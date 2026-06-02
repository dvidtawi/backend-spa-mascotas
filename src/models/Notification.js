const db = require('../config/database');

const Notification = {
    create: async (data = {}) => {
        const result = await db.query(`
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
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, COALESCE($8, false), $9)
            ON CONFLICT (dedupe_key) DO UPDATE
            SET
                recipient_user_id = COALESCE(EXCLUDED.recipient_user_id, notificaciones.recipient_user_id),
                recipient_role = COALESCE(EXCLUDED.recipient_role, notificaciones.recipient_role),
                tipo = EXCLUDED.tipo,
                titulo = EXCLUDED.titulo,
                mensaje = EXCLUDED.mensaje,
                metadata = COALESCE(EXCLUDED.metadata, notificaciones.metadata),
                updated_at = CURRENT_TIMESTAMP
            RETURNING *;
        `, [
            data.recipient_user_id || null,
            data.recipient_role ?? null,
            data.tipo || 'general',
            data.titulo || 'Notificacion',
            data.mensaje || '',
            JSON.stringify(data.metadata || {}),
            data.dedupe_key || null,
            data.leido ?? false,
            data.read_at || null
        ]);

        return result.rows[0];
    },

    listForUser: async ({ userId = null, role = null, unreadOnly = false, limit = 80 } = {}) => {
        const values = [userId || null, role ?? null];
        let query = `
            SELECT *
            FROM notificaciones
            WHERE (
                recipient_user_id = $1
                OR recipient_role = $2
                OR (recipient_user_id IS NULL AND recipient_role IS NULL)
            )
        `;

        if (unreadOnly) {
            query += ' AND leido = false';
        }

        query += ' ORDER BY created_at DESC LIMIT $3';
        values.push(limit);

        const result = await db.query(query, values);
        return result.rows;
    },

    countUnread: async ({ userId = null, role = null } = {}) => {
        const result = await db.query(
            `
            SELECT COUNT(*)::int AS total
            FROM notificaciones
            WHERE (
                recipient_user_id = $1
                OR recipient_role = $2
                OR (recipient_user_id IS NULL AND recipient_role IS NULL)
            )
              AND leido = false;
            `,
            [userId || null, role ?? null]
        );

        return Number(result.rows[0]?.total || 0);
    },

    markRead: async ({ id, userId = null, role = null }) => {
        const result = await db.query(
            `
            UPDATE notificaciones
            SET leido = true,
                read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
            WHERE id = $1
              AND (
                  recipient_user_id = $2
                  OR recipient_role = $3
                  OR (recipient_user_id IS NULL AND recipient_role IS NULL)
              )
            RETURNING *;
            `,
            [id, userId || null, role ?? null]
        );

        return result.rows[0];
    },

    markAllRead: async ({ userId = null, role = null }) => {
        const result = await db.query(
            `
            UPDATE notificaciones
            SET leido = true,
                read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
            WHERE (
                recipient_user_id = $1
                OR recipient_role = $2
                OR (recipient_user_id IS NULL AND recipient_role IS NULL)
            )
              AND leido = false
            RETURNING *;
            `,
            [userId || null, role ?? null]
        );

        return result.rows;
    }
};

module.exports = Notification;
