const db = require('../config/database');

const SpaAvailability = {
    create: async (availabilityData) => {
        const existente = await db.query(
            `
            SELECT *
            FROM disponibilidad_spa
            WHERE dia_semana = $1
            ORDER BY created_at ASC
            LIMIT 1;
            `,
            [availabilityData.dia_semana]
        );

        if (existente.rows[0]) {
            return SpaAvailability.update(existente.rows[0].id, availabilityData);
        }

        const result = await db.query(
            `
            INSERT INTO disponibilidad_spa (dia_semana, hora_inicio, hora_fin, capacidad_diaria, estado_activo)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
            `,
            [
                availabilityData.dia_semana,
                availabilityData.hora_inicio,
                availabilityData.hora_fin,
                availabilityData.capacidad_diaria ?? 0,
                availabilityData.estado_activo ?? true
            ]
        );

        return result.rows[0];
    },

    getByDiaSemana: async (diaSemana) => {
        const result = await db.query(
            `
            SELECT *
            FROM disponibilidad_spa
            WHERE dia_semana = $1 AND estado_activo = true
            ORDER BY hora_inicio ASC;
            `,
            [diaSemana]
        );
        return result.rows;
    },

    getByDiaSemanav: async (diaSemana) => SpaAvailability.getByDiaSemana(diaSemana),

    getAll: async (activas = true) => {
        let query = 'SELECT * FROM disponibilidad_spa';

        if (activas) {
            query += ' WHERE estado_activo = true';
        }

        query += ' ORDER BY dia_semana ASC, hora_inicio ASC;';

        const result = await db.query(query);
        return result.rows;
    },

    getHabitual: async () => {
        const result = await db.query(
            `
            SELECT *
            FROM disponibilidad_spa
            WHERE estado_activo = true
            ORDER BY dia_semana ASC;
            `
        );
        return result.rows;
    },

    getById: async (id) => {
        const result = await db.query(
            'SELECT * FROM disponibilidad_spa WHERE id = $1',
            [id]
        );
        return result.rows[0];
    },

    update: async (id, availabilityData) => {
        const result = await db.query(
            `
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
            `,
            [
                availabilityData.dia_semana || null,
                availabilityData.hora_inicio || null,
                availabilityData.hora_fin || null,
                availabilityData.capacidad_diaria ?? 0,
                availabilityData.estado_activo !== undefined ? availabilityData.estado_activo : null,
                id
            ]
        );

        return result.rows[0];
    },

    delete: async (id) => {
        const result = await db.query(
            `
            UPDATE disponibilidad_spa
            SET estado_activo = false, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *;
            `,
            [id]
        );
        return result.rows[0];
    },

    replaceHabitual: async (dias) => {
        await db.query('BEGIN');

        try {
            await db.query(`
                UPDATE disponibilidad_spa
                SET estado_activo = false, updated_at = CURRENT_TIMESTAMP;
            `);

            const results = [];

            for (const dia of dias) {
                if (!dia.hora_inicio || !dia.hora_fin) {
                    continue;
                }

                const creado = await db.query(
                    `
                    INSERT INTO disponibilidad_spa (dia_semana, hora_inicio, hora_fin, capacidad_diaria, estado_activo)
                    VALUES ($1, $2, $3, 0, true)
                    RETURNING *;
                    `,
                    [dia.dia_semana, dia.hora_inicio, dia.hora_fin]
                );

                results.push(creado.rows[0]);
            }

            await db.query('COMMIT');
            return results;
        } catch (error) {
            await db.query('ROLLBACK');
            throw error;
        }
    }
};

module.exports = SpaAvailability;
