# 📅 Módulo de Organización de Agenda y Slots - Pet Spa Backend

## ✨ Implementación Completada

Se ha implementado exitosamente el módulo 2 de organización de agenda y slots con todas las funcionalidades requeridas.

---

## 🏗️ Estructura Implementada

### 1. **Tablas de Base de Datos**
Las siguientes tablas fueron creadas en PostgreSQL:

```sql
- servicios              # Definición de servicios (baño, corte, etc.)
- caracteristicas_mascotas  # Características que ajustan duración
- mascotas              # Mascotas de clientes
- disponibilidad_spa    # Horarios laborales del spa
- disponibilidad_groomer # Horarios de cada groomer
- bloqueos              # Feriados, ausencias, mantenimiento
- slots                 # Citas/reservas de clientes
```

### 2. **Modelos (src/models/)**
- `Service.js` - Gestión de servicios
- `Pet.js` - Gestión de mascotas y características
- `SpaAvailability.js` - Horarios del spa
- `GroomerAvailability.js` - Horarios de groomers
- `Block.js` - Bloqueos de tiempo
- `Slot.js` - Citas

### 3. **Servicios (src/services/)**

#### `durationService.js`
Calcula dinámicamente la duración de servicios según características de mascota:
- **Pequeña**: Duración base (0%)
- **Mediana**: Duración base + 10%
- **Grande**: Duración base + 15%
- **Gigante/Compleja**: Duración base + 30%
- **Nerviosa/Agresiva**: Duración base + 20%

**Métodos principales:**
```javascript
calcularDuracionAjustada(duracionBase, ajustePorcentaje)
getDuracionAjustadaParaMascota(mascotaId, servicioId)
getDuracionesAjustadasMultiples(mascotaId, servicioIds)
formatearDuracion(minutos)
```

#### `availabilityService.js`
Valida disponibilidad y reglas de capacidad:

**Validaciones:**
1. ✅ Spa abierto en fecha/hora
2. ✅ Groomer disponible
3. ✅ Sin bloqueos en la fecha
4. ✅ Sin solapamiento de citas
5. ✅ Capacidad diaria no excedida

**Métodos principales:**
```javascript
verificarDisponibilidadSpa(fecha, hora)
verificarDisponibilidadGroomer(groomerId, fecha, horaInicio, horaFin)
verificarCapacidadDiaria(fecha, groomerId)
obtenerSlotsDisponibles(fecha, duracionMinutos, groomerId)
validarReglasCapacidad(datos)
```

### 4. **Controlador (src/controllers/scheduleController.js)**
Coordina todas las operaciones con 20+ acciones:
- Gestión de servicios
- Gestión de mascotas
- Disponibilidad del spa
- Disponibilidad de groomers
- Bloqueos
- Citas

### 5. **Rutas (src/routes/scheduleRoutes.js)**
29 endpoints RESTful con validación de roles

---

## 🔌 Endpoints API

### Servicios
```http
GET    /api/schedule/servicios                      # Listar servicios
POST   /api/schedule/servicios                      # Crear servicio (admin, recepcion)
PUT    /api/schedule/servicios/:id                  # Actualizar (admin)
```

### Mascotas
```http
GET    /api/schedule/mascotas                       # Mascotas del cliente (cliente)
POST   /api/schedule/mascotas                       # Crear mascota (cliente)
GET    /api/schedule/caracteristicas-mascotas      # Listar características
```

### Disponibilidad Spa
```http
GET    /api/schedule/disponibilidad-spa            # Horarios del spa
POST   /api/schedule/disponibilidad-spa            # Crear horario (admin)
```

### Disponibilidad Groomers
```http
GET    /api/schedule/disponibilidad-groomer/:id    # Horarios de groomer
POST   /api/schedule/disponibilidad-groomer        # Crear horario (admin)
```

### Bloqueos
```http
POST   /api/schedule/bloqueos                       # Crear bloqueo (admin, recepcion)
GET    /api/schedule/bloqueos/:groomerId           # Listar bloqueos
```

