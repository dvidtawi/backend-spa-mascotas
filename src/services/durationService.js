const Pet = require('../models/Pet');
const Service = require('../models/Service');

const DurationService = {
    AJUSTES_POR_TAMANO: {
        pequeno: 0,
        pequena: 0,
        mediano: 10,
        mediana: 10,
        grande: 15,
        gigante: 30
    },

    MINUTOS_POR_TEMPERAMENTO: {
        tranquilo: 0,
        inquieto: 5,
        nervioso: 10,
        agresivo: 15
    },

    normalizarTexto: (texto = '') => (
        texto
            .toString()
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
    ),

    obtenerAjustePorTamano: (tamano) => {
        if (!tamano) return 0;
        return DurationService.AJUSTES_POR_TAMANO[
            DurationService.normalizarTexto(tamano)
        ] || 0;
    },

    calcularDuracionAjustada: (duracionBase, ajustePorcentaje = 0) => {
        if (ajustePorcentaje < 0 || ajustePorcentaje > 100) {
            throw new Error('El ajuste debe estar entre 0 y 100%');
        }

        const incremento = (duracionBase * ajustePorcentaje) / 100;
        return Math.ceil(duracionBase + incremento);
    },

    calcularDuracionTotalServicio: (duracionBase, tamano, minutosAdicionalesTemperamento = 0) => {
        const ajusteTamano = DurationService.obtenerAjustePorTamano(tamano);
        const duracionPorTamano = DurationService.calcularDuracionAjustada(
            duracionBase,
            ajusteTamano
        );

        return duracionPorTamano + Math.max(0, Number(minutosAdicionalesTemperamento) || 0);
    },

    obtenerMinutosPorTemperamento: (temperamento) => {
        if (!temperamento) return 0;
        return DurationService.MINUTOS_POR_TEMPERAMENTO[
            DurationService.normalizarTexto(temperamento)
        ] || 0;
    },

    getDuracionAjustadaParaMascota: async (mascotaId, servicioId) => {
        const mascota = await Pet.getById(mascotaId);
        if (!mascota) {
            throw new Error('Mascota no encontrada');
        }

        const servicio = await Service.getById(servicioId);
        if (!servicio) {
            throw new Error('Servicio no encontrado');
        }

        const tamano = mascota.tamano || mascota['tamaño'];
        const minutosAutomaticosTemperamento = DurationService.obtenerMinutosPorTemperamento(
            mascota.temperamento
        );
        const minutosOverride = Number(mascota.minutos_adicionales_temperamento) || 0;
        const minutosAdicionalesTemperamento = Math.max(
            minutosAutomaticosTemperamento,
            minutosOverride
        );
        const ajusteTamano = DurationService.obtenerAjustePorTamano(tamano);
        const duracionPorTamano = DurationService.calcularDuracionAjustada(
            servicio.duracion_base,
            ajusteTamano
        );
        const duracionAjustada = duracionPorTamano + minutosAdicionalesTemperamento;

        return {
            servicio_id: servicioId,
            servicio_nombre: servicio.nombre,
            duracion_base: servicio.duracion_base,
            tamano,
            temperamento: mascota.temperamento,
            ajuste_tamano: ajusteTamano,
            minutos_adicionales_temperamento: minutosAdicionalesTemperamento,
            duracion_por_tamano: duracionPorTamano,
            duracion_ajustada: duracionAjustada,
            duracion_en_horas: (duracionAjustada / 60).toFixed(2),
            detalle: {
                base: servicio.duracion_base,
                porcentaje_tamano: ajusteTamano,
                minutos_temperamento: minutosAdicionalesTemperamento,
                minutos_temperamento_automaticos: minutosAutomaticosTemperamento
            }
        };
    },

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

    calcularDuracionTotal: (duraciones) => {
        return duraciones.reduce((total, duracion) => total + duracion, 0);
    },

    formatearDuracion: (minutos) => {
        const horas = Math.floor(minutos / 60);
        const mins = minutos % 60;

        if (horas === 0) {
            return `${mins}m`;
        }

        if (mins === 0) {
            return `${horas}h`;
        }

        return `${horas}h ${mins}m`;
    },

    calcularHoraFinal: (horaInicio, duracionMinutos) => {
        const inicio = new Date(horaInicio);
        return new Date(inicio.getTime() + (duracionMinutos * 60000));
    },

    obtenerSugerenciasAjustes: () => [
        { tamano: 'Pequeno', ajuste_porcentaje: 0, descripcion: 'Duracion base' },
        { tamano: 'Mediano', ajuste_porcentaje: 10, descripcion: 'Duracion base + 10%' },
        { tamano: 'Grande', ajuste_porcentaje: 15, descripcion: 'Duracion base + 15%' },
        { tamano: 'Gigante', ajuste_porcentaje: 30, descripcion: 'Duracion base + 30%' },
        { tamano: 'Temperamento tranquilo', ajuste_porcentaje: null, descripcion: '0 minutos extra' },
        { tamano: 'Temperamento inquieto', ajuste_porcentaje: null, descripcion: '5 minutos extra' },
        { tamano: 'Temperamento nervioso', ajuste_porcentaje: null, descripcion: '10 minutos extra' },
        { tamano: 'Temperamento agresivo', ajuste_porcentaje: null, descripcion: '15 minutos extra' }
    ]
};

module.exports = DurationService;
