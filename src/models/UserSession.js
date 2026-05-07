const db = require('../config/database');

const UserSession = {
    create: async (session) => {
        const query = `
            INSERT INTO user_sessions (usuario_id, refresh_token, ip_address, user_agent, expires_at)
            VALUES ($1, $2, $3, $4, $5)
        `;
        await db.query(query, [
            session.usuario_id,
            session.refresh_token,
            session.ip_address,
            session.user_agent,
            session.expires_at
        ]);
    }
};

module.exports = UserSession;