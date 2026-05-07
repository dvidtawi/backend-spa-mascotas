const User = require('../models/User');
const db = require('../config/database');

exports.getUsers = async (req, res) => {

    try {

        const users = await User.findAll();

        res.json(users);

    } catch (err) {

        res.status(500).json({
            error: err.message
        });
    }
};

exports.deactivateUser = async (req, res) => {

    try {

        await User.updateStatus(
            req.params.id,
            false
        );

        res.json({
            message: 'Usuario desactivado'
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });
    }
};

exports.activateUser = async (req, res) => {

    try {

        await User.updateStatus(
            req.params.id,
            true
        );

        res.json({
            message: 'Usuario activado'
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });
    }
};

exports.forcePasswordChange = async (req, res) => {

    try {

        await User.forcePasswordChange(
            req.params.id
        );

        res.json({
            message:
                'Cambio de contraseña forzado'
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