const db = require('../config/database');

const Inventory = {
    getAll: async ({ includeInactive = true } = {}) => {
        let query = 'SELECT * FROM inventario';
        const values = [];

        if (!includeInactive) {
            query += ' WHERE estado_activo = true';
        }

        query += ' ORDER BY nombre ASC, created_at DESC';

        const result = await db.query(query, values);
        return result.rows;
    },

    getById: async (id) => {
        const result = await db.query('SELECT * FROM inventario WHERE id = $1', [id]);
        return result.rows[0];
    },

    getAlertas: async () => {
        const result = await db.query(`
            SELECT *
            FROM inventario
            WHERE estado_activo = true
              AND stock_actual <= stock_minimo
            ORDER BY stock_actual ASC, nombre ASC;
        `);
        return result.rows;
    },

    getCatalogoTienda: async () => {
        const result = await db.query(`
            SELECT *
            FROM inventario
            WHERE estado_activo = true
              AND tipo = 'producto_tienda'
            ORDER BY categoria ASC NULLS LAST, nombre ASC;
        `);

        return result.rows;
    },

    create: async (data) => {
        const result = await db.query(`
            INSERT INTO inventario (
                nombre,
                descripcion,
                tipo,
                categoria,
                variante,
                marca,
                presentacion,
                stock_actual,
                stock_minimo,
                precio_venta,
                ruta_imagen_local,
                estado_activo
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING *;
        `, [
            data.nombre,
            data.descripcion || null,
            data.tipo,
            data.categoria || 'higiene',
            data.variante || null,
            data.marca || null,
            data.presentacion || null,
            data.stock_actual ?? 0,
            data.stock_minimo ?? 5,
            data.precio_venta ?? 0,
            data.ruta_imagen_local || null,
            data.estado_activo ?? true
        ]);

        return result.rows[0];
    },

    update: async (id, data) => {
        const result = await db.query(`
            UPDATE inventario
            SET
                nombre = COALESCE($1, nombre),
                descripcion = COALESCE($2, descripcion),
                tipo = COALESCE($3, tipo),
                categoria = COALESCE($4, categoria),
                variante = COALESCE($5, variante),
                marca = COALESCE($6, marca),
                presentacion = COALESCE($7, presentacion),
                stock_actual = COALESCE($8, stock_actual),
                stock_minimo = COALESCE($9, stock_minimo),
                precio_venta = COALESCE($10, precio_venta),
                ruta_imagen_local = COALESCE($11, ruta_imagen_local),
                estado_activo = COALESCE($12, estado_activo),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $13
            RETURNING *;
        `, [
            data.nombre || null,
            data.descripcion || null,
            data.tipo || null,
            data.categoria || null,
            data.variante || null,
            data.marca || null,
            data.presentacion || null,
            data.stock_actual ?? null,
            data.stock_minimo ?? null,
            data.precio_venta ?? null,
            data.ruta_imagen_local || null,
            data.estado_activo ?? null,
            id
        ]);

        return result.rows[0];
    },

    adjustStock: async (client, id, delta) => {
        const result = await client.query(`
            UPDATE inventario
            SET stock_actual = stock_actual + $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *;
        `, [delta, id]);

        return result.rows[0];
    }
};

module.exports = Inventory;
