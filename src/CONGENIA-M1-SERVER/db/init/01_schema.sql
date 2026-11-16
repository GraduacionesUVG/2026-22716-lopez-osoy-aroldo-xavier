-- =============================================================
-- CONGENIA — Schema
-- Fuente runtime oficial; sincronizada con CONGENIA-DB
-- Versión: v0.2.1
-- =============================================================

-- Keycloak comparte la instancia RDS, no las tablas de la aplicacion.
CREATE SCHEMA IF NOT EXISTS keycloak;

CREATE TABLE "usuario" (
  "usuario_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "system_id" varchar(50),
  "usuario_ext_id" varchar(50),
  "nombre" varchar(200) NOT NULL,
  "email" varchar(200),
  "especialidad" varchar(50) NOT NULL DEFAULT 'N/A',
  "rol" varchar(20) NOT NULL,
  "activo" boolean NOT NULL DEFAULT true,
  "fecha_creacion" timestamptz NOT NULL DEFAULT (now())
);

COMMENT ON COLUMN "usuario"."usuario_id" IS 'PK interna';
COMMENT ON COLUMN "usuario"."system_id" IS 'Sistema externo propietario. NULL si es usuario interno';
COMMENT ON COLUMN "usuario"."usuario_ext_id" IS 'ID del usuario en el sistema externo. NULL si es interno';
COMMENT ON COLUMN "usuario"."especialidad" IS 'Especialidad del medico. N/A si no aplica';
COMMENT ON COLUMN "usuario"."rol" IS 'MEDICO | GENETISTA | ADMINISTRADOR | SISTEMA_ANALISIS | READONLY';

-- ── Catálogos simples ────────────────────────────────────────

CREATE TABLE "referido_de" (
  "referido_de_id" smallint PRIMARY KEY,
  "nombre" varchar(100) NOT NULL
);

CREATE TABLE "asistencia_parto" (
  "asistencia_parto_id" smallint PRIMARY KEY,
  "nombre" varchar(100) NOT NULL
);

CREATE TABLE "familiar_catalogo" (
  "familiar_catalogo_id" smallint PRIMARY KEY,
  "nombre" varchar(100) UNIQUE NOT NULL
);

CREATE TABLE "region_anatomica" (
  "region_id" smallserial PRIMARY KEY,
  "nombre" varchar(50) UNIQUE NOT NULL,
  "orden" smallint NOT NULL,
  "activo" boolean NOT NULL DEFAULT true
);

CREATE TABLE "lateralidad" (
  "lateralidad_id" smallserial PRIMARY KEY,
  "codigo" varchar(10) UNIQUE NOT NULL,
  "nombre" varchar(20) UNIQUE NOT NULL,
  "orden" smallint NOT NULL,
  "activo" boolean NOT NULL DEFAULT true
);

CREATE TABLE "parte_del_cuerpo" (
  "parte_id" smallserial PRIMARY KEY,
  "region_id" smallint NOT NULL,
  "nombre" varchar(50) NOT NULL,
  "orden" smallint NOT NULL DEFAULT 0,
  "requiere_lateralidad" boolean NOT NULL DEFAULT true,
  "permite_linea_media" boolean NOT NULL DEFAULT true,
  "activo" boolean NOT NULL DEFAULT true
);

CREATE TABLE "signo_catalogo" (
  "signo_catalogo_id" serial PRIMARY KEY,
  "nombre_normalizado" varchar(200) NOT NULL,
  "categoria" varchar(100),
  "descripcion_medica" text,
  "activo" boolean NOT NULL DEFAULT true,
  "fecha_creacion" timestamptz NOT NULL DEFAULT (now())
);

CREATE TABLE "examen_catalogo" (
  "examen_catalogo_id" serial PRIMARY KEY,
  "nombre_normalizado" varchar(200) NOT NULL,
  "tipo" varchar(50),
  "descripcion" text,
  "activo" boolean NOT NULL DEFAULT true,
  "fecha_creacion" timestamptz NOT NULL DEFAULT (now())
);

