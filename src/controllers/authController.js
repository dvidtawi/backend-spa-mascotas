const User = require('../models/User');
const VerificationCode = require('../models/VerificationCode');
const LoginAttempt = require('../models/LoginAttempt');
const UserSession = require('../models/UserSession');
const PasswordHistory = require('../models/PasswordHistory');
const db = require('../config/database');
const {
    validatePassword,
    hashPassword,
    comparePassword
} = require('../utils/passwordUtils');

const {
    generateAccessToken,
    generateRefreshToken
} = require('../services/tokenService');

const { sendEmail } = require('../services/emailService');
const { logEvent } = require('../services/auditService');

const jwt = require('jsonwebtoken');

const generateCode = () =>
    Math.floor(100000 + Math.random() * 900000).toString();


// ===============================
// REGISTER
// ===============================

exports.register = async (req, res) => {

    try {

        const {
            email,
            password,
            nombre,
            telefono
        } = req.body;

        const normalizedEmail =
            email.toLowerCase().trim();

        if (!validatePassword(password)) {

            return res.status(400).json({
                message:
                    'Contraseña débil. Debe tener mayúscula, minúscula, número y carácter especial.'
            });
        }

        const existing =
            await User.findByEmail(normalizedEmail);

        if (existing) {

            return res.status(400).json({
                message: 'Email ya registrado'
            });
        }

        const code = generateCode();

        const expira =
            new Date(Date.now() + 15 * 60 * 1000);

        await VerificationCode.create({
            email: normalizedEmail,
            codigo: code,
            tipo: 'email_verification',
            expira_en: expira
        });

        await sendEmail(
            normalizedEmail,
            'Código de verificación',
            `Tu código es: ${code}`
        );

        await logEvent(
            req,
            'EMAIL_VERIFICATION_REQUESTED',
            'Código enviado'
        );

        res.json({
            message: 'Código enviado al correo'
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });
    }
};


// ===============================
// VERIFY EMAIL
// ===============================

exports.verifyEmail = async (req, res) => {

    try {

        const {
            email,
            code,
            password,
            nombre,
            telefono
        } = req.body;

        const normalizedEmail =
            email.toLowerCase().trim();

        const db =
            require('../config/database');

        const result = await db.query(
            `
            SELECT * FROM verification_codes
            WHERE email=$1
            AND codigo=$2
            AND usado=false
            `,
            [normalizedEmail, code]
        );

        const record = result.rows[0];

        if (
            !record ||
            new Date() > record.expira_en
        ) {

            return res.status(400).json({
                message:
                    'Código inválido o expirado'
            });
        }

        if (!validatePassword(password)) {

            return res.status(400).json({
                message:
                    'Contraseña débil'
            });
        }

        const hashed =
            await hashPassword(password);

        const user = await User.create({
            email: normalizedEmail,
            password_hash: hashed,
            nombre,
            telefono,
            rol_id: 4,
            primer_inicio: false,
            email_verificado: true
        });

        await PasswordHistory.save(
            user.id,
            hashed
        );

        await db.query(
            `
            UPDATE verification_codes
            SET usado=true
            WHERE id=$1
            `,
            [record.id]
        );

        await logEvent(
            req,
            'EMAIL_VERIFIED',
            'Usuario verificado',
            user
        );

        res.json({
            message:
                'Usuario registrado correctamente'
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });
    }
};


// ===============================
// LOGIN
// ===============================

