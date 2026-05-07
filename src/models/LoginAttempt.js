const db = require('../config/database');

const LoginAttempt = {
    findByEmail: async (email) => {
        const result = await db.query(
            `SELECT * FROM login_attempts WHERE email = $1`,
            [email]
        );
        return result.rows[0];
    },

    createOrUpdate: async (email, intentos, bloqueado_hasta) => {
        const query = `
            INSERT INTO login_attempts (email, intentos, bloqueado_hasta)
            VALUES ($1, $2, $3)
            ON CONFLICT (email)
            DO UPDATE SET intentos = $2, bloqueado_hasta = $3, updated_at = CURRENT_TIMESTAMP
            RETURNING *;
        `;
        const result = await db.query(query, [email, intentos, bloqueado_hasta]);
        return result.rows[0];
    }
};

module.exports = LoginAttempt;