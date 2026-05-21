const db = require('../config/database');

const Service = {
    // Crear servicio
    create: async (servicioData) => {
        const query = `
            INSERT INTO servicios (nombre, descripcion, duracion_base, precio, estado_activo)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;

        const values = [
            servicioData.nombre,
            servicioData.descripcion,
            servicioData.duracion_base,
            servicioData.precio,
            servicioData.estado_activo || true
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    // Obtener todos los servicios
    getAll: async (activos = true) => {
        let query = 'SELECT * FROM servicios';
        const values = [];

        if (activos) {
            query += ' WHERE estado_activo = true';
        }

        query += ' ORDER BY nombre ASC;';

        const result = await db.query(query, values);
        return result.rows;
    },

    // Obtener servicio por ID
    getById: async (id) => {
        const result = await db.query(
            'SELECT * FROM servicios WHERE id = $1',
            [id]
        );
        return result.rows[0];
    },

    // Actualizar servicio
    update: async (id, servicioData) => {
        const query = `
            UPDATE servicios
            SET 
                nombre = COALESCE($1, nombre),
                descripcion = COALESCE($2, descripcion),
                duracion_base = COALESCE($3, duracion_base),
                precio = COALESCE($4, precio),
                estado_activo = COALESCE($5, estado_activo),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $6
            RETURNING *;
        `;

        const values = [
            servicioData.nombre || null,
            servicioData.descripcion || null,
            servicioData.duracion_base || null,
            servicioData.precio || null,
            servicioData.estado_activo !== undefined ? servicioData.estado_activo : null,
            id
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    // Eliminar servicio (soft delete)
    delete: async (id) => {
        const result = await db.query(
            `UPDATE servicios SET estado_activo = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *;`,
            [id]
        );
        return result.rows[0];
    }
};

module.exports = Service;
