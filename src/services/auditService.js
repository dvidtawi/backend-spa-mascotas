const AuditLog = require('../models/AuditLog');

const logEvent = async (req, evento, descripcion, usuario = null) => {
    try {
        await AuditLog.create({
            usuario_id: usuario?.id || null,
            email_usuario: usuario?.email || req.body.email,
            evento,
            descripcion,
            ip_address: req.ip,
            user_agent: req.headers['user-agent'],
            detalles_json: {}
        });
    } catch (err) {
        console.error('Error audit log:', err);
    }
};

module.exports = { logEvent };