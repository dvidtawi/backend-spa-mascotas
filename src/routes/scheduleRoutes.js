const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/scheduleController');
const authMiddleware = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/roleMiddleware');
const uploadGroomingPhoto = require('../middlewares/uploadGroomingPhoto');
const uploadPetDocument = require('../middlewares/uploadPetDocument');

router.get('/servicios', scheduleController.getAllServicios);

router.post('/servicios', authMiddleware, roleMiddleware(1, 3), scheduleController.crearServicio);
router.put('/servicios/:id', authMiddleware, roleMiddleware(1), scheduleController.actualizarServicio);
router.delete('/servicios/:id', authMiddleware, roleMiddleware(1), scheduleController.eliminarServicio);

router.get('/mascotas', authMiddleware, roleMiddleware(4), scheduleController.getMascotasCliente);
router.get('/clientes/:clienteId/mascotas', authMiddleware, roleMiddleware(1, 3), scheduleController.getMascotasPorClienteStaff);
router.post('/mascotas', authMiddleware, roleMiddleware(4), uploadPetDocument.single('carnet'), scheduleController.crearMascota);
router.put('/mascotas/:mascotaId', authMiddleware, roleMiddleware(4), uploadPetDocument.single('carnet'), scheduleController.actualizarMascota);
router.delete('/mascotas/:mascotaId', authMiddleware, roleMiddleware(4), scheduleController.eliminarMascota);
router.get('/caracteristicas-mascotas', scheduleController.getCaracteristicasMascotas);

router.get('/clientes', authMiddleware, roleMiddleware(1, 3), scheduleController.getClientes);
router.get('/groomers', authMiddleware, roleMiddleware(1, 3), scheduleController.getGroomers);

router.get('/disponibilidad-spa', scheduleController.getDisponibilidadSpa);
router.post('/disponibilidad-spa', authMiddleware, roleMiddleware(1), scheduleController.crearDisponibilidadSpa);
router.put('/disponibilidad-spa/:id', authMiddleware, roleMiddleware(1), scheduleController.actualizarDisponibilidadSpa);
router.delete('/disponibilidad-spa/:id', authMiddleware, roleMiddleware(1), scheduleController.eliminarDisponibilidadSpa);

router.get('/disponibilidad-groomer/:groomerId', authMiddleware, roleMiddleware(1, 3), scheduleController.getDisponibilidadGroomer);
router.post('/disponibilidad-groomer', authMiddleware, roleMiddleware(1, 3), scheduleController.crearDisponibilidadGroomer);
router.put('/disponibilidad-groomer/:id', authMiddleware, roleMiddleware(1, 3), scheduleController.actualizarDisponibilidadGroomer);
router.delete('/disponibilidad-groomer/:id', authMiddleware, roleMiddleware(1, 3), scheduleController.eliminarDisponibilidadGroomer);

router.get('/bloqueos', authMiddleware, roleMiddleware(1, 3), scheduleController.getAllBloqueos);
router.post('/bloqueos', authMiddleware, roleMiddleware(1, 3), scheduleController.crearBloqueo);
router.get('/bloqueos/:groomerId', authMiddleware, roleMiddleware(1, 3, 2), scheduleController.getBloqueos);
router.put('/bloqueos/:bloqueoId', authMiddleware, roleMiddleware(1, 3), scheduleController.actualizarBloqueo);
router.delete('/bloqueos/:bloqueoId', authMiddleware, roleMiddleware(1, 3), scheduleController.eliminarBloqueo);

router.get('/mis-citas', authMiddleware, roleMiddleware(4), scheduleController.getCitasCliente);
router.get('/citas', authMiddleware, roleMiddleware(1, 3), scheduleController.getAllCitas);
router.get('/agenda', authMiddleware, roleMiddleware(1, 3), scheduleController.getAgenda);
router.get('/slots-disponibles', authMiddleware, scheduleController.getSlotsDisponibles);
router.post('/citas', authMiddleware, roleMiddleware(4), scheduleController.crearCita);
router.post('/citas/admin', authMiddleware, roleMiddleware(1, 3), scheduleController.crearCitaInterna);
router.put('/citas/:citaId/aprobar', authMiddleware, roleMiddleware(1, 3), scheduleController.aprobarCita);
router.put('/citas/:citaId/rechazar', authMiddleware, roleMiddleware(1, 3), scheduleController.rechazarCita);
router.put('/citas/:citaId/cancelar', authMiddleware, scheduleController.cancelarCita);
router.put('/citas/:citaId', authMiddleware, roleMiddleware(1, 3), scheduleController.actualizarCita);
router.get('/citas/:citaId', authMiddleware, scheduleController.getDetalleCita);

router.post('/pagos', authMiddleware, roleMiddleware(1, 3), scheduleController.registrarPago);
router.get('/pagos', authMiddleware, roleMiddleware(1, 3), scheduleController.getPagos);
router.get('/cierre-caja', authMiddleware, roleMiddleware(1, 3), scheduleController.getCierreCaja);

router.get('/groomer/agenda', authMiddleware, roleMiddleware(2), scheduleController.getAgendaGroomer);
router.get('/groomer/citas/:citaId/ficha', authMiddleware, roleMiddleware(2), scheduleController.getFichaGroomer);
router.put('/groomer/citas/:citaId/ficha', authMiddleware, roleMiddleware(2), scheduleController.guardarFichaGroomer);
router.post('/groomer/citas/:citaId/fotos/:tipo', authMiddleware, roleMiddleware(2), uploadGroomingPhoto.single('foto'), scheduleController.subirFotoGroomer);
router.put('/groomer/citas/:citaId/iniciar', authMiddleware, roleMiddleware(2), scheduleController.iniciarServicioGroomer);
router.put('/groomer/citas/:citaId/finalizar', authMiddleware, roleMiddleware(2), scheduleController.finalizarServicioGroomer);

module.exports = router;
