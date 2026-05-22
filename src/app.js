const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();
const {
    globalLimiter
} = require('./middlewares/rateLimit');
const app = express();

// Middlewares
app.use(helmet({
    crossOriginResourcePolicy: false
}));
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

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
const scheduleRoutes = require('./routes/scheduleRoutes');
const {
    startSessionCleanup
} = require('./services/sessionCleanupService');

app.use('/api/admin', adminRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use(globalLimiter);
app.use('/api/auth', authRoutes);
startSessionCleanup();
