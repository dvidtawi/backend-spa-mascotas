const db = require('../config/database');

const VerificationCode = {
    create: async (data) => {
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