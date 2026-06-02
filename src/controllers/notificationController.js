const Notification = require('../models/Notification');

const NotificationController = {
    getMine: async (req, res) => {
        try {
            const unreadOnly = req.query.unread_only === 'true';
            const limit = Math.min(Number(req.query.limit) || 80, 200);
            const data = await Notification.listForUser({
                userId: req.user?.id || null,
                role: Number(req.user?.rol) || null,
                unreadOnly,
                limit
            });

            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    countUnread: async (req, res) => {
        try {
            const total = await Notification.countUnread({
                userId: req.user?.id || null,
                role: Number(req.user?.rol) || null
            });

            res.json({ success: true, data: { total } });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    markRead: async (req, res) => {
        try {
            const row = await Notification.markRead({
                id: req.params.id,
                userId: req.user?.id || null,
                role: Number(req.user?.rol) || null
            });

            if (!row) {
                return res.status(404).json({ success: false, error: 'Notificacion no encontrada' });
            }

            res.json({ success: true, data: row });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    markAllRead: async (req, res) => {
        try {
            const rows = await Notification.markAllRead({
                userId: req.user?.id || null,
                role: Number(req.user?.rol) || null
            });

            res.json({ success: true, data: { updated: rows.length } });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
};

module.exports = NotificationController;
