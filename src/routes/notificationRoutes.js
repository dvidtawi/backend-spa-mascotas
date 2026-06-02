const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middlewares/auth');
const { notificationLimiter } = require('../middlewares/rateLimit');

router.get('/', notificationLimiter, authMiddleware, notificationController.getMine);
router.get('/unread-count', notificationLimiter, authMiddleware, notificationController.countUnread);
router.put('/:id/leida', notificationLimiter, authMiddleware, notificationController.markRead);
router.put('/leidas', notificationLimiter, authMiddleware, notificationController.markAllRead);

module.exports = router;
