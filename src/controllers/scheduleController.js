const Service = require('../models/Service');
const Pet = require('../models/Pet');
const Slot = require('../models/Slot');
const SpaAvailability = require('../models/SpaAvailability');
const GroomerAvailability = require('../models/GroomerAvailability');
const Block = require('../models/Block');
const DurationService = require('../services/durationService');
const AvailabilityService = require('../services/availabilityService');

const ScheduleController = {
    // ============ SERVICIOS ============
    
    /**
     * Obtener todos los servicios disponibles
     */
    getAllServicios: async (req, res) => {
        try {
            // Si el usuario es admin o recepcion, mostrar todos los servicios (activos e inactivos)
            // Si es público/cliente, solo mostrar activos
            const mostrarTodos = req.user && (req.user.rol === 1 || req.user.rol === 3);
            const servicios = await Service.getAll(!mostrarTodos);
            
            // Enriquecer servicios con duración formateada
            const serviciosEnriquecidos = servicios.map(s => ({
                ...s,
                duracion_formateada: DurationService.formatearDuracion(s.duracion_base)
            }));

            res.json({
                success: true,
                data: serviciosEnriquecidos
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Crear nuevo servicio (solo admin o recepción)
     */
    crearServicio: async (req, res) => {
        try {
            const { nombre, descripcion, duracion_base, precio } = req.body;

            // Validaciones
            if (!nombre || !duracion_base || !precio) {
                return res.status(400).json({
                    success: false,
                    error: 'Faltan campos requeridos: nombre, duracion_base, precio'
                });
            }

            if (duracion_base <= 0 || duracion_base > 480) {
                return res.status(400).json({
                    success: false,
                    error: 'La duración debe estar entre 1 y 480 minutos'
                });
            }

            const servicio = await Service.create({
                nombre,
                descripcion,
                duracion_base,
                precio,
                estado_activo: true
            });

            res.status(201).json({
                success: true,
                message: 'Servicio creado exitosamente',
                data: servicio
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Actualizar servicio (solo admin)
     */
    actualizarServicio: async (req, res) => {
        try {
            const { id } = req.params;
            const actualizacion = req.body;

            const servicio = await Service.getById(id);
            if (!servicio) {
                return res.status(404).json({
                    success: false,
                    error: 'Servicio no encontrado'
                });
            }

            const servicioActualizado = await Service.update(id, actualizacion);

            res.json({
                success: true,
                message: 'Servicio actualizado exitosamente',
                data: servicioActualizado
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Eliminar servicio (solo admin) - Soft delete
     */
    eliminarServicio: async (req, res) => {
        try {
            const { id } = req.params;

            const servicio = await Service.getById(id);
            if (!servicio) {
                return res.status(404).json({
                    success: false,
                    error: 'Servicio no encontrado'
                });
            }

            await Service.delete(id);

            res.json({
                success: true,
                message: 'Servicio eliminado exitosamente'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    // ============ MASCOTAS ============

    /**
     * Obtener todas las mascotas de un cliente
     */
    getMascotasCliente: async (req, res) => {
        try {
            const clienteId = req.user.id; // Del middleware de autenticación
            
            const mascotas = await Pet.getByClienteId(clienteId);

            res.json({
                success: true,
                data: mascotas
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Crear nueva mascota
     */
    crearMascota: async (req, res) => {
        try {
            const { nombre, especie, raza, tamaño, caracteristica_id, notas } = req.body;
            const clienteId = req.user.id;

            if (!nombre) {
                return res.status(400).json({
                    success: false,
                    error: 'El nombre de la mascota es requerido'
                });
            }

            const mascota = await Pet.create({
                cliente_id: clienteId,
                nombre,
                especie,
                raza,
                tamaño,
                caracteristica_id,
                notas,
                estado_activo: true
            });

            // Obtener característica para enriquecer la respuesta
            const mascotaEnriquecida = await Pet.getById(mascota.id);

            res.status(201).json({
                success: true,
                message: 'Mascota creada exitosamente',
                data: mascotaEnriquecida
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Actualizar mascota
     */
    actualizarMascota: async (req, res) => {
        try {
            const { mascotaId } = req.params;
            const clienteId = req.user.id;
            const actualizacion = req.body;

            // Verificar que la mascota pertenece al cliente
            const mascota = await Pet.getById(mascotaId);
            if (!mascota || mascota.cliente_id !== clienteId) {
                return res.status(403).json({
                    success: false,
                    error: 'No tienes permiso para modificar esta mascota'
                });
            }

            const mascotaActualizada = await Pet.update(mascotaId, actualizacion);

            res.json({
                success: true,
                message: 'Mascota actualizada exitosamente',
                data: mascotaActualizada
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Eliminar mascota
     */
    eliminarMascota: async (req, res) => {
        try {
            const { mascotaId } = req.params;
            const clienteId = req.user.id;

            // Verificar que la mascota pertenece al cliente
            const mascota = await Pet.getById(mascotaId);
            if (!mascota || mascota.cliente_id !== clienteId) {
                return res.status(403).json({
                    success: false,
                    error: 'No tienes permiso para eliminar esta mascota'
                });
            }

            await Pet.delete(mascotaId);

            res.json({
                success: true,
                message: 'Mascota eliminada exitosamente'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Obtener características de mascotas disponibles
     */
    getCaracteristicasMascotas: async (req, res) => {
        try {
            const caracteristicas = await Pet.getCaracteristicas();
            const sugerencias = DurationService.obtenerSugerenciasAjustes();

            res.json({
                success: true,
                data: {
                    caracteristicas,
                    sugerencias_ajuste: sugerencias
                }
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    // ============ DISPONIBILIDAD DEL SPA ============

    /**
     * Obtener disponibilidad del spa
     */
    getDisponibilidadSpa: async (req, res) => {
        try {
            const disponibilidades = await SpaAvailability.getAll(true);

            const diasSemana = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

            const disponibilidadesFormateadas = disponibilidades.map(d => ({
                ...d,
                dia_nombre: diasSemana[d.dia_semana - 1] || 'Desconocido'
            }));

            res.json({
                success: true,
                data: disponibilidadesFormateadas
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Crear disponibilidad del spa (solo admin)
     */
    crearDisponibilidadSpa: async (req, res) => {
        try {
            const { dia_semana, hora_inicio, hora_fin, capacidad_diaria } = req.body;

            if (!dia_semana || !hora_inicio || !hora_fin) {
                return res.status(400).json({
                    success: false,
                    error: 'Faltan campos requeridos'
                });
            }

            const disponibilidad = await SpaAvailability.create({
                dia_semana,
                hora_inicio,
                hora_fin,
                capacidad_diaria,
                estado_activo: true
            });

            res.status(201).json({
                success: true,
                message: 'Disponibilidad creada exitosamente',
                data: disponibilidad
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Actualizar disponibilidad del spa (solo admin)
     */
    actualizarDisponibilidadSpa: async (req, res) => {
        try {
            const { id } = req.params;
            const actualizacion = req.body;

            const disponibilidad = await SpaAvailability.getById(id);
            if (!disponibilidad) {
                return res.status(404).json({
                    success: false,
                    error: 'Disponibilidad no encontrada'
                });
            }

            const disponibilidadActualizada = await SpaAvailability.update(id, actualizacion);

            res.json({
                success: true,
                message: 'Disponibilidad actualizada exitosamente',
                data: disponibilidadActualizada
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Eliminar disponibilidad del spa (solo admin) - Soft delete
     */
    eliminarDisponibilidadSpa: async (req, res) => {
        try {
            const { id } = req.params;

            const disponibilidad = await SpaAvailability.getById(id);
            if (!disponibilidad) {
                return res.status(404).json({
                    success: false,
                    error: 'Disponibilidad no encontrada'
                });
            }

            await SpaAvailability.delete(id);

            res.json({
                success: true,
                message: 'Disponibilidad eliminada exitosamente'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    // ============ DISPONIBILIDAD DE GROOMERS ============

    /**
     * Obtener disponibilidad de un groomer
     */
    getDisponibilidadGroomer: async (req, res) => {
        try {
            const { groomerId } = req.params;

            const disponibilidades = await GroomerAvailability.getByGroomerId(groomerId, true);

            res.json({
                success: true,
                data: disponibilidades
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Crear disponibilidad de groomer (solo admin)
     */
    crearDisponibilidadGroomer: async (req, res) => {
        try {
            const { groomer_id, dia_semana, hora_inicio, hora_fin, especialidades } = req.body;

            if (!groomer_id || !dia_semana || !hora_inicio || !hora_fin) {
                return res.status(400).json({
                    success: false,
                    error: 'Faltan campos requeridos'
                });
            }

            const disponibilidad = await GroomerAvailability.create({
                groomer_id,
                dia_semana,
                hora_inicio,
                hora_fin,
                especialidades,
                estado_activo: true
            });

            res.status(201).json({
                success: true,
                message: 'Disponibilidad de groomer creada exitosamente',
                data: disponibilidad
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    // ============ BLOQUEOS ============

    /**
     * Crear bloqueo (feriado, ausencia, mantenimiento)
     */
    crearBloqueo: async (req, res) => {
        try {
            const { groomer_id, fecha_inicio, fecha_fin, tipo, razon } = req.body;
            const createdByUserId = req.user.id;

            if (!fecha_inicio || !fecha_fin || !tipo) {
                return res.status(400).json({
                    success: false,
                    error: 'Faltan campos requeridos: fecha_inicio, fecha_fin, tipo'
                });
            }

            const bloqueo = await Block.create({
                groomer_id,
                fecha_inicio,
                fecha_fin,
                tipo,
                razon,
                estado_activo: true
            }, createdByUserId);

            res.status(201).json({
                success: true,
                message: 'Bloqueo creado exitosamente',
                data: bloqueo
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Obtener bloqueos de un groomer
     */
    getBloqueos: async (req, res) => {
        try {
            const { groomerId } = req.params;

            const bloqueos = await Block.getByGroomerId(groomerId, true);

            res.json({
                success: true,
                data: bloqueos
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    // ============ SLOTS/CITAS ============

    /**
     * Obtener citas de un cliente
     */
    getCitasCliente: async (req, res) => {
        try {
            const clienteId = req.user.id;

            const citas = await Slot.getByClienteId(clienteId);

            res.json({
                success: true,
                data: citas
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Obtener todas las citas (solo admin y recepción)
     */
    getAllCitas: async (req, res) => {
        try {
            const { estado, fecha, groomer_id } = req.query;
            
            // Construir filtros
            let filtros = {};
            if (estado) filtros.estado = estado;
            if (fecha) filtros.fecha = fecha;
            if (groomer_id) filtros.groomer_id = groomer_id;

            const citas = await Slot.getAll(filtros);

            res.json({
                success: true,
                data: citas
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Obtener slots disponibles para una fecha
     */
    getSlotsDisponibles: async (req, res) => {
        try {
            const { fecha, duracion_minutos, groomer_id } = req.query;

            if (!fecha || !duracion_minutos) {
                return res.status(400).json({
                    success: false,
                    error: 'Se requieren fecha y duracion_minutos'
                });
            }

            const slots = await AvailabilityService.obtenerSlotsDisponibles(
                fecha,
                parseInt(duracion_minutos),
                groomer_id
            );

            res.json({
                success: true,
                data: slots
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Crear nueva cita
     */
    crearCita: async (req, res) => {
        try {
            const { mascota_id, servicio_id, groomer_id, fecha_inicio, fecha_fin } = req.body;
            const clienteId = req.user.id;

            // Validaciones
            if (!mascota_id || !servicio_id || !fecha_inicio || !fecha_fin) {
                return res.status(400).json({
                    success: false,
                    error: 'Faltan campos requeridos'
                });
            }

            // Verificar que la mascota pertenece al cliente
            const mascota = await Pet.getById(mascota_id);
            if (!mascota || mascota.cliente_id !== clienteId) {
                return res.status(403).json({
                    success: false,
                    error: 'No tiene permiso para reservar esta mascota'
                });
            }

            // Obtener duración ajustada
            const duracionData = await DurationService.getDuracionAjustadaParaMascota(
                mascota_id,
                servicio_id
            );

            // Validar reglas de capacidad
            const horaInicio = new Date(fecha_inicio).toISOString().slice(11, 16);
            const horaFin = new Date(fecha_fin).toISOString().slice(11, 16);
            const fecha = new Date(fecha_inicio).toISOString().slice(0, 10);

            const validacion = await AvailabilityService.validarReglasCapacidad({
                fecha,
                hora_inicio: horaInicio,
                hora_fin: horaFin,
                groomer_id: groomer_id || null
            });

            if (!validacion.valido) {
                return res.status(400).json({
                    success: false,
                    error: 'No se puede crear la cita',
                    errores: validacion.errores
                });
            }

            // Obtener precio del servicio
            const servicio = await Service.getById(servicio_id);

            // Crear la cita
            const cita = await Slot.create({
                cliente_id: clienteId,
                groomer_id: groomer_id || null,
                mascota_id,
                servicio_id,
                fecha_inicio: new Date(fecha_inicio),
                fecha_fin: new Date(fecha_fin),
                duracion_ajustada: duracionData.duracion_ajustada,
                estado: 'confirmada',
                precio_final: servicio.precio
            });

            const citaEnriquecida = await Slot.getById(cita.id);

            res.status(201).json({
                success: true,
                message: 'Cita creada exitosamente',
                data: citaEnriquecida
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Obtener detalles de una cita
     */
    getDetalleCita: async (req, res) => {
        try {
            const { citaId } = req.params;

            const cita = await Slot.getById(citaId);
            if (!cita) {
                return res.status(404).json({
                    success: false,
                    error: 'Cita no encontrada'
                });
            }

            res.json({
                success: true,
                data: cita
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    /**
     * Cancelar cita
     */
    cancelarCita: async (req, res) => {
        try {
            const { citaId } = req.params;
            const { razon } = req.body;

            const cita = await Slot.getById(citaId);
            if (!cita) {
                return res.status(404).json({
                    success: false,
                    error: 'Cita no encontrada'
                });
            }

            const citaCancelada = await Slot.cancel(citaId, razon);

            res.json({
                success: true,
                message: 'Cita cancelada exitosamente',
                data: citaCancelada
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
};

module.exports = ScheduleController;
