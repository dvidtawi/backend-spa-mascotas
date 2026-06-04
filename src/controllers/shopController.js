const db = require('../config/database');
const { appendNotification } = require('../services/notificationLogService');
const User = require('../models/User');
const { sendEmail } = require('../services/emailService');

const MONEY = new Intl.NumberFormat('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const normalizeCartItems = (items = []) => {
    const map = new Map();

    items.forEach((item) => {
        const id = item.id || item.inventario_id || item.producto_id;
        const cantidad = Number(item.cantidad || item.qty || 0);
        if (!id || cantidad <= 0) return;

        if (!map.has(id)) {
            map.set(id, {
                id,
                cantidad,
                precio_venta: Number(item.precio_venta || 0),
                precio_unitario_snapshot: Number(item.precio_unitario_snapshot || item.precio_venta || 0)
            });
        } else {
            const current = map.get(id);
            current.cantidad += cantidad;
            if (!current.precio_venta && Number(item.precio_venta || 0) > 0) {
                current.precio_venta = Number(item.precio_venta || 0);
            }
            if (!current.precio_unitario_snapshot && Number(item.precio_unitario_snapshot || item.precio_venta || 0) > 0) {
                current.precio_unitario_snapshot = Number(item.precio_unitario_snapshot || item.precio_venta || 0);
            }
        }
    });

    return [...map.values()];
};

const buildPedidoMensaje = ({ pedido, items, clienteNombre }) => {
    const lines = [
        'Factura PetSpa Mascotas',
        `Cliente: ${clienteNombre || 'Cliente'}`,
        `Pedido: ${pedido.id}`,
        `Fecha: ${new Date(pedido.created_at || Date.now()).toLocaleString('es-BO')}`,
        ''
    ];

    items.forEach((item, index) => {
        const precioUnitario = Number(item.precio_unitario_snapshot || item.precio_unitario || 0);
        lines.push(
            `${index + 1}. ${item.nombre_producto} x${item.cantidad} - Bs ${MONEY.format(precioUnitario)} = Bs ${MONEY.format(item.subtotal_linea)}`
        );
    });

    lines.push('');
    lines.push(`Subtotal: Bs ${MONEY.format(pedido.subtotal)}`);
    lines.push(`Descuento promocion: Bs ${MONEY.format(pedido.descuento_promocion || pedido.descuentoPromocion || 0)}`);
    lines.push(`Descuento: Bs ${MONEY.format(pedido.descuento || 0)}`);
    lines.push(`Total: Bs ${MONEY.format(pedido.total)}`);

    return lines.join('\n');
};

const buildShareLinks = (mensaje) => {
    const encoded = encodeURIComponent(mensaje);
    return {
        whatsapp: `https://wa.me/?text=${encoded}`,
        telegram: `https://t.me/share/url?url=${encodeURIComponent('')}&text=${encoded}`
    };
};

const isDateWithinRange = (fechaBase, inicio, fin) => {
    const fecha = new Date(fechaBase);
    const fechaInicio = inicio ? new Date(inicio) : null;
    const fechaFin = fin ? new Date(fin) : null;

    if (Number.isNaN(fecha.getTime())) return false;
    if (fechaInicio && fecha < fechaInicio) return false;
    if (fechaFin && fecha > fechaFin) return false;
    return true;
};

const getActivePromotions = async () => {
    const result = await db.query(`
        SELECT *
        FROM tienda_promociones
        WHERE estado_activo = true
          AND (fecha_inicio IS NULL OR fecha_inicio <= CURRENT_TIMESTAMP)
          AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_TIMESTAMP)
        ORDER BY created_at DESC;
    `);

    return result.rows;
};

const getActiveCoupons = async () => {
    const result = await db.query(`
        SELECT *
        FROM tienda_cupones
        WHERE estado_activo = true
          AND (fecha_inicio IS NULL OR fecha_inicio <= CURRENT_TIMESTAMP)
          AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_TIMESTAMP)
        ORDER BY created_at DESC;
    `);

    return result.rows;
};

const findCouponByCode = async (codigo) => {
    if (!codigo) return null;
    const result = await db.query(`
        SELECT *
        FROM tienda_cupones
        WHERE UPPER(codigo) = UPPER($1)
        LIMIT 1;
    `, [codigo.trim()]);
    return result.rows[0] || null;
};

const getPromotionById = async (id) => {
    if (!id) return null;
    const result = await db.query(`
        SELECT *
        FROM tienda_promociones
        WHERE id = $1
        LIMIT 1;
    `, [id]);
    return result.rows[0] || null;
};

const getCouponById = async (id) => {
    if (!id) return null;
    const result = await db.query(`
        SELECT *
        FROM tienda_cupones
        WHERE id = $1
        LIMIT 1;
    `, [id]);
    return result.rows[0] || null;
};

