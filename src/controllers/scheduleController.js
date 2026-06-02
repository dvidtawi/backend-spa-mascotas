const Service = require('../models/Service');
const Pet = require('../models/Pet');
const Slot = require('../models/Slot');
const SpaAvailability = require('../models/SpaAvailability');
const GroomerAvailability = require('../models/GroomerAvailability');
const Block = require('../models/Block');
const User = require('../models/User');
const Payment = require('../models/Payment');
const GroomingRecord = require('../models/GroomingRecord');
const ServiceInsumo = require('../models/ServiceInsumo');
const db = require('../config/database');
const DurationService = require('../services/durationService');
const AvailabilityService = require('../services/availabilityService');
const { appendNotification } = require('../services/notificationLogService');

const isStaffRole = (rol) => [1, 3].includes(rol);
const GROOMING_CHECKLIST_FIELDS = ['unas', 'oidos', 'glandulas', 'corte', 'bano', 'perfume'];
const formatDateISO = (fecha) => AvailabilityService.normalizarFechaISO(fecha);
const HOURS_24_IN_MS = 24 * 60 * 60 * 1000;
const buildInsumosResumen = (items = []) => items
    .map((item) => {
        const nombre = item.insumo_nombre || item.nombre || 'Insumo';
        const entregado = Number(item.cantidad_entregada || 0);
        const usado = Number(item.cantidad_usada || 0);
        const devuelto = Number(item.cantidad_devuelta || 0);
        const desperdiciado = Number(item.cantidad_desperdiciada || 0);
        return `${nombre}: entregado ${entregado}, usado ${usado}, devuelto ${devuelto}, merma ${desperdiciado}`;
    })
    .join(' | ');

const buildPaymentReference = (prefijo, citaId) => `${prefijo}:${citaId}`;

const ensureAppointmentLedgerEntry = async (cita, registradoPor, tipo = 'confirmacion') => {
    const referenciaEvento = buildPaymentReference(tipo, cita.id);
    const existe = await Payment.existsByReference(referenciaEvento);

    if (existe) {
        return null;
    }

    const montoBase = Number(cita.precio_final) || 0;
    if (montoBase <= 0) {
        return null;
    }

    const monto = tipo === 'reembolso' ? (montoBase * -1) : montoBase;
    const concepto = `${tipo === 'reembolso' ? 'Reembolso' : 'Registro de cita'}: ${cita.servicio_nombre} - ${cita.mascota_nombre}`;

    return Payment.create({
        cita_id: cita.id,
        registrado_por: registradoPor || null,
        tipo_venta: 'cita',
        concepto,
        metodo_pago: 'pendiente',
        monto,
        observaciones: tipo === 'reembolso'
            ? 'Movimiento automatico por cancelacion de cita'
            : 'Movimiento automatico por confirmacion de cita',
        origen: tipo === 'reembolso' ? 'sistema_cancelacion' : 'sistema_confirmacion',
        tipo_movimiento: tipo === 'reembolso' ? 'reembolso' : 'ingreso',
        referencia_evento: referenciaEvento
    });
};

const buildCitaPayload = async ({
    clienteId,
    mascotaId,
    servicioId,
    groomerId,
    fecha,
    horaInicio,
    estado,
    notas,
    precioFinal,
    excludeCitaId,
    omitirValidaciones = false
}) => {
    const duracionData = await DurationService.getDuracionAjustadaParaMascota(
        mascotaId,
        servicioId
    );

    const fechaInicioReal = new Date(`${fecha}T${horaInicio}:00`);
    const fechaFinReal = DurationService.calcularHoraFinal(
        fechaInicioReal,
        duracionData.duracion_ajustada
    );
    const horaFinBase = fechaFinReal.toTimeString().slice(0, 5);

    if (!omitirValidaciones) {
        const validacion = await AvailabilityService.validarReglasCapacidad({
            fecha,
            hora_inicio: horaInicio,
            hora_fin: horaFinBase,
            mascota_id: mascotaId,
            servicio_id: servicioId,
            groomer_id: groomerId,
            exclude_cita_id: excludeCitaId || null
        });

        if (!validacion.valido) {
            const error = new Error(validacion.errores?.[0] || 'No se puede crear o actualizar la cita');
            error.statusCode = 400;
            error.details = validacion.errores;
            throw error;
        }
    }

    const servicio = await Service.getById(servicioId);

    return {
        cliente_id: clienteId,
        groomer_id: groomerId,
        mascota_id: mascotaId,
        servicio_id: servicioId,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFinBase,
        fecha_inicio: fechaInicioReal,
        fecha_fin: fechaFinReal,
        duracion_ajustada: duracionData.duracion_ajustada,
        minutos_adicionales_temperamento: duracionData.minutos_adicionales_temperamento,
        estado,
        notas: notas || null,
        precio_final: precioFinal || servicio.precio
    };
};

const validateGroomerOwnership = async (citaId, groomerId) => {
    const cita = await Slot.getById(citaId);
    if (!cita) {
        const error = new Error('Cita no encontrada');
        error.statusCode = 404;
        throw error;
    }

    if (cita.groomer_id !== groomerId) {
        const error = new Error('No tienes permiso sobre esta cita');
        error.statusCode = 403;
        throw error;
    }

    return cita;
};

