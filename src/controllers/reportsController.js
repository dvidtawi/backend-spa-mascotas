const db = require('../config/database');

const toDateRange = (req) => {
    const fechaInicio = req.query.fecha_inicio || null;
    const fechaFin = req.query.fecha_fin || null;
    return { fechaInicio, fechaFin };
};

const buildDateFilter = (alias, whereParts, params, fechaInicio, fechaFin) => {
    if (fechaInicio) {
        params.push(fechaInicio);
        whereParts.push(`${alias}.created_at >= $${params.length}`);
    }
    if (fechaFin) {
        params.push(fechaFin);
        whereParts.push(`${alias}.created_at <= $${params.length}`);
    }
};

const ReportsController = {
    auditoriaInsumos: async (req, res) => {
        try {
            const { fechaInicio, fechaFin } = toDateRange(req);
            const params = [];
            const whereParts = [];
            buildDateFilter('si', whereParts, params, fechaInicio, fechaFin);

            const query = `
                SELECT
                    i.id AS insumo_id,
                    i.nombre AS insumo_nombre,
                    COALESCE(SUM(si.cantidad_entregada), 0) AS entregado,
                    COALESCE(SUM(si.cantidad_usada), 0) AS usado,
                    COALESCE(SUM(si.cantidad_devuelta), 0) AS devuelto,
                    COALESCE(SUM(si.cantidad_desperdiciada), 0) AS merma
                FROM servicio_insumos si
                LEFT JOIN inventario i ON i.id = si.id_insumo
                ${whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : ''}
                GROUP BY i.id, i.nombre
                ORDER BY i.nombre ASC;
            `;

            const result = await db.query(query, params);
            res.json({ success: true, data: result.rows });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    productividadGroomer: async (req, res) => {
        try {
            const groomerId = req.query.groomer_id || req.user?.id || null;
            const { fechaInicio, fechaFin } = toDateRange(req);
            const params = [groomerId];
            const whereParts = ['s.groomer_id = $1', "s.estado = 'finalizada'"];
            if (fechaInicio) {
                params.push(fechaInicio);
                whereParts.push(`s.fecha_inicio >= $${params.length}`);
            }
            if (fechaFin) {
                params.push(fechaFin);
                whereParts.push(`s.fecha_inicio <= $${params.length}`);
            }

            const query = `
                SELECT
                    COUNT(*)::int AS servicios_realizados,
                    COALESCE(AVG(EXTRACT(EPOCH FROM (s.fecha_fin - s.fecha_inicio)) / 60), 0) AS promedio_minutos,
                    COALESCE(SUM(EXTRACT(EPOCH FROM (s.fecha_fin - s.fecha_inicio)) / 60), 0) AS minutos_totales
                FROM slots s
                WHERE ${whereParts.join(' AND ')};
            `;

            const result = await db.query(query, params);
            res.json({ success: true, data: result.rows[0] || {} });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    historialGroomer: async (req, res) => {
        try {
            const groomerId = req.query.groomer_id || req.user?.id || null;
            const limit = Math.min(Number(req.query.limit) || 20, 100);
            const result = await db.query(`
                SELECT
                    s.id,
                    s.fecha_inicio,
                    s.fecha_fin,
                    s.estado,
                    s.notas,
                    s.precio_final,
                    srv.nombre AS servicio_nombre,
                    m.nombre AS mascota_nombre,
                    c.nombre AS cliente_nombre,
                    f.estado_ingreso,
                    f.observaciones_iniciales,
                    f.recomendaciones,
                    f.foto_antes_path,
                    f.foto_despues_path,
                    f.insumos_texto
                FROM slots s
                LEFT JOIN servicios srv ON srv.id = s.servicio_id
                LEFT JOIN mascotas m ON m.id = s.mascota_id
                LEFT JOIN usuarios c ON c.id = s.cliente_id
                LEFT JOIN fichas_grooming f ON f.cita_id = s.id
                WHERE s.groomer_id = $1
                  AND s.estado = 'finalizada'
                ORDER BY s.fecha_inicio DESC
                LIMIT $2;
            `, [groomerId, limit]);

            res.json({ success: true, data: result.rows });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    consumoGroomer: async (req, res) => {
        try {
            const groomerId = req.query.groomer_id || req.user?.id || null;
            const result = await db.query(`
                SELECT
                    i.id AS insumo_id,
                    i.nombre AS insumo_nombre,
                    COALESCE(SUM(si.cantidad_entregada), 0) AS entregado,
                    COALESCE(SUM(si.cantidad_usada), 0) AS usado,
                    COALESCE(SUM(si.cantidad_devuelta), 0) AS devuelto,
                    COALESCE(SUM(si.cantidad_desperdiciada), 0) AS merma
                FROM servicio_insumos si
                LEFT JOIN inventario i ON i.id = si.id_insumo
                LEFT JOIN slots s ON s.id = si.id_cita
                WHERE s.groomer_id = $1
                GROUP BY i.id, i.nombre
                ORDER BY i.nombre ASC;
            `, [groomerId]);

            res.json({ success: true, data: result.rows });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    beneficiosCliente: async (req, res) => {
        try {
            const clienteId = req.query.cliente_id || req.user?.id || null;
            const result = await db.query(`
                SELECT
                    COUNT(*)::int AS total_pedidos,
                    COALESCE(SUM(total), 0) AS total_gastado,
                    COALESCE(SUM(descuento_lealtad), 0) AS descuento_lealtad,
                    COALESCE(SUM(descuento_cupon), 0) AS descuento_cupon
                FROM tienda_pedidos
                WHERE cliente_id = $1;
            `, [clienteId]);

            res.json({ success: true, data: result.rows[0] || {} });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
};

module.exports = ReportsController;
