const db = require('../config/database');

const buildSelect = `
    SELECT si.*,
           i.nombre AS insumo_nombre,
           i.descripcion AS insumo_descripcion,
           i.tipo AS insumo_tipo,
           i.precio_venta AS insumo_precio_venta,
           i.ruta_imagen_local AS insumo_ruta_imagen_local
    FROM servicio_insumos si
    LEFT JOIN inventario i ON i.id = si.id_insumo
`;

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value) => value === true || value === 'true' || value === 1 || value === '1';

const ServiceInsumo = {
    getByCitaId: async (citaId) => {
        const result = await db.query(`${buildSelect} WHERE si.id_cita = $1 ORDER BY si.created_at ASC`, [citaId]);
        return result.rows;
    },

    getById: async (id) => {
        const result = await db.query(`${buildSelect} WHERE si.id = $1`, [id]);
        return result.rows[0];
    },

    entregar: async (client, { citaId, items = [], registradoPor = null }) => {
        if (!Array.isArray(items) || items.length === 0) {
            const error = new Error('Debes seleccionar al menos un insumo para entregar');
            error.statusCode = 400;
            throw error;
        }

        const registros = [];

        for (const item of items) {
            const idInsumo = item.id_insumo || item.insumo_id || item.id;
            const cantidadEntregada = Number(item.cantidad_entregada || item.cantidad || 0);

            if (!idInsumo || cantidadEntregada <= 0) {
                const error = new Error('Cada insumo debe tener una cantidad entregada mayor a 0');
                error.statusCode = 400;
                throw error;
            }

            const inventario = await client.query('SELECT * FROM inventario WHERE id = $1 FOR UPDATE', [idInsumo]);
            const rowInventario = inventario.rows[0];
            if (!rowInventario) {
                const error = new Error('Uno de los insumos no existe');
                error.statusCode = 404;
                throw error;
            }

            if (rowInventario.stock_actual < cantidadEntregada) {
                const error = new Error(`Stock insuficiente para ${rowInventario.nombre}`);
                error.statusCode = 400;
                throw error;
            }

            await client.query(`
                UPDATE inventario
                SET stock_actual = stock_actual - $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [cantidadEntregada, idInsumo]);

            const existente = await client.query(`
                SELECT *
                FROM servicio_insumos
                WHERE id_cita = $1 AND id_insumo = $2
                FOR UPDATE
            `, [citaId, idInsumo]);

            let registro;
            if (existente.rows[0]) {
                const actual = existente.rows[0];
                if (actual.estado === 'Procesado') {
                    const error = new Error(`El insumo ${rowInventario.nombre} ya fue procesado para esta cita`);
                    error.statusCode = 400;
                    throw error;
                }

                const cantidadAnterior = Number(actual.cantidad_entregada) || 0;
                const delta = cantidadEntregada - cantidadAnterior;

                if (delta !== 0) {
                    if (delta > 0 && rowInventario.stock_actual < delta) {
                        const error = new Error(`Stock insuficiente para ampliar la entrega de ${rowInventario.nombre}`);
                        error.statusCode = 400;
                        throw error;
                    }

                    await client.query(`
                        UPDATE inventario
                        SET stock_actual = stock_actual - $1,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = $2
                    `, [delta, idInsumo]);
                }

                const update = await client.query(`
                    UPDATE servicio_insumos
                    SET cantidad_entregada = $1,
                        estado = 'Entregado',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                    RETURNING *
                `, [cantidadEntregada, actual.id]);
                registro = update.rows[0];
            } else {
                const insert = await client.query(`
                    INSERT INTO servicio_insumos (
                        id_cita,
                        id_insumo,
                        cantidad_entregada,
                        cantidad_usada,
                        cantidad_devuelta,
                        cantidad_desperdiciada,
                        estado
                    )
                    VALUES ($1,$2,$3,0,0,0,'Entregado')
                    RETURNING *
                `, [citaId, idInsumo, cantidadEntregada]);
                registro = insert.rows[0];
            }

            registros.push({
                ...registro,
                insumo_nombre: rowInventario.nombre,
                entregado_por: registradoPor
            });
        }

        return registros;
    },

    confirmarUso: async (client, { citaId, items = [] }) => {
        const sourceItems = Array.isArray(items) && items.length > 0
            ? items
            : await ServiceInsumo.getByCitaId(citaId);

        if (!Array.isArray(sourceItems) || sourceItems.length === 0) {
            const error = new Error('No hay insumos asignados para esta cita');
            error.statusCode = 400;
            throw error;
        }

        const procesados = [];

        for (const item of sourceItems) {
            const idServicioInsumo = item.id || item.servicio_insumo_id;
            const cantidadEntregada = toNumber(item.cantidad_entregada, 0);
            const usaCheckbox = item.usado !== undefined || item.uso !== undefined;
            const estaUsado = usaCheckbox ? toBool(item.usado ?? item.uso) : null;
            const mermaSolicitada = Math.max(0, toNumber(item.cantidad_desperdiciada ?? item.merma, 0));

            if (!idServicioInsumo) {
                const error = new Error('Falta identificar uno de los insumos entregados');
                error.statusCode = 400;
                throw error;
            }

            const row = await client.query(`
                SELECT si.*, i.nombre AS insumo_nombre
                FROM servicio_insumos si
                LEFT JOIN inventario i ON i.id = si.id_insumo
                WHERE si.id = $1
                FOR UPDATE OF si
            `, [idServicioInsumo]);

            const servicioInsumo = row.rows[0];
            if (!servicioInsumo) {
                const error = new Error('No se encontro el insumo entregado');
                error.statusCode = 404;
                throw error;
            }

            if (servicioInsumo.estado === 'Procesado') {
                continue;
            }

            const cantidadUsada = usaCheckbox === null
                ? toNumber(item.cantidad_usada, 0)
                : (estaUsado ? Math.max(0, cantidadEntregada - mermaSolicitada) : 0);
            const cantidadDevuelta = usaCheckbox === null
                ? toNumber(item.cantidad_devuelta, 0)
                : (estaUsado ? 0 : cantidadEntregada);
            const cantidadDesperdiciada = usaCheckbox === null
                ? toNumber(item.cantidad_desperdiciada, 0)
                : (estaUsado ? mermaSolicitada : 0);

            if (usaCheckbox === true && mermaSolicitada > cantidadEntregada) {
                const error = new Error(`La merma de ${servicioInsumo.insumo_nombre} no puede superar lo entregado`);
                error.statusCode = 400;
                throw error;
            }

            if (cantidadUsada < 0 || cantidadDevuelta < 0 || cantidadDesperdiciada < 0) {
                const error = new Error('Las cantidades de insumo no pueden ser negativas');
                error.statusCode = 400;
                throw error;
            }

            if (cantidadUsada + cantidadDevuelta + cantidadDesperdiciada !== cantidadEntregada) {
                const error = new Error('La suma de usado, devuelto y merma debe coincidir con lo entregado');
                error.statusCode = 400;
                throw error;
            }

            const inventoryUpdate = await client.query(`
                UPDATE inventario
                SET stock_actual = stock_actual + $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `, [cantidadDevuelta, servicioInsumo.id_insumo]);

            const updated = await client.query(`
                UPDATE servicio_insumos
                SET cantidad_usada = $1,
                    cantidad_devuelta = $2,
                    cantidad_desperdiciada = $3,
                    estado = 'Procesado',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $4
                RETURNING *
            `, [cantidadUsada, cantidadDevuelta, cantidadDesperdiciada, idServicioInsumo]);

            procesados.push({
                ...updated.rows[0],
                insumo_nombre: servicioInsumo.insumo_nombre,
                inventario_actualizado: inventoryUpdate.rows[0] || null
            });
        }

        return procesados;
    }
};

module.exports = ServiceInsumo;
