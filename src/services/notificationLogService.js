const fs = require('fs');
const path = require('path');

const notificationsLogPath = path.join(__dirname, '..', '..', 'notifications.log');

const appendNotification = async (payload) => {
    const line = `[${new Date().toISOString()}] ${JSON.stringify(payload)}\n`;
    await fs.promises.appendFile(notificationsLogPath, line, 'utf8');
};

module.exports = {
    appendNotification,
    notificationsLogPath
};