const getValidPromotionForOrder = async (promocionId) => {
    if (!promocionId) {
        return null;
    }

    const promo = await getPromotionById(promocionId);
    if (!promo) {
        const error = new Error('La promocion seleccionada no existe');
        error.statusCode = 400;
        throw error;
    }

    if (!promo.estado_activo) {
        const error = new Error('La promocion seleccionada no esta activa');
        error.statusCode = 400;
        throw error;
    }

    const fechaValida = isDateWithinRange(new Date().toISOString(), promo.fecha_inicio, promo.fecha_fin);
    if (!fechaValida) {
        const error = new Error('La promocion seleccionada ya no esta vigente');
        error.statusCode = 400;
        throw error;
    }

    if (promo.tipo === 'combo') {
        const status = await getPromotionComboStatus(promo.productos_json);
        if (!status.viable) {
            const error = new Error(`El combo no tiene stock suficiente en: ${status.faltantes.map((item) => item.nombre).join(', ')}`);
            error.statusCode = 400;
            error.details = status.faltantes;
            throw error;
        }
    }

    return promo;
};

const getPromotionComboStatus = async (productosJson = '[]') => {
    const productos = parsePromoProducts(productosJson);
    if (!Array.isArray(productos) || productos.length === 0) {
        return { viable: true, faltantes: [] };
    }

    const faltantes = [];
    for (const prod of productos) {
        const productoId = prod.id || prod.producto_id || prod.inventario_id;
        const cantidadRequerida = Number(prod.cantidad || 1);
        if (!productoId || cantidadRequerida <= 0) {
            continue;
        }

        const result = await db.query(`
            SELECT id, nombre, stock_actual
            FROM inventario
            WHERE id = $1
            LIMIT 1;
        `, [productoId]);

        const producto = result.rows[0];
        if (!producto || Number(producto.stock_actual || 0) < cantidadRequerida) {
            faltantes.push({
                producto_id: productoId,
                nombre: producto?.nombre || 'Producto',
                stock_actual: Number(producto?.stock_actual || 0),
                requerido: cantidadRequerida
            });
        }
    }

    return { viable: faltantes.length === 0, faltantes };
};

const calcularDescuentoLealtad = async (clienteId) => {
    if (!clienteId) {
        return 0;
    }

    const result = await db.query(`
        SELECT COUNT(*)::int AS total_pedidos,
               COALESCE(SUM(total), 0) AS total_gastado
        FROM tienda_pedidos
        WHERE cliente_id = $1;
    `, [clienteId]);

    const totalPedidos = Number(result.rows[0]?.total_pedidos || 0);
    const totalGastado = Number(result.rows[0]?.total_gastado || 0);

    if (totalPedidos >= 5 || totalGastado >= 500) {
        return 0.05;
    }

    return 0;
};

const parsePromoProducts = (productosJson) => {
    if (!productosJson) return [];
    if (Array.isArray(productosJson)) return productosJson;
    try {
        return JSON.parse(productosJson);
    } catch (_err) {
        return [];
    }
};

const parseItemsPayload = (payload) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (typeof payload === 'string') {
        try {
            const parsed = JSON.parse(payload);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_err) {
            return [];
        }
    }
    return [];
};

const calcularDescuentoPromociones = (items = [], promociones = []) => {
    const itemMap = new Map(items.map((item) => [item.id, item]));
    let descuento = 0;

    promociones.forEach((promo) => {
        const productos = parsePromoProducts(promo.productos_json);
        if (!productos.length) {
            return;
        }

        const subtotalCoincidente = productos.reduce((acc, prod) => {
            const productoId = prod.id || prod.producto_id || prod.inventario_id;
            const cantidadRequerida = Number(prod.cantidad || 1);
            const item = itemMap.get(productoId);

            if (!item || Number(item.cantidad || 0) < cantidadRequerida) {
                return acc;
            }

            return acc + (Number(item.precio_unitario_snapshot) || Number(item.precio_venta) || 0) * cantidadRequerida;
        }, 0);

        if (subtotalCoincidente <= 0) {
            return;
        }

        if (promo.tipo === 'combo' && Number(promo.precio_promocional) > 0) {
            descuento += Math.max(0, subtotalCoincidente - Number(promo.precio_promocional));
        } else if (promo.tipo === 'porcentaje') {
            descuento += subtotalCoincidente * (Number(promo.porcentaje_descuento) || 0) / 100;
        }
    });

    return descuento;
};

