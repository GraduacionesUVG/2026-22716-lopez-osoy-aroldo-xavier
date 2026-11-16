'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const db = require('../src/config/db');

// patient.service desestructura sus dependencias al cargarse: se reemplazan
// antes de requerirlo. Cada archivo de prueba corre en su propio proceso.
const patientSession = require('../src/services/patient-session.service');
const uploadService = require('../src/services/upload.service');
const rabbitmq = require('../src/config/rabbitmq');
const auditService = require('../src/services/audit.service');
const patientName = require('../src/utils/patientName');
const consentSignature = require('../src/services/consent-signature.service');
const { canonicalJson } = require('../src/utils/canonicalJson');

const {
  parseSignaturePng,
  resolveSignatureInput,
  sanitizeEvidence,
  buildSignatureKey,
} = consentSignature;

// PNG sintetico de 1x1.
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG_DATA_URL = `data:image/png;base64,${PNG_BASE64}`;
const PNG_SHA256 = crypto.createHash('sha256').update(Buffer.from(PNG_BASE64, 'base64')).digest('hex');

const storageCalls = [];
const auditEvents = [];
let sessionPayload;

patientSession.acquireSubmission = async () => ({ payload: sessionPayload });
patientSession.completeSubmission = async () => {};
patientSession.rollbackSubmission = async () => {};
uploadService.verifyUploadedObjects = async () => {};
rabbitmq.publishToQueue = async () => {};
auditService.recordAuditEvent = async (_audit, event) => { auditEvents.push(event); };
auditService.sessionAuditActor = () => ({ sub: 'medico-subject', username: 'medico.prueba', roles: null });
patientName.encryptPatientName = () => ({ nombreEnc: Buffer.from('x'), nombreDekEnc: Buffer.from('y') });
patientName.encryptText = () => ({ textEnc: Buffer.from('x'), dekEnc: Buffer.from('y') });
patientName.tokenizePatientName = () => [];
patientName.patientNameToken = () => Buffer.from('t');
consentSignature.putSignaturePng = async (args) => { storageCalls.push({ op: 'put', ...args }); };
consentSignature.deleteSignaturePng = async (key) => { storageCalls.push({ op: 'delete', key }); };

const { registerFicha } = require('../src/services/patient.service');

const FICHA_ID = '11111111-1111-4111-8111-111111111111';
const MEDICO_ID = '22222222-2222-4222-8222-222222222222';
const PACIENTE_ID = '44444444-4444-4444-8444-444444444444';

// ── Unidad ─────────────────────────────────────────────────────────────────

test('parseSignaturePng accepts a PNG data URL and hashes its bytes', () => {
  const { buffer, sha256 } = parseSignaturePng(PNG_DATA_URL);
  assert.equal(buffer.length, Buffer.from(PNG_BASE64, 'base64').length);
  assert.equal(sha256, PNG_SHA256);
  assert.equal(parseSignaturePng(PNG_BASE64).sha256, PNG_SHA256, 'bare base64 is accepted too');
});

test('parseSignaturePng rejects missing, non-base64, non-PNG and oversized input', () => {
  const invalid = { status: 400, code: 'INVALID_SIGNATURE_PNG' };
  assert.throws(() => parseSignaturePng(null), invalid);
  assert.throws(() => parseSignaturePng('data:image/png;base64,***'), invalid);
  assert.throws(() => parseSignaturePng(Buffer.from('GIF89a-not-a-png').toString('base64')), invalid);

  process.env.CONSENT_SIGNATURE_MAX_BYTES = '16';
  try {
    assert.throws(() => parseSignaturePng(PNG_DATA_URL), invalid);
  } finally {
    delete process.env.CONSENT_SIGNATURE_MAX_BYTES;
  }
});

test('resolveSignatureInput prefers firmaPng and falls back to the legacy firmaBase64', () => {
  assert.equal(resolveSignatureInput({ firmaPng: 'a', firmaEvidenciaTecnica: { firmaBase64: 'b' } }), 'a');
  assert.equal(resolveSignatureInput({ firmaEvidenciaTecnica: { firmaBase64: 'b' } }), 'b');
  assert.equal(resolveSignatureInput({ firmaEvidenciaTecnica: {} }), null);
});

