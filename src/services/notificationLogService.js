const fs = require('fs');
const path = require('path');
const db = require('../config/database');
const { sendEmail } = require('./emailService');

const notificationsLogPath = path.join(__dirname, '..', '..', 'notifications.log');

const normalizeRecipients = (payload) => {
    if (Array.isArray(payload.recipient_roles) && payload.recipient_roles.length > 0) {
        return payload.recipient_roles.map((role) => ({ recipient_role: Number(role) || null }));
    }

    if (Array.isArray(payload.recipient_user_ids) && payload.recipient_user_ids.length > 0) {
        return payload.recipient_user_ids.map((userId) => ({ recipient_user_id: userId || null }));
    }

    if (payload.recipient_user_id || payload.recipient_role !== undefined) {
        return [{
            recipient_user_id: payload.recipient_user_id || null,
            recipient_role: payload.recipient_role ?? null
        }];
    }

    return [{ recipient_user_id: null, recipient_role: null }];
};

const appendNotification = async (payload) => {
    const notificationPayload = {
        tipo: payload.tipo || 'general',
        titulo: payload.titulo || payload.asunto || 'Notificacion',
        mensaje: payload.mensaje || payload.message || payload.descripcion || '',
        metadata: payload.metadata || {
            ...payload
        }
    };

    const line = `[${new Date().toISOString()}] ${JSON.stringify(payload)}\n`;
    await fs.promises.appendFile(notificationsLogPath, line, 'utf8');

    const recipients = normalizeRecipients(payload);
    for (const recipient of recipients) {
        try {
            const dedupeKey = payload.dedupe_key
                ? `${payload.dedupe_key}:${recipient.recipient_user_id || recipient.recipient_role || 'all'}`
                : null;
            await db.query(`
                INSERT INTO notificaciones (
                    recipient_user_id,
                    recipient_role,
                    tipo,
                    titulo,
                    mensaje,
                    metadata,
                    dedupe_key,
                    leido,
                    read_at
                )
                VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, false, NULL)
                ON CONFLICT (dedupe_key) DO UPDATE
                SET
                    recipient_user_id = COALESCE(EXCLUDED.recipient_user_id, notificaciones.recipient_user_id),
                    recipient_role = COALESCE(EXCLUDED.recipient_role, notificaciones.recipient_role),
                    tipo = EXCLUDED.tipo,
                    titulo = EXCLUDED.titulo,
                    mensaje = EXCLUDED.mensaje,
                    metadata = COALESCE(EXCLUDED.metadata, notificaciones.metadata),
                    updated_at = CURRENT_TIMESTAMP;
            `, [
                recipient.recipient_user_id,
                recipient.recipient_role,
                notificationPayload.tipo,
                notificationPayload.titulo,
                notificationPayload.mensaje,
                JSON.stringify(notificationPayload.metadata || {}),
                dedupeKey
            ]);
        } catch (dbError) {
            console.warn('No se pudo guardar la notificacion en BD:', dbError.message);
        }
    }

    if (payload.email_to) {
        try {
            const subject = payload.email_subject || notificationPayload.titulo;
            const body = payload.email_body || notificationPayload.mensaje;
            await sendEmail(payload.email_to, subject, body);
        } catch (mailError) {
            console.warn('No se pudo enviar el correo de notificacion:', mailError.message);
        }
    }
};

module.exports = {
    appendNotification,
    notificationsLogPath
};
