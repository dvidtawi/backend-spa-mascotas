const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({

    service: 'gmail',

    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendEmail = async (
    to,
    subject,
    content
) => {

    try {

        await transporter.sendMail({

            from:
                `"Pet Spa" <${process.env.EMAIL_USER}>`,

            to,

            subject,

            text: content
        });

        console.log(
            `📧 Email enviado a ${to}`
        );

    } catch (err) {

        console.error(
            'Error enviando email:',
            err.message
        );

        throw err;
    }
};

module.exports = {
    sendEmail
};