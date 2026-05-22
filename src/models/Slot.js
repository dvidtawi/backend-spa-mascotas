const db = require('../config/database');

const Slot = {
    create: async (slotData) => {
        const query = `
            INSERT INTO slots (
                cliente_id, groomer_id, mascota_id, servicio_id, fecha, hora_inicio,
                hora_fin, fecha_inicio, fecha_fin, duracion_ajustada,
                minutos_adicionales_temperamento, estado, notas, precio_final
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *;
        `;

        const values = [
            slotData.cliente_id,
            slotData.groomer_id || null,
            slotData.mascota_id,
            slotData.servicio_id,
            slotData.fecha,
            slotData.hora_inicio,
            slotData.hora_fin,
            slotData.fecha_inicio,
            slotData.fecha_fin,
            slotData.duracion_ajustada,
            slotData.minutos_adicionales_temperamento || 0,
            slotData.estado || 'en_revision',
            slotData.notas || null,
            slotData.precio_final || null
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    getByClienteId: async (clienteId) => {
        const result = await db.query(
            `
            SELECT s.*, srv.nombre as servicio_nombre, m.nombre as mascota_nombre,
                   u.nombre as groomer_nombre
            FROM slots s
            LEFT JOIN servicios srv ON s.servicio_id = srv.id
            LEFT JOIN mascotas m ON s.mascota_id = m.id
            LEFT JOIN usuarios u ON s.groomer_id = u.id
            WHERE s.cliente_id = $1
            ORDER BY s.fecha_inicio DESC;
            `,
            [clienteId]
        );

        return result.rows;
    },

    getByGroomerId: async (groomerId, estado = null) => {
        let query = `
            SELECT s.*, srv.nombre as servicio_nombre, m.nombre as mascota_nombre,
                   c.nombre as cliente_nombre, c.email as cliente_email
            FROM slots s
            LEFT JOIN servicios srv ON s.servicio_id = srv.id
            LEFT JOIN mascotas m ON s.mascota_id = m.id
            LEFT JOIN usuarios c ON s.cliente_id = c.id
            WHERE s.groomer_id = $1
        `;

        const values = [groomerId];

        if (estado) {
            query += ' AND s.estado = $2';
            values.push(estado);
        }

        query += ' ORDER BY s.fecha_inicio ASC;';

        const result = await db.query(query, values);
        return result.rows;
    },

    getByFechaRango: async (fechaInicio, fechaFin, groomerId = null) => {
        let query = `
            SELECT s.*, srv.nombre as servicio_nombre, m.nombre as mascota_nombre,
                   u.nombre as groomer_nombre, c.nombre as cliente_nombre
            FROM slots s
            LEFT JOIN servicios srv ON s.servicio_id = srv.id
            LEFT JOIN mascotas m ON s.mascota_id = m.id
            LEFT JOIN usuarios u ON s.groomer_id = u.id
            LEFT JOIN usuarios c ON s.cliente_id = c.id
            WHERE s.fecha_inicio >= $1 AND s.fecha_fin <= $2
        `;

        const values = [fechaInicio, fechaFin];

        if (groomerId) {
            query += ' AND s.groomer_id = $3';
            values.push(groomerId);
        }

        query += ' ORDER BY s.fecha_inicio ASC;';

        const result = await db.query(query, values);
        return result.rows;
    },

    getByDia: async (fecha, groomerId = null) => {
        let query = `
            SELECT s.*, srv.nombre as servicio_nombre, m.nombre as mascota_nombre,
                   u.nombre as groomer_nombre, c.nombre as cliente_nombre
            FROM slots s
            LEFT JOIN servicios srv ON s.servicio_id = srv.id
            LEFT JOIN mascotas m ON s.mascota_id = m.id
            LEFT JOIN usuarios u ON s.groomer_id = u.id
            LEFT JOIN usuarios c ON s.cliente_id = c.id
            WHERE s.fecha = $1::date
        `;

        const values = [fecha];

        if (groomerId) {
            query += ' AND s.groomer_id = $2';
            values.push(groomerId);
        }

        query += ' ORDER BY s.hora_inicio ASC;';

        const result = await db.query(query, values);
        return result.rows;
    },

    getById: async (id) => {
        const result = await db.query(
            `
            SELECT s.*, srv.nombre as servicio_nombre, srv.duracion_base, m.nombre as mascota_nombre,
                   u.nombre as groomer_nombre, c.nombre as cliente_nombre, c.email as cliente_email
            FROM slots s
            LEFT JOIN servicios srv ON s.servicio_id = srv.id
            LEFT JOIN mascotas m ON s.mascota_id = m.id
            LEFT JOIN usuarios u ON s.groomer_id = u.id
            LEFT JOIN usuarios c ON s.cliente_id = c.id
            WHERE s.id = $1;
            `,
            [id]
        );

        return result.rows[0];
    },

    update: async (id, slotData) => {
        const query = `
            UPDATE slots
            SET
                groomer_id = COALESCE($1, groomer_id),
                fecha = COALESCE($2, fecha),
                hora_inicio = COALESCE($3, hora_inicio),
                hora_fin = COALESCE($4, hora_fin),
                fecha_inicio = COALESCE($5, fecha_inicio),
                fecha_fin = COALESCE($6, fecha_fin),
                estado = COALESCE($7, estado),
                notas = COALESCE($8, notas),
                precio_final = COALESCE($9, precio_final),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $10
            RETURNING *;
        `;

        const values = [
            slotData.groomer_id || null,
            slotData.fecha || null,
            slotData.hora_inicio || null,
            slotData.hora_fin || null,
            slotData.fecha_inicio || null,
            slotData.fecha_fin || null,
            slotData.estado || null,
            slotData.notas || null,
            slotData.precio_final || null,
            id
        ];

        const result = await db.query(query, values);
        return result.rows[0];
    },

    cancel: async (id, razon = null) => {
        const result = await db.query(
            `
            UPDATE slots
            SET estado = 'cancelada', notas = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *;
            `,
            [razon, id]
        );

        return result.rows[0];
    },

    delete: async (id) => {
        const result = await db.query(
            'DELETE FROM slots WHERE id = $1 RETURNING *;',
            [id]
        );
        return result.rows[0];
    },

    getCitasOcupadas: async (groomerId, fecha, horaInicio, horaFin, excludeId = null) => {
        const result = await db.query(
            `
            SELECT *
            FROM slots
            WHERE groomer_id = $1
              AND fecha = $2::date
              AND estado IN ('en_revision', 'confirmada', 'en_proceso')
              AND hora_inicio < $4::time
              AND hora_fin > $3::time
              AND ($5::uuid IS NULL OR id <> $5::uuid)
            ORDER BY hora_inicio ASC;
            `,
            [groomerId, fecha, horaInicio, horaFin, excludeId]
        );

        return result.rows;
    },

    getCitasActivasPorGroomerDia: async (groomerId, fecha, excludeId = null) => {
        const result = await db.query(
            `
            SELECT s.*, srv.nombre AS servicio_nombre, m.nombre AS mascota_nombre
            FROM slots s
            LEFT JOIN servicios srv ON srv.id = s.servicio_id
            LEFT JOIN mascotas m ON m.id = s.mascota_id
            WHERE s.groomer_id = $1
              AND s.fecha = $2::date
              AND s.estado IN ('en_revision', 'confirmada', 'en_proceso', 'finalizada')
              AND ($3::uuid IS NULL OR s.id <> $3::uuid)
            ORDER BY s.hora_inicio ASC;
            `,
            [groomerId, fecha, excludeId]
        );

        return result.rows;
    },

    getCitasActivasPorMascotaDia: async (mascotaId, fecha, excludeId = null) => {
        const result = await db.query(
            `
            SELECT s.*, srv.nombre AS servicio_nombre
            FROM slots s
            LEFT JOIN servicios srv ON srv.id = s.servicio_id
            WHERE s.mascota_id = $1
              AND s.fecha = $2::date
              AND s.estado IN ('en_revision', 'confirmada', 'en_proceso')
              AND ($3::uuid IS NULL OR s.id <> $3::uuid)
            ORDER BY s.hora_inicio ASC;
            `,
            [mascotaId, fecha, excludeId]
        );

        return result.rows;
    },

    getServiciosActivosDuplicadosMascota: async (mascotaId, servicioId, fecha, excludeId = null) => {
        const result = await db.query(
            `
            SELECT s.*, srv.nombre AS servicio_nombre
            FROM slots s
            LEFT JOIN servicios srv ON srv.id = s.servicio_id
            WHERE s.mascota_id = $1
              AND s.servicio_id = $2
              AND s.fecha = $3::date
              AND s.estado IN ('en_revision', 'confirmada')
              AND ($4::uuid IS NULL OR s.id <> $4::uuid)
            ORDER BY s.hora_inicio ASC;
            `,
            [mascotaId, servicioId, fecha, excludeId]
        );

        return result.rows;
    },

    contarCitasEnDia: async (fecha, groomerId = null) => {
        let query = `
            SELECT COUNT(*) as total
            FROM slots
            WHERE fecha = $1::date
              AND estado IN ('en_revision', 'confirmada', 'en_proceso')
        `;

        const values = [fecha];

        if (groomerId) {
            query += ' AND groomer_id = $2';
            values.push(groomerId);
        }

        const result = await db.query(query, values);
        return parseInt(result.rows[0].total, 10);
    },

    getAll: async (filtros = {}) => {
        let query = `
            SELECT s.*, srv.nombre as servicio_nombre, m.nombre as mascota_nombre,
                   u.nombre as groomer_nombre, c.nombre as cliente_nombre, c.email as cliente_email
            FROM slots s
            LEFT JOIN servicios srv ON s.servicio_id = srv.id
            LEFT JOIN mascotas m ON s.mascota_id = m.id
            LEFT JOIN usuarios u ON s.groomer_id = u.id
            LEFT JOIN usuarios c ON s.cliente_id = c.id
            WHERE 1=1
        `;

        const values = [];
        let paramIndex = 1;

        if (filtros.estado) {
            query += ` AND s.estado = $${paramIndex}`;
            values.push(filtros.estado);
            paramIndex++;
        }

        if (filtros.fecha) {
            query += ` AND s.fecha = $${paramIndex}::date`;
            values.push(filtros.fecha);
            paramIndex++;
        }

        if (filtros.groomer_id) {
            query += ` AND s.groomer_id = $${paramIndex}`;
            values.push(filtros.groomer_id);
            paramIndex++;
        }

        if (filtros.mascota_id) {
            query += ` AND s.mascota_id = $${paramIndex}`;
            values.push(filtros.mascota_id);
            paramIndex++;
        }

        query += ' ORDER BY s.fecha DESC, s.hora_inicio DESC;';

        const result = await db.query(query, values);
        return result.rows;
    }
};

module.exports = Slot;