const fetchPedidoConItems = async (pedidoId) => {
    const pedidoRes = await db.query(`
        SELECT p.*, u.nombre AS cliente_nombre,
               pay.metodo_pago AS pago_metodo,
               pay.tipo_movimiento AS pago_tipo_movimiento,
               pay.monto AS pago_monto
        FROM tienda_pedidos p
        LEFT JOIN usuarios u ON u.id = p.cliente_id
        LEFT JOIN pagos pay ON pay.referencia_evento = p.id::text AND pay.tipo_venta = 'tienda'
        WHERE p.id = $1
        LIMIT 1;
    `, [pedidoId]);

    const pedido = pedidoRes.rows[0];
    if (!pedido) return null;

    const itemsRes = await db.query(`
        SELECT *
        FROM tienda_pedido_items
        WHERE pedido_id = $1
        ORDER BY created_at ASC;
    `, [pedidoId]);

    pedido.items = itemsRes.rows;
    pedido.mensaje_compartir = pedido.mensaje_compartir || buildPedidoMensaje({
        pedido,
        items: pedido.items,
        clienteNombre: pedido.cliente_nombre
    });
    pedido.enlaces = buildShareLinks(pedido.mensaje_compartir);

    return pedido;
};

const registrarPedidoTienda = async ({
    client,
    items,
    clienteId = null,
    registradoPor = null,
    metodoPago,
    observaciones = null,
    origen = 'tienda_cliente',
    tipoEntrega = 'retiro',
    direccionEntrega = null,
    codigoCupon = null,
    promocionId = null,
    contactoDestino = null
}) => {
    const detalles = [];
    let subtotal = 0;

    for (const item of items) {
        const inventarioRes = await client.query(`
            SELECT *
            FROM inventario
            WHERE id = $1
            FOR UPDATE;
        `, [item.id]);

        const producto = inventarioRes.rows[0];
        if (!producto) {
            const error = new Error('Uno de los productos no existe');
            error.statusCode = 404;
            throw error;
        }

        if (!producto.estado_activo || producto.tipo !== 'producto_tienda') {
            const error = new Error(`El producto ${producto.nombre} no esta disponible para venta`);
            error.statusCode = 400;
            throw error;
        }

        if (producto.stock_actual < item.cantidad) {
            const error = new Error(`Stock insuficiente para ${producto.nombre}`);
            error.statusCode = 400;
            throw error;
        }

        const precioUnitario = Number(producto.precio_venta) || 0;
        const subtotalLinea = precioUnitario * item.cantidad;
        subtotal += subtotalLinea;

        await client.query(`
            UPDATE inventario
            SET stock_actual = stock_actual - $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2;
        `, [item.cantidad, producto.id]);

        detalles.push({
            inventario_id: producto.id,
            nombre_producto: producto.nombre,
            categoria: producto.categoria || null,
            variante: producto.variante || null,
            precio_unitario_snapshot: precioUnitario,
            cantidad: item.cantidad,
            subtotal_linea: subtotalLinea,
            ruta_imagen_local: producto.ruta_imagen_local || null
        });
    }

    const promocionesActivas = promocionId
        ? [await getValidPromotionForOrder(promocionId)].filter(Boolean)
        : await getActivePromotions();
    const descuentoPromos = calcularDescuentoPromociones(detalles, promocionesActivas);

    const cliente = clienteId ? await User.findById(clienteId) : null;
    const clienteNombre = cliente?.nombre || 'Cliente';
    const descuentoLealtadPct = origen === 'tienda_cliente'
        ? await calcularDescuentoLealtad(clienteId)
        : 0;
    const descuentoLealtad = subtotal * descuentoLealtadPct;

    let descuentoCupon = 0;
    let cuponUsado = null;
    if (codigoCupon) {
      const cupon = await findCouponByCode(codigoCupon);
      if (cupon) {
        const fechaValida = isDateWithinRange(
          new Date().toISOString().slice(0, 10),
          cupon.fecha_inicio,
          cupon.fecha_fin
        );
        const tieneUsos = Number(cupon.usos_maximos || 0) === 0 || Number(cupon.usos_actuales || 0) < Number(cupon.usos_maximos || 0);
        if (cupon.estado_activo && fechaValida && tieneUsos) {
          const baseDescuento = cupon.tipo_descuento === 'monto'
            ? Number(cupon.valor_descuento) || 0
            : subtotal * ((Number(cupon.valor_descuento) || 0) / 100);
          descuentoCupon = Math.min(baseDescuento, subtotal);
          cuponUsado = cupon.codigo;

          await client.query(`
              UPDATE tienda_cupones
              SET usos_actuales = usos_actuales + 1,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = $1;
          `, [cupon.id]);
        }
      }
    }

    const cargoEntrega = tipoEntrega === 'delivery' ? 15 : 0;
    const descuentoTotal = Math.min(subtotal + cargoEntrega, descuentoPromos + descuentoLealtad + descuentoCupon);
    const total = Math.max(0, subtotal + cargoEntrega - descuentoTotal);

    const pedidoBaseInsert = `
        INSERT INTO tienda_pedidos (
            cliente_id,
            subtotal,
            descuento,
            total,
            tipo_entrega,
            cargo_entrega,
            direccion_entrega,
            codigo_cupon,
            estado,
            contacto_destino,
            observaciones
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *;
    `;

    const pedidoInsert = await client.query(pedidoBaseInsert, [
        clienteId,
        subtotal,
        descuentoTotal,
        total,
        tipoEntrega,
        cargoEntrega,
        direccionEntrega || null,
        cuponUsado,
        'registrado',
        contactoDestino,
        observaciones
    ]);

    const pedido = pedidoInsert.rows[0];

    try {
        await client.query(`
            UPDATE tienda_pedidos
            SET promocion_id = $1,
                descuento_promocion = $2,
                descuento_lealtad = $3,
                descuento_cupon = $4,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $5;
        `, [
            promocionId || null,
            descuentoPromos,
            descuentoLealtad,
            descuentoCupon,
            pedido.id
        ]);
    } catch (_err) {
        // Compatibilidad con bases existentes sin columnas nuevas.
    }

    for (const detalle of detalles) {
        await client.query(`
            INSERT INTO tienda_pedido_items (
                pedido_id,
                inventario_id,
                nombre_producto,
                categoria,
                variante,
                precio_unitario,
                cantidad,
                subtotal_linea
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
        `, [
            pedido.id,
            detalle.inventario_id,
            detalle.nombre_producto,
            detalle.categoria,
            detalle.variante,
            detalle.precio_unitario_snapshot,
            detalle.cantidad,
            detalle.subtotal_linea
        ]);
    }

    const factura = buildPedidoMensaje({
        pedido: {
            ...pedido,
            subtotal,
            descuento: descuentoTotal,
            total,
            tipo_entrega: tipoEntrega,
            cargo_entrega: cargoEntrega,
            codigo_cupon: cuponUsado,
            promocion_id: promocionId || null,
            descuento_promocion: descuentoPromos,
            descuento_lealtad: descuentoLealtad,
            descuento_cupon: descuentoCupon,
            created_at: pedido.created_at || new Date()
        },
        items: detalles,
        clienteNombre
    });

    const pagoRes = await client.query(`
        INSERT INTO pagos (
            cita_id,
            registrado_por,
            tipo_venta,
            concepto,
            metodo_pago,
            monto,
            observaciones,
            origen,
            tipo_movimiento,
            referencia_evento
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *;
    `, [
        null,
        registradoPor || clienteId || null,
        'tienda',
        `Venta tienda - Pedido ${pedido.id.slice(0, 8)}`,
        metodoPago,
        total,
        observaciones || 'Venta de tienda',
        origen,
        'ingreso',
        pedido.id
    ]);
    const pago = pagoRes.rows[0];

    await client.query(`
        UPDATE tienda_pedidos
        SET mensaje_compartir = $1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $2;
    `, [factura, pedido.id]);

    return {
        pedido,
        pago,
        items: detalles,
        factura,
        cliente,
        subtotal,
        descuentoTotal,
        total,
        cargoEntrega,
        descuentoLealtad,
        descuentoCupon,
        descuentoPromos,
        cuponUsado
    };
};

