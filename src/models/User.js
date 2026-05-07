const db = require('../config/database');

const User = {

    create: async (user) => {

        const query = `
            INSERT INTO usuarios (
                email,
                password_hash,
                nombre,
                telefono,
                rol_id,
                primer_inicio,
                email_verificado
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            RETURNING *;
        `;

        const values = [
            user.email,
            user.password_hash,
            user.nombre,
            user.telefono,
            user.rol_id,
            user.primer_inicio,
            user.email_verificado
        ];

        const result = await db.query(
            query,
            values
        );

        return result.rows[0];
    },

    findByEmail: async (email) => {

        const result = await db.query(
            `SELECT * FROM usuarios WHERE email=$1`,
            [email]
        );

        return result.rows[0];
    },

    findById: async (id) => {

        const result = await db.query(
            `SELECT * FROM usuarios WHERE id=$1`,
            [id]
        );

        return result.rows[0];
    },

    getAll: async () => {

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
            JOIN roles r
            ON r.id = u.rol_id
            ORDER BY u.created_at DESC
        `);

        return result.rows;
    }

};

module.exports = User;