exports.login = async (req, res) => {

    try {

        const { email, password } = req.body;

        const normalizedEmail =
            email.toLowerCase().trim();

        let attempt =
            await LoginAttempt.findByEmail(
                normalizedEmail
            );

        if (
            attempt &&
            attempt.bloqueado_hasta &&
            new Date() < attempt.bloqueado_hasta
        ) {

            return res.status(403).json({
                message:
                    'Cuenta bloqueada temporalmente'
            });
        }

        const user =
            await User.findByEmail(
                normalizedEmail
            );

        if (user && !user.estado_activo) {

            return res.status(403).json({
                message: 'Cuenta desactivada'
            });
        }

        if (
            !user ||
            !(await comparePassword(
                password,
                user.password_hash
            ))
        ) {

            let intentos =
                (attempt?.intentos || 0) + 1;

            let bloqueado = null;

            if (intentos >= 5) {

                bloqueado =
                    new Date(
                        Date.now() +
                        15 * 60 * 1000
                    );

                intentos = 0;
            }

            await LoginAttempt.createOrUpdate(
                normalizedEmail,
                intentos,
                bloqueado
            );

            await logEvent(
                req,
                'LOGIN_FAILED',
                'Credenciales incorrectas'
            );

            return res.status(401).json({
                message:
                    'Credenciales inválidas'
            });
        }

                // crear sesión
        const sessionResult = await db.query(
            `
            INSERT INTO user_sessions (
                usuario_id,
                ip_address,
                user_agent,
                expires_at
            )
            VALUES ($1,$2,$3,$4)
            RETURNING *
            `,
            [
                user.id,
                req.ip,
                req.headers['user-agent'],
                new Date(
                    Date.now() +
                    7 * 24 * 60 * 60 * 1000
                )
            ]
        );

        const session = sessionResult.rows[0];

        // generar tokens ligados a ESTA sesión
        const accessToken =
            generateAccessToken(
                user,
                session.id
            );

        const refreshToken =
            generateRefreshToken(
                user,
                session.id
            );

        // guardar refresh token
        await db.query(
            `
            UPDATE user_sessions
            SET refresh_token=$1
            WHERE id=$2
            `,
            [refreshToken, session.id]
        );
        
        await logEvent(
            req,
            'LOGIN_SUCCESS',
            'Login exitoso',
            user
        );

        res.json({
            accessToken,
            refreshToken,
            primer_inicio: user.primer_inicio
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });
    }
};


// ===============================
// LOGOUT
// ===============================

exports.logout = async (req, res) => {

    try {

        const { refreshToken } = req.body;

        if (!refreshToken) {

            return res.status(400).json({
                message:
                    'Refresh token requerido'
            });
        }

        const db =
            require('../config/database');

        const result = await db.query(
            `
            DELETE FROM user_sessions
            WHERE refresh_token=$1
            RETURNING *
            `,
            [refreshToken]
        );

        if (result.rows.length === 0) {

            return res.status(404).json({
                message:
                    'Sesión no encontrada'
            });
        }

        await logEvent(
            req,
            'LOGOUT',
            'Sesión cerrada'
        );

        res.json({
            message: 'Logout exitoso'
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });
    }
};


// ===============================
// FORGOT PASSWORD
// ===============================

exports.forgotPassword = async (req, res) => {

    try {

        const { email } = req.body;

        const normalizedEmail =
            email.toLowerCase().trim();

        const user =
            await User.findByEmail(
                normalizedEmail
            );

        if (user) {

            const code = generateCode();
            const expira =
                new Date(Date.now() + 15 * 60 * 1000);

            await VerificationCode.create({
                email: normalizedEmail,
                codigo: code,
                tipo: 'password_reset',
                expira_en: expira
            });

            await sendEmail(
                normalizedEmail,
                'Recuperación',
                `Código: ${code}`
            );

            await logEvent(
                req,
                'PASSWORD_RESET_REQUESTED',
                'Solicitud recuperación',
                user
            );
        }

        res.json({
            message:
                'Si el correo existe, se envió un código'
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });
    }
};


// ===============================
// RESET PASSWORD
// ===============================

