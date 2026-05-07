const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: 'Demasiadas peticiones, intenta más tarde'
});

module.exports = limiter;