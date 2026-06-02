const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const authMiddleware = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/roleMiddleware');
const uploadInventoryImage = require('../middlewares/uploadInventoryImage');

router.get('/', authMiddleware, roleMiddleware(1, 3), inventoryController.getInventario);
router.get('/alertas', authMiddleware, roleMiddleware(1, 3), inventoryController.getInventarioAlertas);
router.get('/citas/:citaId', authMiddleware, roleMiddleware(1, 3, 2), inventoryController.getInsumosCita);
router.get('/citas-pendientes', authMiddleware, roleMiddleware(1, 3), inventoryController.getCitasPendientesInsumos);
router.post('/', authMiddleware, roleMiddleware(1, 3), inventoryController.crearInventario);
router.post('/upload-image', authMiddleware, roleMiddleware(1, 3), uploadInventoryImage.single('imagen'), inventoryController.uploadInventarioImagen);
router.put('/:id', authMiddleware, roleMiddleware(1, 3), inventoryController.actualizarInventario);
router.put('/:id/estado', authMiddleware, roleMiddleware(1, 3), inventoryController.toggleInventario);
router.post('/entregar', authMiddleware, roleMiddleware(1, 3), inventoryController.entregarInsumos);
router.post('/confirmar-uso', authMiddleware, roleMiddleware(2), inventoryController.confirmarUso);

module.exports = router;
