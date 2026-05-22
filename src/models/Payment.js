const db = require('../config/database');

const Payment = {
    create: async (paymentData) => {
        const result = await db.query(`
            INSERT INTO pagos (
                cita_id,
                registrado_por,
                tipo_venta,
                concepto,
                metodo_pago,
                monto,
                observaciones,
                origen,
                tipo_movimiento,
                referencia_evento
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *;
        `, [
            paymentData.cita_id || null,
            paymentData.registrado_por || null,
            paymentData.tipo_venta || 'cita',
            paymentData.concepto || null,
            paymentData.metodo_pago,
            paymentData.monto,
            paymentData.observaciones || null,
            paymentData.origen || 'manual',
            paymentData.tipo_movimiento || 'ingreso',
            paymentData.referencia_evento || null
        ]);

        return result.rows[0];
    },

    existsByReference: async (referenciaEvento) => {
        if (!referenciaEvento) return false;

        const result = await db.query(
            'SELECT 1 FROM pagos WHERE referencia_evento = $1 LIMIT 1;',
            [referenciaEvento]
        );

        return Boolean(result.rows[0]);
    },

    getByCitaId: async (citaId) => {
        const result = await db.query(
            `
            SELECT *
            FROM pagos
            WHERE cita_id = $1
            ORDER BY fecha_pago ASC;
            `,
            [citaId]
        );
        return result.rows;
    },

    getAll: async (filters = {}) => {
        let query = `
            SELECT p.*, s.fecha, s.hora_inicio, s.estado as cita_estado,
                   c.nombre as cliente_nombre, m.nombre as mascota_nombre
            FROM pagos p
            LEFT JOIN slots s ON s.id = p.cita_id
            LEFT JOIN mascotas m ON m.id = s.mascota_id
            LEFT JOIN usuarios c ON c.id = s.cliente_id
            WHERE 1=1
        `;

        const values = [];
        let i = 1;

        if (filters.fecha) {
            query += ` AND DATE(p.fecha_pago) = $${i}`;
            values.push(filters.fecha);
            i++;
        }

        if (filters.metodo_pago) {
            query += ` AND p.metodo_pago = $${i}`;
            values.push(filters.metodo_pago);
            i++;
        }

        if (filters.tipo_movimiento) {
            query += ` AND p.tipo_movimiento = $${i}`;
            values.push(filters.tipo_movimiento);
            i++;
        }

        query += ' ORDER BY p.fecha_pago DESC;';

        const result = await db.query(query, values);
        return result.rows;
    },

    getCierreCaja: async (fecha) => {
        const result = await db.query(`
            SELECT
                metodo_pago,
                tipo_movimiento,
                COUNT(*) as total_transacciones,
                COALESCE(SUM(monto), 0) as total_monto
            FROM pagos
            WHERE DATE(fecha_pago) = $1
            GROUP BY metodo_pago, tipo_movimiento
            ORDER BY metodo_pago ASC, tipo_movimiento ASC;
        `, [fecha]);

        const total = await db.query(`
            SELECT COALESCE(SUM(monto), 0) as total_dia
            FROM pagos
            WHERE DATE(fecha_pago) = $1
        `, [fecha]);

        return {
            resumen: result.rows,
            total_dia: Number(total.rows[0].total_dia)
        };
    }
};

module.exports = Payment;
