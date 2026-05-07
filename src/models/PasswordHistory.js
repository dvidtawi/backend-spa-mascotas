const db = require('../config/database');

const PasswordHistory = {
    save: async (userId, hash) => {
        await db.query(
            `INSERT INTO password_history (usuario_id, password_hash) VALUES ($1, $2)`,
            [userId, hash]
        );
    },

    getLast: async (userId) => {
        const result = await db.query(
            `SELECT password_hash FROM password_history 
             WHERE usuario_id=$1 
             ORDER BY created_at DESC LIMIT 3`,
            [userId]
        );
        return result.rows;
    }
};

module.exports = PasswordHistory;