### Citas
```http
GET    /api/schedule/mis-citas                      # Mis citas (cliente)
GET    /api/schedule/slots-disponibles              # Slots libres
POST   /api/schedule/citas                          # Crear cita (cliente)
GET    /api/schedule/citas/:citaId                  # Detalles de cita
PUT    /api/schedule/citas/:citaId/cancelar        # Cancelar cita
```

---

## 🚀 Primeros Pasos

### 1. Inicializar Base de Datos
```bash
npm run init-db
```
Esto creará:
- ✅ Todas las tablas necesarias
- ✅ 4 servicios pre-configurados:
  - Baño rápido (30 min, $25)
  - Baño completo (60 min, $40)
  - Corte y peinado (90 min, $55)
  - Servicio completo (120 min, $75)
- ✅ Características de mascotas
- ✅ Disponibilidad del spa (Lunes-Viernes, 9:00-18:00, capacidad 10)

### 2. Crear un Groomer
```bash
# Registrar con rol groomer (rol_id = 2)
POST /api/auth/register
{
  "email": "groomer@petters.com",
  "password": "GroomerPassword123!",
  "nombre": "Carlos",
  "rol_id": 2
}
```

### 3. Configurar Disponibilidad del Groomer
```bash
POST /api/schedule/disponibilidad-groomer
{
  "groomer_id": "<groomer-uuid>",
  "dia_semana": 1,  # Lunes
  "hora_inicio": "09:00",
  "hora_fin": "18:00",
  "especialidades": "Cortes complejos"
}
```

### 4. Crear Cliente y Mascota
```bash
# Registrar cliente (rol_id = 4)
POST /api/auth/register
{
  "email": "cliente@petters.com",
  "password": "ClientePassword123!",
  "nombre": "Juan",
  "rol_id": 4
}

# Crear mascota
POST /api/schedule/mascotas
{
  "nombre": "Max",
  "especie": "Perro",
  "raza": "Labrador",
  "tamaño": "Grande",
  "caracteristica_id": 3  # ID de característica "Grande"
}
```

### 5. Reservar una Cita
```bash
# Obtener slots disponibles
GET /api/schedule/slots-disponibles?fecha=2025-03-15&duracion_minutos=120&groomer_id=<groomer-uuid>

# Crear cita
POST /api/schedule/citas
{
  "mascota_id": "<mascota-uuid>",
  "servicio_id": "<servicio-uuid>",
  "groomer_id": "<groomer-uuid>",
  "fecha_inicio": "2025-03-15T10:00:00Z",
  "fecha_fin": "2025-03-15T11:30:00Z"
}
```

---

## 📊 Datos de Semilla por Defecto

### Servicios Pre-configurados
| Servicio | Duración | Precio |
|----------|----------|--------|
| Baño rápido | 30 min | $25.00 |
| Baño completo | 60 min | $40.00 |
| Corte y peinado | 90 min | $55.00 |
| Servicio completo | 120 min | $75.00 |

### Características de Mascota
| Característica | Ajuste | Descripción |
|---|---|---|
| Pequeña | 0% | Duración base |
| Mediana | +10% | Duración base + 10% |
| Grande | +15% | Duración base + 15% |
| Gigante | +30% | Duración base + 30% |
| Nerviosa | +20% | Tiempo adicional |

### Disponibilidad Spa Inicial
- **Días**: Lunes a Viernes
- **Horario**: 09:00 - 18:00
- **Capacidad**: 10 citas por día

---

## 🔐 Control de Acceso por Rol

| Endpoint | Admin | Groomer | Recepción | Cliente |
|----------|-------|---------|-----------|---------|
| Ver servicios | ✅ | ✅ | ✅ | ✅ |
| Crear/Editar servicios | ✅ | ❌ | ✅ | ❌ |
| Ver/Editar disponibilidad spa | ✅ | ❌ | ❌ | ❌ |
| Ver/Crear disponibilidad groomer | ✅ | ❌ | ❌ | ❌ |
| Crear bloqueos | ✅ | ❌ | ✅ | ❌ |
| Gestionar mascotas | ❌ | ❌ | ❌ | ✅ |
| Crear citas | ❌ | ❌ | ❌ | ✅ |
| Ver citas personales | ❌ | ❌ | ❌ | ✅ |

