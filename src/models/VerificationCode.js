const db = require('../config/database');

const VerificationCode = {
    create: async (data) => {
        await db.query(
            `
            UPDATE verification_codes
            SET usado=true
            WHERE email=$1
            AND tipo=$2
            AND usado=false
            `,
            [data.email, data.tipo]
        );

        const query = `
            INSERT INTO verification_codes (email, codigo, tipo, expira_en)
            VALUES ($1, $2, $3, $4)
        `;
        await db.query(query, [
            data.email,
            data.codigo,
            data.tipo,
            data.expira_en
        ]);
    }
};

module.exports = VerificationCode;