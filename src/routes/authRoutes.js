const express = require('express');
const router = express.Router();

const auth = require('../controllers/authController');
const authMiddleware = require('../middlewares/auth');

router.post('/register', auth.register);
router.post('/verify-email', auth.verifyEmail);
router.post('/login', auth.login);
router.post('/logout', auth.logout);
router.post('/forgot-password', auth.forgotPassword);
router.post('/reset-password', auth.resetPassword);
router.post('/change-password', authMiddleware, auth.changePassword);
router.post('/refresh-token', auth.refreshToken);
module.exports = router;