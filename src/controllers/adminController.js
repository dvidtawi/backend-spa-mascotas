const User = require('../models/User');
const db = require('../config/database');

const {
    hashPassword
} = require('../utils/passwordUtils');

const {
    sendEmail
} = require('../services/emailService');

const {
    logEvent
} = require('../services/auditService');

const crypto = require('crypto');


// ===============================
// GET USERS
// ===============================

exports.getUsers = async (req, res) => {

    try {

        const users =
            await User.getAll();

        res.json(users);

    } catch (err) {

        res.status(500).json({
            error: err.message
        });
    }
};


// ===============================
// CREATE USER
// ===============================

exports.createUser = async (req, res) => {

    try {

        const {
            email,
            nombre,
            telefono,
            rol_id
        } = req.body;

        const existing =
            await User.findByEmail(email);

        if (existing) {

            return res.status(400).json({
                message:
                    'Usuario ya existe'
            });
        }

        // password temporal
        const tempPassword =
            crypto.randomBytes(4)
            .toString('hex') + 'A!1';

        const hash =
            await hashPassword(
                tempPassword
            );

        const user =
            await User.create({

                email,
                password_hash: hash,
                nombre,
                telefono,
                rol_id,

                primer_inicio: true,

                email_verificado: true
            });

        await sendEmail(
            email,
            'Cuenta creada',
            `
            Tu cuenta fue creada.

            Password temporal:
            ${tempPassword}

            Debes cambiarla
            en tu primer inicio.
            `
        );

        await logEvent(
            req,
            'ADMIN_CREATE_USER',
            'Admin creó usuario',
            req.user,
            {
                usuario_creado_id: user.id,
                usuario_creado_email: user.email,
                rol_id: user.rol_id
            }
        );

        res.json({
            message:
                'Usuario creado correctamente'
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });
    }
};


// ===============================
// UPDATE USER
// ===============================

exports.updateUser = async (req, res) => {

    try {

        const { id } = req.params;

        const {
            nombre,
            telefono,
            rol_id
        } = req.body;

        await db.query(
            `
            UPDATE usuarios
            SET
                nombre=$1,
                telefono=$2,
                rol_id=$3
            WHERE id=$4
            `,
            [
                nombre,
                telefono,
                rol_id,
                id
            ]
        );

        await logEvent(
            req,
            'ADMIN_UPDATE_USER',
            'Admin actualizó usuario',
            req.user,
            {
                usuario_afectado_id: id,
                nuevos_datos: {
                    nombre,
                    telefono,
                    rol_id
                }
            }
        );

        res.json({
            message:
                'Usuario actualizado'
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });
    }
};


// ===============================
// ACTIVATE / DEACTIVATE
// ===============================

exports.toggleUser = async (req, res) => {

    try {

        const { id } = req.params;

        const user =
            await User.findById(id);

        const newState =
            !user.estado_activo;

        await db.query(
            `
            UPDATE usuarios
            SET estado_activo=$1
            WHERE id=$2
            `,
            [newState, id]
        );

        await logEvent(
            req,
            'ADMIN_TOGGLE_USER',
            `Admin ${newState ? 'activó' : 'desactivó'} usuario`,
            req.user,
            {
                usuario_afectado_id: id,
                nuevo_estado: newState
            }
        );

        res.json({
            message:
                'Estado actualizado'
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });
    }
};
exports.auditLogs = async (req, res) => {

    try {

        const result = await db.query(`
            SELECT *
            FROM audit_log
            ORDER BY fecha_hora DESC
            LIMIT 100
        `);

        res.json(result.rows);

    } catch (err) {

        res.status(500).json({
            error: err.message
        });
    }
};