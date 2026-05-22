const db = require('../config/database');

const GroomingRecord = {
    getByCitaId: async (citaId) => {
        const result = await db.query(
            'SELECT * FROM fichas_grooming WHERE cita_id = $1',
            [citaId]
        );
        return result.rows[0];
    },

    upsert: async (data) => {
        const result = await db.query(`
            INSERT INTO fichas_grooming (
                cita_id,
                groomer_id,
                estado_ingreso,
                observaciones_iniciales,
                checklist,
                insumos_texto,
                foto_antes_path,
                foto_despues_path,
                recomendaciones
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (cita_id)
            DO UPDATE SET
                estado_ingreso = COALESCE($3, fichas_grooming.estado_ingreso),
                observaciones_iniciales = COALESCE($4, fichas_grooming.observaciones_iniciales),
                checklist = COALESCE($5, fichas_grooming.checklist),
                insumos_texto = COALESCE($6, fichas_grooming.insumos_texto),
                foto_antes_path = COALESCE($7, fichas_grooming.foto_antes_path),
                foto_despues_path = COALESCE($8, fichas_grooming.foto_despues_path),
                recomendaciones = COALESCE($9, fichas_grooming.recomendaciones),
                updated_at = CURRENT_TIMESTAMP
            RETURNING *;
        `, [
            data.cita_id,
            data.groomer_id,
            data.estado_ingreso || null,
            data.observaciones_iniciales || null,
            data.checklist || null,
            data.insumos_texto || null,
            data.foto_antes_path || null,
            data.foto_despues_path || null,
            data.recomendaciones || null
        ]);

        return result.rows[0];
    }
};

module.exports = GroomingRecord;