---

## 📝 Ejemplo Completo de Flujo

```javascript
// 1. Cliente registrado y autenticado crea una mascota
POST /api/schedule/mascotas
{
  "nombre": "Fluffy",
  "especie": "Gato",
  "raza": "Persa",
  "tamaño": "Pequeño",
  "caracteristica_id": 1  // Pequeña = 0% ajuste
}
// Duración para Baño rápido: 30 min (base) + 0% = 30 min

// 2. Si fuera mascota Grande
// "caracteristica_id": 3  // Grande = +15% ajuste
// Duración para Baño rápido: 30 min (base) + 15% = 34.5 min → 35 min (redondeado)

// 3. Obtener slots disponibles
GET /api/schedule/slots-disponibles?fecha=2025-03-15&duracion_minutos=35&groomer_id=groomer123

// Respuesta: Array con horarios libres en intervalos de 30 minutos

// 4. Crear cita
POST /api/schedule/citas
{
  "mascota_id": "fluffy-uuid",
  "servicio_id": "bano-rapido-uuid",
  "groomer_id": "groomer123",
  "fecha_inicio": "2025-03-15T10:00:00Z",
  "fecha_fin": "2025-03-15T10:35:00Z"
}

// Sistema automáticamente:
// ✅ Calcula duración ajustada (35 min)
// ✅ Valida disponibilidad del groomer
// ✅ Verifica sin solapamiento
// ✅ Verifica capacidad diaria
// ✅ Confirma la cita
```

---

## 🛠️ Estructura de Archivo

```
backend/
├── src/
│   ├── models/
│   │   ├── Service.js ✨ (nuevo)
│   │   ├── Pet.js ✨ (nuevo)
│   │   ├── Slot.js ✨ (nuevo)
│   │   ├── SpaAvailability.js ✨ (nuevo)
│   │   ├── GroomerAvailability.js ✨ (nuevo)
│   │   └── Block.js ✨ (nuevo)
│   ├── services/
│   │   ├── durationService.js ✨ (nuevo)
│   │   └── availabilityService.js ✨ (nuevo)
│   ├── controllers/
│   │   └── scheduleController.js ✨ (nuevo)
│   ├── routes/
│   │   └── scheduleRoutes.js ✨ (nuevo)
│   └── app.js ✏️ (modificado)
└── init-db.js ✏️ (modificado)
```

---

## 🧪 Pruebas Recomendadas

1. **Crear servicios y verificar listado**
2. **Registrar groomer y configurar disponibilidad**
3. **Verificar slots disponibles**
4. **Crear cita y validar duración ajustada**
5. **Crear bloqueo y verificar que no permite citas**
6. **Cancelar cita**
7. **Exceder capacidad diaria y verificar rechazo**

---

## 📚 Notas Técnicas

- **BD**: PostgreSQL con pool de conexiones
- **Roles**: admin (1), groomer (2), recepcion (3), cliente (4)
- **Autenticación**: JWT con middleware
- **Validación**: Reglas de negocio en services
- **Transacciones**: ACID en operaciones de base de datos
- **Duraciones**: Calculadas en minutos, formateadas para UI

---

## ✅ Checklist de Implementación

- ✅ Tablas de base de datos creadas
- ✅ Modelos con operaciones CRUD
- ✅ Servicio de duración dinámica
- ✅ Servicio de validación de disponibilidad
- ✅ Controlador con 20+ acciones
- ✅ 29 endpoints con control de roles
- ✅ Datos de semilla pre-configurados
- ✅ Integración en app.js
- ✅ Documentación completa

---

**¡El módulo está listo para usar!** 🎉
