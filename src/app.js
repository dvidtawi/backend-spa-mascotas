const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();
const {
    globalLimiter
} = require('./middlewares/rateLimit');
const app = express();

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());

// Ruta base
app.get('/', (req, res) => {
    res.json({ message: 'API Pet Spa funcionando 🚀' });
});

// Puerto
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🔥 Servidor corriendo en http://localhost:${PORT}`);
});

const authRoutes = require('./routes/authRoutes');
const limiter = require('./middlewares/rateLimit');
const adminRoutes =
    require('./routes/adminRoutes');
const {
    startSessionCleanup
} = require('./services/sessionCleanupService');

app.use('/api/admin', adminRoutes);
app.use(globalLimiter);
app.use('/api/auth', authRoutes);
startSessionCleanup();