COMMENT ON COLUMN "examen_catalogo"."tipo" IS 'GENETICO | IMAGEN | LABORATORIO | FUNCIONAL';

-- ── Integración con sistemas externos ────────────────────────

CREATE TABLE "sistema_externo" (
  "system_id" varchar(50) PRIMARY KEY,
  "nombre" varchar(200) NOT NULL,
  "api_key_hash" char(64) NOT NULL,
  "auth_method" varchar(20) NOT NULL DEFAULT 'API_KEY',
  "oauth_client_id" varchar(100),
  "oauth_issuer" varchar(300),
  "oauth_audience" varchar(100),
  "activo_oauth" boolean NOT NULL DEFAULT false,
  "client_secret_hmac_hash" char(64),
  "webhook_callback_url" varchar(500),
  "activo" boolean NOT NULL DEFAULT true,
  "fecha_registro" timestamptz NOT NULL DEFAULT (now()),
  "fecha_ultimo_acceso" timestamptz
);

COMMENT ON COLUMN "sistema_externo"."api_key_hash" IS 'SHA-256 del API Key. El key en texto plano nunca se almacena.';
COMMENT ON COLUMN "sistema_externo"."client_secret_hmac_hash" IS 'Solo para flujo intermedio con firma HMAC. NULL en flujo básico.';

COMMENT ON COLUMN "sistema_externo"."auth_method" IS 'API_KEY | OAUTH2 | HYBRID';
COMMENT ON COLUMN "sistema_externo"."oauth_client_id" IS 'Client ID registrado en el authorization server OAuth 2.0.';
COMMENT ON COLUMN "sistema_externo"."oauth_issuer" IS 'Issuer esperado del authorization server.';
COMMENT ON COLUMN "sistema_externo"."oauth_audience" IS 'Audience esperada para tokens destinados a CONGENIA.';
COMMENT ON COLUMN "sistema_externo"."activo_oauth" IS 'Permite autenticacion OAuth 2.0 para este sistema externo.';

CREATE TABLE "sistema_externo_permiso" (
  "system_id" varchar(50) NOT NULL,
  "permiso" varchar(100) NOT NULL,
  PRIMARY KEY ("system_id", "permiso")
);

COMMENT ON COLUMN "sistema_externo_permiso"."permiso" IS 'Scope/permiso interno autorizado para el sistema externo.';

CREATE TABLE "sesion_integracion" (
  "sesion_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "system_id" varchar(50) NOT NULL,
  "token_hash" char(64) UNIQUE NOT NULL,
  "patient_payload_enc" jsonb NOT NULL,
  "ficha_id" uuid,
  "estado" varchar(20) NOT NULL DEFAULT 'PENDIENTE',
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT (now()),
  "activated_at" timestamptz,
  "consumed_at" timestamptz,
  "ip_origen_sadc" varchar(45) NOT NULL,
  "nonce" varchar(100) UNIQUE
);

COMMENT ON COLUMN "sesion_integracion"."token_hash" IS 'SHA-256 del token entregado al sistema externo. El token real nunca se persiste.';
COMMENT ON COLUMN "sesion_integracion"."patient_payload_enc" IS 'Payload del sistema externo cifrado en reposo con AES-256-GCM.';
COMMENT ON COLUMN "sesion_integracion"."estado" IS 'PENDIENTE | ACTIVA | CONSUMIDA | EXPIRADA';
COMMENT ON COLUMN "sesion_integracion"."nonce" IS 'Para flujo intermedio anti-replay. NULL en flujo básico.';

CREATE TABLE "nonce_usado" (
  "nonce" varchar(100) PRIMARY KEY,
  "system_id" varchar(50) NOT NULL,
  "usado_en" timestamptz NOT NULL DEFAULT (now()),
  "expires_at" timestamptz NOT NULL
);