const ShopController = {
    getPromociones: async (req, res) => {
        try {
            const includeInactive = req.query.include_inactive === 'true' && [1, 3].includes(Number(req.user?.rol));
            const result = await db.query(`
                SELECT *
                FROM tienda_promociones
                WHERE (${includeInactive ? 'true' : 'estado_activo = true'})
                  AND (fecha_inicio IS NULL OR fecha_inicio <= CURRENT_TIMESTAMP)
                  AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_TIMESTAMP)
                ORDER BY created_at DESC;
            `);

            const promociones = [];
            for (const promo of result.rows) {
                if (promo.tipo === 'combo') {
                    const status = await getPromotionComboStatus(promo.productos_json);
                    if (!status.viable && promo.estado_activo) {
                        await db.query(`
                            UPDATE tienda_promociones
                            SET estado_activo = false,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = $1;
                        `, [promo.id]);
                        promociones.push({ ...promo, estado_activo: false, bloqueo_stock: status.faltantes });
                        continue;
                    }
                    promociones.push({ ...promo, bloqueo_stock: status.faltantes });
                    continue;
                }

                promociones.push(promo);
            }

            res.json({ success: true, data: promociones });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getCupones: async (req, res) => {
        try {
            const result = await db.query(`
                SELECT *
                FROM tienda_cupones
                WHERE (fecha_inicio IS NULL OR fecha_inicio <= CURRENT_TIMESTAMP)
                  AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_TIMESTAMP)
                ORDER BY created_at DESC;
            `);

            res.json({ success: true, data: result.rows });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    validarCupon: async (req, res) => {
        try {
            const codigo = req.body?.codigo_cupon || req.query?.codigo_cupon || req.body?.codigo || req.query?.codigo;
            const rawItems = req.body?.items
                || req.query?.items
                || req.body?.items_json
                || req.query?.items_json
                || [];
            const items = normalizeCartItems(parseItemsPayload(rawItems));
            if (!codigo) {
                return res.json({
                    success: true,
                    data: {
                        valido: false,
                        descuento: 0,
                        mensaje: 'Ingresa un codigo para validar'
                    }
                });
            }

            const cupon = await findCouponByCode(codigo);
            if (!cupon) {
                return res.json({
                    success: true,
                    data: {
                        valido: false,
                        descuento: 0,
                        mensaje: 'El cupon no existe'
                    }
                });
            }

            const hoy = new Date().toISOString().slice(0, 10);
            const fechaValida = isDateWithinRange(hoy, cupon.fecha_inicio, cupon.fecha_fin);
            const tieneUsos = Number(cupon.usos_maximos || 0) === 0 || Number(cupon.usos_actuales || 0) < Number(cupon.usos_maximos || 0);
            const estaActivo = Boolean(cupon.estado_activo);

            if (!estaActivo || !fechaValida || !tieneUsos) {
                return res.json({
                    success: true,
                    data: {
                        valido: false,
                        descuento: 0,
                        mensaje: 'El cupon no esta disponible en este momento',
                        cupon: {
                            codigo: cupon.codigo,
                            tipo_descuento: cupon.tipo_descuento,
                            valor_descuento: cupon.valor_descuento
                        }
                    }
                });
            }

            const subtotalTotal = items.reduce((sum, item) => {
                const precio = Number(item.precio_venta || item.precio_unitario_snapshot || 0);
                return sum + (precio * Number(item.cantidad || 0));
            }, 0);

            let subtotalObjetivo = subtotalTotal;
            if (cupon.producto_id) {
                subtotalObjetivo = items
                    .filter((item) => String(item.id) === String(cupon.producto_id))
                    .reduce((sum, item) => sum + (Number(item.precio_venta || item.precio_unitario_snapshot || 0) * Number(item.cantidad || 0)), 0);
            }

            const descuentoBase = cupon.tipo_descuento === 'monto'
                ? Number(cupon.valor_descuento) || 0
                : subtotalObjetivo * ((Number(cupon.valor_descuento) || 0) / 100);

            const descuento = Math.min(descuentoBase, subtotalTotal);
            const detalle = cupon.producto_id
                ? `Aplica sobre el producto seleccionado`
                : `Aplica sobre el subtotal del pedido`;

            res.json({
                success: true,
                data: {
                    valido: true,
                    codigo: cupon.codigo,
                    descuento,
                    subtotal_total: subtotalTotal,
                    subtotal_objetivo: subtotalObjetivo,
                    mensaje: detalle,
                    cupon: {
                        id: cupon.id,
                        codigo: cupon.codigo,
                        tipo_descuento: cupon.tipo_descuento,
                        valor_descuento: Number(cupon.valor_descuento) || 0,
                        producto_id: cupon.producto_id || null
                    }
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    crearPromocion: async (req, res) => {
        try {
            const {
                nombre,
                descripcion,
                tipo,
                porcentaje_descuento,
                precio_promocional,
                productos_json,
                fecha_inicio,
                fecha_fin,
                stock_limite
            } = req.body;

            if (!nombre || !tipo) {
                return res.status(400).json({ success: false, error: 'Nombre y tipo son requeridos' });
            }

            if (tipo === 'combo') {
                const comboStatus = await getPromotionComboStatus(productos_json || '[]');
                if (!comboStatus.viable) {
                    return res.status(400).json({
                        success: false,
                        error: `No se puede activar el combo por stock insuficiente en: ${comboStatus.faltantes.map((item) => `${item.nombre} (${item.stock_actual}/${item.requerido})`).join(', ')}`
                    });
                }
            }

            const result = await db.query(`
                INSERT INTO tienda_promociones (
                    nombre, descripcion, tipo, porcentaje_descuento, precio_promocional,
                    productos_json, fecha_inicio, fecha_fin, stock_limite, estado_activo
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
                RETURNING *;
            `, [
                nombre,
                descripcion || null,
                tipo,
                porcentaje_descuento || 0,
                precio_promocional || 0,
                productos_json || '[]',
                fecha_inicio || null,
                fecha_fin || null,
                stock_limite || 0
            ]);

            res.status(201).json({ success: true, data: result.rows[0] });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    actualizarPromocion: async (req, res) => {
        try {
            const promo = await getPromotionById(req.params.id);
            if (!promo) {
                return res.status(404).json({ success: false, error: 'Promocion no encontrada' });
            }

            const data = {
                nombre: req.body.nombre ?? promo.nombre,
                descripcion: req.body.descripcion ?? promo.descripcion,
                tipo: req.body.tipo ?? promo.tipo,
                porcentaje_descuento: req.body.porcentaje_descuento ?? promo.porcentaje_descuento,
                precio_promocional: req.body.precio_promocional ?? promo.precio_promocional,
                productos_json: req.body.productos_json ?? promo.productos_json,
                fecha_inicio: req.body.fecha_inicio ?? promo.fecha_inicio,
                fecha_fin: req.body.fecha_fin ?? promo.fecha_fin,
                stock_limite: req.body.stock_limite ?? promo.stock_limite,
                estado_activo: req.body.estado_activo ?? promo.estado_activo
            };

            if (!data.nombre || !data.tipo) {
                return res.status(400).json({ success: false, error: 'Nombre y tipo son requeridos' });
            }

            if (data.tipo === 'combo') {
                const comboStatus = await getPromotionComboStatus(data.productos_json || '[]');
                if (!comboStatus.viable && data.estado_activo !== false) {
                    return res.status(400).json({
                        success: false,
                        error: `No se puede guardar el combo por stock insuficiente en: ${comboStatus.faltantes.map((item) => `${item.nombre} (${item.stock_actual}/${item.requerido})`).join(', ')}`
                    });
                }
            }

            const result = await db.query(`
                UPDATE tienda_promociones
                SET nombre = $1,
                    descripcion = $2,
                    tipo = $3,
                    porcentaje_descuento = $4,
                    precio_promocional = $5,
                    productos_json = $6::jsonb,
                    fecha_inicio = $7,
                    fecha_fin = $8,
                    stock_limite = $9,
                    estado_activo = $10,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $11
                RETURNING *;
            `, [
                data.nombre,
                data.descripcion || null,
                data.tipo,
                data.porcentaje_descuento || 0,
                data.precio_promocional || 0,
                JSON.stringify(parsePromoProducts(data.productos_json || '[]')),
                data.fecha_inicio || null,
                data.fecha_fin || null,
                data.stock_limite || 0,
                Boolean(data.estado_activo),
                req.params.id
            ]);

            res.json({ success: true, data: result.rows[0] });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    togglePromocion: async (req, res) => {
        try {
            const promo = await getPromotionById(req.params.id);
            if (!promo) {
                return res.status(404).json({ success: false, error: 'Promocion no encontrada' });
            }

            const nuevoEstado = req.body.estado_activo === undefined ? !promo.estado_activo : Boolean(req.body.estado_activo);
            if (promo.tipo === 'combo' && nuevoEstado) {
                const comboStatus = await getPromotionComboStatus(promo.productos_json);
                if (!comboStatus.viable) {
                    return res.status(400).json({
                        success: false,
                        error: `No se puede activar el combo por stock insuficiente en: ${comboStatus.faltantes.map((item) => `${item.nombre} (${item.stock_actual}/${item.requerido})`).join(', ')}`
                    });
                }
            }

            const result = await db.query(`
                UPDATE tienda_promociones
                SET estado_activo = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *;
            `, [nuevoEstado, req.params.id]);

            res.json({ success: true, data: result.rows[0] });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    crearCupon: async (req, res) => {
        try {
            const {
                codigo,
                descripcion,
                tipo_descuento,
                valor_descuento,
                producto_id,
                fecha_inicio,
                fecha_fin,
                usos_maximos
            } = req.body;

            if (!codigo || !tipo_descuento || !valor_descuento) {
                return res.status(400).json({ success: false, error: 'Codigo, tipo y valor son requeridos' });
            }

            const result = await db.query(`
                INSERT INTO tienda_cupones (
                    codigo, descripcion, tipo_descuento, valor_descuento, producto_id,
                    fecha_inicio, fecha_fin, usos_maximos, usos_actuales, estado_activo
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,true)
                RETURNING *;
            `, [
                codigo,
                descripcion || null,
                tipo_descuento,
                valor_descuento,
                producto_id || null,
                fecha_inicio || null,
                fecha_fin || null,
                usos_maximos || 0
            ]);

            res.status(201).json({ success: true, data: result.rows[0] });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    actualizarCupon: async (req, res) => {
        try {
            const cupon = await getCouponById(req.params.id);
            if (!cupon) {
                return res.status(404).json({ success: false, error: 'Cupon no encontrado' });
            }

            const data = {
                codigo: req.body.codigo ?? cupon.codigo,
                descripcion: req.body.descripcion ?? cupon.descripcion,
                tipo_descuento: req.body.tipo_descuento ?? cupon.tipo_descuento,
                valor_descuento: req.body.valor_descuento ?? cupon.valor_descuento,
                producto_id: req.body.producto_id ?? cupon.producto_id,
                fecha_inicio: req.body.fecha_inicio ?? cupon.fecha_inicio,
                fecha_fin: req.body.fecha_fin ?? cupon.fecha_fin,
                usos_maximos: req.body.usos_maximos ?? cupon.usos_maximos,
                estado_activo: req.body.estado_activo ?? cupon.estado_activo
            };

            if (!data.codigo || !data.tipo_descuento || data.valor_descuento === undefined || data.valor_descuento === null) {
                return res.status(400).json({ success: false, error: 'Codigo, tipo y valor son requeridos' });
            }

            const result = await db.query(`
                UPDATE tienda_cupones
                SET codigo = $1,
                    descripcion = $2,
                    tipo_descuento = $3,
                    valor_descuento = $4,
                    producto_id = $5,
                    fecha_inicio = $6,
                    fecha_fin = $7,
                    usos_maximos = $8,
                    estado_activo = $9,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $10
                RETURNING *;
            `, [
                data.codigo,
                data.descripcion || null,
                data.tipo_descuento,
                data.valor_descuento || 0,
                data.producto_id || null,
                data.fecha_inicio || null,
                data.fecha_fin || null,
                data.usos_maximos || 0,
                Boolean(data.estado_activo),
                req.params.id
            ]);

            res.json({ success: true, data: result.rows[0] });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    toggleCupon: async (req, res) => {
        try {
            const cupon = await getCouponById(req.params.id);
            if (!cupon) {
                return res.status(404).json({ success: false, error: 'Cupon no encontrado' });
            }

            const nuevoEstado = req.body.estado_activo === undefined ? !cupon.estado_activo : Boolean(req.body.estado_activo);
            const result = await db.query(`
                UPDATE tienda_cupones
                SET estado_activo = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
                RETURNING *;
            `, [nuevoEstado, req.params.id]);

            res.json({ success: true, data: result.rows[0] });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getCatalogo: async (req, res) => {
        try {
            const { categoria, q } = req.query;
            const values = [];
            const filters = [`estado_activo = true`, `tipo = 'producto_tienda'`];

            if (categoria) {
                values.push(categoria);
                filters.push(`categoria = $${values.length}`);
            }

            if (q) {
                values.push(`%${q}%`);
                filters.push(`(nombre ILIKE $${values.length} OR descripcion ILIKE $${values.length} OR marca ILIKE $${values.length} OR variante ILIKE $${values.length})`);
            }

            const [productosRes, promocionesRes] = await Promise.all([
                db.query(`
                    SELECT *
                    FROM inventario
                    WHERE ${filters.join(' AND ')}
                    ORDER BY categoria ASC NULLS LAST, nombre ASC;
                `, values),
                getActivePromotions()
            ]);

            res.json({
                success: true,
                data: {
                    productos: productosRes.rows,
                    promociones: promocionesRes
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getPedidos: async (req, res) => {
        try {
            const isCliente = Number(req.user?.rol) === 4;
            const values = [];
            let query = `
                SELECT p.*, u.nombre AS cliente_nombre,
                       pay.metodo_pago AS pago_metodo,
                       pay.tipo_movimiento AS pago_tipo_movimiento,
                       pay.monto AS pago_monto
                FROM tienda_pedidos p
                LEFT JOIN usuarios u ON u.id = p.cliente_id
                LEFT JOIN pagos pay ON pay.referencia_evento = p.id::text AND pay.tipo_venta = 'tienda'
                WHERE 1=1
            `;

            if (isCliente) {
                values.push(req.user.id);
                query += ` AND p.cliente_id = $${values.length}`;
            }

            query += ' ORDER BY p.created_at DESC;';

            const pedidosRes = await db.query(query, values);
            const pedidos = [];

            for (const pedido of pedidosRes.rows) {
                const itemsRes = await db.query(`
                    SELECT *
                    FROM tienda_pedido_items
                    WHERE pedido_id = $1
                    ORDER BY created_at ASC;
                `, [pedido.id]);

                pedidos.push({
                    ...pedido,
                    items: itemsRes.rows,
                    mensaje_compartir: pedido.mensaje_compartir || buildPedidoMensaje({
                        pedido,
                        items: itemsRes.rows,
                        clienteNombre: pedido.cliente_nombre
                    }),
                    enlaces: buildShareLinks(pedido.mensaje_compartir || buildPedidoMensaje({
                        pedido,
                        items: itemsRes.rows,
                        clienteNombre: pedido.cliente_nombre
                    }))
                });
            }

            res.json({ success: true, data: pedidos });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    getPedidoMensaje: async (req, res) => {
        try {
            const pedido = await fetchPedidoConItems(req.params.pedidoId);
            if (!pedido) {
                return res.status(404).json({ success: false, error: 'Pedido no encontrado' });
            }

            if (Number(req.user?.rol) === 4 && String(pedido.cliente_id) !== String(req.user.id)) {
                return res.status(403).json({ success: false, error: 'Sin permisos para ver este pedido' });
            }

            res.json({
                success: true,
                data: {
                    pedido_id: pedido.id,
                    mensaje: pedido.mensaje_compartir,
                    enlaces: pedido.enlaces
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    },

    crearPedido: async (req, res) => {
        const client = await db.connect();
        try {
            const items = normalizeCartItems(req.body.items);
            const metodoPago = (req.body.metodo_pago || '').toLowerCase();
            const tipoEntrega = req.body.tipo_entrega || 'retiro';
            const direccionEntrega = req.body.direccion_entrega || null;
            const codigoCupon = req.body.codigo_cupon || null;

            if (!items.length) {
                return res.status(400).json({ success: false, error: 'Agrega al menos un producto al carrito' });
            }

            if (!metodoPago) {
                return res.status(400).json({ success: false, error: 'Selecciona un metodo de pago' });
            }

            await client.query('BEGIN');
            const resultado = await registrarPedidoTienda({
                client,
                items,
                clienteId: req.user.id,
                registradoPor: req.user.id,
                metodoPago,
                observaciones: req.body.observaciones || null,
                origen: 'tienda_cliente',
                tipoEntrega,
                direccionEntrega,
                codigoCupon,
                promocionId: req.body.promocion_id || null
            });
            await client.query('COMMIT');

            try {
                await appendNotification({
                    tipo: 'pedido_tienda',
                    titulo: 'Pedido registrado',
                    pedido_id: resultado.pedido.id,
                    recipient_user_id: req.user.id,
                    recipient_role: 4,
                    tipo_entrega: tipoEntrega,
                    subtotal: Number(resultado.subtotal || resultado.pedido.subtotal || 0),
                    total: Number(resultado.total || resultado.pedido.total || 0),
                    mensaje: 'Tu pedido de tienda fue registrado correctamente.',
                    email_to: resultado.cliente?.email || null,
                    email_subject: 'Factura de tu pedido PetSpa',
                    email_body: resultado.factura
                });
            } catch (logError) {
                console.warn('No se pudo registrar el pedido en notifications.log:', logError.message);
            }

            if (resultado.cliente?.email) {
                try {
                    await sendEmail(
                        resultado.cliente.email,
                        'Factura de tu pedido PetSpa',
                        resultado.factura
                    );
                } catch (mailError) {
                    console.warn('No se pudo enviar el correo del pedido:', mailError.message);
                }
            }

            res.status(201).json({
                success: true,
                message: 'Pedido registrado correctamente',
                data: {
                    ...resultado.pedido,
                    items: resultado.items,
                    mensaje_compartir: resultado.factura,
                    factura: resultado.factura,
                    pago: resultado.pago,
                    cliente_nombre: resultado.cliente?.nombre || req.user.nombre,
                    subtotal: resultado.subtotal,
                    descuento_total: resultado.descuentoTotal,
                    total: resultado.total,
                    cargo_entrega: resultado.cargoEntrega,
                    descuento_promocion: resultado.descuentoPromos,
                    descuento_lealtad: resultado.descuentoLealtad,
                    descuento_cupon: resultado.descuentoCupon,
                    codigo_cupon: resultado.cuponUsado
                }
            });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(error.statusCode || 500).json({ success: false, error: error.message });
        } finally {
            client.release();
        }
    },

    crearVentaPos: async (req, res) => {
        const client = await db.connect();
        try {
            const items = normalizeCartItems(req.body.items);
            const metodoPago = (req.body.metodo_pago || '').toLowerCase();
            const observaciones = req.body.observaciones || null;
            const clienteId = req.body.cliente_id || null;

            if (!items.length) {
                return res.status(400).json({ success: false, error: 'Agrega al menos un producto a la venta' });
            }

            if (!metodoPago) {
                return res.status(400).json({ success: false, error: 'Selecciona un metodo de pago' });
            }

            await client.query('BEGIN');
            const resultado = await registrarPedidoTienda({
                client,
                items,
                clienteId,
                registradoPor: req.user.id,
                metodoPago,
                observaciones,
                origen: 'pos_tienda',
                tipoEntrega: 'retiro',
                promocionId: req.body.promocion_id || null
            });
            await client.query('COMMIT');

            try {
                await appendNotification({
                    tipo: 'venta_pos_tienda',
                    titulo: 'Venta registrada',
                    pedido_id: resultado.pedido.id,
                    registrado_por: req.user.id,
                    recipient_roles: [1, 3],
                    subtotal: Number(resultado.subtotal || resultado.pedido.subtotal || 0),
                    total: Number(resultado.total || resultado.pedido.total || 0),
                    mensaje: 'Se registro una venta en caja.',
                    email_to: null,
                    email_subject: 'Venta registrada en caja PetSpa',
                    email_body: resultado.factura
                });
            } catch (logError) {
                console.warn('No se pudo registrar la venta POS en notifications.log:', logError.message);
            }

            res.status(201).json({
                success: true,
                message: 'Venta registrada correctamente',
                data: {
                    ...resultado.pedido,
                    items: resultado.items,
                    factura: resultado.factura,
                    pago: resultado.pago,
                    cliente_nombre: resultado.cliente?.nombre || null,
                    subtotal: resultado.subtotal,
                    descuento_total: resultado.descuentoTotal,
                    descuento_promocion: resultado.descuentoPromos,
                    total: resultado.total
                }
            });
        } catch (error) {
            await client.query('ROLLBACK');
            res.status(error.statusCode || 500).json({ success: false, error: error.message });
        } finally {
            client.release();
        }
    }
};

module.exports = ShopController;
