const AuditLog = require('../models/AuditLog');

const logEvent = async (
    req,
    evento,
    descripcion,
    actor = null,
    detalles = {}
) => {

    try {

        await AuditLog.create({

            // quién realizó la acción
            usuario_id:
                actor?.id ||
                req.user?.id ||
                null,

            email_usuario:
                actor?.email ||
                req.user?.email ||
                req.body.email ||
                null,

            evento,

            descripcion,

            ip_address: req.ip,

            user_agent:
                req.headers['user-agent'],

            // información extra
            detalles_json: detalles
        });

    } catch (err) {

        console.error(
            'Error audit log:',
            err
        );
    }
};

module.exports = {
    logEvent
};