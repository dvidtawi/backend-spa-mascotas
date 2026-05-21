const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/scheduleController');
const authMiddleware = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/roleMiddleware');

// ROLES: 1 = admin, 2 = groomer, 3 = recepcion, 4 = cliente

// ============ SERVICIOS ============

// GET /api/schedule/servicios - Obtener todos los servicios (público)
router.get('/servicios', scheduleController.getAllServicios);

// POST /api/schedule/servicios - Crear nuevo servicio (admin, recepcion)
router.post(
    '/servicios',
    authMiddleware,
    roleMiddleware(1, 3),
    scheduleController.crearServicio
);

// PUT /api/schedule/servicios/:id - Actualizar servicio (admin)
router.put(
    '/servicios/:id',
    authMiddleware,
    roleMiddleware(1),
    scheduleController.actualizarServicio
);

// DELETE /api/schedule/servicios/:id - Eliminar servicio (admin)
router.delete(
    '/servicios/:id',
    authMiddleware,
    roleMiddleware(1),
    scheduleController.eliminarServicio
);

// ============ MASCOTAS ============

// GET /api/schedule/mascotas - Obtener mascotas del cliente autenticado
router.get(
    '/mascotas',
    authMiddleware,
    roleMiddleware(4),
    scheduleController.getMascotasCliente
);

// POST /api/schedule/mascotas - Crear nueva mascota
router.post(
    '/mascotas',
    authMiddleware,
    roleMiddleware(4),
    scheduleController.crearMascota
);

// PUT /api/schedule/mascotas/:mascotaId - Actualizar mascota
router.put(
    '/mascotas/:mascotaId',
    authMiddleware,
    roleMiddleware(4),
    scheduleController.actualizarMascota
);

// DELETE /api/schedule/mascotas/:mascotaId - Eliminar mascota
router.delete(
    '/mascotas/:mascotaId',
    authMiddleware,
    roleMiddleware(4),
    scheduleController.eliminarMascota
);

// GET /api/schedule/caracteristicas-mascotas - Obtener características disponibles
router.get(
    '/caracteristicas-mascotas',
    scheduleController.getCaracteristicasMascotas
);

// ============ DISPONIBILIDAD DEL SPA ============

// GET /api/schedule/disponibilidad-spa - Obtener disponibilidad del spa
router.get(
    '/disponibilidad-spa',
    scheduleController.getDisponibilidadSpa
);

// POST /api/schedule/disponibilidad-spa - Crear disponibilidad del spa (admin)
router.post(
    '/disponibilidad-spa',
    authMiddleware,
    roleMiddleware(1),
    scheduleController.crearDisponibilidadSpa
);

// PUT /api/schedule/disponibilidad-spa/:id - Actualizar disponibilidad del spa (admin)
router.put(
    '/disponibilidad-spa/:id',
    authMiddleware,
    roleMiddleware(1),
    scheduleController.actualizarDisponibilidadSpa
);

// DELETE /api/schedule/disponibilidad-spa/:id - Eliminar disponibilidad del spa (admin)
router.delete(
    '/disponibilidad-spa/:id',
    authMiddleware,
    roleMiddleware(1),
    scheduleController.eliminarDisponibilidadSpa
);

// ============ DISPONIBILIDAD DE GROOMERS ============

// GET /api/schedule/disponibilidad-groomer/:groomerId - Obtener disponibilidad de un groomer
router.get(
    '/disponibilidad-groomer/:groomerId',
    scheduleController.getDisponibilidadGroomer
);

// POST /api/schedule/disponibilidad-groomer - Crear disponibilidad de groomer (admin)
router.post(
    '/disponibilidad-groomer',
    authMiddleware,
    roleMiddleware(1),
    scheduleController.crearDisponibilidadGroomer
);

// ============ BLOQUEOS ============

// POST /api/schedule/bloqueos - Crear bloqueo (admin, recepcion)
router.post(
    '/bloqueos',
    authMiddleware,
    roleMiddleware(1, 3),
    scheduleController.crearBloqueo
);

// GET /api/schedule/bloqueos/:groomerId - Obtener bloqueos de un groomer
router.get(
    '/bloqueos/:groomerId',
    authMiddleware,
    roleMiddleware(1, 3, 2),
    scheduleController.getBloqueos
);

// ============ SLOTS/CITAS ============

// GET /api/schedule/mis-citas - Obtener citas del cliente autenticado
router.get(
    '/mis-citas',
    authMiddleware,
    roleMiddleware(4),
    scheduleController.getCitasCliente
);

// GET /api/schedule/citas - Obtener todas las citas (solo admin, recepcion)
router.get(
    '/citas',
    authMiddleware,
    roleMiddleware(1, 3),
    scheduleController.getAllCitas
);

// GET /api/schedule/slots-disponibles - Obtener slots disponibles
router.get(
    '/slots-disponibles',
    authMiddleware,
    scheduleController.getSlotsDisponibles
);

// POST /api/schedule/citas - Crear nueva cita
router.post(
    '/citas',
    authMiddleware,
    roleMiddleware(4),
    scheduleController.crearCita
);

// GET /api/schedule/citas/:citaId - Obtener detalles de una cita
router.get(
    '/citas/:citaId',
    authMiddleware,
    scheduleController.getDetalleCita
);

// PUT /api/schedule/citas/:citaId/cancelar - Cancelar una cita
router.put(
    '/citas/:citaId/cancelar',
    authMiddleware,
    scheduleController.cancelarCita
);

module.exports = router;
