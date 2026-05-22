const db = require('../config/database');

const Pet = {
    create: async (petData) => {
        const query = `
            INSERT INTO mascotas (
                cliente_id, nombre, especie, raza, tamano, fecha_nacimiento,
                alergias, temperamento, minutos_adicionales_temperamento,
                ruta_foto_carnet, notas, estado_activo
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *;
        `;

        const values = [
            petData.cliente_id,
            petData.nombre,
            petData.especie || null,
            petData.raza || null,
            petData.tamano || null,
            petData.fecha_nacimiento || null,
            petData.alergias || null,
            petData.temperamento || null,
            petData.minutos_adicionales_temperamento || 0,
            petData.ruta_foto_carnet || null,
            petData.notas || null,
            petData.estado_activo ?? true
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    getByClienteId: async (clienteId) => {
        const result = await db.query(
            `
            SELECT *
            FROM mascotas
            WHERE cliente_id = $1 AND estado_activo = true
            ORDER BY nombre ASC;
            `,
            [clienteId]
        );

        return result.rows;
    },

    getByClienteIdForStaff: async (clienteId) => {
        return Pet.getByClienteId(clienteId);
    },

    getById: async (id) => {
        const result = await db.query(
            `
            SELECT *
            FROM mascotas
            WHERE id = $1;
            `,
            [id]
        );

        return result.rows[0];
    },

    update: async (id, petData) => {
        const query = `
            UPDATE mascotas
            SET
                nombre = COALESCE($1, nombre),
                especie = COALESCE($2, especie),
                raza = COALESCE($3, raza),
                tamano = COALESCE($4, tamano),
                fecha_nacimiento = COALESCE($5, fecha_nacimiento),
                alergias = COALESCE($6, alergias),
                temperamento = COALESCE($7, temperamento),
                minutos_adicionales_temperamento = COALESCE($8, minutos_adicionales_temperamento),
                ruta_foto_carnet = COALESCE($9, ruta_foto_carnet),
                notas = COALESCE($10, notas),
                estado_activo = COALESCE($11, estado_activo),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $12
            RETURNING *;
        `;

        const values = [
            petData.nombre || null,
            petData.especie || null,
            petData.raza || null,
            petData.tamano || null,
            petData.fecha_nacimiento || null,
            petData.alergias || null,
            petData.temperamento || null,
            petData.minutos_adicionales_temperamento ?? null,
            petData.ruta_foto_carnet || null,
            petData.notas || null,
            petData.estado_activo !== undefined ? petData.estado_activo : null,
            id
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    delete: async (id) => {
        const result = await db.query(
            `UPDATE mascotas SET estado_activo = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *;`,
            [id]
        );
        return result.rows[0];
    },

    getOpcionesTemperamento: () => [
        { value: 'tranquilo', label: 'Tranquilo' },
        { value: 'nervioso', label: 'Nervioso' },
        { value: 'agresivo', label: 'Agresivo' },
        { value: 'inquieto', label: 'Inquieto' }
    ]
};

module.exports = Pet;
