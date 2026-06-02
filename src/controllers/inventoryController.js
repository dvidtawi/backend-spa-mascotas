const db = require('../config/database');
const Inventory = require('../models/Inventory');
const ServiceInsumo = require('../models/ServiceInsumo');
const Slot = require('../models/Slot');
const { appendNotification } = require('../services/notificationLogService');

const buildResumenInsumos = (items = []) => items
    .map((item) => {
        const nombre = item.insumo_nombre || item.nombre || 'Insumo';
        const entregado = Number(item.cantidad_entregada || 0);
        const usado = Number(item.cantidad_usada || 0);
        const devuelto = Number(item.cantidad_devuelta || 0);
        const desperdiciado = Number(item.cantidad_desperdiciada || 0);
        return `${nombre}: entregado ${entregado}, usado ${usado}, devuelto ${devuelto}, merma ${desperdiciado}`;
    })
    .join(' | ');

const notifyLowStock = async (items = []) => {
    // Obtener emails de admin y recepción
    let adminEmails = [];
    try {
        const adminRes = await db.query(
            'SELECT email FROM usuarios WHERE rol_id IN (1, 3) AND email IS NOT NULL AND email != \'\' LIMIT 50'
        );
        adminEmails = adminRes.rows.map(row => row.email).filter(Boolean);
    } catch (error) {
        console.warn('No se pudo obtener emails de admins:', error.message);
    }

    for (const item of items) {
        let inventario = item.inventario_actualizado || item;
        if ((!inventario?.id || inventario.stock_actual === undefined) && item.id_insumo) {
            inventario = await Inventory.getById(item.id_insumo);
        }
        if (!inventario?.id) continue;
        const stockActual = Number(inventario.stock_actual || 0);
        const stockMinimo = Number(inventario.stock_minimo || 0);
        if (stockActual > stockMinimo) continue;

        try {
            const emailBody = `
Alerta de bajo stock - PetSpa Mascotas

Insumo: ${inventario.nombre || 'Insumo'}
Stock actual: ${stockActual}
Stock minimo: ${stockMinimo}

Por favor, revisa el inventario y realiza los pedidos necesarios.

---
Este es un correo automatico. No responder.
            `.trim();

            await appendNotification({
                tipo: 'bajo_stock',
                titulo: 'Alerta de bajo stock',
                mensaje: `${inventario.nombre || 'Insumo'} llego al minimo (${stockActual}/${stockMinimo}).`,
                recipient_roles: [1, 3],
                dedupe_key: `stocklow:${inventario.id}:${stockActual}`,
                email_to: adminEmails.length > 0 ? adminEmails[0] : null,
                email_subject: `⚠️ ALERTA: Stock bajo - ${inventario.nombre || 'Insumo'}`,
                email_body: emailBody,
                metadata: {
                    inventario_id: inventario.id,
                    nombre: inventario.nombre,
                    stock_actual: stockActual,
                    stock_minimo: stockMinimo,
                    admin_emails: adminEmails
                }
            });
        } catch (error) {
            console.warn('No se pudo registrar la alerta de bajo stock:', error.message);
        }
    }
};