COMMENT ON COLUMN "nonce_usado"."expires_at" IS 'Usado por job de limpieza: DELETE FROM nonce_usado WHERE expires_at < NOW()';

-- ── Ficha clínica ────────────────────────────────────────────

CREATE TABLE "ficha_clinica" (
  "ficha_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "paciente_id" uuid NOT NULL,
  "sesion_id" uuid,
  "origen_creacion" varchar(20) NOT NULL DEFAULT 'MANUAL',
  "ultimo_autosave" timestamptz,
  "medico_id" uuid NOT NULL,
  "fecha_consulta" date NOT NULL,
  "diagnosticos_ext_texto" text,
  "estado_ficha" varchar(20) NOT NULL DEFAULT 'BORRADOR',
  "version_ficha" smallint NOT NULL DEFAULT 1,
  "fecha_creacion" timestamptz NOT NULL DEFAULT (now()),
  "fecha_modificacion" timestamptz,
  "creado_por" uuid NOT NULL,
  "modificado_por" uuid
);

COMMENT ON COLUMN "ficha_clinica"."ficha_id" IS 'PK interna, nunca expuesta al sistema externo';
COMMENT ON COLUMN "ficha_clinica"."sesion_id" IS 'FK a sesion_integracion. NULL si creación manual.';
COMMENT ON COLUMN "ficha_clinica"."origen_creacion" IS 'INTEGRACION | MANUAL';
COMMENT ON COLUMN "ficha_clinica"."ultimo_autosave" IS 'NULL si nunca se hizo autosave desde la creación';
COMMENT ON COLUMN "ficha_clinica"."medico_id" IS 'proveniente de sistema externo';
COMMENT ON COLUMN "ficha_clinica"."diagnosticos_ext_texto" IS 'Texto libre proveniente del sistema externo — fuente para el modelo de data oscura';
COMMENT ON COLUMN "ficha_clinica"."estado_ficha" IS 'BORRADOR | COMPLETA | VALIDADA | ARCHIVADA';
COMMENT ON COLUMN "ficha_clinica"."version_ficha" IS 'version de la ficha del sistema interno';

CREATE TABLE "paciente" (
  "paciente_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "system_id" varchar(50),
  "paciente_ext_id" varchar(64),
  "nombre_enc" bytea NOT NULL,
  "nombre_dek_enc" bytea NOT NULL,
  "fecha_creacion_registro" timestamptz NOT NULL DEFAULT (now()),
  "ultima_sincronizacion" timestamptz
);

COMMENT ON COLUMN "paciente"."paciente_id" IS 'id interno';
COMMENT ON COLUMN "paciente"."system_id" IS 'Sistema externo propietario. NULL si es paciente creado manualmente';
COMMENT ON COLUMN "paciente"."paciente_ext_id" IS 'ID del paciente en el sistema externo';
COMMENT ON COLUMN "paciente"."nombre_enc" IS 'Nombre completo encriptado';
COMMENT ON COLUMN "paciente"."nombre_dek_enc" IS 'DEK encriptada con clave maestra del proveedor KMS';
COMMENT ON COLUMN "paciente"."ultima_sincronizacion" IS 'Última vez que se actualizó desde el sistema externo';

CREATE TABLE "datos_adicionales_ficha" (
  "ficha_id" uuid PRIMARY KEY,
  "referido_de_id" smallint,
  "asistencia_parto_id" smallint,
  "familiares_afectos" boolean NOT NULL DEFAULT false,
  "personas_hogar_menores" smallint DEFAULT 0,
  "personas_hogar_adultos" smallint DEFAULT 0,
  "comunidad_afectada" varchar(20)
);

COMMENT ON COLUMN "datos_adicionales_ficha"."comunidad_afectada" IS 'SI | NO | DESCONOCIDO';

CREATE TABLE "familiar_afectado" (
  "familiar_afectado_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "ficha_id" uuid NOT NULL,
  "familiar_catalogo_id" smallint NOT NULL
);

