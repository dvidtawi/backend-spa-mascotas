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

        max: 100,

        message: {
            message:
                'Demasiados intentos login'
        }
    });

const notificationLimiter =
    rateLimit({

        windowMs:
            1 * 60 * 1000,

        max: 60,

        message: {
            message:
                'Demasiadas solicitudes de notificaciones'
        },

        standardHeaders: true,

        legacyHeaders: false
    });

module.exports = {
    globalLimiter,
    loginLimiter,
    notificationLimiter
};