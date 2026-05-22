const multer = require('multer');
const fs = require('fs');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const targetDir = path.join(__dirname, '..', '..', 'uploads', 'pets');
        fs.mkdirSync(targetDir, { recursive: true });
        cb(null, targetDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
        const safeBase = `pet-${Date.now()}`;
        cb(null, `${safeBase}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp'
    ];

    if (!allowed.includes(file.mimetype)) {
        cb(new Error('Solo se permiten PDF o imagenes'));
        return;
    }

    cb(null, true);
};

module.exports = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 8 * 1024 * 1024
    }
});
