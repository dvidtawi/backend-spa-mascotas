const db = require('../config/database');

const Pet = {
    // Crear mascota
    create: async (petData) => {
        const query = `
            INSERT INTO mascotas (cliente_id, nombre, especie, raza, tamaño, caracteristica_id, notas, estado_activo)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *;
        `;

        const values = [
            petData.cliente_id,
            petData.nombre,
            petData.especie || null,
            petData.raza || null,
            petData.tamaño || null,
            petData.caracteristica_id || null,
            petData.notas || null,
            petData.estado_activo || true
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    // Obtener mascotas de un cliente
    getByClienteId: async (clienteId) => {
        const query = `
            SELECT m.*, cm.nombre as caracteristica, cm.ajuste_porcentaje
            FROM mascotas m
            LEFT JOIN caracteristicas_mascotas cm ON m.caracteristica_id = cm.id
            WHERE m.cliente_id = $1 AND m.estado_activo = true
            ORDER BY m.nombre ASC;
        `;

        const result = await db.query(query, [clienteId]);
        return result.rows;
    },

    // Obtener mascota por ID
    getById: async (id) => {
        const query = `
            SELECT m.*, cm.nombre as caracteristica, cm.ajuste_porcentaje
            FROM mascotas m
            LEFT JOIN caracteristicas_mascotas cm ON m.caracteristica_id = cm.id
            WHERE m.id = $1;
        `;

        const result = await db.query(query, [id]);
        return result.rows[0];
    },

    // Actualizar mascota
    update: async (id, petData) => {
        const query = `
            UPDATE mascotas
            SET 
                nombre = COALESCE($1, nombre),
                especie = COALESCE($2, especie),
                raza = COALESCE($3, raza),
                tamaño = COALESCE($4, tamaño),
                caracteristica_id = COALESCE($5, caracteristica_id),
                notas = COALESCE($6, notas),
                estado_activo = COALESCE($7, estado_activo),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $8
            RETURNING *;
        `;

        const values = [
            petData.nombre || null,
            petData.especie || null,
            petData.raza || null,
            petData.tamaño || null,
            petData.caracteristica_id || null,
            petData.notas || null,
            petData.estado_activo !== undefined ? petData.estado_activo : null,
            id
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    // Eliminar mascota (soft delete)
    delete: async (id) => {
        const result = await db.query(
            `UPDATE mascotas SET estado_activo = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *;`,
            [id]
        );
        return result.rows[0];
    },

    // Obtener características de mascotas
    getCaracteristicas: async () => {
        const result = await db.query('SELECT * FROM caracteristicas_mascotas ORDER BY nombre ASC;');
        return result.rows;
    },

    // Obtener característica por ID
    getCaracteristicaById: async (id) => {
        const result = await db.query(
            'SELECT * FROM caracteristicas_mascotas WHERE id = $1',
            [id]
        );
        return result.rows[0];
    }
};

module.exports = Pet;
