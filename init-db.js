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
                two_factor_enabled BOOLEAN DEFAULT false,
                two_factor_secret VARCHAR(255),
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
                expires_at TIMESTAMP,
                last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

        // TABLAS DE AGENDA Y SLOTS
        // Servicios disponibles
        await pool.query(`
            CREATE TABLE IF NOT EXISTS servicios (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                nombre VARCHAR(100) UNIQUE NOT NULL,
                descripcion TEXT,
                duracion_base INT NOT NULL,
                precio DECIMAL(10, 2) NOT NULL,
                estado_activo BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Características de mascotas para ajuste de duración
        await pool.query(`
            CREATE TABLE IF NOT EXISTS caracteristicas_mascotas (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(50) UNIQUE NOT NULL,
                ajuste_porcentaje INT DEFAULT 0,
                descripcion VARCHAR(200),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Mascotas (relación con clientes)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mascotas (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cliente_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
                nombre VARCHAR(100) NOT NULL,
                especie VARCHAR(50),
                raza VARCHAR(100),
                tamaño VARCHAR(20),
                caracteristica_id INT REFERENCES caracteristicas_mascotas(id),
                notas TEXT,
                estado_activo BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Disponibilidad del spa (horarios laborales generales)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS disponibilidad_spa (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                dia_semana INT NOT NULL,
                hora_inicio TIME NOT NULL,
                hora_fin TIME NOT NULL,
                capacidad_diaria INT DEFAULT 10,
                estado_activo BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Disponibilidad de groomers
        await pool.query(`
            CREATE TABLE IF NOT EXISTS disponibilidad_groomer (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                groomer_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
                dia_semana INT NOT NULL,
                hora_inicio TIME NOT NULL,
                hora_fin TIME NOT NULL,
                especialidades TEXT,
                estado_activo BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Bloqueos (feriados, mantenimiento, ausencias)
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bloqueos (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                groomer_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
                fecha_inicio DATE NOT NULL,
                fecha_fin DATE NOT NULL,
                tipo VARCHAR(50) NOT NULL,
                razon VARCHAR(255),
                created_by UUID REFERENCES usuarios(id),
                estado_activo BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Slots/Citas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS slots (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cliente_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
                groomer_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
                mascota_id UUID REFERENCES mascotas(id) ON DELETE CASCADE,
                servicio_id UUID REFERENCES servicios(id) ON DELETE CASCADE,
                fecha_inicio TIMESTAMP NOT NULL,
                fecha_fin TIMESTAMP NOT NULL,
                duracion_ajustada INT NOT NULL,
                estado VARCHAR(50) DEFAULT 'confirmada',
                notas TEXT,
                precio_final DECIMAL(10, 2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // ROLES
        await pool.query(`
            INSERT INTO roles (nombre)
            VALUES ('admin'), ('groomer'), ('recepcion'), ('cliente')
            ON CONFLICT (nombre) DO NOTHING;
        `);

        // DATOS DE SEMILLA - SERVICIOS
        await pool.query(`
            INSERT INTO servicios (nombre, descripcion, duracion_base, precio, estado_activo)
            VALUES 
                ('Baño rápido', 'Baño básico para mascotas', 30, 25.00, true),
                ('Baño completo', 'Baño con secado profesional', 60, 40.00, true),
                ('Corte y peinado', 'Corte de pelo y peinado', 90, 55.00, true),
                ('Servicio completo', 'Baño, corte, peinado y limpieza de oídos', 120, 75.00, true)
            ON CONFLICT (nombre) DO NOTHING;
        `);

        // DATOS DE SEMILLA - CARACTERÍSTICAS DE MASCOTAS
        // Ahora contiene solo comportamientos/temperamento
        // El tamaño se maneja en el campo 'tamaño' de la tabla mascotas
        await pool.query(`
            INSERT INTO caracteristicas_mascotas (nombre, ajuste_porcentaje, descripcion)
            VALUES 
                ('Nerviosa', 20, 'Mascotas nerviosas - tiempo adicional'),
                ('Agresiva', 25, 'Mascotas agresivas - tiempo adicional y precauciones')
            ON CONFLICT (nombre) DO NOTHING;
        `);

        // DATOS DE SEMILLA - DISPONIBILIDAD DEL SPA
        // Lunes a viernes 09:00 a 18:00, capacidad de 10 citas diarias
        await pool.query(`
            INSERT INTO disponibilidad_spa (dia_semana, hora_inicio, hora_fin, capacidad_diaria, estado_activo)
            VALUES 
                (1, '09:00', '18:00', 10, true),
                (2, '09:00', '18:00', 10, true),
                (3, '09:00', '18:00', 10, true),
                (4, '09:00', '18:00', 10, true),
                (5, '09:00', '18:00', 10, true)
            ON CONFLICT DO NOTHING;
        `);

        // ADMIN PRINCIPAL
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
                    email_verificado,
                    primer_inicio,
                    estado_activo,
                    two_factor_enabled,
                    two_factor_secret
                )
                VALUES ($1, $2, $3, 1, true, true, true, false, NULL)
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

        // ADMINS DE PRUEBA
        const testAdmins = [
            { email: 'admin.prueba1@petters.com', password: 'AdminPrueba1!', nombre: 'Admin Prueba 1' },
            { email: 'admin.prueba2@petters.com', password: 'AdminPrueba2!', nombre: 'Admin Prueba 2' },
            { email: 'admin.prueba3@petters.com', password: 'AdminPrueba3!', nombre: 'Admin Prueba 3' },
            { email: 'admin.prueba4@petters.com', password: 'AdminPrueba4!', nombre: 'Admin Prueba 4' },
            { email: 'admin.prueba5@petters.com', password: 'AdminPrueba5!', nombre: 'Admin Prueba 5' }
        ];

        for (const testAdmin of testAdmins) {
            const exists = await pool.query(
                `SELECT * FROM usuarios WHERE email = $1`,
                [testAdmin.email]
            );

            if (exists.rows.length === 0) {
                const hash = await bcrypt.hash(testAdmin.password, 12);

                const adminResult = await pool.query(`
                    INSERT INTO usuarios (
                        email,
                        password_hash,
                        nombre,
                        telefono,
                        rol_id,
                        estado_activo,
                        primer_inicio,
                        email_verificado,
                        two_factor_enabled,
                        two_factor_secret
                    )
                    VALUES ($1, $2, $3, $4, 1, true, true, true, false, NULL)
                    RETURNING *;
                `, [
                    testAdmin.email,
                    hash,
                    testAdmin.nombre,
                    '+34123456789'
                ]);

                const admin = adminResult.rows[0];

                await pool.query(`
                    INSERT INTO password_history (usuario_id, password_hash)
                    VALUES ($1, $2)
                `, [admin.id, hash]);

                console.log('✅ Admin de prueba creado:');
                console.log('📧 Email:', testAdmin.email);
                console.log('🔑 Password:', testAdmin.password);
            } else {
                console.log('⚠️ Admin de prueba ya existe:', testAdmin.email);
            }
        }

        console.log('✅ Base de datos lista');
        process.exit();
    } catch (err) {
        console.error('❌ Error:', err);
        process.exit(1);
    }
}

initDB();