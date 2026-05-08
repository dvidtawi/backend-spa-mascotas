const cron = require('node-cron');
const db = require('../config/database');

const startSessionCleanup = () => {

    // cada 1 hora
    cron.schedule('0 * * * *', async () => {

        try {

            const result = await db.query(`
                DELETE FROM user_sessions
                WHERE expires_at < NOW()
            `);

            console.log(
                `🧹 Sesiones expiradas eliminadas`
            );

        } catch (err) {

            console.error(
                'Cleanup error:',
                err.message
            );
        }
    });
};

module.exports = {
    startSessionCleanup
};