const InventoryController = {
    getInventario: async (req, res) => {
        try {
            const includeInactive = req.query.include_inactive !== 'false';
            const items = await Inventory.getAll({ includeInactive });
            res.json({ success: true, data: items });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getInventarioAlertas: async (req, res) => {
        try {
            const items = await Inventory.getAlertas();
            res.json({ success: true, data: items });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    crearInventario: async (req, res) => {
        try {
            const {
                nombre,
                descripcion,
                tipo,
                categoria,
                variante,
                marca,
                presentacion,
                stock_actual,
                stock_minimo,
                precio_venta,
                ruta_imagen_local
            } = req.body;

            if (!nombre || !tipo) {
                return res.status(400).json({ success: false, error: 'Nombre y tipo son requeridos' });
            }

            const item = await Inventory.create({
                nombre,
                descripcion,
                tipo,
                categoria,
                variante,
                marca,
                presentacion,
                stock_actual,
                stock_minimo,
                precio_venta,
                ruta_imagen_local
            });

            res.status(201).json({ success: true, data: item });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    uploadInventarioImagen: async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No se recibio ninguna imagen' });
            }

            res.json({
                success: true,
                data: {
                    ruta_imagen_local: `/uploads/inventario/${req.file.filename}`
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    actualizarInventario: async (req, res) => {
        try {
            const item = await Inventory.update(req.params.id, req.body);
            if (!item) {
                return res.status(404).json({ success: false, error: 'Insumo no encontrado' });
            }
            res.json({ success: true, data: item });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    toggleInventario: async (req, res) => {
        try {
            const item = await Inventory.update(req.params.id, { estado_activo: req.body.estado_activo });
            if (!item) {
                return res.status(404).json({ success: false, error: 'Insumo no encontrado' });
            }
            res.json({ success: true, data: item });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getInsumosCita: async (req, res) => {
        try {
            const cita = await Slot.getById(req.params.citaId);
            if (!cita) {
                return res.status(404).json({ success: false, error: 'Cita no encontrada' });
            }

            const items = await ServiceInsumo.getByCitaId(req.params.citaId);
            res.json({ success: true, data: { cita, items } });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getCitasPendientesInsumos: async (req, res) => {
        try {
            const result = await db.query(`
                SELECT s.*, srv.nombre AS servicio_nombre, m.nombre AS mascota_nombre,
                       c.nombre AS cliente_nombre, g.nombre AS groomer_nombre
                FROM slots s
                LEFT JOIN servicios srv ON srv.id = s.servicio_id
                LEFT JOIN mascotas m ON m.id = s.mascota_id
                LEFT JOIN usuarios c ON c.id = s.cliente_id
                LEFT JOIN usuarios g ON g.id = s.groomer_id
                WHERE s.estado = 'confirmada'
                  AND NOT EXISTS (
                      SELECT 1
                      FROM servicio_insumos si
                      WHERE si.id_cita = s.id
                  )
                ORDER BY s.fecha_inicio ASC;
            `);

            res.json({ success: true, data: result.rows });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    entregarInsumos: async (req, res) => {
        const client = await db.connect();
        try {
            const { cita_id, items } = req.body;
            if (!cita_id) {
                return res.status(400).json({ success: false, error: 'La cita es requerida' });
            }

            const cita = await Slot.getById(cita_id);
            if (!cita) {
                return res.status(404).json({ success: false, error: 'Cita no encontrada' });
            }

            await client.query('BEGIN');
            const entregados = await ServiceInsumo.entregar(client, {
                citaId: cita_id,
                items,
                registradoPor: req.user?.id || null
            });
            await client.query('COMMIT');
            await notifyLowStock(entregados.map((item) => item.inventario_actualizado || item));

            res.status(201).json({
                success: true,
                message: 'Insumos entregados correctamente',
                data: {
                    cita_id,
                    items: entregados
                }
            });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(error.statusCode || 500).json({ success: false, error: error.message });
        } finally {
            client.release();
        }
    },

    confirmarUso: async (req, res) => {
        const client = await db.connect();
        try {
            const { cita_id, items } = req.body;
            if (!cita_id) {
                return res.status(400).json({ success: false, error: 'La cita es requerida' });
            }

            const cita = await Slot.getById(cita_id);
            if (!cita) {
                return res.status(404).json({ success: false, error: 'Cita no encontrada' });
            }

            await client.query('BEGIN');
            const procesados = await ServiceInsumo.confirmarUso(client, { citaId: cita_id, items });
            const resumen = buildResumenInsumos(procesados);

            if (resumen) {
                await client.query(
                    'UPDATE fichas_grooming SET insumos_texto = COALESCE($1, insumos_texto), updated_at = CURRENT_TIMESTAMP WHERE cita_id = $2',
                    [resumen, cita_id]
                );
            }

            await client.query('COMMIT');
            await notifyLowStock(procesados.map((item) => item.inventario_actualizado || item));

            res.json({
                success: true,
                message: 'Uso de insumos confirmado',
                data: {
                    cita_id,
                    items: procesados,
                    resumen
                }
            });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(error.statusCode || 500).json({ success: false, error: error.message });
        } finally {
            client.release();
        }
    }
};

module.exports = InventoryController;
module.exports.notifyLowStock = notifyLowStock;
