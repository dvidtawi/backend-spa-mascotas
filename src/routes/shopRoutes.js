const express = require('express');
const router = express.Router();
const shopController = require('../controllers/shopController');
const authMiddleware = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/roleMiddleware');

router.get('/catalogo', authMiddleware, roleMiddleware(1, 3, 4), shopController.getCatalogo);
router.get('/promociones', authMiddleware, roleMiddleware(1, 3, 4), shopController.getPromociones);
router.get('/cupones', authMiddleware, roleMiddleware(1, 3), shopController.getCupones);
router.get('/cupones/validar', authMiddleware, roleMiddleware(1, 3, 4), shopController.validarCupon);
router.get('/pedidos', authMiddleware, roleMiddleware(1, 3, 4), shopController.getPedidos);
router.get('/pedidos/:pedidoId/mensaje', authMiddleware, roleMiddleware(1, 3, 4), shopController.getPedidoMensaje);
router.post('/pedidos', authMiddleware, roleMiddleware(4), shopController.crearPedido);
router.post('/ventas', authMiddleware, roleMiddleware(1, 3), shopController.crearVentaPos);
router.post('/promociones', authMiddleware, roleMiddleware(1, 3), shopController.crearPromocion);
router.post('/cupones', authMiddleware, roleMiddleware(1, 3), shopController.crearCupon);
router.put('/promociones/:id', authMiddleware, roleMiddleware(1, 3), shopController.actualizarPromocion);
router.put('/promociones/:id/estado', authMiddleware, roleMiddleware(1, 3), shopController.togglePromocion);
router.put('/cupones/:id', authMiddleware, roleMiddleware(1, 3), shopController.actualizarCupon);
router.put('/cupones/:id/estado', authMiddleware, roleMiddleware(1, 3), shopController.toggleCupon);

module.exports = router;
