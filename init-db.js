const pool = require('./src/config/database');
const bcrypt = require('bcrypt');

async function initDB() {
    try {
        console.log('🚀 Inicializando base de datos...');

        // EXTENSION UUID
        await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

        // TABLAS
        await pool.query(`
            CREATE TABLE IF NOT EXISTS roles (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(50) UNIQUE NOT NULL
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                nombre VARCHAR(100) NOT NULL,
                telefono VARCHAR(20),
                rol_id INT REFERENCES roles(id),
                estado_activo BOOLEAN DEFAULT true,
                primer_inicio BOOLEAN DEFAULT true,
                email_verificado BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS login_attempts (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                intentos INT DEFAULT 1,
                bloqueado_hasta TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS verification_codes (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255),
                codigo VARCHAR(6),
                tipo VARCHAR(50),
                expira_en TIMESTAMP,
                usado BOOLEAN DEFAULT false
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_sessions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
                refresh_token TEXT,
                ip_address VARCHAR(45),
                user_agent TEXT,
                expires_at TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                usuario_id UUID,
                email_usuario VARCHAR(255),
                evento VARCHAR(100),
                descripcion TEXT,
                ip_address VARCHAR(45),
                user_agent TEXT,
                fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                detalles_json JSONB
            );
        `);
        //paswordhistory
        await pool.query(`
            CREATE TABLE IF NOT EXISTS password_history (
            id SERIAL PRIMARY KEY,
            usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
            password_hash VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // ROLES
        await pool.query(`
            INSERT INTO roles (nombre)
            VALUES ('admin'), ('groomer'), ('recepcion'), ('cliente')
            ON CONFLICT (nombre) DO NOTHING;
        `);

        // ADMIN
        const adminEmail = 'admindavid@petters.com';
        const existing = await pool.query(
            `SELECT * FROM usuarios WHERE email = $1`,
            [adminEmail]
        );

        if (existing.rows.length === 0) {
            const hash = await bcrypt.hash('Admin123!', 12);

            const adminResult = await pool.query(`
                INSERT INTO usuarios (
                    email,
                    password_hash,
                    nombre,
                    rol_id,
                    email_verificado
                )
                VALUES ($1, $2, $3, 1, true)
                RETURNING *;
            `, [adminEmail, hash, 'Administrador']);

            const admin = adminResult.rows[0];

            await pool.query(`
                INSERT INTO password_history (usuario_id, password_hash)
                VALUES ($1, $2)
            `, [admin.id, hash]);
            console.log('✅ Admin creado:');
            console.log('📧 Email: admindavid@petters.com');
            console.log('🔑 Password: Admin123!');
        } else {
            console.log('⚠️ Admin ya existe');
        }

        console.log('✅ Base de datos lista');
        process.exit();
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

initDB();