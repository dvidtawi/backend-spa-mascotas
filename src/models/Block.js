const db = require('../config/database');

const Block = {
    // Crear bloqueo (feriado, mantenimiento, ausencia)
    create: async (blockData, createdByUserId) => {
        const query = `
            INSERT INTO bloqueos (groomer_id, fecha_inicio, fecha_fin, tipo, razon, created_by, estado_activo)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *;
        `;

        const values = [
            blockData.groomer_id || null,
            blockData.fecha_inicio,
            blockData.fecha_fin,
            blockData.tipo,
            blockData.razon || null,
            createdByUserId,
            blockData.estado_activo || true
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    // Obtener bloqueos de un groomer
    getByGroomerId: async (groomerId, activos = true) => {
        let query = `SELECT * FROM bloqueos WHERE groomer_id = $1`;
        
        if (activos) {
            query += ' AND estado_activo = true';
        }
        
        query += ' ORDER BY fecha_inicio DESC;';

        const result = await db.query(query, [groomerId]);
        return result.rows;
    },

    // Obtener bloqueos en un rango de fechas
    getByFechaRango: async (fechaInicio, fechaFin, groomerId = null) => {
        let query = `
            SELECT * FROM bloqueos 
            WHERE estado_activo = true 
            AND (fecha_inicio <= $2 AND fecha_fin >= $1)`;
        
        const values = [fechaInicio, fechaFin];

        if (groomerId) {
            query += ' AND groomer_id = $3';
            values.push(groomerId);
        }

        query += ' ORDER BY fecha_inicio ASC;';

        const result = await db.query(query, values);
        return result.rows;
    },

    // Obtener todos los bloqueos
    getAll: async (activos = true) => {
        let query = 'SELECT * FROM bloqueos';
        
        if (activos) {
            query += ' WHERE estado_activo = true';
        }
        
        query += ' ORDER BY fecha_inicio DESC;';

        const result = await db.query(query);
        return result.rows;
    },

    // Obtener bloqueo por ID
    getById: async (id) => {
        const result = await db.query(
            'SELECT * FROM bloqueos WHERE id = $1',
            [id]
        );
        return result.rows[0];
    },

    // Actualizar bloqueo
    update: async (id, blockData) => {
        const query = `
            UPDATE bloqueos
            SET 
                fecha_inicio = COALESCE($1, fecha_inicio),
                fecha_fin = COALESCE($2, fecha_fin),
                tipo = COALESCE($3, tipo),
                razon = COALESCE($4, razon),
                estado_activo = COALESCE($5, estado_activo),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING *;
        `;

        const values = [
            blockData.fecha_inicio || null,
            blockData.fecha_fin || null,
            blockData.tipo || null,
            blockData.razon || null,
            blockData.estado_activo !== undefined ? blockData.estado_activo : null,
            id
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    // Eliminar bloqueo (soft delete)
    delete: async (id) => {
        const result = await db.query(
            `UPDATE bloqueos SET estado_activo = false WHERE id = $1 RETURNING *;`,
            [id]
        );
        return result.rows[0];
    },

    // Verificar si existe bloqueo en una fecha
    existeBloqueoEnFecha: async (groomerId, fecha) => {
        const result = await db.query(
            `SELECT * FROM bloqueos 
            WHERE groomer_id = $1 
            AND estado_activo = true
            AND fecha_inicio <= $2::date 
            AND fecha_fin >= $2::date
            LIMIT 1;`,
            [groomerId, fecha]
        );
        return result.rows.length > 0;
    }
};

module.exports = Block;
