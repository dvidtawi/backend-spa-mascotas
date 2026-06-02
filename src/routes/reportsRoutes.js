const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');
const authMiddleware = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/roleMiddleware');

router.get('/insumos/auditoria', authMiddleware, roleMiddleware(1, 3), reportsController.auditoriaInsumos);
router.get('/groomer/productividad', authMiddleware, roleMiddleware(1, 2, 3), reportsController.productividadGroomer);
router.get('/groomer/historial', authMiddleware, roleMiddleware(1, 2, 3), reportsController.historialGroomer);
router.get('/groomer/consumo', authMiddleware, roleMiddleware(1, 2, 3), reportsController.consumoGroomer);
router.get('/cliente/beneficios', authMiddleware, roleMiddleware(1, 4), reportsController.beneficiosCliente);

module.exports = router;