test('sanitizeEvidence keeps only allowed metadata and never the image or the stroke', () => {
  const clean = sanitizeEvidence({
    timestamp: '2026-10-13T00:00:00.000Z',
    userAgent: 'x'.repeat(900),
    source: 'canvas-pad',
    canvasHash: 'abc',
    version_texto_legal: 'CONSENTIMIENTO_V1',
    firmaBase64: PNG_DATA_URL,
    strokes: [{ x: 1, y: 2, t: 3 }],
    declaraciones: [{ titulo: 'T', descripcion: 'D', aceptada: true, obligatoria: 'si', extra: 1 }, 'basura'],
    otroCampo: 'x',
  });

  assert.equal(clean.firmaBase64, undefined);
  assert.equal(clean.strokes, undefined);
  assert.equal(clean.otroCampo, undefined);
  assert.equal(clean.userAgent.length, 500);
  assert.deepEqual(clean.declaraciones, [{ titulo: 'T', descripcion: 'D', aceptada: true, obligatoria: false }]);
});

test('canonicalJson does not depend on key order', () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [1, { f: 2, e: 3 }], c: null } }), '{"a":{"c":null,"d":[1,{"e":3,"f":2}]},"b":1}');
  assert.equal(canonicalJson({ a: 1, b: 2 }), canonicalJson({ b: 2, a: 1 }));
});

test('buildSignatureKey places the signature next to the consent PDF', () => {
  const key = buildSignatureKey({ systemId: 'Congenia-Web', pacienteId: PACIENTE_ID, consentimientoId: 'c1' });
  assert.match(key, new RegExp(`^[a-z0-9_-]+/tenants/congenia-web/patients/${PACIENTE_ID}/consents/c1-firma\\.png$`));
  assert.throws(() => buildSignatureKey({ systemId: '../x', pacienteId: PACIENTE_ID, consentimientoId: 'c1' }));
});

// ── Alta de ficha ──────────────────────────────────────────────────────────

function session() {
  return {
    sessionId: '33333333-3333-4333-8333-333333333333',
    fichaId: FICHA_ID,
    systemId: 'congenia-web',
    origenCreacion: 'MANUAL',
    paciente: {
      patientId: PACIENTE_ID,
      externalID: '12345678',
      historiaClinica: '12345678',
      tenantId: '23',
      nombre: 'Paciente Sintetico',
    },
    consulta: { fechaConsulta: '2026-10-10', diagnosticoTexto: '' },
    medico: { medicoId: MEDICO_ID, externalId: 'medico-subject', nombre: 'Medico Prueba', especialidad: 'Genetica' },
    provisional: null,
    uploads: [],
  };
}

function body(consentOverrides) {
  return {
    referralSourceId: 1,
    sexId: 1,
    affectedRelatives: false,
    affectedUnderageRelatives: 0,
    affectedAdultRelatives: 0,
    affectedCommunityMembers: 'NO',
    consent: {
      tipoFirmante: 'MADRE',
      nombreFirmante: 'Firmante Sintetico',
      idiomaConsentimiento: 'ESPANOL',
      aceptacionTerminos: true,
      aceptacionContacto: false,
      ...consentOverrides,
    },
  };
}

function fakeClient({ failCommit = false } = {}) {
  const queries = [];
  return {
    queries,
    release() {},
    async query(sql, params) {
      const flat = sql.replace(/\s+/g, ' ').trim();
      queries.push({ sql: flat, params });
      if (flat === 'COMMIT' && failCommit) throw new Error('commit failed');
      if (/FROM sexo_catalogo/.test(flat)) return { rows: [{ sexo_id: 1 }] };
      if (/INSERT INTO paciente /.test(flat)) return { rows: [{ paciente_id: params[0] }] };
      if (/INSERT INTO usuario/.test(flat)) return { rows: [{ usuario_id: MEDICO_ID }] };
      if (/next_version/.test(flat)) return { rows: [{ next_version: 1 }] };
      return { rows: [] };
    },
  };
}