const ScheduleController = {
    getAllServicios: async (req, res) => {
        try {
            const mostrarTodos = (req.user && isStaffRole(req.user.rol))
                || req.query.include_inactive === 'true';
            const servicios = await Service.getAll(!mostrarTodos);

            res.json({
                success: true,
                data: servicios.map((servicio) => ({
                    ...servicio,
                    duracion_formateada: DurationService.formatearDuracion(servicio.duracion_base)
                }))
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    crearServicio: async (req, res) => {
        try {
            const { nombre, descripcion, duracion_base, precio } = req.body;

            if (!nombre || !duracion_base || !precio) {
                return res.status(400).json({
                    success: false,
                    error: 'Faltan campos requeridos: nombre, duracion_base, precio'
                });
            }

            if (duracion_base <= 0 || duracion_base > 480) {
                return res.status(400).json({
                    success: false,
                    error: 'La duracion debe estar entre 1 y 480 minutos'
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
            res.status(500).json({ success: false, error: error.message });
        }
    },

    actualizarServicio: async (req, res) => {
        try {
            const servicio = await Service.getById(req.params.id);
            if (!servicio) {
                return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
            }

            const servicioActualizado = await Service.update(req.params.id, req.body);
            res.json({
                success: true,
                message: 'Servicio actualizado exitosamente',
                data: servicioActualizado
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    eliminarServicio: async (req, res) => {
        try {
            const servicio = await Service.getById(req.params.id);
            if (!servicio) {
                return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
            }

            await Service.delete(req.params.id);
            res.json({ success: true, message: 'Servicio eliminado exitosamente' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getMascotasCliente: async (req, res) => {
        try {
            const mascotas = await Pet.getByClienteId(req.user.id);
            res.json({ success: true, data: mascotas });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getMascotasPorClienteStaff: async (req, res) => {
        try {
            const mascotas = await Pet.getByClienteIdForStaff(req.params.clienteId);
            res.json({ success: true, data: mascotas });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    crearMascota: async (req, res) => {
        try {
            const {
                nombre,
                especie,
                raza,
                tamano,
                fecha_nacimiento,
                alergias,
                temperamento,
                minutos_adicionales_temperamento,
                ruta_foto_carnet,
                notas
            } = req.body;
            const rutaCarnetSubida = req.file ? `/uploads/pets/${req.file.filename}` : null;

            if (!nombre || !especie || !tamano) {
                return res.status(400).json({
                    success: false,
                    error: 'Los campos nombre, especie y tamano son requeridos'
                });
            }

            const mascota = await Pet.create({
                cliente_id: req.user.id,
                nombre,
                especie,
                raza,
                tamano,
                fecha_nacimiento,
                alergias,
                temperamento,
                minutos_adicionales_temperamento,
                ruta_foto_carnet: rutaCarnetSubida || ruta_foto_carnet,
                notas,
                estado_activo: true
            });

            const mascotaEnriquecida = await Pet.getById(mascota.id);
            res.status(201).json({
                success: true,
                message: 'Mascota creada exitosamente',
                data: mascotaEnriquecida
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    actualizarMascota: async (req, res) => {
        try {
            const mascota = await Pet.getById(req.params.mascotaId);
            if (!mascota || mascota.cliente_id !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    error: 'No tienes permiso para modificar esta mascota'
                });
            }

            const datosActualizacion = {
                ...req.body
            };

            if (req.file) {
                datosActualizacion.ruta_foto_carnet = `/uploads/pets/${req.file.filename}`;
            }

            const mascotaActualizada = await Pet.update(req.params.mascotaId, datosActualizacion);
            res.json({
                success: true,
                message: 'Mascota actualizada exitosamente',
                data: mascotaActualizada
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    eliminarMascota: async (req, res) => {
        try {
            const mascota = await Pet.getById(req.params.mascotaId);
            if (!mascota || mascota.cliente_id !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    error: 'No tienes permiso para eliminar esta mascota'
                });
            }

            await Pet.delete(req.params.mascotaId);
            res.json({ success: true, message: 'Mascota eliminada exitosamente' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getCaracteristicasMascotas: async (req, res) => {
        try {
            res.json({
                success: true,
                data: {
                    temperamentos: Pet.getOpcionesTemperamento(),
                    reglas_duracion: DurationService.obtenerSugerenciasAjustes()
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getClientes: async (req, res) => {
        try {
            const clientes = await User.getClientes();
            res.json({ success: true, data: clientes });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getGroomers: async (req, res) => {
        try {
            const groomers = await User.getGroomers();
            res.json({ success: true, data: groomers });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getDisponibilidadSpa: async (req, res) => {
        try {
            const disponibilidades = await SpaAvailability.getHabitual();
            const fechaBase = req.query.fecha_base || new Date().toISOString().slice(0, 10);
            const inicioSemana = new Date(`${fechaBase}T00:00:00`);
            const diaJs = inicioSemana.getDay();
            const ajuste = diaJs === 0 ? -6 : 1 - diaJs;
            inicioSemana.setDate(inicioSemana.getDate() + ajuste);
            const finSemana = new Date(inicioSemana);
            finSemana.setDate(finSemana.getDate() + 6);
            const bloqueosSpa = (await Block.getByFechaRango(
                inicioSemana.toISOString().slice(0, 10),
                finSemana.toISOString().slice(0, 10),
                null
            )).filter((item) => item.groomer_id === null);
            const diasSemana = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

            res.json({
                success: true,
                data: {
                    fecha_base: fechaBase,
                    semana: {
                        inicio: inicioSemana.toISOString().slice(0, 10),
                        fin: finSemana.toISOString().slice(0, 10)
                    },
                    habitual: disponibilidades.map((item) => ({
                        ...item,
                        dia_nombre: diasSemana[item.dia_semana - 1] || 'Desconocido'
                    })),
                    excepciones: bloqueosSpa,
                    total_excepciones_semana: bloqueosSpa.length
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    crearDisponibilidadSpa: async (req, res) => {
        try {
            if (Array.isArray(req.body.dias)) {
                const dias = req.body.dias.filter((item) => item.hora_inicio && item.hora_fin);
                if (dias.length === 0) {
                    return res.status(400).json({ success: false, error: 'Debes enviar al menos un dia con horario' });
                }

                const disponibilidad = await SpaAvailability.replaceHabitual(dias);
                return res.status(201).json({
                    success: true,
                    message: 'Horario habitual del spa actualizado',
                    data: disponibilidad
                });
            }

            const { dia_semana, hora_inicio, hora_fin, capacidad_diaria } = req.body;
            if (!dia_semana || !hora_inicio || !hora_fin) {
                return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
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
            res.status(500).json({ success: false, error: error.message });
        }
    },

    actualizarDisponibilidadSpa: async (req, res) => {
        try {
            const disponibilidad = await SpaAvailability.getById(req.params.id);
            if (!disponibilidad) {
                return res.status(404).json({ success: false, error: 'Disponibilidad no encontrada' });
            }

            const disponibilidadActualizada = await SpaAvailability.update(req.params.id, req.body);
            res.json({
                success: true,
                message: 'Disponibilidad actualizada exitosamente',
                data: disponibilidadActualizada
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    eliminarDisponibilidadSpa: async (req, res) => {
        try {
            const disponibilidad = await SpaAvailability.getById(req.params.id);
            if (!disponibilidad) {
                return res.status(404).json({ success: false, error: 'Disponibilidad no encontrada' });
            }

            await SpaAvailability.delete(req.params.id);
            res.json({ success: true, message: 'Disponibilidad eliminada exitosamente' });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getDisponibilidadGroomer: async (req, res) => {
        try {
            const disponibilidades = await GroomerAvailability.getByGroomerId(req.params.groomerId, true);
            res.json({ success: true, data: disponibilidades });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    crearDisponibilidadGroomer: async (req, res) => {
        try {
            const { groomer_id, dia_semana, hora_inicio, hora_fin, especialidades } = req.body;
            if (!groomer_id || !dia_semana || !hora_inicio || !hora_fin) {
                return res.status(400).json({ success: false, error: 'Faltan campos requeridos' });
            }

            const existentes = await GroomerAvailability.getByGroomerIdAndDia(groomer_id, dia_semana);
            if (existentes.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'El groomer ya tiene un horario configurado para ese dia. Edita el existente.'
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
            res.status(500).json({ success: false, error: error.message });
        }
    },

    actualizarDisponibilidadGroomer: async (req, res) => {
        try {
            const disponibilidad = await GroomerAvailability.getById(req.params.id);
            if (!disponibilidad) {
                return res.status(404).json({ success: false, error: 'Horario de groomer no encontrado' });
            }

            const actualizada = await GroomerAvailability.update(req.params.id, req.body);
            res.json({
                success: true,
                message: 'Horario de groomer actualizado',
                data: actualizada
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    eliminarDisponibilidadGroomer: async (req, res) => {
        try {
            const disponibilidad = await GroomerAvailability.getById(req.params.id);
            if (!disponibilidad) {
                return res.status(404).json({ success: false, error: 'Horario de groomer no encontrado' });
            }

            const eliminada = await GroomerAvailability.delete(req.params.id);
            res.json({
                success: true,
                message: 'Horario de groomer eliminado',
                data: eliminada
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    crearBloqueo: async (req, res) => {
        try {
            const { groomer_id, fecha, hora_inicio, hora_fin, tipo, motivo, razon } = req.body;
            if (!fecha || !tipo) {
                return res.status(400).json({
                    success: false,
                    error: 'Faltan campos requeridos: fecha y tipo'
                });
            }

            const bloqueo = await Block.create({
                groomer_id,
                fecha,
                hora_inicio,
                hora_fin,
                tipo,
                motivo,
                razon,
                estado_activo: true
            }, req.user.id);

            res.status(201).json({
                success: true,
                message: 'Bloqueo creado exitosamente',
                data: bloqueo
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getBloqueos: async (req, res) => {
        try {
            const incluirInactivos = req.query.include_inactive === 'true';
            const bloqueos = await Block.getByGroomerId(req.params.groomerId, !incluirInactivos);
            res.json({ success: true, data: bloqueos });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getAllBloqueos: async (req, res) => {
        try {
            const scope = req.query.scope || 'todos';
            const incluirInactivos = req.query.include_inactive === 'true';
            let bloqueos = await Block.getAll(!incluirInactivos);

            if (scope === 'spa') {
                bloqueos = bloqueos.filter((item) => item.groomer_id === null);
            }

            if (scope === 'groomer') {
                bloqueos = bloqueos.filter((item) => item.groomer_id !== null);
            }

            res.json({ success: true, data: bloqueos });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    actualizarBloqueo: async (req, res) => {
        try {
            const bloqueo = await Block.getById(req.params.bloqueoId);
            if (!bloqueo) {
                return res.status(404).json({ success: false, error: 'Bloqueo no encontrado' });
            }

            const actualizado = await Block.update(req.params.bloqueoId, req.body);
            res.json({ success: true, message: 'Bloqueo actualizado', data: actualizado });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    eliminarBloqueo: async (req, res) => {
        try {
            const bloqueo = await Block.getById(req.params.bloqueoId);
            if (!bloqueo) {
                return res.status(404).json({ success: false, error: 'Bloqueo no encontrado' });
            }

            const eliminado = await Block.delete(req.params.bloqueoId);
            res.json({ success: true, message: 'Bloqueo eliminado', data: eliminado });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getCitasCliente: async (req, res) => {
        try {
            const citas = await Slot.getByClienteId(req.user.id);
            res.json({ success: true, data: citas });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getAllCitas: async (req, res) => {
        try {
            const { estado, fecha, groomer_id } = req.query;
            const filtros = {};
            if (estado) filtros.estado = estado;
            if (fecha) filtros.fecha = fecha;
            if (groomer_id) filtros.groomer_id = groomer_id;

            const citas = await Slot.getAll(filtros);
            const incluirDiagnostico = req.query.include_diagnostico === 'true' || estado === 'en_revision';

            const citasEnriquecidas = incluirDiagnostico
                ? await Promise.all(citas.map(async (cita) => ({
                    ...cita,
                    diagnostico: await AvailabilityService.diagnosticarCitaExistente(cita)
                })))
                : citas;
            res.json({ success: true, data: citasEnriquecidas });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getAgenda: async (req, res) => {
        try {
            const { fecha_inicio, fecha_fin, groomer_id } = req.query;
            if (!fecha_inicio || !fecha_fin) {
                return res.status(400).json({
                    success: false,
                    error: 'Se requieren fecha_inicio y fecha_fin'
                });
            }

            const [citas, bloqueos, groomers] = await Promise.all([
                Slot.getByFechaRango(new Date(`${fecha_inicio}T00:00:00`), new Date(`${fecha_fin}T23:59:59`), groomer_id || null),
                Block.getByFechaRango(fecha_inicio, fecha_fin, groomer_id || null),
                groomer_id ? User.getGroomers().then((rows) => rows.filter((g) => g.id === groomer_id)) : User.getGroomers()
            ]);

            const citasEnriquecidas = await Promise.all(
                citas.map(async (cita) => ({
                    ...cita,
                    diagnostico: cita.estado === 'cancelada'
                        ? { valido: true, errores: [], advertencias: [] }
                        : await AvailabilityService.diagnosticarCitaExistente(cita)
                }))
            );

            res.json({
                success: true,
                data: {
                    fecha_inicio,
                    fecha_fin,
                    groomers,
                    citas: citasEnriquecidas,
                    bloqueos
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getSlotsDisponibles: async (req, res) => {
        try {
            const { fecha, duracion_minutos, groomer_id, mascota_id, servicio_id } = req.query;
            if (!fecha || (!duracion_minutos && !(mascota_id && servicio_id))) {
                return res.status(400).json({
                    success: false,
                    error: 'Se requiere fecha y una duracion_minutos o bien mascota_id + servicio_id'
                });
            }

            let duracionCalculada = parseInt(duracion_minutos, 10);
            if (!duracionCalculada) {
                const duracionData = await DurationService.getDuracionAjustadaParaMascota(
                    mascota_id,
                    servicio_id
                );
                duracionCalculada = duracionData.duracion_ajustada;
            }

            const slots = await AvailabilityService.obtenerSlotsDisponibles(
                fecha,
                duracionCalculada,
                groomer_id
            );

            res.json({ success: true, data: slots });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    crearCita: async (req, res) => {
        try {
            const { mascota_id, servicio_id, groomer_id, fecha, hora_inicio, fecha_inicio } = req.body;
            if (!mascota_id || !servicio_id || !groomer_id || (!fecha_inicio && !(fecha && hora_inicio))) {
                return res.status(400).json({
                    success: false,
                    error: 'Faltan campos requeridos: mascota_id, servicio_id, groomer_id y fecha/hora_inicio'
                });
            }

            const mascota = await Pet.getById(mascota_id);
            if (!mascota || mascota.cliente_id !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    error: 'No tiene permiso para reservar esta mascota'
                });
            }

            const fechaBase = fecha || new Date(fecha_inicio).toISOString().slice(0, 10);
            const horaInicioBase = hora_inicio || new Date(fecha_inicio).toISOString().slice(11, 16);
            const payload = await buildCitaPayload({
                clienteId: req.user.id,
                mascotaId: mascota_id,
                servicioId: servicio_id,
                groomerId: groomer_id,
                fecha: fechaBase,
                horaInicio: horaInicioBase,
                estado: 'en_revision'
            });

            const cita = await Slot.create(payload);
            const citaEnriquecida = await Slot.getById(cita.id);

            try {
                await appendNotification({
                    tipo: 'solicitud_en_revision',
                    titulo: 'Solicitud en revision',
                    mensaje: `Tu cita para ${citaEnriquecida?.mascota_nombre || 'tu mascota'} fue enviada a revision.`,
                    recipient_user_id: citaEnriquecida.cliente_id,
                    recipient_role: 4,
                    dedupe_key: `cita_revision:${citaEnriquecida.id}`,
                    email_to: citaEnriquecida.cliente_email || null,
                    email_subject: 'Solicitud de cita en revision',
                    email_body: `Tu cita para ${citaEnriquecida?.mascota_nombre || 'tu mascota'} quedo en revision. Te avisaremos cuando recepcion la confirme.`,
                    metadata: {
                        cita_id: citaEnriquecida.id,
                        mascota: citaEnriquecida.mascota_nombre,
                        servicio: citaEnriquecida.servicio_nombre,
                        fecha: citaEnriquecida.fecha,
                        hora_inicio: citaEnriquecida.hora_inicio
                    }
                });
            } catch (notificationError) {
                console.warn('No se pudo registrar la notificacion de cita en revision:', notificationError.message);
            }

            res.status(201).json({
                success: true,
                message: 'Cita creada exitosamente',
                data: citaEnriquecida
            });
        } catch (error) {
            const statusCode = error.statusCode || 500;
            res.status(statusCode).json({
                success: false,
                error: error.message,
                errores: error.details
            });
        }
    },

    crearCitaInterna: async (req, res) => {
        try {
            const {
                cliente_id,
                mascota_id,
                servicio_id,
                groomer_id,
                fecha,
                hora_inicio,
                estado,
                notas
            } = req.body;

            if (!cliente_id || !mascota_id || !servicio_id || !groomer_id || !fecha || !hora_inicio) {
                return res.status(400).json({
                    success: false,
                    error: 'Faltan campos requeridos para la cita manual'
                });
            }

            const mascota = await Pet.getById(mascota_id);
            if (!mascota || mascota.cliente_id !== cliente_id) {
                return res.status(400).json({
                    success: false,
                    error: 'La mascota no pertenece al cliente seleccionado'
                });
            }

            const payload = await buildCitaPayload({
                clienteId: cliente_id,
                mascotaId: mascota_id,
                servicioId: servicio_id,
                groomerId: groomer_id,
                fecha,
                horaInicio: hora_inicio,
                estado: estado || 'confirmada',
                notas,
                omitirValidaciones: req.body.omitir_validaciones === true
            });

            const cita = await Slot.create(payload);
            const citaEnriquecida = await Slot.getById(cita.id);

            if ((estado || 'confirmada') === 'confirmada') {
                await ensureAppointmentLedgerEntry(citaEnriquecida, req.user.id, 'confirmacion');
                try {
                    await appendNotification({
                        tipo: 'cita_confirmada',
                        titulo: 'Cita confirmada',
                        mensaje: `Tu cita para ${citaEnriquecida?.mascota_nombre || 'tu mascota'} fue confirmada por recepcion.`,
                        recipient_user_id: citaEnriquecida.cliente_id,
                        recipient_role: 4,
                        dedupe_key: `cita_confirmada:${citaEnriquecida.id}`,
                        email_to: citaEnriquecida.cliente_email || null,
                        email_subject: 'Tu cita fue confirmada',
                        email_body: `Tu cita para ${citaEnriquecida?.mascota_nombre || 'tu mascota'} ya fue confirmada. Fecha: ${formatDateISO(citaEnriquecida.fecha)} ${String(citaEnriquecida.hora_inicio).slice(0, 5)}.`,
                        metadata: {
                            cita_id: citaEnriquecida.id,
                            mascota: citaEnriquecida.mascota_nombre,
                            servicio: citaEnriquecida.servicio_nombre,
                            fecha: citaEnriquecida.fecha,
                            hora_inicio: citaEnriquecida.hora_inicio
                        }
                    });
                } catch (notificationError) {
                    console.warn('No se pudo registrar la notificacion de cita confirmada:', notificationError.message);
                }
            }

            res.status(201).json({
                success: true,
                message: 'Cita manual creada exitosamente',
                data: citaEnriquecida
            });
        } catch (error) {
            const statusCode = error.statusCode || 500;
            res.status(statusCode).json({
                success: false,
                error: error.message,
                errores: error.details
            });
        }
    },

    actualizarCita: async (req, res) => {
        try {
            const cita = await Slot.getById(req.params.citaId);
            if (!cita) {
                return res.status(404).json({ success: false, error: 'Cita no encontrada' });
            }

            const diagnosticoPrevio = ['confirmada', 'en_revision'].includes(cita.estado)
                ? await AvailabilityService.diagnosticarCitaExistente(cita)
                : { errores: [], advertencias: [] };

            const {
                groomer_id,
                fecha,
                hora_inicio,
                estado,
                notas,
                precio_final
            } = req.body;

            let updateData = {
                groomer_id: groomer_id || cita.groomer_id,
                estado: estado || cita.estado,
                notas: notas !== undefined ? notas : cita.notas,
                precio_final: precio_final || cita.precio_final
            };

            if (fecha || hora_inicio || groomer_id) {
                const payload = await buildCitaPayload({
                    clienteId: cita.cliente_id,
                    mascotaId: cita.mascota_id,
                    servicioId: cita.servicio_id,
                    groomerId: groomer_id || cita.groomer_id,
                    fecha: fecha || cita.fecha,
                    horaInicio: hora_inicio || String(cita.hora_inicio).slice(0, 5),
                    estado: estado || cita.estado,
                    notas: notas !== undefined ? notas : cita.notas,
                    precioFinal: precio_final || cita.precio_final,
                    excludeCitaId: cita.id,
                    omitirValidaciones: req.body.omitir_validaciones === true
                });

                updateData = {
                    ...updateData,
                    fecha: payload.fecha,
                    hora_inicio: payload.hora_inicio,
                    hora_fin: payload.hora_fin,
                    fecha_inicio: payload.fecha_inicio,
                    fecha_fin: payload.fecha_fin
                };
            }

            const actualizada = await Slot.update(req.params.citaId, updateData);
            const citaEnriquecida = await Slot.getById(actualizada.id);

            if (cita.estado !== 'confirmada' && citaEnriquecida.estado === 'confirmada') {
                await ensureAppointmentLedgerEntry(citaEnriquecida, req.user.id, 'confirmacion');
            }

            if (cita.estado !== 'cancelada' && citaEnriquecida.estado === 'cancelada' && ['confirmada', 'en_proceso', 'finalizada'].includes(cita.estado)) {
                await ensureAppointmentLedgerEntry(citaEnriquecida, req.user.id, 'reembolso');
            }

            const huboCambioAgenda = Boolean(fecha || hora_inicio || groomer_id);
            if (
                huboCambioAgenda
                && cita.estado === 'confirmada'
                && (diagnosticoPrevio.errores?.length || diagnosticoPrevio.advertencias?.length)
            ) {
                await appendNotification({
                    tipo: 'reprogramacion_operativa',
                    titulo: 'Reprogramacion operativa',
                    cita_id: cita.id,
                    cliente: cita.cliente_nombre,
                    mascota: cita.mascota_nombre,
                    mensaje: 'La cita fue ajustada por cambios operativos en la agenda',
                    recipient_user_id: cita.cliente_id,
                    recipient_role: 4,
                    email_to: cita.cliente_email || null,
                    email_subject: 'Tu cita fue reprogramada',
                    email_body: `Tu cita fue ajustada por cambios operativos en la agenda. Nueva fecha: ${formatDateISO(citaEnriquecida.fecha)} ${String(citaEnriquecida.hora_inicio).slice(0, 5)}.`,
                    cambios: {
                        groomer_anterior: cita.groomer_nombre,
                        groomer_nuevo: citaEnriquecida.groomer_nombre,
                        fecha_anterior: formatDateISO(cita.fecha),
                        fecha_nueva: formatDateISO(citaEnriquecida.fecha),
                        hora_anterior: String(cita.hora_inicio).slice(0, 5),
                        hora_nueva: String(citaEnriquecida.hora_inicio).slice(0, 5)
                    }
                });
            }

            res.json({
                success: true,
                message: 'Cita actualizada exitosamente',
                data: citaEnriquecida
            });
        } catch (error) {
            const statusCode = error.statusCode || 500;
            res.status(statusCode).json({
                success: false,
                error: error.message,
                errores: error.details
            });
        }
    },

    aprobarCita: async (req, res) => {
        try {
            const cita = await Slot.getById(req.params.citaId);
            if (!cita) {
                return res.status(404).json({ success: false, error: 'Cita no encontrada' });
            }

            const validacion = await AvailabilityService.validarReglasCapacidad({
                fecha: formatDateISO(cita.fecha),
                hora_inicio: String(cita.hora_inicio).slice(0, 5),
                hora_fin: String(cita.hora_fin).slice(0, 5),
                mascota_id: cita.mascota_id,
                servicio_id: cita.servicio_id,
                groomer_id: cita.groomer_id,
                exclude_cita_id: cita.id
            });

            if (!validacion.valido) {
                return res.status(400).json({
                    success: false,
                    error: 'La solicitud no puede aprobarse por restricciones de agenda',
                    errores: validacion.errores
                });
            }

            const actualizada = await Slot.update(req.params.citaId, {
                estado: 'confirmada',
                notas: req.body?.notas || cita.notas
            });

            const citaEnriquecida = await Slot.getById(actualizada.id);
            await ensureAppointmentLedgerEntry(citaEnriquecida, req.user.id, 'confirmacion');
            try {
                await appendNotification({
                    tipo: 'cita_confirmada',
                    titulo: 'Cita confirmada',
                    mensaje: `Recepcion confirmo la cita de ${citaEnriquecida.mascota_nombre}.`,
                    recipient_user_id: citaEnriquecida.cliente_id,
                    recipient_role: 4,
                    dedupe_key: `cita_confirmada:${citaEnriquecida.id}`,
                    email_to: citaEnriquecida.cliente_email || null,
                    email_subject: 'Tu cita fue confirmada',
                    email_body: `Tu cita de ${citaEnriquecida.servicio_nombre} para ${citaEnriquecida.mascota_nombre} fue confirmada para ${formatDateISO(citaEnriquecida.fecha)} a las ${String(citaEnriquecida.hora_inicio).slice(0, 5)}.`,
                    metadata: {
                        cita_id: citaEnriquecida.id,
                        mascota: citaEnriquecida.mascota_nombre,
                        servicio: citaEnriquecida.servicio_nombre,
                        fecha: citaEnriquecida.fecha,
                        hora_inicio: citaEnriquecida.hora_inicio
                    }
                });
            } catch (notificationError) {
                console.warn('No se pudo registrar la notificacion de confirmacion:', notificationError.message);
            }

            res.json({
                success: true,
                message: 'Cita aprobada',
                data: citaEnriquecida
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    rechazarCita: async (req, res) => {
        try {
            const cita = await Slot.getById(req.params.citaId);
            if (!cita) {
                return res.status(404).json({ success: false, error: 'Cita no encontrada' });
            }

            const actualizada = await Slot.update(req.params.citaId, {
                estado: 'cancelada',
                notas: req.body?.razon || 'Solicitud rechazada por recepcion'
            });

            try {
                await appendNotification({
                    tipo: 'cita_rechazada',
                    titulo: 'Solicitud rechazada',
                    mensaje: `Tu solicitud de cita para ${cita.mascota_nombre} fue rechazada por recepcion.`,
                    recipient_user_id: cita.cliente_id,
                    recipient_role: 4,
                    dedupe_key: `cita_rechazada:${cita.id}`,
                    email_to: cita.cliente_email || null,
                    email_subject: 'Tu solicitud fue rechazada',
                    email_body: `Tu solicitud para ${cita.mascota_nombre} fue rechazada. Puedes intentar con otro horario.`,
                    metadata: {
                        cita_id: cita.id,
                        mascota: cita.mascota_nombre,
                        servicio: cita.servicio_nombre
                    }
                });
            } catch (notificationError) {
                console.warn('No se pudo registrar la notificacion de rechazo:', notificationError.message);
            }

            res.json({
                success: true,
                message: 'Cita rechazada',
                data: await Slot.getById(actualizada.id)
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getDetalleCita: async (req, res) => {
        try {
            const cita = await Slot.getById(req.params.citaId);
            if (!cita) {
                return res.status(404).json({ success: false, error: 'Cita no encontrada' });
            }

            const ficha = await GroomingRecord.getByCitaId(req.params.citaId);
            const insumosServicio = await ServiceInsumo.getByCitaId(req.params.citaId);
            res.json({
                success: true,
                data: {
                    ...cita,
                    ficha_grooming: ficha || null,
                    insumos_servicio: insumosServicio
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    cancelarCita: async (req, res) => {
        try {
            const cita = await Slot.getById(req.params.citaId);
            if (!cita) {
                return res.status(404).json({ success: false, error: 'Cita no encontrada' });
            }

            if (req.user.rol === 4) {
                if (!['en_revision', 'confirmada'].includes(cita.estado)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Solo puedes anular citas en revision o confirmadas'
                    });
                }

                const fechaHoraCita = new Date(cita.fecha_inicio);
                const ahora = new Date();
                const diferenciaMs = fechaHoraCita.getTime() - ahora.getTime();

                if (Number.isNaN(fechaHoraCita.getTime())) {
                    return res.status(400).json({
                        success: false,
                        error: 'La cita tiene una fecha invalida y no puede anularse en este momento'
                    });
                }

                if (diferenciaMs < HOURS_24_IN_MS) {
                    return res.status(400).json({
                        success: false,
                        error: 'Solo puedes anular citas con al menos 24 horas de anticipacion'
                    });
                }
            }

            const citaCancelada = await Slot.cancel(req.params.citaId, req.body.razon);
            const citaEnriquecida = await Slot.getById(citaCancelada.id);

            if (['confirmada', 'en_proceso', 'finalizada'].includes(cita.estado)) {
                await ensureAppointmentLedgerEntry(citaEnriquecida, req.user.id, 'reembolso');
            }

            try {
                await appendNotification({
                    tipo: 'cita_cancelada',
                    titulo: 'Cita cancelada',
                    mensaje: `La cita de ${cita.mascota_nombre} fue cancelada.`,
                    recipient_user_id: cita.cliente_id,
                    recipient_role: 4,
                    dedupe_key: `cita_cancelada:${cita.id}`,
                    email_to: cita.cliente_email || null,
                    email_subject: 'Tu cita fue cancelada',
                    email_body: `La cita de ${cita.mascota_nombre} fue cancelada. Si deseas reprogramarla, puedes volver a solicitar una nueva cita.`,
                    metadata: {
                        cita_id: cita.id,
                        mascota: cita.mascota_nombre,
                        servicio: cita.servicio_nombre,
                        estado_anterior: cita.estado
                    }
                });
            } catch (notificationError) {
                console.warn('No se pudo registrar la notificacion de cancelacion:', notificationError.message);
            }

            res.json({
                success: true,
                message: 'Cita cancelada exitosamente',
                data: citaEnriquecida
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    registrarPago: async (req, res) => {
        try {
            const {
                cita_id,
                metodo_pago,
                monto,
                concepto,
                tipo_venta,
                observaciones
            } = req.body;

            if (!metodo_pago) {
                return res.status(400).json({ success: false, error: 'El metodo de pago es requerido' });
            }

            const metodosValidos = ['efectivo', 'qr', 'transferencia', 'pendiente'];
            if (!metodosValidos.includes(metodo_pago)) {
                return res.status(400).json({ success: false, error: 'Metodo de pago invalido' });
            }

            let montoFinal = Number(monto) || 0;
            let conceptoFinal = concepto || null;

            if (cita_id) {
                const cita = await Slot.getById(cita_id);
                if (!cita) {
                    return res.status(404).json({ success: false, error: 'Cita no encontrada' });
                }

                montoFinal = montoFinal || Number(cita.precio_final) || 0;
                conceptoFinal = conceptoFinal || `${cita.servicio_nombre} - ${cita.mascota_nombre}`;
            }

            if (!montoFinal || montoFinal <= 0) {
                return res.status(400).json({ success: false, error: 'El monto debe ser mayor a 0' });
            }

            const pago = await Payment.create({
                cita_id,
                registrado_por: req.user.id,
                tipo_venta: tipo_venta || (cita_id ? 'cita' : 'directa'),
                concepto: conceptoFinal,
                metodo_pago,
                monto: montoFinal,
                observaciones
            });

            if (cita_id) {
                try {
                    const cita = await Slot.getById(cita_id);
                    if (cita?.cliente_id) {
                        await appendNotification({
                            tipo: 'pago_registrado',
                            titulo: 'Pago registrado',
                            mensaje: `Se registro el pago de ${cita.servicio_nombre} para ${cita.mascota_nombre}.`,
                            recipient_user_id: cita.cliente_id,
                            recipient_role: 4,
                            dedupe_key: `pago_registrado:${pago.id}`,
                            email_to: cita.cliente_email || null,
                            email_subject: 'Pago registrado',
                            email_body: `Se registro el pago de tu cita para ${cita.mascota_nombre}. Monto: Bs ${Number(montoFinal).toFixed(2)}.`,
                            metadata: {
                                pago_id: pago.id,
                                cita_id: cita.id,
                                mascota: cita.mascota_nombre,
                                servicio: cita.servicio_nombre,
                                monto: Number(montoFinal)
                            }
                        });
                    }
                } catch (notificationError) {
                    console.warn('No se pudo registrar la notificacion de pago:', notificationError.message);
                }
            }

            res.status(201).json({
                success: true,
                message: 'Pago registrado exitosamente',
                data: pago
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getPagos: async (req, res) => {
        try {
            const pagos = await Payment.getAll(req.query || {});
            res.json({ success: true, data: pagos });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getCierreCaja: async (req, res) => {
        try {
            const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
            const cierre = await Payment.getCierreCaja(fecha);
            res.json({
                success: true,
                data: {
                    fecha,
                    ...cierre
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getAgendaGroomer: async (req, res) => {
        try {
            const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
            const citas = (await Slot.getByDia(fecha, req.user.id))
                .filter((cita) => cita.estado !== 'cancelada');

            res.json({
                success: true,
                data: {
                    fecha,
                    citas
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getFichaGroomer: async (req, res) => {
        try {
            const cita = await validateGroomerOwnership(req.params.citaId, req.user.id);
            const ficha = await GroomingRecord.getByCitaId(req.params.citaId);
            const insumosServicio = await ServiceInsumo.getByCitaId(req.params.citaId);

            res.json({
                success: true,
                data: {
                    cita,
                    ficha: ficha || null,
                    insumos_servicio: insumosServicio,
                    checklist_requerido: GROOMING_CHECKLIST_FIELDS
                }
            });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, error: error.message });
        }
    },

    guardarFichaGroomer: async (req, res) => {
        try {
            await validateGroomerOwnership(req.params.citaId, req.user.id);
            const {
                estado_ingreso,
                observaciones_iniciales,
                checklist,
                insumos_texto,
                recomendaciones
            } = req.body;

            const ficha = await GroomingRecord.upsert({
                cita_id: req.params.citaId,
                groomer_id: req.user.id,
                estado_ingreso,
                observaciones_iniciales,
                checklist,
                insumos_texto,
                recomendaciones
            });

            res.json({
                success: true,
                message: 'Ficha grooming guardada',
                data: ficha
            });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, error: error.message });
        }
    },

    subirFotoGroomer: async (req, res) => {
        try {
            await validateGroomerOwnership(req.params.citaId, req.user.id);
            if (!req.file) {
                return res.status(400).json({ success: false, error: 'No se recibio ninguna imagen' });
            }

            const tipo = req.params.tipo;
            if (!['antes', 'despues'].includes(tipo)) {
                return res.status(400).json({ success: false, error: 'Tipo de foto invalido' });
            }

            const relativePath = `/uploads/grooming/${req.file.filename}`;
            const payload = {
                cita_id: req.params.citaId,
                groomer_id: req.user.id
            };

            if (tipo === 'antes') payload.foto_antes_path = relativePath;
            if (tipo === 'despues') payload.foto_despues_path = relativePath;

            const ficha = await GroomingRecord.upsert(payload);

            res.json({
                success: true,
                message: 'Foto subida correctamente',
                data: ficha
            });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, error: error.message });
        }
    },

    iniciarServicioGroomer: async (req, res) => {
        try {
            const cita = await validateGroomerOwnership(req.params.citaId, req.user.id);
            const ficha = await GroomingRecord.getByCitaId(cita.id);
            const insumosAsignados = await ServiceInsumo.getByCitaId(cita.id);

            if (!insumosAsignados.length) {
                return res.status(400).json({
                    success: false,
                    error: 'No hay insumos asignados para esta cita'
                });
            }

            if (!ficha?.estado_ingreso || !String(ficha.estado_ingreso).trim()) {
                return res.status(400).json({ success: false, error: 'Debes registrar el estado de ingreso antes de iniciar el servicio' });
            }

            if (!ficha?.foto_antes_path) {
                return res.status(400).json({ success: false, error: 'Debes subir la foto del antes antes de iniciar el servicio' });
            }

            const actualizada = await Slot.update(cita.id, { estado: 'en_proceso' });
            res.json({
                success: true,
                message: 'Servicio iniciado',
                data: await Slot.getById(actualizada.id)
            });
        } catch (error) {
            res.status(error.statusCode || 500).json({ success: false, error: error.message });
        }
    },

    finalizarServicioGroomer: async (req, res) => {
        const client = await db.connect();
        try {
            const cita = await validateGroomerOwnership(req.params.citaId, req.user.id);
            const ficha = await GroomingRecord.getByCitaId(cita.id);

            if (!ficha) {
                return res.status(400).json({ success: false, error: 'Debes completar la ficha tecnica antes de finalizar' });
            }

            if (!ficha.foto_antes_path) {
                return res.status(400).json({ success: false, error: 'Debes contar con la foto del antes' });
            }

            if (!ficha.foto_despues_path) {
                return res.status(400).json({ success: false, error: 'Debes subir la foto del despues para finalizar' });
            }

            if (!Array.isArray(req.body?.insumos) || req.body.insumos.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Debes registrar el control de insumos antes de finalizar'
                });
            }

            await client.query('BEGIN');
            const insumosProcesados = await ServiceInsumo.confirmarUso(client, {
                citaId: cita.id,
                items: req.body?.insumos || []
            });
            const resumenInsumos = buildInsumosResumen(insumosProcesados);

            if (resumenInsumos) {
                await client.query(`
                    UPDATE fichas_grooming
                    SET insumos_texto = COALESCE($1, insumos_texto),
                        updated_at = CURRENT_TIMESTAMP
                    WHERE cita_id = $2
                `, [resumenInsumos, cita.id]);
            }

            const actualizada = await client.query(`
                UPDATE slots
                SET estado = 'finalizada',
                    notas = COALESCE($1, notas),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *
            `, [req.body?.notas_cierre || cita.notas, cita.id]);

            await client.query('COMMIT');

            try {
                await appendNotification({
                    tipo: 'servicio_finalizado',
                    titulo: 'Servicio finalizado',
                    cita_id: cita.id,
                    cliente: cita.cliente_nombre,
                    mascota: cita.mascota_nombre,
                    groomer: cita.groomer_nombre,
                    mensaje: 'La mascota puede ser recogida',
                    recipient_user_id: cita.cliente_id,
                    recipient_role: 4,
                    email_to: cita.cliente_email || null,
                    email_subject: 'Tu mascota esta lista para recoger',
                    email_body: `El servicio de ${cita.mascota_nombre} fue finalizado. Ya puedes pasar por la mascota. ${ficha.recomendaciones ? `Recomendaciones: ${ficha.recomendaciones}` : ''}`,
                    recomendaciones: ficha.recomendaciones || null
                });
            } catch (notificationError) {
                console.error('No se pudo escribir la notificacion del servicio finalizado:', notificationError.message);
            }

            res.json({
                success: true,
                message: 'Servicio finalizado exitosamente',
                data: await Slot.getById(actualizada.rows[0].id)
            });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(error.statusCode || 500).json({ success: false, error: error.message });
        } finally {
            client.release();
        }
    }
};

module.exports = ScheduleController;
