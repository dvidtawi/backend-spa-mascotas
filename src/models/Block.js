const db = require('../config/database');

const Block = {
    create: async (blockData, createdByUserId) => {
        const query = `
            INSERT INTO bloqueos (
                groomer_id, fecha, hora_inicio, hora_fin, fecha_inicio, fecha_fin,
                tipo, motivo, razon, created_by, estado_activo
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *;
        `;

        const fecha = blockData.fecha || blockData.fecha_inicio || blockData.fecha_fin;

        const values = [
            blockData.groomer_id || null,
            fecha,
            blockData.hora_inicio || '00:00',
            blockData.hora_fin || '23:59',
            fecha,
            fecha,
            blockData.tipo,
            blockData.motivo || blockData.razon || null,
            blockData.razon || null,
            createdByUserId,
            blockData.estado_activo ?? true
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    getByGroomerId: async (groomerId, activos = true) => {
        let query = `
            SELECT *
            FROM bloqueos
            WHERE (groomer_id = $1 OR groomer_id IS NULL)
        `;

        if (activos) {
            query += ' AND estado_activo = true';
        }

        query += ' ORDER BY fecha DESC, hora_inicio ASC;';

        const result = await db.query(query, [groomerId]);
        return result.rows;
    },

    getByFechaRango: async (fechaInicio, fechaFin, groomerId = null) => {
        let query = `
            SELECT *
            FROM bloqueos
            WHERE estado_activo = true
              AND (fecha_inicio <= $2 AND fecha_fin >= $1)
        `;

        const values = [fechaInicio, fechaFin];

        if (groomerId) {
            query += ' AND (groomer_id = $3 OR groomer_id IS NULL)';
            values.push(groomerId);
        }

        query += ' ORDER BY fecha_inicio ASC;';

        const result = await db.query(query, values);
        return result.rows;
    },

    getAll: async (activos = true) => {
        let query = 'SELECT * FROM bloqueos';

        if (activos) {
            query += ' WHERE estado_activo = true';
        }

        query += ' ORDER BY fecha DESC, hora_inicio ASC;';

        const result = await db.query(query);
        return result.rows;
    },

    getById: async (id) => {
        const result = await db.query(
            'SELECT * FROM bloqueos WHERE id = $1',
            [id]
        );
        return result.rows[0];
    },

    update: async (id, blockData) => {
        const query = `
            UPDATE bloqueos
            SET
                fecha = COALESCE($1, fecha),
                hora_inicio = COALESCE($2, hora_inicio),
                hora_fin = COALESCE($3, hora_fin),
                fecha_inicio = COALESCE($4, fecha_inicio),
                fecha_fin = COALESCE($5, fecha_fin),
                tipo = COALESCE($6, tipo),
                motivo = COALESCE($7, motivo),
                razon = COALESCE($8, razon),
                estado_activo = COALESCE($9, estado_activo),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $10
            RETURNING *;
        `;

        const values = [
            blockData.fecha || null,
            blockData.hora_inicio || null,
            blockData.hora_fin || null,
            blockData.fecha || blockData.fecha_inicio || null,
            blockData.fecha || blockData.fecha_fin || null,
            blockData.tipo || null,
            blockData.motivo || null,
            blockData.razon || null,
            blockData.estado_activo !== undefined ? blockData.estado_activo : null,
            id
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    delete: async (id) => {
        const result = await db.query(
            `UPDATE bloqueos SET estado_activo = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *;`,
            [id]
        );
        return result.rows[0];
    },

    existeBloqueoEnFecha: async (groomerId, fecha) => {
        const bloqueos = await Block.getBloqueosSolapados(groomerId, fecha, '00:00', '23:59');
        return bloqueos.length > 0;
    },

    getBloqueosSolapados: async (groomerId, fecha, horaInicio, horaFin) => {
        const result = await db.query(
            `
            SELECT *
            FROM bloqueos
            WHERE estado_activo = true
              AND fecha = $2::date
              AND (groomer_id = $1 OR groomer_id IS NULL)
              AND hora_inicio < $4::time
              AND hora_fin > $3::time
            ORDER BY hora_inicio ASC;
            `,
            [groomerId, fecha, horaInicio, horaFin]
        );

        return result.rows;
    }
};

module.exports = Block;
