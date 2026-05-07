const jwt = require('jsonwebtoken');

exports.generateAccessToken = (
    user,
    sessionId
) => {

    return jwt.sign(
        {
            id: user.id,
            rol_id: user.rol_id,
            session_id: sessionId
        },
        process.env.JWT_SECRET,
        {
            expiresIn: '15m'
        }
    );
};

exports.generateRefreshToken = (
    user,
    sessionId
) => {

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
