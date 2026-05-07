const jwt = require('jsonwebtoken');
const db = require('../config/database');

const IDLE_TIMEOUT_MINUTES = 1;

const authMiddleware = async (req, res, next) => {
    try {

        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                message: 'No autorizado'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // buscar sesión activa
        const sessionResult = await db.query(
            `SELECT * FROM user_sessions 
             WHERE usuario_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [decoded.id]
        );

        const session = sessionResult.rows[0];

        if (!session) {
            return res.status(401).json({
                message: 'Sesión no válida'
            });
        }

        // verificar idle timeout
        const now = new Date();
        const lastActivity = new Date(session.last_activity);

        const diffMinutes =
            (now - lastActivity) / 1000 / 60;

        if (diffMinutes > IDLE_TIMEOUT_MINUTES) {

            await db.query(
                `DELETE FROM user_sessions WHERE id=$1`,
                [session.id]
            );

            return res.status(401).json({
                message: 'Sesión expirada por inactividad'
            });
        }

        // actualizar actividad
        await db.query(
            `UPDATE user_sessions
             SET last_activity = CURRENT_TIMESTAMP
             WHERE id=$1`,
            [session.id]
        );

        req.user = decoded;

        next();

    } catch (err) {

    console.error('AUTH ERROR:', err);

    return res.status(401).json({
        message: err.message
    });
}
};

module.exports = authMiddleware;