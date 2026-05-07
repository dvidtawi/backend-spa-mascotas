const db = require('../config/database');

const AuditLog = {
    create: async (log) => {
        const query = `
            INSERT INTO audit_log (usuario_id, email_usuario, evento, descripcion, ip_address, user_agent, detalles_json)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;
        const values = [
            log.usuario_id,
            log.email_usuario,
            log.evento,
            log.descripcion,
            log.ip_address,
            log.user_agent,
            log.detalles_json || {}
        ];
        await db.query(query, values);
    }
};

module.exports = AuditLog;