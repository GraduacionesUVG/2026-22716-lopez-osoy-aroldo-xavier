'use strict';

const swaggerJsdoc = require('swagger-jsdoc');

const spec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'CONGENIA — MedicalRecordManagement',
      version: '1.0.0',
      description:
        'Servicio para el registro, actualización y deshabilitación de fichas ' +
        'de sospecha de condiciones congénitas. Dominio privado.',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local' },
    ],
    tags: [
      { name: 'Integration', description: 'Flujo de integración con sistemas externos' },
      { name: 'Catalog', description: 'Catálogos de referencia del sistema' },
    ],
    components: {
      securitySchemes: {
        OAuthClientCredentials: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'OAuth 2.0 Client Credentials access token emitido por Keycloak',
        },
        OIDCUser: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token del medico emitido para congenia-web mediante Authorization Code + PKCE',
        },
        XSessionToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Session-Token',
          description: 'Capability temporal cifrada emitida por POST /api/v1/sessions/init',
        },
      },
      schemas: {
        // ── Sesión de integración ──────────────────────────────
        SessionInitRequest: {
          type: 'object',
          required: ['paciente', 'consulta', 'medico'],
          properties: {
            paciente: {
              type: 'object',
              required: ['patientId', 'nombre'],
              properties: {
                patientId:       { type: 'string', example: 'EXT-12345' },
                nombre:          { type: 'string', example: 'Juan Pérez López' },
                historiaClinica: { type: 'string', example: 'HC-98765' },
              },
            },
            consulta: {
              type: 'object',
              required: ['fechaConsulta', 'diagnosticoTexto'],
              properties: {
                fechaConsulta:    { type: 'string', format: 'date', example: '2026-04-18' },
                diagnosticoTexto: { type: 'string', example: 'Sospecha de síndrome cromosómico no especificado' },
              },
            },
            medico: {
              type: 'object',
              required: ['medicoId', 'nombre', 'especialidad'],
              properties: {
                medicoId:    { type: 'string', example: 'MED-001' },
                nombre:      { type: 'string', example: 'Dra. Ana García' },
                especialidad: {
                  type: 'string',
                  enum: ['PEDIATRIA', 'MEDICINA_INTERNA', 'GINECOLOGIA', 'CIRUGIA'],
                  example: 'PEDIATRIA',
                },
              },
            },
          },
        },
        SessionInitResponse: {
          type: 'object',
          properties: {
            sessionToken: { type: 'string', description: 'Capability temporal cifrada para X-Session-Token' },
            formUrl:      { type: 'string', example: 'http://localhost:5174/ficha#sessionToken=eyJ...' },
            expiresIn:    { type: 'integer', example: 900, description: 'Segundos de vigencia del token' },
          },
        },
        ManualSessionInitRequest: {
          type: 'object',
          required: ['paciente'],
          properties: {
            paciente: {
              type: 'object',
              required: ['patientId', 'nombre'],
              properties: {
                patientId: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
                nombre:    { type: 'string' },
              },
            },
            consulta: {
              type: 'object',
              properties: {
                fechaConsulta:    { type: 'string', format: 'date' },
                diagnosticoTexto: { type: 'string' },
              },
            },
          },
        },
        SessionInitErrorResponse: {
          type: 'object',
          properties: {
            error:   { type: 'string', example: 'INVALID_PAYLOAD' },
            details: { type: 'array', items: { type: 'string' }, example: ['paciente.nombre is required'] },
          },
        },
        SessionActivateResponse: {
          type: 'object',
          properties: {
            fichaId:        { type: 'string', format: 'uuid' },
            sessionId:      { type: 'string', format: 'uuid' },
            origenCreacion: { type: 'string', example: 'INTEGRACION' },
            alreadyActive: {
              type: 'boolean',
              example: false,
              description: 'true si la sesión ya estaba activa (refresh / segunda pestaña)',
            },
            paciente: {
              type: 'object',
              properties: {
                patientId:       { type: 'string', format: 'uuid', description: 'UUID interno de Congenia' },
                externalId:      { type: 'string', example: 'EXT-12345' },
                nombre:          { type: 'string', example: 'Juan Pérez López' },
                historiaClinica: { type: 'string', example: 'HC-98765' },
              },
            },
            consulta: {
              type: 'object',
              properties: {
                fechaConsulta:    { type: 'string', format: 'date', example: '2026-04-18' },
                diagnosticoTexto: { type: 'string', example: 'Sospecha de síndrome cromosómico no especificado' },
              },
            },
            medico: {
              type: 'object',
              properties: {
                medicoId:    { type: 'string', format: 'uuid', description: 'UUID interno de Congenia' },
                medicoExtId: { type: 'string', example: 'MED-001', description: 'ID del sistema externo' },
                nombre:      { type: 'string', example: 'Dra. Ana García' },
                especialidad: { type: 'string', example: 'PEDIATRIA' },
              },
            },
          },
        },

        // ── Región anatómica ───────────────────────────────────
        RegionAnatomica: {
          type: 'object',
          properties: {
            region_id: { type: 'integer', example: 1 },
            nombre:    { type: 'string',  example: 'Cabeza y cuello' },
            orden:     { type: 'integer', example: 1 },
            activo:    { type: 'boolean', example: true },
          },
        },
        RegionInput: {
          type: 'object',
          required: ['nombre', 'orden'],
          properties: {
            nombre: { type: 'string',  example: 'Extremidades inferiores' },
            orden:  { type: 'integer', example: 5 },
            activo: { type: 'boolean', default: true },
          },
        },

        // ── Lateralidad ────────────────────────────────────────
        Lateralidad: {
          type: 'object',
          properties: {
            lateralidad_id: { type: 'integer', example: 1 },
            codigo: {
              type: 'string',
              enum: ['NA', 'DER', 'IZQ', 'BILAT', 'MID'],
              example: 'DER',
            },
            nombre: { type: 'string', example: 'Derecho' },
            orden:  { type: 'integer', example: 2 },
            activo: { type: 'boolean', example: true },
          },
        },
        LateralidadInput: {
          type: 'object',
          required: ['codigo', 'nombre', 'orden'],
          properties: {
            codigo: {
              type: 'string',
              enum: ['NA', 'DER', 'IZQ', 'BILAT', 'MID'],
              example: 'IZQ',
            },
            nombre: { type: 'string',  example: 'Izquierdo' },
            orden:  { type: 'integer', example: 3 },
            activo: { type: 'boolean', default: true },
          },
        },

        // ── Parte del cuerpo ───────────────────────────────────
        ParteCuerpo: {
          type: 'object',
          properties: {
            parte_id: { type: 'integer', example: 1 },
            nombre:   { type: 'string',  example: 'Cabeza' },
            activo:   { type: 'boolean', example: true },
          },
        },
        ParteCuerpoInput: {
          type: 'object',
          required: ['nombre'],
          properties: {
            nombre: { type: 'string', example: 'Mano derecha' },
            activo: { type: 'boolean', default: true },
          },
        },

        // ── Signo catálogo ─────────────────────────────────────
        SignoCatalogo: {
          type: 'object',
          properties: {
            signo_catalogo_id:  { type: 'integer', example: 2 },
            nombre_normalizado: { type: 'string',  example: 'Hipertelorismo ocular' },
            categoria:          { type: 'string',  nullable: true, example: 'Cabeza / Cara' },
            descripcion_medica: { type: 'string',  nullable: true, example: 'Distancia interpupilar mayor a 2 DE' },
            activo:             { type: 'boolean', example: true },
            fecha_creacion:     { type: 'string',  format: 'date-time', nullable: true },
          },
        },
        SignoInput: {
          type: 'object',
          required: ['nombre_normalizado'],
          properties: {
            nombre_normalizado: { type: 'string', example: 'Macrocefalia' },
            categoria:          { type: 'string', example: 'Cabeza / Cara' },
            descripcion_medica: { type: 'string', example: 'Perímetro cefálico > +2 DE para edad y sexo' },
          },
        },

        // ── Examen catálogo ────────────────────────────────────
        ExamenCatalogo: {
          type: 'object',
          properties: {
            examen_catalogo_id: { type: 'integer', example: 2 },
            nombre_normalizado: { type: 'string',  example: 'Cariotipo estándar (bandeo GTG)' },
            tipo: {
              type: 'string',
              nullable: true,
              enum: ['GENETICO', 'IMAGEN', 'LABORATORIO', 'FUNCIONAL'],
              example: 'GENETICO',
            },
            descripcion:    { type: 'string', nullable: true, example: 'Análisis de los 46 cromosomas' },
            activo:         { type: 'boolean', example: true },
            fecha_creacion: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        ExamenInput: {
          type: 'object',
          required: ['nombre_normalizado'],
          properties: {
            nombre_normalizado: { type: 'string', example: 'Resonancia magnética cerebral' },
            tipo: {
              type: 'string',
              enum: ['GENETICO', 'IMAGEN', 'LABORATORIO', 'FUNCIONAL'],
              example: 'IMAGEN',
            },
            descripcion: { type: 'string', example: 'RM encefálica para malformaciones del SNC' },
          },
        },

        // ── Asistencia parto ───────────────────────────────────
        AsistenciaParto: {
          type: 'object',
          properties: {
            asistencia_parto_id: { type: 'integer', example: 1 },
            nombre:              { type: 'string',  example: 'Médico/a' },
          },
        },

        // ── Referido de ────────────────────────────────────────
        ReferidoDe: {
          type: 'object',
          properties: {
            referido_de_id: { type: 'integer', example: 1 },
            nombre:         { type: 'string',  example: 'Hospital público' },
          },
        },

        // ── Familiar catálogo ──────────────────────────────────
        FamiliarCatalogo: {
          type: 'object',
          properties: {
            familiar_catalogo_id: { type: 'integer', example: 1 },
            nombre:               { type: 'string',  example: 'Padre' },
          },
        },
        FamiliarInput: {
          type: 'object',
          required: ['nombre'],
          properties: {
            nombre: { type: 'string', example: 'Tío materno' },
          },
        },

        // ── Catálogo solicitudes ───────────────────────────────
        CatalogoSolicitud: {
          type: 'object',
          properties: {
            solicitud_id:         { type: 'string', format: 'uuid' },
            tipo:                 { type: 'string', enum: ['SIGNO', 'EXAMEN'] },
            descripcion_propuesta:{ type: 'string', example: 'Orejas de implantación baja' },
            estado: {
              type: 'string',
              enum: ['PENDIENTE', 'APROBADO', 'RECHAZADO', 'RECLASIFICADO'],
              example: 'PENDIENTE',
            },
            catalogo_destino_id: { type: 'integer', nullable: true },
            fecha_solicitud:     { type: 'string', format: 'date-time' },
          },
        },
        SolicitudInput: {
          type: 'object',
          required: ['tipo', 'descripcion_propuesta', 'ficha_id', 'solicitado_por'],
          properties: {
            tipo:                 { type: 'string', enum: ['SIGNO', 'EXAMEN'] },
            descripcion_propuesta:{ type: 'string', example: 'Orejas de implantación baja' },
            ficha_id:             { type: 'string', format: 'uuid' },
            solicitado_por:       { type: 'string', format: 'uuid' },
          },
        },

        // ── Respuestas genéricas ───────────────────────────────
        CreatedResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data:    { type: 'object' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string',  example: 'nombre es requerido' },
          },
        },
      },
    },
  },
  // Glob to all route files that contain @openapi annotations
  apis: ['./src/routes/**/*.js'],
});

module.exports = spec;
