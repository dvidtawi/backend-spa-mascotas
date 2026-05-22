const Slot = require('../models/Slot');
const SpaAvailability = require('../models/SpaAvailability');
const GroomerAvailability = require('../models/GroomerAvailability');
const Block = require('../models/Block');

const BUFFER_MINUTOS_GROOMER = 15;
const SLOT_INTERVALO_MINUTOS = 15;

const AvailabilityService = {
    BUFFER_MINUTOS_GROOMER,

    normalizarFechaISO: (fecha) => {
        if (!fecha) return null;

        if (typeof fecha === 'string' && fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return fecha;
        }

        const date = fecha instanceof Date ? fecha : new Date(fecha);

        if (Number.isNaN(date.getTime())) {
            return null;
        }

        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    obtenerDiaSemanaPG: (fecha) => {
        let date;

        const fechaNormalizada = AvailabilityService.normalizarFechaISO(fecha);

        if (fechaNormalizada) {
            const [year, month, day] = fechaNormalizada.split('-').map(Number);
            date = new Date(year, month - 1, day);
        } else {
            date = new Date(fecha);
        }

        const diaSemana = date.getDay();
        return diaSemana === 0 ? 7 : diaSemana;
    },

    normalizarHora: (hora) => String(hora).slice(0, 5),

    convertirHoraAMinutos: (hora) => {
        const [horas, minutos] = AvailabilityService.normalizarHora(hora).split(':').map(Number);
        return (horas * 60) + minutos;
    },

    formatearMinutosAHora: (totalMinutos) => {
        const horas = String(Math.floor(totalMinutos / 60)).padStart(2, '0');
        const minutos = String(totalMinutos % 60).padStart(2, '0');
        return `${horas}:${minutos}`;
    },

    estaDentroDeHorario: (horaInicio, horaFin, inicioJornada, finJornada) => {
        const inicio = AvailabilityService.convertirHoraAMinutos(horaInicio);
        const fin = AvailabilityService.convertirHoraAMinutos(horaFin);
        const inicioRango = AvailabilityService.convertirHoraAMinutos(inicioJornada);
        const finRango = AvailabilityService.convertirHoraAMinutos(finJornada);

        return inicio >= inicioRango && fin <= finRango && inicio < fin;
    },

    intersectanRangos: (inicioA, finA, inicioB, finB) => {
        const aInicio = AvailabilityService.convertirHoraAMinutos(inicioA);
        const aFin = AvailabilityService.convertirHoraAMinutos(finA);
        const bInicio = AvailabilityService.convertirHoraAMinutos(inicioB);
        const bFin = AvailabilityService.convertirHoraAMinutos(finB);

        return aInicio < bFin && aFin > bInicio;
    },

    intersectanRangosConBufferGroomer: (inicioA, finA, inicioB, finB, bufferMinutos = BUFFER_MINUTOS_GROOMER) => {
        const aInicio = AvailabilityService.convertirHoraAMinutos(inicioA);
        const aFin = AvailabilityService.convertirHoraAMinutos(finA) + bufferMinutos;
        const bInicio = AvailabilityService.convertirHoraAMinutos(inicioB);
        const bFin = AvailabilityService.convertirHoraAMinutos(finB) + bufferMinutos;

        return aInicio < bFin && aFin > bInicio;
    },

    intersectarHorarios: (inicioA, finA, inicioB, finB) => {
        const inicio = Math.max(
            AvailabilityService.convertirHoraAMinutos(inicioA),
            AvailabilityService.convertirHoraAMinutos(inicioB)
        );
        const fin = Math.min(
            AvailabilityService.convertirHoraAMinutos(finA),
            AvailabilityService.convertirHoraAMinutos(finB)
        );

        if (inicio >= fin) {
            return null;
        }

        return {
            hora_inicio: AvailabilityService.formatearMinutosAHora(inicio),
            hora_fin: AvailabilityService.formatearMinutosAHora(fin)
        };
    },

    verificarDisponibilidadSpa: async (fecha, horaInicio, horaFin = null) => {
        const diaSemana = AvailabilityService.obtenerDiaSemanaPG(fecha);
        const disponibilidades = await SpaAvailability.getByDiaSemana(diaSemana);
        const bloqueosDelDia = (await Block.getByFechaRango(fecha, fecha, null))
            .filter((bloqueo) => bloqueo.groomer_id === null);

        if (disponibilidades.length === 0) {
            return {
                disponible: false,
                razon: 'El spa no tiene horario habitual configurado para este dia'
            };
        }

        const horaFinEvaluada = horaFin || horaInicio;
        const cambiosHorario = bloqueosDelDia.filter((bloqueo) => bloqueo.tipo === 'cambio_horario');

        if (cambiosHorario.length > 0) {
            const dentroDeExcepcion = cambiosHorario.some((bloqueo) => (
                AvailabilityService.estaDentroDeHorario(
                    horaInicio,
                    horaFinEvaluada,
                    bloqueo.hora_inicio,
                    bloqueo.hora_fin
                )
            ));

            if (!dentroDeExcepcion) {
                return {
                    disponible: false,
                    razon: `Existe una excepcion de cambio de horario para este dia. Rango permitido: ${cambiosHorario.map((b) => `${AvailabilityService.normalizarHora(b.hora_inicio)}-${AvailabilityService.normalizarHora(b.hora_fin)}`).join(', ')}`
                };
            }
        }

        const coincideHorario = disponibilidades.some((disp) => (
            AvailabilityService.estaDentroDeHorario(
                horaInicio,
                horaFinEvaluada,
                disp.hora_inicio,
                disp.hora_fin
            )
        ));

        if (!coincideHorario) {
            return {
                disponible: false,
                razon: `El horario solicitado queda fuera del horario habitual del spa (${disponibilidades.map((d) => `${AvailabilityService.normalizarHora(d.hora_inicio)}-${AvailabilityService.normalizarHora(d.hora_fin)}`).join(', ')})`
            };
        }

        const bloqueosGenerales = bloqueosDelDia.filter((bloqueo) => (
            bloqueo.tipo !== 'cambio_horario'
            && AvailabilityService.intersectanRangos(
                horaInicio,
                horaFinEvaluada,
                bloqueo.hora_inicio,
                bloqueo.hora_fin
            )
        ));

        if (bloqueosGenerales.length > 0) {
            return {
                disponible: false,
                razon: 'Existe un bloqueo general del spa en ese rango',
                bloqueos: bloqueosGenerales
            };
        }

        return {
            disponible: true,
            horarios: disponibilidades
        };
    },

    verificarDisponibilidadGroomer: async (groomerId, fecha, horaInicio, horaFin, excludeCitaId = null) => {
        const bloqueosSolapados = await Block.getBloqueosSolapados(groomerId, fecha, horaInicio, horaFin);
        const bloqueosGroomer = bloqueosSolapados.filter((bloqueo) => bloqueo.groomer_id === groomerId);

        if (bloqueosGroomer.length > 0) {
            return {
                disponible: false,
                razon: 'El groomer tiene un bloqueo en este horario',
                bloqueos: bloqueosGroomer
            };
        }

        const diaSemana = AvailabilityService.obtenerDiaSemanaPG(fecha);
        const disponibilidades = await GroomerAvailability.getByGroomerIdAndDia(groomerId, diaSemana);

        if (disponibilidades.length === 0) {
            return {
                disponible: false,
                razon: 'El groomer no tiene horario asignado para este dia'
            };
        }

        const coincideHorario = disponibilidades.some((disp) => (
            AvailabilityService.estaDentroDeHorario(
                horaInicio,
                horaFin,
                disp.hora_inicio,
                disp.hora_fin
            )
        ));

        if (!coincideHorario) {
            return {
                disponible: false,
                razon: `La cita no cae dentro del horario laboral del groomer (${disponibilidades.map((d) => `${AvailabilityService.normalizarHora(d.hora_inicio)}-${AvailabilityService.normalizarHora(d.hora_fin)}`).join(', ')})`
            };
        }

        const citasExistentes = await Slot.getCitasActivasPorGroomerDia(groomerId, fecha, excludeCitaId);
        const citasOcupadas = citasExistentes.filter((cita) => (
            AvailabilityService.intersectanRangosConBufferGroomer(
                horaInicio,
                horaFin,
                cita.hora_inicio,
                cita.hora_fin
            )
        ));

        if (citasOcupadas.length > 0) {
            return {
                disponible: false,
                razon: `El groomer ya tiene una cita que choca o no deja el margen operativo de ${BUFFER_MINUTOS_GROOMER} minutos`,
                citasOcupadas
            };
        }

        return {
            disponible: true,
            horarios_disponibles: disponibilidades
        };
    },

    verificarDisponibilidadMascota: async (mascotaId, fecha, horaInicio, horaFin, excludeCitaId = null) => {
        const citasExistentes = await Slot.getCitasActivasPorMascotaDia(mascotaId, fecha, excludeCitaId);
        const citasSolapadas = citasExistentes.filter((cita) => (
            AvailabilityService.intersectanRangos(horaInicio, horaFin, cita.hora_inicio, cita.hora_fin)
        ));

        if (citasSolapadas.length > 0) {
            return {
                disponible: false,
                razon: 'La mascota ya tiene otra cita en ese rango horario',
                citasSolapadas
            };
        }

        return {
            disponible: true,
            citasSolapadas: []
        };
    },

    verificarDuplicadoServicioMascota: async (mascotaId, servicioId, fecha, excludeCitaId = null) => {
        const duplicadas = await Slot.getServiciosActivosDuplicadosMascota(
            mascotaId,
            servicioId,
            fecha,
            excludeCitaId
        );

        if (duplicadas.length > 0) {
            return {
                disponible: false,
                razon: 'La mascota ya tiene una solicitud o cita activa para este mismo servicio en la fecha seleccionada',
                duplicadas
            };
        }

        return {
            disponible: true,
            duplicadas: []
        };
    },

    diagnosticarCita: async ({
        citaId = null,
        mascotaId,
        servicioId,
        groomerId,
        fecha,
        horaInicio,
        horaFin
    }) => {
        const errores = [];
        const advertencias = [];

        const spa = await AvailabilityService.verificarDisponibilidadSpa(fecha, horaInicio, horaFin);
        if (!spa.disponible) {
            errores.push(spa.razon);
        }

        if (!groomerId) {
            errores.push('Se requiere seleccionar un groomer');
        } else {
            const groomer = await AvailabilityService.verificarDisponibilidadGroomer(
                groomerId,
                fecha,
                horaInicio,
                horaFin,
                citaId
            );

            if (!groomer.disponible) {
                errores.push(groomer.razon);
            } else if (horaFin === '23:59') {
                advertencias.push('El horario de cierre queda al limite del rango permitido');
            }
        }

        if (mascotaId) {
            const mascota = await AvailabilityService.verificarDisponibilidadMascota(
                mascotaId,
                fecha,
                horaInicio,
                horaFin,
                citaId
            );
            if (!mascota.disponible) {
                errores.push(mascota.razon);
            }
        }

        if (mascotaId && servicioId) {
            const duplicado = await AvailabilityService.verificarDuplicadoServicioMascota(
                mascotaId,
                servicioId,
                fecha,
                citaId
            );
            if (!duplicado.disponible) {
                errores.push(duplicado.razon);
            }
        }

        return {
            valido: errores.length === 0,
            errores,
            advertencias
        };
    },

    diagnosticarCitaExistente: async (cita) => {
        const fecha = AvailabilityService.normalizarFechaISO(cita.fecha);
        const horaInicio = AvailabilityService.normalizarHora(cita.hora_inicio);
        const horaFin = AvailabilityService.normalizarHora(cita.hora_fin);

        if (!fecha) {
            return {
                valido: false,
                errores: [],
                advertencias: ['No se pudo interpretar la fecha de esta cita para recalcular su diagnostico.']
            };
        }

        try {
            const diagnostico = await AvailabilityService.diagnosticarCita({
                citaId: cita.id,
                mascotaId: cita.mascota_id,
                servicioId: cita.servicio_id,
                groomerId: cita.groomer_id,
                fecha,
                horaInicio,
                horaFin
            });

            const advertencias = [...(diagnostico.advertencias || [])];
            const errores = [...(diagnostico.errores || [])];

            if (errores.length > 0) {
                advertencias.unshift('La cita requiere revision porque la agenda actual ya no coincide con sus reglas de disponibilidad.');
            }

            return {
                valido: errores.length === 0,
                errores,
                advertencias
            };
        } catch (error) {
            return {
                valido: false,
                errores: [],
                advertencias: ['No se pudo recalcular el diagnostico automatico de esta cita.']
            };
        }
    },

    obtenerSlotsDisponibles: async (fecha, duracionMinutos, groomerId = null) => {
        const diaSemana = AvailabilityService.obtenerDiaSemanaPG(fecha);
        const horariosSpa = await SpaAvailability.getByDiaSemana(diaSemana);

        if (horariosSpa.length === 0) {
            return {
                disponibles: [],
                razon: 'El spa no atiende este dia'
            };
        }

        const groomersObjetivo = groomerId
            ? [{ id: groomerId }]
            : await GroomerAvailability.getGroomersDisponiblesEnDia(diaSemana);

        const slots = [];

        for (const groomer of groomersObjetivo) {
            const disponibilidadesGroomer = await GroomerAvailability.getByGroomerIdAndDia(
                groomer.id,
                diaSemana
            );

            for (const horarioSpa of horariosSpa) {
                for (const horarioGroomer of disponibilidadesGroomer) {
                    const interseccion = AvailabilityService.intersectarHorarios(
                        horarioSpa.hora_inicio,
                        horarioSpa.hora_fin,
                        horarioGroomer.hora_inicio,
                        horarioGroomer.hora_fin
                    );

                    if (!interseccion) {
                        continue;
                    }

                    let inicioMinutos = AvailabilityService.convertirHoraAMinutos(interseccion.hora_inicio);
                    const finJornadaMinutos = AvailabilityService.convertirHoraAMinutos(interseccion.hora_fin);

                    while ((inicioMinutos + duracionMinutos) <= finJornadaMinutos) {
                        const horaInicio = AvailabilityService.formatearMinutosAHora(inicioMinutos);
                        const horaFin = AvailabilityService.formatearMinutosAHora(inicioMinutos + duracionMinutos);
                        const diagnostico = await AvailabilityService.diagnosticarCita({
                            groomerId: groomer.id,
                            fecha,
                            horaInicio,
                            horaFin
                        });

                        if (diagnostico.valido) {
                            slots.push({
                                fecha,
                                hora_inicio: horaInicio,
                                hora_fin: horaFin,
                                groomer_id: groomer.id,
                                groomer_nombre: groomer.nombre || null
                            });
                        }

                        inicioMinutos += SLOT_INTERVALO_MINUTOS;
                    }
                }
            }
        }

        return {
            disponibles: slots,
            total_slots: slots.length
        };
    },

    validarReglasCapacidad: async (datos) => {
        const diagnostico = await AvailabilityService.diagnosticarCita({
            citaId: datos.exclude_cita_id || null,
            mascotaId: datos.mascota_id,
            servicioId: datos.servicio_id,
            groomerId: datos.groomer_id,
            fecha: datos.fecha,
            horaInicio: datos.hora_inicio,
            horaFin: datos.hora_fin
        });

        return {
            valido: diagnostico.valido,
            errores: diagnostico.errores,
            advertencias: diagnostico.advertencias
        };
    }
};

module.exports = AvailabilityService;
