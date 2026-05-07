const express = require('express');

const router = express.Router();

const adminController =
    require('../controllers/adminController');

const auth =
    require('../middlewares/auth');

const role =
    require('../middlewares/roleMiddleware');

router.use(auth);
router.use(role(1));

router.get(
    '/users',
    adminController.getUsers
);

router.put(
    '/users/:id/deactivate',
    adminController.deactivateUser
);

router.put(
    '/users/:id/activate',
    adminController.activateUser
);

router.put(
    '/users/:id/force-password-change',
    adminController.forcePasswordChange
);

router.get(
    '/audit-logs',
    adminController.auditLogs
);

module.exports = router;