CREATE TABLE "signo_alerta_ficha" (
  "signo_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "ficha_id" uuid NOT NULL,
  "signo_texto_libre" varchar(300) NOT NULL,
  "parte_id" smallint NOT NULL,
  "imagen_bucket_ref" varchar(500),
  "imagen_hash_sha256" char(64),
  "fecha_registro" timestamptz NOT NULL DEFAULT (now()),
  "registrado_por" uuid NOT NULL
);

COMMENT ON COLUMN "signo_alerta_ficha"."signo_texto_libre" IS 'Texto libre ingresado por el médico';

COMMENT ON COLUMN "signo_alerta_ficha"."imagen_hash_sha256" IS 'Integridad del archivo en bucket';

CREATE TABLE "examen_ficha" (
  "examen_ficha_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "ficha_id" uuid NOT NULL,
  "examen_texto_libre" varchar(300) NOT NULL,
  "imagen_bucket_ref" varchar(500),
  "imagen_hash_sha256" char(64),
  "fecha_registro" timestamptz NOT NULL DEFAULT (now()),
  "registrado_por" uuid NOT NULL
);

COMMENT ON COLUMN "examen_ficha"."examen_texto_libre" IS 'Texto libre ingresado por el médico';

CREATE TABLE "resultado_ia" (
  "resultado_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "ficha_id" uuid NOT NULL,
  "ejecutado_por" uuid NOT NULL,
  "modelo_utilizado" varchar(100),
  "version_modelo" varchar(50) NOT NULL,
  "resultado_raw" jsonb NOT NULL,
  "es_resultado_vigente" boolean NOT NULL DEFAULT true,
  "ejecutado_en" timestamptz NOT NULL DEFAULT (now())
);

COMMENT ON COLUMN "resultado_ia"."resultado_raw" IS 'Response completo de la API. Inmutable.';
COMMENT ON COLUMN "resultado_ia"."es_resultado_vigente" IS 'Partial unique index garantiza solo uno TRUE por ficha';

CREATE TABLE "consentimiento" (
  "consentimiento_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "ficha_id" uuid UNIQUE NOT NULL,
  "medico_id" uuid NOT NULL,
  "tipo_firmante" varchar(50) NOT NULL,
  "nombre_firmante" varchar(200),
  "idioma_consentimiento" varchar(20) NOT NULL,
  "aceptacion_terminos" boolean NOT NULL,
  "aceptacion_contacto" boolean,
  "fecha_hora_aceptacion" timestamptz NOT NULL,
  "firma_evidencia_tecnica" jsonb NOT NULL,
  "firma_png_ref" varchar(500),
  "pdf_ref" varchar(500),
  "pdf_hash_sha256" char(64) NOT NULL,
  "firma_png_hash_sha256" char(64) NOT NULL,
  "json_hash_sha256" char(64) NOT NULL,
  "ip_dispositivo" varchar(45) NOT NULL,
  "session_id" varchar(100),
  "estado_consentimiento" varchar(20) NOT NULL DEFAULT 'VIGENTE',
  "anulado_por_id" uuid,
  "fecha_anulacion" timestamptz
);

COMMENT ON COLUMN "consentimiento"."tipo_firmante" IS 'PADRE | MADRE | TUTOR | REPRESENTANTE_LEGAL';
COMMENT ON COLUMN "consentimiento"."idioma_consentimiento" IS 'ESPANOL | QEQCHI | IXIL';
COMMENT ON COLUMN "consentimiento"."aceptacion_terminos" IS 'Siempre TRUE para persistir. Constraint a nivel de app y BD.';
COMMENT ON COLUMN "consentimiento"."fecha_hora_aceptacion" IS 'NTP del servidor. Nunca hora del cliente.';
COMMENT ON COLUMN "consentimiento"."firma_evidencia_tecnica" IS 'Coordenadas (x,y), tiempo y presión del trazo del canvas';
COMMENT ON COLUMN "consentimiento"."json_hash_sha256" IS 'Hash del campo firma_evidencia_tecnica';
COMMENT ON COLUMN "consentimiento"."ip_dispositivo" IS 'IPv4 o IPv6';
COMMENT ON COLUMN "consentimiento"."estado_consentimiento" IS 'VIGENTE | ANULADO';

