const db = require('../config/database');
const { appendNotification } = require('./notificationLogService');

const INTERVAL_MS = 15 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;
const HOURS = {
    24: 24 * 60 * 60 * 1000,
    2: 2 * 60 * 60 * 1000
};

const buildReminderMessage = (cita, hours) => {
    const fecha = new Date(cita.fecha_inicio).toLocaleString('es-BO');
    return hours === 24
        ? `Recordatorio: tienes una cita de ${cita.servicio_nombre} para ${cita.mascota_nombre} el ${fecha}.`
        : `Recordatorio: tu cita de ${cita.servicio_nombre} para ${cita.mascota_nombre} es dentro de 2 horas (${fecha}).`;
};

const fetchConfirmedAppointments = async () => {
    const result = await db.query(`
        SELECT s.id, s.fecha_inicio, s.cliente_id, c.nombre AS cliente_nombre, c.email AS cliente_email,
               srv.nombre AS servicio_nombre, m.nombre AS mascota_nombre
        FROM slots s
        LEFT JOIN usuarios c ON c.id = s.cliente_id
        LEFT JOIN servicios srv ON srv.id = s.servicio_id
        LEFT JOIN mascotas m ON m.id = s.mascota_id
        WHERE s.estado IN ('confirmada', 'en_proceso')
          AND s.fecha_inicio IS NOT NULL;
    `);

    return result.rows;
};

const emitReminder = async (cita, hours) => {
    const dedupeKey = `reminder:${hours}:${cita.id}`;
    const titulo = hours === 24 ? 'Recordatorio de cita en 24 horas' : 'Recordatorio de cita en 2 horas';
    const mensaje = buildReminderMessage(cita, hours);

    await appendNotification({
        tipo: hours === 24 ? 'recordatorio_24h' : 'recordatorio_2h',
        titulo,
        mensaje,
        recipient_user_id: cita.cliente_id,
        recipient_role: 4,
        dedupe_key: dedupeKey,
        email_to: cita.cliente_email || null,
        email_subject: titulo,
        email_body: mensaje,
        metadata: {
            cita_id: cita.id,
            servicio: cita.servicio_nombre,
            mascota: cita.mascota_nombre,
            fecha_inicio: cita.fecha_inicio,
            recordatorio_horas: hours
        }
    });
};

const runReminderCheck = async () => {
    const citas = await fetchConfirmedAppointments();
    const now = Date.now();

    for (const cita of citas) {
        const citaTime = new Date(cita.fecha_inicio).getTime();
        if (Number.isNaN(citaTime)) continue;

        for (const hours of [24, 2]) {
            const target = citaTime - HOURS[hours];
            if (Math.abs(now - target) <= WINDOW_MS) {
                await emitReminder(cita, hours);
            }
        }
    }
};

const startNotificationReminderScheduler = () => {
    runReminderCheck().catch((error) => {
        console.warn('No se pudo ejecutar el primer barrido de recordatorios:', error.message);
    });

    setInterval(() => {
        runReminderCheck().catch((error) => {
            console.warn('No se pudo ejecutar el barrido de recordatorios:', error.message);
        });
    }, INTERVAL_MS);
};

module.exports = {
    startNotificationReminderScheduler
};
