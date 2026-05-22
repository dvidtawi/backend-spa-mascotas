const db = require('../config/database');
const SpaAvailability = require('./SpaAvailability');

const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];
const DEFAULT_HOURS = {
    hora_inicio: '09:00',
    hora_fin: '18:00'
};

const GroomerAvailability = {
    // Crear disponibilidad de groomer
    create: async (availabilityData) => {
        const query = `
            INSERT INTO disponibilidad_groomer (groomer_id, dia_semana, hora_inicio, hora_fin, especialidades, estado_activo)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *;
        `;

        const values = [
            availabilityData.groomer_id,
            availabilityData.dia_semana,
            availabilityData.hora_inicio,
            availabilityData.hora_fin,
            availabilityData.especialidades || null,
            availabilityData.estado_activo || true
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    // Obtener disponibilidad de un groomer
    getByGroomerId: async (groomerId, activa = true) => {
        let query = `
            SELECT * FROM disponibilidad_groomer 
            WHERE groomer_id = $1`;
        
        if (activa) {
            query += ' AND estado_activo = true';
        }
        
        query += ' ORDER BY dia_semana ASC, hora_inicio ASC;';

        const result = await db.query(query, [groomerId]);
        return result.rows;
    },

    // Obtener disponibilidad de groomer por día
    getByGroomerIdAndDia: async (groomerId, diaSemana) => {
        const result = await db.query(
            `SELECT * FROM disponibilidad_groomer 
            WHERE groomer_id = $1 AND dia_semana = $2 AND estado_activo = true
            ORDER BY hora_inicio ASC;`,
            [groomerId, diaSemana]
        );
        return result.rows;
    },

    // Obtener todos los groomers disponibles en un día específico
    getGroomersDisponiblesEnDia: async (diaSemana) => {
        const result = await db.query(
            `SELECT DISTINCT g.id, g.nombre, dg.dia_semana, dg.hora_inicio, dg.hora_fin, dg.especialidades
            FROM disponibilidad_groomer dg
            JOIN usuarios g ON dg.groomer_id = g.id
            WHERE dg.dia_semana = $1 AND dg.estado_activo = true AND g.estado_activo = true
            ORDER BY g.nombre ASC;`,
            [diaSemana]
        );
        return result.rows;
    },

    // Obtener disponibilidad por ID
    getById: async (id) => {
        const result = await db.query(
            'SELECT * FROM disponibilidad_groomer WHERE id = $1',
            [id]
        );
        return result.rows[0];
    },

    // Actualizar disponibilidad de groomer
    update: async (id, availabilityData) => {
        const query = `
            UPDATE disponibilidad_groomer
            SET 
                dia_semana = COALESCE($1, dia_semana),
                hora_inicio = COALESCE($2, hora_inicio),
                hora_fin = COALESCE($3, hora_fin),
                especialidades = COALESCE($4, especialidades),
                estado_activo = COALESCE($5, estado_activo),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING *;
        `;

        const values = [
            availabilityData.dia_semana || null,
            availabilityData.hora_inicio || null,
            availabilityData.hora_fin || null,
            availabilityData.especialidades || null,
            availabilityData.estado_activo !== undefined ? availabilityData.estado_activo : null,
            id
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    // Eliminar disponibilidad (soft delete)
    delete: async (id) => {
        const result = await db.query(
            `UPDATE disponibilidad_groomer SET estado_activo = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *;`,
            [id]
        );
        return result.rows[0];
    },

    ensureDefaultForGroomer: async (groomerId) => {
        const existentes = await GroomerAvailability.getByGroomerId(groomerId, true);
        if (existentes.length > 0) {
            return existentes;
        }

        const horarioHabitual = await SpaAvailability.getHabitual();
        const mapaHabitual = new Map(
            horarioHabitual
                .filter((item) => DEFAULT_WEEKDAYS.includes(item.dia_semana))
                .map((item) => [item.dia_semana, item])
        );

        const creados = [];

        for (const dia of DEFAULT_WEEKDAYS) {
            const base = mapaHabitual.get(dia) || DEFAULT_HOURS;
            const creado = await GroomerAvailability.create({
                groomer_id: groomerId,
                dia_semana: dia,
                hora_inicio: String(base.hora_inicio).slice(0, 5),
                hora_fin: String(base.hora_fin).slice(0, 5),
                estado_activo: true
            });
            creados.push(creado);
        }

        return creados;
    }
};

module.exports = GroomerAvailability;
