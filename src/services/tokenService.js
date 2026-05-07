const jwt = require('jsonwebtoken');

const generateAccessToken = (user, sessionId) => {

    return jwt.sign(
        {
            id: user.id,
            email: user.email,
            rol: user.rol_id,
            session_id: sessionId
        },
        process.env.JWT_SECRET,
        {
            expiresIn: '15m'
        }
    );
};

const generateRefreshToken = (user, sessionId) => {

    return jwt.sign(
        {
            id: user.id,
            session_id: sessionId
        },
        process.env.JWT_REFRESH_SECRET,
        {
            expiresIn: '7d'
        }
    );
};

module.exports = {
    generateAccessToken,
    generateRefreshToken
};