const Pet = require('../models/Pet');
const Service = require('../models/Service');

/**
 * Servicio para calcular duraciones dinámicas de servicios
 * basadas en tamaño y características de mascotas
 */
const DurationService = {
    /**
     * Mapa de tamaños a porcentajes de ajuste
     * El tamaño se utiliza para ajustar la duración base
     */
    AJUSTES_POR_TAMAÑO: {
        'pequeño': 0,
        'pequeña': 0,
        'mediano': 10,
        'mediana': 10,
        'grande': 15,
        'gigante': 30,
        'compleja': 30
    },

    /**
     * Obtiene el ajuste de porcentaje basado en el tamaño de la mascota
     * @param {string} tamaño - Tamaño de la mascota
     * @returns {number} Porcentaje de ajuste (0-30)
     */
    obtenerAjustePorTamaño: (tamaño) => {
        if (!tamaño) return 0;
        const tamañoNormalizado = tamaño.toLowerCase();
        return DurationService.AJUSTES_POR_TAMAÑO[tamañoNormalizado] || 0;
    },

    /**
     * Calcula la duración ajustada de un servicio
     * @param {number} duracionBase - Duración base del servicio en minutos
     * @param {number} ajustePorcentaje - Porcentaje de ajuste (0-30)
     * @returns {number} Duración ajustada en minutos
     */
    calcularDuracionAjustada: (duracionBase, ajustePorcentaje = 0) => {
        if (ajustePorcentaje < 0 || ajustePorcentaje > 100) {
            throw new Error('El ajuste debe estar entre 0 y 100%');
        }
        
        const incremento = (duracionBase * ajustePorcentaje) / 100;
        return Math.ceil(duracionBase + incremento);
    },

    /**
     * Calcula ajuste combinado aplicando ambos factores (tamaño + característica)
     * Los ajustes se suman (máximo 50% para evitar duraciones excesivas)
     * @param {number} ajusteTamaño - Ajuste por tamaño
     * @param {number} ajusteCaracteristica - Ajuste por característica/comportamiento
     * @returns {number} Ajuste combinado total
     */
    calcularAjusteTotal: (ajusteTamaño = 0, ajusteCaracteristica = 0) => {
        const ajusteTotal = Math.min(ajusteTamaño + ajusteCaracteristica, 50);
        return ajusteTotal;
    },

    /**
     * Obtiene la duración ajustada para una mascota y servicio específicos
     * @param {string} mascotaId - ID de la mascota
     * @param {string} servicioId - ID del servicio
     * @returns {Promise<Object>} Objeto con duración base y duración ajustada
     */
    getDuracionAjustadaParaMascota: async (mascotaId, servicioId) => {
        try {
            // Obtener datos de la mascota
            const mascota = await Pet.getById(mascotaId);
            if (!mascota) {
                throw new Error('Mascota no encontrada');
            }

            // Obtener datos del servicio
            const servicio = await Service.getById(servicioId);
            if (!servicio) {
                throw new Error('Servicio no encontrado');
            }

            // Calcular ajustes por tamaño y característica
            const ajusteTamaño = DurationService.obtenerAjustePorTamaño(mascota.tamaño);
            const ajusteCaracteristica = mascota.ajuste_porcentaje || 0;
            const ajusteTotal = DurationService.calcularAjusteTotal(ajusteTamaño, ajusteCaracteristica);
            
            const duracionAjustada = DurationService.calcularDuracionAjustada(
                servicio.duracion_base,
                ajusteTotal
            );

            return {
                servicio_id: servicioId,
                servicio_nombre: servicio.nombre,
                duracion_base: servicio.duracion_base,
                ajuste_tamaño: ajusteTamaño,
                ajuste_caracteristica: ajusteCaracteristica,
                ajuste_total: ajusteTotal,
                caracteristica: mascota.caracteristica,
                tamaño: mascota.tamaño,
                duracion_ajustada: duracionAjustada,
                duracion_en_horas: (duracionAjustada / 60).toFixed(2)
            };
        } catch (error) {
            throw new Error(`Error calculando duración: ${error.message}`);
        }
    },

    /**
     * Calcula duraciones ajustadas para múltiples servicios de una mascota
     * @param {string} mascotaId - ID de la mascota
     * @param {Array<string>} servicioIds - Array de IDs de servicios
     * @returns {Promise<Array>} Array con duraciones ajustadas para cada servicio
     */
    getDuracionesAjustadasMultiples: async (mascotaId, servicioIds) => {
        const duraciones = [];
        
        for (const servicioId of servicioIds) {
            try {
                const duracion = await DurationService.getDuracionAjustadaParaMascota(
                    mascotaId,
                    servicioId
                );
                duraciones.push(duracion);
            } catch (error) {
                duraciones.push({
                    servicio_id: servicioId,
                    error: error.message
                });
            }
        }

        return duraciones;
    },

    /**
     * Calcula el tiempo total de múltiples servicios
     * @param {Array<number>} duraciones - Array de duraciones ajustadas
     * @returns {number} Duración total en minutos
     */
    calcularDuracionTotal: (duraciones) => {
        return duraciones.reduce((total, duracion) => total + duracion, 0);
    },

    /**
     * Convierte minutos a formato legible (horas y minutos)
     * @param {number} minutos - Duración en minutos
     * @returns {string} Formato: "1h 30m" o "45m"
     */
    formatearDuracion: (minutos) => {
        const horas = Math.floor(minutos / 60);
        const mins = minutos % 60;

        if (horas === 0) {
            return `${mins}m`;
        } else if (mins === 0) {
            return `${horas}h`;
        } else {
            return `${horas}h ${mins}m`;
        }
    },

    /**
     * Calcula la hora final de una cita
     * @param {Date|string} horaInicio - Hora de inicio
     * @param {number} duracionMinutos - Duración en minutos
     * @returns {Date} Hora final
     */
    calcularHoraFinal: (horaInicio, duracionMinutos) => {
        const inicio = new Date(horaInicio);
        const fin = new Date(inicio.getTime() + duracionMinutos * 60000);
        return fin;
    },

    /**
     * Obtiene sugerencias de duraciones según características de mascota
     * @returns {Array} Array con los ajustes sugeridos
     */
    obtenerSugerenciasAjustes: () => {
        return [
            { caracteristica: 'Pequeña', ajuste_porcentaje: 0, descripcion: 'Duración base' },
            { caracteristica: 'Mediana', ajuste_porcentaje: 10, descripcion: 'Duración base + 10%' },
            { caracteristica: 'Grande', ajuste_porcentaje: 15, descripcion: 'Duración base + 15%' },
            { caracteristica: 'Gigante', ajuste_porcentaje: 30, descripcion: 'Duración base + 30%' },
            { caracteristica: 'Nerviosa/Agresiva', ajuste_porcentaje: 20, descripcion: 'Tiempo adicional según criterio técnico' }
        ];
    }
};

module.exports = DurationService;
