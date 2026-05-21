const db = require('../config/database');

const SpaAvailability = {
    // Crear disponibilidad del spa
    create: async (availabilityData) => {
        const query = `
            INSERT INTO disponibilidad_spa (dia_semana, hora_inicio, hora_fin, capacidad_diaria, estado_activo)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;

        const values = [
            availabilityData.dia_semana,
            availabilityData.hora_inicio,
            availabilityData.hora_fin,
            availabilityData.capacidad_diaria || 10,
            availabilityData.estado_activo || true
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    // Obtener disponibilidad por día de semana
    getByDiaSemana: async (diaSemana) => {
        const result = await db.query(
            `SELECT * FROM disponibilidad_spa 
            WHERE dia_semana = $1 AND estado_activo = true
            ORDER BY hora_inicio ASC;`,
            [diaSemana]
        );
        return result.rows;
    },

    // Alias para mantener compatibilidad
    getByDiaSemanav: async (diaSemana) => {
        return await SpaAvailability.getByDiaSemana(diaSemana);
    },

    // Obtener todas las disponibilidades
    getAll: async (activas = true) => {
        let query = 'SELECT * FROM disponibilidad_spa';
        
        if (activas) {
            query += ' WHERE estado_activo = true';
        }
        
        query += ' ORDER BY dia_semana ASC, hora_inicio ASC;';

        const result = await db.query(query);
        return result.rows;
    },

    // Obtener disponibilidad por ID
    getById: async (id) => {
        const result = await db.query(
            'SELECT * FROM disponibilidad_spa WHERE id = $1',
            [id]
        );
        return result.rows[0];
    },

    // Actualizar disponibilidad
    update: async (id, availabilityData) => {
        const query = `
            UPDATE disponibilidad_spa
            SET 
                dia_semana = COALESCE($1, dia_semana),
                hora_inicio = COALESCE($2, hora_inicio),
                hora_fin = COALESCE($3, hora_fin),
                capacidad_diaria = COALESCE($4, capacidad_diaria),
                estado_activo = COALESCE($5, estado_activo),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING *;
        `;

        const values = [
            availabilityData.dia_semana || null,
            availabilityData.hora_inicio || null,
            availabilityData.hora_fin || null,
            availabilityData.capacidad_diaria || null,
            availabilityData.estado_activo !== undefined ? availabilityData.estado_activo : null,
            id
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    // Eliminar disponibilidad (soft delete)
    delete: async (id) => {
        const result = await db.query(
            `UPDATE disponibilidad_spa SET estado_activo = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *;`,
            [id]
        );
        return result.rows[0];
    }
};

module.exports = SpaAvailability;
