const db = require('../config/database');

const Slot = {
    // Crear cita/slot
    create: async (slotData) => {
        const query = `
            INSERT INTO slots (cliente_id, groomer_id, mascota_id, servicio_id, fecha_inicio, fecha_fin, duracion_ajustada, estado, notas, precio_final)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *;
        `;

        const values = [
            slotData.cliente_id,
            slotData.groomer_id || null,
            slotData.mascota_id,
            slotData.servicio_id,
            slotData.fecha_inicio,
            slotData.fecha_fin,
            slotData.duracion_ajustada,
            slotData.estado || 'confirmada',
            slotData.notas || null,
            slotData.precio_final || null
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    // Obtener citas de un cliente
    getByClienteId: async (clienteId) => {
        const query = `
            SELECT s.*, srv.nombre as servicio_nombre, m.nombre as mascota_nombre, 
                   u.nombre as groomer_nombre
            FROM slots s
            LEFT JOIN servicios srv ON s.servicio_id = srv.id
            LEFT JOIN mascotas m ON s.mascota_id = m.id
            LEFT JOIN usuarios u ON s.groomer_id = u.id
            WHERE s.cliente_id = $1
            ORDER BY s.fecha_inicio DESC;
        `;

        const result = await db.query(query, [clienteId]);
        return result.rows;
    },

    // Obtener citas de un groomer
    getByGroomerId: async (groomerId, estado = null) => {
        let query = `
            SELECT s.*, srv.nombre as servicio_nombre, m.nombre as mascota_nombre, 
                   c.nombre as cliente_nombre, c.email as cliente_email
            FROM slots s
            LEFT JOIN servicios srv ON s.servicio_id = srv.id
            LEFT JOIN mascotas m ON s.mascota_id = m.id
            LEFT JOIN usuarios c ON s.cliente_id = c.id
            WHERE s.groomer_id = $1`;

        const values = [groomerId];

        if (estado) {
            query += ' AND s.estado = $2';
            values.push(estado);
        }

        query += ' ORDER BY s.fecha_inicio ASC;';

        const result = await db.query(query, values);
        return result.rows;
    },

    // Obtener citas en un rango de fechas
    getByFechaRango: async (fechaInicio, fechaFin, groomerId = null) => {
        let query = `
            SELECT s.*, srv.nombre as servicio_nombre, m.nombre as mascota_nombre, 
                   u.nombre as groomer_nombre, c.nombre as cliente_nombre
            FROM slots s
            LEFT JOIN servicios srv ON s.servicio_id = srv.id
            LEFT JOIN mascotas m ON s.mascota_id = m.id
            LEFT JOIN usuarios u ON s.groomer_id = u.id
            LEFT JOIN usuarios c ON s.cliente_id = c.id
            WHERE s.fecha_inicio >= $1 AND s.fecha_fin <= $2`;

        const values = [fechaInicio, fechaFin];

        if (groomerId) {
            query += ' AND s.groomer_id = $3';
            values.push(groomerId);
        }

        query += ' ORDER BY s.fecha_inicio ASC;';

        const result = await db.query(query, values);
        return result.rows;
    },

    // Obtener citas en un día específico
    getByDia: async (fecha, groomerId = null) => {
        const diaInicio = `${fecha}T00:00:00Z`;
        const diaFin = `${fecha}T23:59:59Z`;

        let query = `
            SELECT s.*, srv.nombre as servicio_nombre, m.nombre as mascota_nombre, 
                   u.nombre as groomer_nombre, c.nombre as cliente_nombre
            FROM slots s
            LEFT JOIN servicios srv ON s.servicio_id = srv.id
            LEFT JOIN mascotas m ON s.mascota_id = m.id
            LEFT JOIN usuarios u ON s.groomer_id = u.id
            LEFT JOIN usuarios c ON s.cliente_id = c.id
            WHERE DATE(s.fecha_inicio) = $1::DATE`;

        const values = [fecha];

        if (groomerId) {
            query += ' AND s.groomer_id = $2';
            values.push(groomerId);
        }

        query += ' ORDER BY s.fecha_inicio ASC;';

        const result = await db.query(query, values);
        return result.rows;
    },

    // Obtener cita por ID
    getById: async (id) => {
        const query = `
            SELECT s.*, srv.nombre as servicio_nombre, srv.duracion_base, m.nombre as mascota_nombre,
                   u.nombre as groomer_nombre, c.nombre as cliente_nombre, c.email as cliente_email
            FROM slots s
            LEFT JOIN servicios srv ON s.servicio_id = srv.id
            LEFT JOIN mascotas m ON s.mascota_id = m.id
            LEFT JOIN usuarios u ON s.groomer_id = u.id
            LEFT JOIN usuarios c ON s.cliente_id = c.id
            WHERE s.id = $1;
        `;

        const result = await db.query(query, [id]);
        return result.rows[0];
    },

    // Actualizar cita
    update: async (id, slotData) => {
        const query = `
            UPDATE slots
            SET 
                groomer_id = COALESCE($1, groomer_id),
                estado = COALESCE($2, estado),
                notas = COALESCE($3, notas),
                precio_final = COALESCE($4, precio_final),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5
            RETURNING *;
        `;

        const values = [
            slotData.groomer_id || null,
            slotData.estado || null,
            slotData.notas || null,
            slotData.precio_final || null,
            id
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    // Cancelar cita
    cancel: async (id, razon = null) => {
        const query = `
            UPDATE slots
            SET estado = 'cancelada', notas = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *;
        `;

        const result = await db.query(query, [razon, id]);
        return result.rows[0];
    },

    // Eliminar cita (hard delete)
    delete: async (id) => {
        const result = await db.query(
            'DELETE FROM slots WHERE id = $1 RETURNING *;',
            [id]
        );
        return result.rows[0];
    },

    // Obtener citas ocupadas en un horario
    getCitasOcupadas: async (groomerId, fechaInicio, fechaFin) => {
        const query = `
            SELECT * FROM slots
            WHERE groomer_id = $1 
            AND estado IN ('confirmada', 'en_progreso')
            AND (
                (fecha_inicio >= $2 AND fecha_inicio < $3) OR
                (fecha_fin > $2 AND fecha_fin <= $3) OR
                (fecha_inicio <= $2 AND fecha_fin >= $3)
            )
            ORDER BY fecha_inicio ASC;
        `;

        const result = await db.query(query, [groomerId, fechaInicio, fechaFin]);
        return result.rows;
    },

    // Contar citas en un día
    contarCitasEnDia: async (fecha, groomerId = null) => {
        let query = `
            SELECT COUNT(*) as total
            FROM slots
            WHERE DATE(fecha_inicio) = $1::DATE 
            AND estado IN ('confirmada', 'en_progreso')`;

        const values = [fecha];

        if (groomerId) {
            query += ' AND groomer_id = $2';
            values.push(groomerId);
        }

        const result = await db.query(query, values);
        return parseInt(result.rows[0].total);
    },

    // Obtener todas las citas con filtros opcionales
    getAll: async (filtros = {}) => {
        let query = `
            SELECT s.*, srv.nombre as servicio_nombre, m.nombre as mascota_nombre, 
                   u.nombre as groomer_nombre, c.nombre as cliente_nombre, c.email as cliente_email
            FROM slots s
            LEFT JOIN servicios srv ON s.servicio_id = srv.id
            LEFT JOIN mascotas m ON s.mascota_id = m.id
            LEFT JOIN usuarios u ON s.groomer_id = u.id
            LEFT JOIN usuarios c ON s.cliente_id = c.id
            WHERE 1=1`;

        const values = [];
        let paramIndex = 1;

        // Filtro por estado
        if (filtros.estado) {
            query += ` AND s.estado = $${paramIndex}`;
            values.push(filtros.estado);
            paramIndex++;
        }

        // Filtro por fecha
        if (filtros.fecha) {
            query += ` AND DATE(s.fecha_inicio) = $${paramIndex}::DATE`;
            values.push(filtros.fecha);
            paramIndex++;
        }

        // Filtro por groomer
        if (filtros.groomer_id) {
            query += ` AND s.groomer_id = $${paramIndex}`;
            values.push(filtros.groomer_id);
            paramIndex++;
        }

        query += ' ORDER BY s.fecha_inicio DESC;';

        const result = await db.query(query, values);
        return result.rows;
    }
};

module.exports = Slot;