exports.resetPassword = async (req, res) => {

    try {

        const {
            email,
            code,
            newPassword
        } = req.body;

        const emailNormalized =
            email.toLowerCase().trim();

        const user =
            await User.findByEmail(
                emailNormalized
            );

        if (!user) {

            return res.status(404).json({
                message:
                    'Usuario no encontrado'
            });
        }

        if (!validatePassword(newPassword)) {

            return res.status(400).json({
                message:
                    'Contraseña débil. Debe tener mayúscula, minúscula, número y carácter especial.'
            });
        }

        const db =
            require('../config/database');

        const result = await db.query(
            `
            SELECT * FROM verification_codes
            WHERE email=$1
            AND codigo=$2
            AND tipo='password_reset'
            AND usado=false
            `,
            [emailNormalized, code]
        );

        const record = result.rows[0];

        if (
            !record ||
            new Date() > record.expira_en
        ) {

            return res.status(400).json({
                message: 'Código inválido'
            });
        }

        const lastPasswords =
            await PasswordHistory.getLast(
                user.id
            );

        for (let p of lastPasswords) {

            const reused =
                await comparePassword(
                    newPassword,
                    p.password_hash
                );

            if (reused) {

                return res.status(400).json({
                    message:
                        'No puedes reutilizar contraseña'
                });
            }
        }

        const hash =
            await hashPassword(newPassword);

        await db.query(
            `
            UPDATE usuarios
            SET password_hash=$1
            WHERE id=$2
            `,
            [hash, user.id]
        );

        await PasswordHistory.save(
            user.id,
            hash
        );

        await db.query(
            `
            UPDATE verification_codes
            SET usado=true
            WHERE id=$1
            `,
            [record.id]
        );

        await logEvent(
            req,
            'PASSWORD_RESET',
            'Contraseña reseteada',
            user
        );

        res.json({
            message:
                'Contraseña actualizada'
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });
    }
};


// ===============================
// CHANGE PASSWORD
// ===============================

exports.changePassword = async (req, res) => {
    console.log(req.user);
    try {

        const {
            currentPassword,
            newPassword
        } = req.body;

        if (!validatePassword(newPassword)) {

            return res.status(400).json({
                message:
                    'Contraseña débil. Debe tener mayúscula, minúscula, número y carácter especial.'
            });
        }

        const user =
            await User.findById(req.user.id);

        const validCurrent =
            await comparePassword(
                currentPassword,
                user.password_hash
            );

        if (!validCurrent) {

            return res.status(400).json({
                message:
                    'Contraseña actual incorrecta'
            });
        }

        const lastPasswords =
            await PasswordHistory.getLast(
                user.id
            );

        for (let p of lastPasswords) {

            const reused =
                await comparePassword(
                    newPassword,
                    p.password_hash
                );

            if (reused) {

                return res.status(400).json({
                    message:
                        'No puedes reutilizar contraseña'
                });
            }
        }

        const hash =
            await hashPassword(newPassword);

        const db =
            require('../config/database');

        await db.query(
            `
            UPDATE usuarios
            SET password_hash=$1
            WHERE id=$2
            `,
            [hash, user.id]
        );
        await db.query(
            `
            UPDATE usuarios
            SET primer_inicio=false
            WHERE id=$1
            `,
            [user.id]
        );
        await PasswordHistory.save(
            user.id,
            hash
        );

        await logEvent(
            req,
            'PASSWORD_CHANGE',
            'Cambio de contraseña',
            user
        );

        res.json({
            message:
                'Contraseña cambiada'
        });

    } catch (err) {

        res.status(500).json({
            error: err.message
        });
    }
};


// ===============================
// REFRESH TOKEN
// ===============================

exports.refreshToken = async (req, res) => {

    try {

        const { refreshToken } = req.body;

        if (!refreshToken) {

            return res.status(400).json({
                message:
                    'Refresh token requerido'
            });
        }

        const db =
            require('../config/database');

        const sessionResult = await db.query(
            `
            SELECT * FROM user_sessions
            WHERE refresh_token=$1
            `,
            [refreshToken]
        );

        const session =
            sessionResult.rows[0];

        if (!session) {

            return res.status(403).json({
                message:
                    'Refresh token inválido'
            });
        }

        const decoded = jwt.verify(
            refreshToken,
            process.env.JWT_REFRESH_SECRET
        );

        const user =
            await User.findById(decoded.id);

        const newAccessToken =
            generateAccessToken(user);

        res.json({
            accessToken: newAccessToken
        });

    } catch (err) {

        return res.status(403).json({
            message:
                'Refresh token expirado'
        });
    }
};