CREATE TABLE "auditoria_evento" (
  "evento_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "usuario_id" uuid,
  "tipo_evento" varchar(50) NOT NULL,
  "entidad_tipo" varchar(50),
  "entidad_id" uuid,
  "ip_origen" varchar(45) NOT NULL,
  "user_agent" varchar(500),
  "session_id" varchar(100),
  "fecha_hora" timestamptz NOT NULL DEFAULT (now()),
  "resultado" varchar(20) NOT NULL,
  "detalle_json" jsonb,
  "hash_entrada_anterior" char(64),
  "hash_entrada_actual" char(64) NOT NULL
);

COMMENT ON COLUMN "auditoria_evento"."usuario_id" IS 'NULL si el evento es previo a autenticación';
COMMENT ON COLUMN "auditoria_evento"."tipo_evento" IS 'FICHA_CREADA | FICHA_LEIDA | FICHA_MODIFICADA | FICHA_ARCHIVADA | CONSENTIMIENTO_PRESENTADO | CONSENTIMIENTO_FIRMADO | CONSENTIMIENTO_ANULADO | SIGNO_AGREGADO | EXAMEN_AGREGADO | URL_PREFIRMADA_GENERADA | SESION_INICIADA | SESION_CERRADA | ACCESO_DENEGADO | CONSULTA_NLP_EJECUTADA | GESTALTMATCHER_CONSULTADO | SESION_INTEGRACION_CREADA | SESION_INTEGRACION_ACTIVADA';
COMMENT ON COLUMN "auditoria_evento"."entidad_tipo" IS 'Ficha | Consentimiento | Signo | Examen | Sesion';
COMMENT ON COLUMN "auditoria_evento"."entidad_id" IS 'ID del objeto afectado';
COMMENT ON COLUMN "auditoria_evento"."resultado" IS 'EXITOSO | FALLIDO | DENEGADO';
COMMENT ON COLUMN "auditoria_evento"."detalle_json" IS 'Contexto adicional estructurado por tipo de evento';
COMMENT ON COLUMN "auditoria_evento"."hash_entrada_anterior" IS 'SHA-256 del evento_id anterior — cadena de no-repudio';
COMMENT ON COLUMN "auditoria_evento"."hash_entrada_actual" IS 'SHA-256(todos los campos de esta fila + hash_entrada_anterior)';

CREATE TABLE "ficha_cambio" (
  "cambio_id" uuid PRIMARY KEY DEFAULT (gen_random_uuid()),
  "ficha_id" uuid NOT NULL,
  "usuario_id" uuid NOT NULL,
  "campo_modificado" varchar(100),
  "valor_anterior" text,
  "valor_nuevo" text,
  "justificacion" varchar(500),
  "fecha_hora" timestamptz NOT NULL DEFAULT (now()),
  "ip_origen" varchar(45) NOT NULL
);

COMMENT ON COLUMN "ficha_cambio"."valor_anterior" IS 'Encriptado en reposo';
COMMENT ON COLUMN "ficha_cambio"."valor_nuevo" IS 'Encriptado en reposo';


-- ── Foreign Keys ─────────────────────────────────────────────

CREATE UNIQUE INDEX "uq_usuario_system_ext" ON "usuario" ("system_id", "usuario_ext_id");
CREATE UNIQUE INDEX "uq_paciente_system_ext" ON "paciente" ("system_id", "paciente_ext_id");
CREATE UNIQUE INDEX "uq_parte_region_nombre" ON "parte_del_cuerpo" ("region_id", "nombre");

