const db = require('../config/database');

const User = {
    create: async (user) => {
        const query = `
            INSERT INTO usuarios (email, password_hash, nombre, telefono, rol_id)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `;
        const values = [
            user.email,
            user.password_hash,
            user.nombre,
            user.telefono,
            user.rol_id
        ];
        const result = await db.query(query, values);
        return result.rows[0];
    },

    findByEmail: async (email) => {
        const result = await db.query(
            `SELECT * FROM usuarios WHERE email = $1`,
            [email]
        );
        return result.rows[0];
    },

    findById: async (id) => {
        const result = await db.query(
            `SELECT * FROM usuarios WHERE id = $1`,
            [id]
        );
        return result.rows[0];
    },
    findAll: async () => {

        const result = await db.query(`
            SELECT
                u.id,
                u.email,
                u.nombre,
                u.telefono,
                u.estado_activo,
                u.primer_inicio,
                u.created_at,
                r.nombre as rol
            FROM usuarios u
            JOIN roles r ON r.id = u.rol_id
            ORDER BY created_at DESC
        `);

        return result.rows;
    },
    updateStatus: async (id, estado) => {

        await db.query(
            `
            UPDATE usuarios
            SET estado_activo=$1
            WHERE id=$2
            `,
            [estado, id]
        );
    },
    forcePasswordChange: async (id) => {

        await db.query(
            `
            UPDATE usuarios
            SET primer_inicio=true
            WHERE id=$1
            `,
            [id]
        );
    },
};

module.exports = User;