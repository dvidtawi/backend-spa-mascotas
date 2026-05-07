const express = require('express');

const router = express.Router();

const admin =
    require('../controllers/adminController');

const auth =
    require('../middlewares/auth');

const role =
    require('../middlewares/roleMiddleware');

router.use(auth);
router.use(role(1));

router.get(
    '/users',
    admin.getUsers
);

router.post(
    '/users',
    admin.createUser
);

router.put(
    '/users/:id',
    admin.updateUser
);

router.patch(
    '/users/:id/toggle',
    admin.toggleUser
);



router.get(
    '/audit-logs',
    admin.auditLogs
);

module.exports = router;