ALTER TABLE "usuario" ADD FOREIGN KEY ("system_id") REFERENCES "sistema_externo" ("system_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "sesion_integracion" ADD FOREIGN KEY ("system_id") REFERENCES "sistema_externo" ("system_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "sistema_externo_permiso" ADD FOREIGN KEY ("system_id") REFERENCES "sistema_externo" ("system_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "sesion_integracion" ADD FOREIGN KEY ("ficha_id") REFERENCES "ficha_clinica" ("ficha_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "nonce_usado" ADD FOREIGN KEY ("system_id") REFERENCES "sistema_externo" ("system_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "paciente" ADD FOREIGN KEY ("system_id") REFERENCES "sistema_externo" ("system_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ficha_clinica" ADD FOREIGN KEY ("paciente_id") REFERENCES "paciente" ("paciente_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "ficha_clinica" ADD FOREIGN KEY ("sesion_id") REFERENCES "sesion_integracion" ("sesion_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "ficha_clinica" ADD FOREIGN KEY ("medico_id") REFERENCES "usuario" ("usuario_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "ficha_clinica" ADD FOREIGN KEY ("creado_por") REFERENCES "usuario" ("usuario_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "ficha_clinica" ADD FOREIGN KEY ("modificado_por") REFERENCES "usuario" ("usuario_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "datos_adicionales_ficha" ADD FOREIGN KEY ("ficha_id") REFERENCES "ficha_clinica" ("ficha_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "datos_adicionales_ficha" ADD FOREIGN KEY ("referido_de_id") REFERENCES "referido_de" ("referido_de_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "datos_adicionales_ficha" ADD FOREIGN KEY ("asistencia_parto_id") REFERENCES "asistencia_parto" ("asistencia_parto_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "familiar_afectado" ADD FOREIGN KEY ("ficha_id") REFERENCES "ficha_clinica" ("ficha_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "familiar_afectado" ADD FOREIGN KEY ("familiar_catalogo_id") REFERENCES "familiar_catalogo" ("familiar_catalogo_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "signo_alerta_ficha" ADD FOREIGN KEY ("ficha_id") REFERENCES "ficha_clinica" ("ficha_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "signo_alerta_ficha" ADD FOREIGN KEY ("parte_id") REFERENCES "parte_del_cuerpo" ("parte_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "signo_alerta_ficha" ADD FOREIGN KEY ("registrado_por") REFERENCES "usuario" ("usuario_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "parte_del_cuerpo" ADD FOREIGN KEY ("region_id") REFERENCES "region_anatomica" ("region_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "examen_ficha" ADD FOREIGN KEY ("ficha_id") REFERENCES "ficha_clinica" ("ficha_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "examen_ficha" ADD FOREIGN KEY ("registrado_por") REFERENCES "usuario" ("usuario_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "resultado_ia" ADD FOREIGN KEY ("ficha_id") REFERENCES "ficha_clinica" ("ficha_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "resultado_ia" ADD FOREIGN KEY ("ejecutado_por") REFERENCES "usuario" ("usuario_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "consentimiento" ADD FOREIGN KEY ("ficha_id") REFERENCES "ficha_clinica" ("ficha_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "consentimiento" ADD FOREIGN KEY ("medico_id") REFERENCES "usuario" ("usuario_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "consentimiento" ADD FOREIGN KEY ("anulado_por_id") REFERENCES "usuario" ("usuario_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "auditoria_evento" ADD FOREIGN KEY ("usuario_id") REFERENCES "usuario" ("usuario_id") DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE "ficha_cambio" ADD FOREIGN KEY ("ficha_id") REFERENCES "ficha_clinica" ("ficha_id") DEFERRABLE INITIALLY IMMEDIATE;
ALTER TABLE "ficha_cambio" ADD FOREIGN KEY ("usuario_id") REFERENCES "usuario" ("usuario_id") DEFERRABLE INITIALLY IMMEDIATE;