async function register(client, requestBody) {
  const originalConnect = db.connect;
  db.connect = async () => client;
  try {
    return await registerFicha({
      redisSessionKey: 'patient:session:test',
      body: requestBody,
      ip: '127.0.0.1',
      audit: { requestId: 'r1' },
    });
  } finally {
    db.connect = originalConnect;
  }
}

function consentInsert(client) {
  const insert = client.queries.find((q) => q.sql.startsWith('INSERT INTO consentimiento'));
  assert.ok(insert, 'consentimiento is inserted');
  const columns = insert.sql.match(/\(([^)]*)\)/)[1].split(',').map((c) => c.trim());
  return Object.fromEntries(columns.map((column, i) => [column, insert.params[i]]));
}

test('legacy payload: the image goes to S3 and never into the consentimiento row', async () => {
  sessionPayload = session();
  storageCalls.length = 0;
  auditEvents.length = 0;
  const client = fakeClient();

  const result = await register(client, body({
    firmaEvidenciaTecnica: { source: 'canvas-pad', canvasHash: 'abc', firmaBase64: PNG_DATA_URL },
  }));

  const row = consentInsert(client);
  assert.equal(row.consentimiento_id, result.consentimientoId);
  assert.equal(row.firma_png_hash_sha256, PNG_SHA256);
  assert.equal(row.firma_png_ref, buildSignatureKey({
    systemId: 'congenia-web', pacienteId: PACIENTE_ID, consentimientoId: result.consentimientoId,
  }));
  assert.equal(row.firma_evidencia_tecnica.includes('firmaBase64'), false);
  assert.equal(row.firma_evidencia_tecnica.includes(PNG_BASE64.slice(0, 20)), false);

  // Hash reproducible desde la evidencia guardada.
  const stored = JSON.parse(row.firma_evidencia_tecnica);
  assert.equal(row.json_hash_sha256, crypto.createHash('sha256').update(canonicalJson(stored)).digest('hex'));

  // La subida ocurre antes del COMMIT y con la misma clave de la fila.
  assert.deepEqual(storageCalls.map((c) => c.op), ['put']);
  assert.equal(storageCalls[0].key, row.firma_png_ref);
  assert.equal(storageCalls[0].sha256, PNG_SHA256);

  const firmado = auditEvents.find((e) => e.tipoEvento === 'CONSENTIMIENTO_FIRMADO');
  assert.equal(firmado.detalle.firmaPngHashSha256, PNG_SHA256);
});

test('current payload: firmaPng is read outside the technical evidence', async () => {
  sessionPayload = session();
  storageCalls.length = 0;
  const client = fakeClient();

  await register(client, body({ firmaEvidenciaTecnica: { source: 'canvas-pad' }, firmaPng: PNG_DATA_URL }));

  assert.equal(consentInsert(client).firma_png_hash_sha256, PNG_SHA256);
  assert.equal(storageCalls[0].op, 'put');
});

test('a failed COMMIT removes the uploaded signature', async () => {
  sessionPayload = session();
  storageCalls.length = 0;
  const client = fakeClient({ failCommit: true });

  await assert.rejects(register(client, body({ firmaEvidenciaTecnica: {}, firmaPng: PNG_DATA_URL })));

  assert.deepEqual(storageCalls.map((c) => c.op), ['put', 'delete']);
  assert.equal(storageCalls[1].key, storageCalls[0].key);
});

test('an invalid PNG is rejected before touching the database or S3', async () => {
  sessionPayload = session();
  storageCalls.length = 0;
  const client = fakeClient();

  await assert.rejects(register(client, body({ firmaEvidenciaTecnica: {}, firmaPng: 'no-es-png' })), {
    code: 'INVALID_SIGNATURE_PNG',
  });

  assert.equal(storageCalls.length, 0);
  assert.equal(client.queries.length, 0);
});
