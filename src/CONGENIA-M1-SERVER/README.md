# CONGENIA M1 — Server

Servicio backend de MedicalRecordManagement. Expone la API REST para el registro de fichas, catalogos etc.
## Primera ejecución

### 1. Configurar variables de entorno (.env) en la raíz del proyecto

### 2. Levantar los servicios

```bash
docker compose up --build -d
```

Esto:
- Construye la imagen de la API
- Levanta el contenedor de PostgreSQL
- Ejecuta los scripts de `db/init/` (schema + seed) sobre un volumen nuevo
- Espera a que PostgreSQL esté listo antes de arrancar la API

### 3. Verificar que todo esté corriendo

```bash
docker compose ps
```

```bash
# Health check de la API
curl http://localhost:3000/health
# → { "status": "ok" }
```

### 4. Documentación de la API
```
http://localhost:3000/docs
```
---


## Estructura

```
CONGENIA-M1-SERVER/
├── db/
│   └── init/
│       ├── 01_schema.sql   # Schema (CONGENIA-DB v0.1.0-alpha.8)
│       └── 02_seed.sql     # Datos iniciales de catálogos
├── src/
│   ├── server.js           # Entry point
│   ├── app.js              # Express + middlewares + rutas
│   ├── config/
│   │   ├── db.js           # Pool de conexiones PostgreSQL
│   │   └── swagger.js      # Spec OpenAPI
│   ├── routes/v1/
│   ├── controllers/
│   ├── services/
│   └── middleware/
├── Dockerfile
├── docker-compose.yml
└── .env
```
---