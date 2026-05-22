const pool = require('./src/config/database');
const bcrypt = require('bcrypt');

async function initDB() {
    try {
        console.log('Inicializando base de datos...');

        await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS password_history (
                id SERIAL PRIMARY KEY,
                usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
                password_hash VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS caracteristicas_mascotas (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(50) UNIQUE NOT NULL,
                ajuste_porcentaje INT DEFAULT 0,
                descripcion VARCHAR(200),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS mascotas (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cliente_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
                nombre VARCHAR(100) NOT NULL,
                especie VARCHAR(50),
                raza VARCHAR(100),
                tamano VARCHAR(20),
                fecha_nacimiento DATE,
                alergias TEXT,
                temperamento VARCHAR(30),
                minutos_adicionales_temperamento INT DEFAULT 0,
                ruta_foto_carnet TEXT,
                notas TEXT,
                estado_activo BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

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

        await pool.query(`
            CREATE TABLE IF NOT EXISTS bloqueos (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                groomer_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
                fecha DATE,
                hora_inicio TIME,
                hora_fin TIME,
                fecha_inicio DATE NOT NULL,
                fecha_fin DATE NOT NULL,
                tipo VARCHAR(50) NOT NULL,
                motivo VARCHAR(255),
                razon VARCHAR(255),
                created_by UUID REFERENCES usuarios(id),
                estado_activo BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS slots (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cliente_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
                groomer_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
                mascota_id UUID REFERENCES mascotas(id) ON DELETE CASCADE,
                servicio_id UUID REFERENCES servicios(id) ON DELETE CASCADE,
                fecha DATE,
                hora_inicio TIME,
                hora_fin TIME,
                fecha_inicio TIMESTAMP NOT NULL,
                fecha_fin TIMESTAMP NOT NULL,
                duracion_ajustada INT NOT NULL,
                minutos_adicionales_temperamento INT DEFAULT 0,
                estado VARCHAR(50) DEFAULT 'en_revision',
                notas TEXT,
                precio_final DECIMAL(10, 2),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS pagos (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cita_id UUID REFERENCES slots(id) ON DELETE SET NULL,
                registrado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
                tipo_venta VARCHAR(20) NOT NULL DEFAULT 'cita',
                concepto VARCHAR(255),
                metodo_pago VARCHAR(30) NOT NULL,
                monto DECIMAL(10, 2) NOT NULL,
                fecha_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                observaciones TEXT,
                origen VARCHAR(30) DEFAULT 'manual',
                tipo_movimiento VARCHAR(20) DEFAULT 'ingreso',
                referencia_evento VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS fichas_grooming (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cita_id UUID UNIQUE REFERENCES slots(id) ON DELETE CASCADE,
                groomer_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
                estado_ingreso TEXT,
                observaciones_iniciales TEXT,
                checklist JSONB DEFAULT '{}'::jsonb,
                insumos_texto TEXT,
                foto_antes_path TEXT,
                foto_despues_path TEXT,
                recomendaciones TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            ALTER TABLE pagos
            ADD COLUMN IF NOT EXISTS origen VARCHAR(30) DEFAULT 'manual',
            ADD COLUMN IF NOT EXISTS tipo_movimiento VARCHAR(20) DEFAULT 'ingreso',
            ADD COLUMN IF NOT EXISTS referencia_evento VARCHAR(100);
        `);

        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_indexes
                    WHERE indexname = 'pagos_referencia_evento_unique'
                ) THEN
                    EXECUTE 'CREATE UNIQUE INDEX pagos_referencia_evento_unique ON pagos (referencia_evento) WHERE referencia_evento IS NOT NULL';
                END IF;
            END $$;
        `);

        await pool.query(`
            ALTER TABLE disponibilidad_spa
            ALTER COLUMN capacidad_diaria SET DEFAULT 0;
        `);

        await pool.query(`
            WITH duplicados AS (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY dia_semana
                           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                       ) AS rn
                FROM disponibilidad_spa
                WHERE estado_activo = true
            )
            UPDATE disponibilidad_spa
            SET estado_activo = false, updated_at = CURRENT_TIMESTAMP
            WHERE id IN (SELECT id FROM duplicados WHERE rn > 1);
        `);

        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_indexes
                    WHERE indexname = 'disponibilidad_spa_dia_activo_unique'
                ) THEN
                    EXECUTE 'CREATE UNIQUE INDEX disponibilidad_spa_dia_activo_unique ON disponibilidad_spa (dia_semana) WHERE estado_activo = true';
                END IF;
            END $$;
        `);

        await pool.query(`
            WITH duplicados AS (
                SELECT id,
                       ROW_NUMBER() OVER (
                           PARTITION BY groomer_id, dia_semana
                           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                       ) AS rn
                FROM disponibilidad_groomer
                WHERE estado_activo = true
            )
            UPDATE disponibilidad_groomer
            SET estado_activo = false, updated_at = CURRENT_TIMESTAMP
            WHERE id IN (SELECT id FROM duplicados WHERE rn > 1);
        `);

        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM pg_indexes
                    WHERE indexname = 'disponibilidad_groomer_dia_activo_unique'
                ) THEN
                    EXECUTE 'CREATE UNIQUE INDEX disponibilidad_groomer_dia_activo_unique ON disponibilidad_groomer (groomer_id, dia_semana) WHERE estado_activo = true';
                END IF;
            END $$;
        `);

        await pool.query(`
            ALTER TABLE mascotas
            ADD COLUMN IF NOT EXISTS tamano VARCHAR(20),
            ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
            ADD COLUMN IF NOT EXISTS alergias TEXT,
            ADD COLUMN IF NOT EXISTS temperamento VARCHAR(30),
            ADD COLUMN IF NOT EXISTS minutos_adicionales_temperamento INT DEFAULT 0,
            ADD COLUMN IF NOT EXISTS ruta_foto_carnet TEXT,
            ADD COLUMN IF NOT EXISTS notas TEXT,
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `);

        await pool.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name = 'mascotas' AND column_name = 'tamaño'
                ) THEN
                    EXECUTE 'UPDATE mascotas SET tamano = COALESCE(tamano, "tamaño") WHERE tamano IS NULL';
                END IF;
            END $$;
        `);

        await pool.query(`
            ALTER TABLE bloqueos
            ADD COLUMN IF NOT EXISTS fecha DATE,
            ADD COLUMN IF NOT EXISTS hora_inicio TIME,
            ADD COLUMN IF NOT EXISTS hora_fin TIME,
            ADD COLUMN IF NOT EXISTS motivo VARCHAR(255),
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `);

        await pool.query(`
            UPDATE bloqueos
            SET
                fecha = COALESCE(fecha, fecha_inicio),
                hora_inicio = COALESCE(hora_inicio, '00:00'::time),
                hora_fin = COALESCE(hora_fin, '23:59'::time),
                motivo = COALESCE(motivo, razon)
            WHERE fecha IS NULL OR hora_inicio IS NULL OR hora_fin IS NULL OR motivo IS NULL;
        `);

        await pool.query(`
            ALTER TABLE slots
            ADD COLUMN IF NOT EXISTS fecha DATE,
            ADD COLUMN IF NOT EXISTS hora_inicio TIME,
            ADD COLUMN IF NOT EXISTS hora_fin TIME,
            ADD COLUMN IF NOT EXISTS minutos_adicionales_temperamento INT DEFAULT 0;
        `);

        await pool.query(`
            UPDATE slots
            SET
                fecha = COALESCE(fecha, DATE(fecha_inicio)),
                hora_inicio = COALESCE(hora_inicio, fecha_inicio::time),
                hora_fin = COALESCE(hora_fin, fecha_fin::time)
            WHERE fecha IS NULL OR hora_inicio IS NULL OR hora_fin IS NULL;
        `);

        await pool.query(`
            INSERT INTO roles (nombre)
            VALUES ('admin'), ('groomer'), ('recepcion'), ('cliente')
            ON CONFLICT (nombre) DO NOTHING;
        `);

        await pool.query(`
            INSERT INTO servicios (nombre, descripcion, duracion_base, precio, estado_activo)
            VALUES
                ('Baño rápido', 'Baño básico para mascotas', 30, 25.00, true),
                ('Baño completo', 'Baño con secado profesional', 60, 40.00, true),
                ('Corte y peinado', 'Corte de pelo y peinado', 90, 55.00, true),
                ('Servicio completo', 'Baño, corte, peinado y limpieza de oídos', 120, 75.00, true)
            ON CONFLICT (nombre) DO NOTHING;
        `);

        await pool.query(`
            INSERT INTO caracteristicas_mascotas (nombre, ajuste_porcentaje, descripcion)
            VALUES
                ('Nerviosa', 20, 'Compatibilidad con el modulo temprano'),
                ('Agresiva', 25, 'Compatibilidad con el modulo temprano')
            ON CONFLICT (nombre) DO NOTHING;
        `);

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

            console.log('Admin creado:');
            console.log('Email: admindavid@petters.com');
            console.log('Password: Admin123!');
        } else {
            console.log('Admin ya existe');
        }

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

                console.log('Admin de prueba creado:', testAdmin.email);
            }
        }

        console.log('Base de datos lista');
        process.exit();
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

initDB();
