const fs = require('fs');

const sendEmail = async (to, subject, content) => {
    const log = `
========================
TO: ${to}
SUBJECT: ${subject}
CONTENT:
${content}
========================
`;

    console.log(log);

    fs.appendFileSync('emails.log', log);
};

module.exports = { sendEmail };