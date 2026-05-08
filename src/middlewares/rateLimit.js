const rateLimit =
    require('express-rate-limit');

const globalLimiter =
    rateLimit({

        windowMs:
            15 * 60 * 1000,

        max: 100,

        message: {
            message:
                'Demasiadas solicitudes'
        },

        standardHeaders: true,

        legacyHeaders: false
    });
const loginLimiter =
    rateLimit({

        windowMs:
            15 * 60 * 1000,

        max: 5,

        message: {
            message:
                'Demasiados intentos login'
        }
    });
module.exports = {
    globalLimiter,
    loginLimiter
};