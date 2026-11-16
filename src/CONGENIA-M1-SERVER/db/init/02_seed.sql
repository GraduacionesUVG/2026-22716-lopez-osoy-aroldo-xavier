-- =============================================================
-- CONGENIA — Seed de catálogos
-- =============================================================

-- ── referido_de ──────────────────────────────────────────────
INSERT INTO referido_de (referido_de_id, nombre) VALUES
  (1,  'Hospital público'),
  (2,  'Clínica privada'),
  (3,  'Centro de salud'),
  (4,  'Médico general'),
  (5,  'Pediatra'),
  (6,  'Neurólogo/a'),
  (7,  'Genetista'),
  (8,  'ONG / Fundación'),
  (9,  'Iniciativa propia'),
  (10, 'Otro');

-- ── familiar_catalogo ────────────────────────────────────────
INSERT INTO familiar_catalogo (familiar_catalogo_id, nombre) VALUES
  (1,  'Padre'),
  (2,  'Madre'),
  (3,  'Hermano'),
  (4,  'Hermana'),
  (5,  'Abuelo paterno'),
  (6,  'Abuela paterna'),
  (7,  'Abuelo materno'),
  (8,  'Abuela materna'),
  (9,  'Tío paterno'),
  (10, 'Tía paterna'),
  (11, 'Tío materno'),
  (12, 'Tía materna'),
  (13, 'Primo / Prima'),
  (14, 'Hijo / Hija');

-- ── asistencia_parto ─────────────────────────────────────────
INSERT INTO asistencia_parto (asistencia_parto_id, nombre) VALUES
  (1, 'Médico/a'),
  (2, 'Enfermera/o'),
  (3, 'Partera / Comadrona'),
  (4, 'Familiar'),
  (5, 'Solo/a'),
  (6, 'Otro');

-- ── region_anatomica ─────────────────────────────────────────
INSERT INTO region_anatomica (nombre, orden) VALUES
  ('Cabeza y cuello',         1),
  ('Cara',                    2),
  ('Tronco',                  3),
  ('Extremidades superiores', 4),
  ('Extremidades inferiores', 5),
  ('Piel',                    6),
  ('Sistema nervioso',        7),
  ('Órganos internos',        8);

-- ── lateralidad ───────────────────────────────────────────────
INSERT INTO lateralidad (codigo, nombre, orden) VALUES
  ('NA',    'No aplica',   1),
  ('DER',   'Derecha',     2),
  ('IZQ',   'Izquierda',   3),
  ('BILAT', 'Bilateral',   4),
  ('MID',   'Línea media', 5);

-- ── parte_del_cuerpo ─────────────────────────────────────────
-- region_id ref: 1=Cabeza y cuello, 2=Cara, 3=Tronco,
--               4=Ext. superiores, 5=Ext. inferiores,
--               6=Piel, 7=Sistema nervioso, 8=Órganos internos
INSERT INTO parte_del_cuerpo (region_id, nombre, orden, requiere_lateralidad, permite_linea_media) VALUES
  (1, 'Cabeza',                      1,  false, false),
  (1, 'Orejas',                      2,  true,  false),
  (1, 'Cuello',                      3,  false, false),
  (2, 'Cara',                        1,  false, false),
  (2, 'Ojos',                        2,  true,  false),
  (2, 'Nariz',                       3,  false, true),
  (2, 'Boca / Labios',               4,  false, true),
  (3, 'Tórax',                       1,  false, true),
  (3, 'Abdomen',                     2,  false, true),
  (3, 'Espalda',                     3,  false, true),
  (3, 'Genitales',                   4,  false, false),
  (4, 'Brazo',                       1,  true,  false),
  (4, 'Manos',                       2,  true,  false),
  (4, 'Dedos de mano',               3,  true,  false),
  (5, 'Pierna',                      1,  true,  false),
  (5, 'Pies',                        2,  true,  false),
  (5, 'Dedos de pie',                3,  true,  false),
  (6, 'Piel (general)',              1,  false, false),
  (7, 'Sistema nervioso central',    1,  false, false),
  (7, 'Sistema nervioso periférico', 2,  true,  false),
  (8, 'Corazón',                     1,  false, false),
  (8, 'Pulmones',                    2,  true,  false),
  (8, 'Hígado',                      3,  false, false),
  (8, 'Riñones',                     4,  true,  false);

-- ── sistema_externo (sandbox) ────────────────────────────────
-- api_key_hash = SHA-256("sandbox-api-key-dev-2026")
INSERT INTO sistema_externo (system_id, nombre, api_key_hash, activo)
VALUES (
  'SADC-COBAN-SANDBOX',
  'SADC Cobán — Entorno Sandbox',
  repeat('0', 64),
  true
) ON CONFLICT (system_id) DO NOTHING;

-- sadc = client_id real del token OAuth de Keycloak
INSERT INTO sistema_externo (system_id, nombre, api_key_hash, auth_method, oauth_client_id, oauth_issuer, activo_oauth, activo)
VALUES (
  'sadc',
  'SADC — Cliente OAuth Keycloak',
  repeat('0', 64),
  'OAUTH2',
  'sadc',
  'http://keycloak:8080/realms/congenia',
  true,
  true
) ON CONFLICT (system_id) DO NOTHING;

-- ── usuario médico de prueba ──────────────────────────────────
INSERT INTO usuario (usuario_ext_id, nombre, email, rol)
VALUES ('MEDICO-EXT-001', 'Dr. Roberto Ajú', 'r.aju@hospitalcoban.gt', 'MEDICO');

-- OAuth 2.0 sandbox metadata for the SADC integration client.
UPDATE sistema_externo
SET auth_method = 'HYBRID',
    oauth_client_id = 'sadc',
    oauth_issuer = 'http://keycloak:8080/realms/congenia',
    oauth_audience = 'congenia-api',
    activo_oauth = true
WHERE system_id = 'SADC-COBAN-SANDBOX';

INSERT INTO sistema_externo_permiso (system_id, permiso)
VALUES ('SADC-COBAN-SANDBOX', 'congenia.sessions:init')
ON CONFLICT (system_id, permiso) DO NOTHING;

INSERT INTO sistema_externo_permiso (system_id, permiso)
VALUES ('sadc', 'congenia.sessions:init')
ON CONFLICT (system_id, permiso) DO NOTHING;

-- Cliente publico usado por medicos autenticados en el flujo manual.
INSERT INTO sistema_externo (
  system_id, nombre, api_key_hash, auth_method, oauth_client_id,
  oauth_issuer, oauth_audience, activo_oauth, activo
)
VALUES (
  'congenia-web',
  'CONGENIA — Aplicacion web',
  'fa0e5c989f0e417c02fa495aef6dcddfce6a966d15285101c639998d464a358a',
  'OAUTH2',
  'congenia-web',
  'http://keycloak:8080/realms/congenia',
  'congenia-api',
  true,
  true
) ON CONFLICT (system_id) DO UPDATE SET
  oauth_client_id = EXCLUDED.oauth_client_id,
  oauth_audience = EXCLUDED.oauth_audience,
  activo_oauth = true,
  activo = true;
