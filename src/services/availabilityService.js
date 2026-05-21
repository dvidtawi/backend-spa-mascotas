const Slot = require('../models/Slot');
const SpaAvailability = require('../models/SpaAvailability');
const GroomerAvailability = require('../models/GroomerAvailability');
const Block = require('../models/Block');
const DurationService = require('./durationService');

/**
 * Servicio para verificar y gestionar disponibilidad
 */
const AvailabilityService = {
    /**
     * Obtiene el día de semana de una fecha (0 = domingo, 1 = lunes, ..., 6 = sábado)
     * En PostgreSQL: 0 = domingo, 1 = lunes, ..., 6 = sábado
     * @param {Date|string} fecha - Fecha a procesar
     * @returns {number} Día de semana (1-7, donde 1 = lunes)
     */
    obtenerDiaSemanaPG: (fecha) => {
        let date;
        
        // Si es string en formato YYYY-MM-DD, parsear manualmente para evitar problemas de zona horaria
        if (typeof fecha === 'string' && fecha.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = fecha.split('-').map(Number);
            date = new Date(year, month - 1, day);  // Parsea en zona horaria local
        } else {
            date = new Date(fecha);
        }
        
        let diaSemana = date.getDay();
        // Convertir: domingo=0 a 7, lunes=1 se mantiene
        diaSemana = diaSemana === 0 ? 7 : diaSemana;
        return diaSemana;
    },

    /**
     * Compara dos horarios en formato HH:MM o HH:MM:SS
     * @param {string} hora - Hora a comparar (HH:MM)
     * @param {string} inicio - Hora inicio (HH:MM o HH:MM:SS)
     * @param {string} fin - Hora fin (HH:MM o HH:MM:SS)
     * @returns {boolean} True si hora está entre inicio y fin
     */
    estaEnRango: (hora, inicio, fin) => {
        // Normalizar a HH:MM quitando segundos si existen
        const normalizarHora = (h) => h.substring(0, 5);
        const hNorm = normalizarHora(hora);
        const initNorm = normalizarHora(inicio);
        const finNorm = normalizarHora(fin);
        
        return hNorm >= initNorm && hNorm <= finNorm;
    },

    /**
     * Verifica si el spa está abierto en una fecha y hora específica
     * @param {Date|string} fecha - Fecha a verificar
     * @param {string} hora - Hora en formato "HH:MM"
     * @returns {Promise<Object>} Disponibilidad del spa
     */
    verificarDisponibilidadSpa: async (fecha, hora) => {
        try {
            const diaSemana = AvailabilityService.obtenerDiaSemanaPG(fecha);
            
            const disponibilidades = await SpaAvailability.getByDiaSemanav(diaSemana);
            
            if (disponibilidades.length === 0) {
                return {
                    disponible: false,
                    razon: 'El spa no tiene horario configurado para este día'
                };
            }

            // Verificar si la hora está dentro de alguno de los horarios
            const horaDisponible = disponibilidades.some(disp => {
                return AvailabilityService.estaEnRango(hora, disp.hora_inicio, disp.hora_fin);
            });

            if (!horaDisponible) {
                return {
                    disponible: false,
                    razon: `El spa no atiende a esta hora. Horarios: ${disponibilidades.map(d => `${d.hora_inicio} - ${d.hora_fin}`).join(', ')}`
                };
            }

            return {
                disponible: true,
                horarios: disponibilidades
            };
        } catch (error) {
            throw new Error(`Error verificando disponibilidad del spa: ${error.message}`);
        }
    },

    /**
     * Verifica la disponibilidad de un groomer en una fecha y hora
     * @param {string} groomerId - ID del groomer
     * @param {Date|string} fecha - Fecha
     * @param {string} horaInicio - Hora de inicio en formato "HH:MM"
     * @param {string} horaFin - Hora de fin en formato "HH:MM"
     * @returns {Promise<Object>} Disponibilidad del groomer
     */
    verificarDisponibilidadGroomer: async (groomerId, fecha, horaInicio, horaFin) => {
        try {
            const diaSemana = AvailabilityService.obtenerDiaSemanaPG(fecha);

            // Verificar si existe bloqueo en la fecha
            const tieneBloqueo = await Block.existeBloqueoEnFecha(groomerId, fecha);
            if (tieneBloqueo) {
                return {
                    disponible: false,
                    razon: 'El groomer tiene un bloqueo en esta fecha'
                };
            }

            // Obtener disponibilidades del groomer
            const disponibilidades = await GroomerAvailability.getByGroomerIdAndDia(groomerId, diaSemana);
            
            if (disponibilidades.length === 0) {
                return {
                    disponible: false,
                    razon: 'El groomer no tiene horario asignado para este día'
                };
            }

            // Verificar si la hora está dentro de alguno de sus horarios
            const horaDisponible = disponibilidades.some(disp => {
                return AvailabilityService.estaEnRango(horaInicio, disp.hora_inicio, disp.hora_fin) &&
                       AvailabilityService.estaEnRango(horaFin, disp.hora_inicio, disp.hora_fin);
            });

            if (!horaDisponible) {
                return {
                    disponible: false,
                    razon: `El groomer no está disponible a esta hora. Horarios: ${disponibilidades.map(d => `${d.hora_inicio} - ${d.hora_fin}`).join(', ')}`
                };
            }

            // Verificar solapamiento con otras citas
            const citasOcupadas = await Slot.getCitasOcupadas(
                groomerId,
                new Date(`${fecha}T${horaInicio}`),
                new Date(`${fecha}T${horaFin}`)
            );

            if (citasOcupadas.length > 0) {
                return {
                    disponible: false,
                    razon: 'El groomer tiene otras citas en este horario',
                    citasOcupadas: citasOcupadas
                };
            }

            return {
                disponible: true,
                horarios_disponibles: disponibilidades
            };
        } catch (error) {
            throw new Error(`Error verificando disponibilidad del groomer: ${error.message}`);
        }
    },

    /**
     * Verifica capacidad diaria del spa
     * @param {Date|string} fecha - Fecha
     * @param {string} groomerId - ID del groomer (opcional)
     * @returns {Promise<Object>} Información de capacidad
     */
    verificarCapacidadDiaria: async (fecha, groomerId = null) => {
        try {
            const diaSemana = AvailabilityService.obtenerDiaSemanaPG(fecha);
            
            // Obtener capacidad configurada
            const disponibilidades = await SpaAvailability.getByDiaSemanav(diaSemana);
            
            if (disponibilidades.length === 0) {
                return {
                    disponible: false,
                    razon: 'No hay disponibilidad configurada para este día'
                };
            }

            const capacidadDiaria = disponibilidades[0].capacidad_diaria || 10;

            // Contar citas existentes
            const citasExistentes = await Slot.contarCitasEnDia(fecha, groomerId);

            const disponible = citasExistentes < capacidadDiaria;
            const capacidadRestante = capacidadDiaria - citasExistentes;

            return {
                disponible,
                capacidad_diaria: capacidadDiaria,
                citas_existentes: citasExistentes,
                capacidad_restante: capacidadRestante,
                porcentaje_ocupacion: Math.round((citasExistentes / capacidadDiaria) * 100)
            };
        } catch (error) {
            throw new Error(`Error verificando capacidad: ${error.message}`);
        }
    },

    /**
     * Obtiene slots disponibles para una fecha
     * @param {Date|string} fecha - Fecha
     * @param {number} duracionMinutos - Duración requerida en minutos
     * @param {string} groomerId - ID del groomer (opcional)
     * @returns {Promise<Array>} Array con slots disponibles
     */
    obtenerSlotsDisponibles: async (fecha, duracionMinutos, groomerId = null) => {
        try {
            const diaSemana = AvailabilityService.obtenerDiaSemanaPG(fecha);
            
            // Obtener horarios disponibles del spa
            const horariosSpa = await SpaAvailability.getByDiaSemanav(diaSemana);
            
            if (horariosSpa.length === 0) {
                return {
                    disponibles: [],
                    razon: 'El spa no atiende este día'
                };
            }

            // Verificar capacidad diaria primero
            const capacidad = await AvailabilityService.verificarCapacidadDiaria(fecha, groomerId);
            if (!capacidad.disponible) {
                return {
                    disponibles: [],
                    razon: 'Se ha alcanzado la capacidad máxima del día'
                };
            }

            const slots = [];
            const intervaloMinutos = 30; // Intervalos de 30 minutos
            const duracionEnMinutos = duracionMinutos;

            for (const horario of horariosSpa) {
                let horaActual = new Date(`${fecha}T${horario.hora_inicio}`);
                const horaFin = new Date(`${fecha}T${horario.hora_fin}`);

                while (horaActual.getTime() + (duracionEnMinutos * 60000) <= horaFin.getTime()) {
                    const horaInicio = horaActual.toISOString().slice(11, 16);
                    const proximaHora = new Date(horaActual.getTime() + (duracionEnMinutos * 60000));
                    const horaFinSlot = proximaHora.toISOString().slice(11, 16);

                    // Verificar disponibilidad en este intervalo
                    if (groomerId) {
                        const disponibilidad = await AvailabilityService.verificarDisponibilidadGroomer(
                            groomerId,
                            fecha,
                            horaInicio,
                            horaFinSlot
                        );

                        if (disponibilidad.disponible) {
                            slots.push({
                                fecha,
                                hora_inicio: horaInicio,
                                hora_fin: horaFinSlot,
                                groomer_id: groomerId
                            });
                        }
                    } else {
                        // Sin groomer específico, validar disponibilidad del spa y capacidad
                        const disponibleSpa = await AvailabilityService.verificarDisponibilidadSpa(
                            fecha,
                            horaInicio
                        );

                        if (disponibleSpa.disponible) {
                            slots.push({
                                fecha,
                                hora_inicio: horaInicio,
                                hora_fin: horaFinSlot
                            });
                        }
                    }

                    horaActual.setMinutes(horaActual.getMinutes() + intervaloMinutos);
                }
            }

            return {
                disponibles: slots,
                total_slots: slots.length
            };
        } catch (error) {
            throw new Error(`Error obteniendo slots disponibles: ${error.message}`);
        }
    },

    /**
     * Valida todas las reglas de capacidad para crear una cita
     * @param {Object} datos - Objeto con los datos de la cita
     * @returns {Promise<Object>} Resultado de la validación
     */
    validarReglasCapacidad: async (datos) => {
        try {
            const errores = [];

            // 1. Verificar disponibilidad del spa
            const disponibleSpa = await AvailabilityService.verificarDisponibilidadSpa(
                datos.fecha,
                datos.hora_inicio
            );
            if (!disponibleSpa.disponible) {
                errores.push(disponibleSpa.razon);
            }

            // 2. Verificar disponibilidad del groomer
            if (datos.groomer_id) {
                const disponibleGroomer = await AvailabilityService.verificarDisponibilidadGroomer(
                    datos.groomer_id,
                    datos.fecha,
                    datos.hora_inicio,
                    datos.hora_fin
                );
                if (!disponibleGroomer.disponible) {
                    errores.push(disponibleGroomer.razon);
                }
            }

            // 3. Verificar capacidad diaria
            const capacidad = await AvailabilityService.verificarCapacidadDiaria(
                datos.fecha,
                datos.groomer_id
            );
            if (!capacidad.disponible) {
                errores.push('Se ha alcanzado la capacidad máxima del día');
            }

            return {
                valido: errores.length === 0,
                errores,
                capacidad
            };
        } catch (error) {
            throw new Error(`Error validando reglas de capacidad: ${error.message}`);
        }
    }
};

module.exports = AvailabilityService;
