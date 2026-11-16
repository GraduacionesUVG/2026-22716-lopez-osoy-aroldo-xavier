'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/config/db');

// patient.service desestructura sus dependencias al cargarse: se reemplazan
// antes de requerirlo. Cada archivo de prueba corre en su propio proceso.
const patientSession = require('../src/services/patient-session.service');
const uploadService = require('../src/services/upload.service');
const rabbitmq = require('../src/config/rabbitmq');
const auditService = require('../src/services/audit.service');
const patientName = require('../src/utils/patientName');
const consentSignature = require('../src/services/consent-signature.service');

let sessionPayload;
const auditEvents = [];
const sessionCalls = [];

patientSession.acquireSubmission = async () => ({ payload: sessionPayload });
patientSession.completeSubmission = async () => { sessionCalls.push('complete'); };
patientSession.rollbackSubmission = async () => { sessionCalls.push('rollback'); };
uploadService.verifyUploadedObjects = async () => {};
rabbitmq.publishToQueue = async () => {};
auditService.recordAuditEvent = async (_audit, event) => { auditEvents.push(event); };
auditService.sessionAuditActor = () => ({ sub: 'medico-subject', username: 'medico.prueba', roles: null });
patientName.encryptPatientName = () => ({ nombreEnc: Buffer.from('x'), nombreDekEnc: Buffer.from('y') });
patientName.encryptText = () => ({ textEnc: Buffer.from('x'), dekEnc: Buffer.from('y') });
patientName.tokenizePatientName = () => [];
patientName.patientNameToken = () => Buffer.from('t');
consentSignature.putSignaturePng = async () => {};
consentSignature.deleteSignaturePng = async () => {};

const { registerFicha } = require('../src/services/patient.service');

const FICHA_ID = '11111111-1111-4111-8111-111111111111';
const MEDICO_ID = '22222222-2222-4222-8222-222222222222';

function payload({ provisional }) {
  return {
    sessionId: '33333333-3333-4333-8333-333333333333',
    fichaId: FICHA_ID,
    systemId: 'congenia-web',
    origenCreacion: 'MANUAL',
    paciente: {
      patientId: '44444444-4444-4444-8444-444444444444',
      externalID: provisional ? 'TMP-23-12345678' : '12345678',
      historiaClinica: provisional ? 'TMP-23-12345678' : '12345678',
      tenantId: '23',
      nombre: 'Paciente Sintetico',
    },
    consulta: { fechaConsulta: '2026-10-10', diagnosticoTexto: '' },
    medico: { medicoId: MEDICO_ID, externalId: 'medico-subject', nombre: 'Medico Prueba', especialidad: 'Genetica' },
    provisional: provisional ? { historiaClinicaReferida: '12345678' } : null,
    uploads: [],
  };
}

const body = {
  referralSourceId: 1,
  sexId: 1,
  affectedRelatives: false,
  affectedUnderageRelatives: 0,
  affectedAdultRelatives: 0,
  affectedCommunityMembers: 'NO',
  consent: {
    tipoFirmante: 'PACIENTE',
    nombreFirmante: 'Firmante Sintetico',
    idiomaConsentimiento: 'es',
    aceptacionTerminos: true,
    aceptacionContacto: false,
    firmaEvidenciaTecnica: { trazo: [] },
    firmaPng: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  },
};

/** Cliente falso: registra cada SQL y responde lo minimo que el servicio lee. */
function fakeClient({ vigente = false } = {}) {
  const queries = [];
  return {
    queries,
    release() {},
    async query(sql, params) {
      queries.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (/FROM sexo_catalogo/.test(sql)) return { rows: [{ sexo_id: 1 }] };
      if (/FROM ficha_clinica WHERE id_tenant/.test(sql.replace(/\s+/g, ' '))) {
        return { rows: vigente ? [{ '?column?': 1 }] : [] };
      }
      if (/INSERT INTO paciente /.test(sql)) return { rows: [{ paciente_id: params[0] }] };
      if (/INSERT INTO usuario/.test(sql)) return { rows: [{ usuario_id: MEDICO_ID }] };
      if (/next_version/.test(sql)) return { rows: [{ next_version: 1 }] };
      if (/INSERT INTO consentimiento/.test(sql)) return { rows: [{ consentimiento_id: 'c1' }] };
      return { rows: [] };
    },
  };
}

async function register(client) {
  const originalConnect = db.connect;
  db.connect = async () => client;
  try {
    return await registerFicha({
      redisSessionKey: 'patient:session:test',
      body,
      ip: '127.0.0.1',
      audit: { requestId: 'r1' },
    });
  } finally {
    db.connect = originalConnect;
  }
}

test('provisional ficha is registered with its ficha_provisional row and audit event', async () => {
  sessionPayload = payload({ provisional: true });
  auditEvents.length = 0;
  const client = fakeClient();

  const result = await register(client);

  assert.equal(result.historiaClinica, 'TMP-23-12345678');
  const sqls = client.queries.map((q) => q.sql);
  const fichaIndex = sqls.findIndex((sql) => sql.startsWith('INSERT INTO ficha_clinica'));
  const provisionalIndex = sqls.findIndex((sql) => sql.startsWith('INSERT INTO ficha_provisional'));
  assert.ok(fichaIndex >= 0 && provisionalIndex > fichaIndex, 'ficha_provisional goes after its ficha');
  assert.deepEqual(client.queries[provisionalIndex].params, [
    FICHA_ID, 23, '12345678', 'TMP-23-12345678', MEDICO_ID,
  ]);
  // El trabajo del PDF entra en la bandeja dentro de la transaccion; despues
  // del COMMIT solo se marca como publicado.
  const commitIndex = sqls.lastIndexOf('COMMIT');
  const outboxIndex = sqls.findIndex((sql) => sql.startsWith('INSERT INTO pdf_outbox'));
  assert.ok(outboxIndex >= 0 && commitIndex > outboxIndex, 'pdf_outbox row is written before COMMIT');
  assert.ok(sqls.slice(commitIndex + 1).every((sql) => sql.startsWith('UPDATE pdf_outbox')));

  const tipos = auditEvents.map((event) => event.tipoEvento);
  assert.deepEqual(tipos, ['FICHA_CREADA', 'CONSENTIMIENTO_FIRMADO', 'FICHA_PROVISIONAL_CREADA']);
  assert.equal(auditEvents[0].detalle.provisional, true);
  // Sin HC ni nombre en el detalle del evento provisional.
  assert.deepEqual(auditEvents[2].detalle, { origenCreacion: 'MANUAL' });
});

test('normal ficha does not write a ficha_provisional row', async () => {
  sessionPayload = payload({ provisional: false });
  auditEvents.length = 0;
  const client = fakeClient();

  await register(client);

  assert.equal(client.queries.some((q) => q.sql.startsWith('INSERT INTO ficha_provisional')), false);
  assert.deepEqual(auditEvents.map((event) => event.tipoEvento), ['FICHA_CREADA', 'CONSENTIMIENTO_FIRMADO']);
  assert.equal(auditEvents[0].detalle.provisional, false);
});

test('a history with a current ficha is refused with 409 and nothing is inserted', async () => {
  sessionPayload = payload({ provisional: true });
  auditEvents.length = 0;
  sessionCalls.length = 0;
  const client = fakeClient({ vigente: true });

  await assert.rejects(register(client), { status: 409, code: 'FICHA_VIGENTE_EXISTE' });

  const sqls = client.queries.map((q) => q.sql);
  assert.equal(sqls.some((sql) => sql.startsWith('INSERT')), false);
  assert.equal(sqls.at(-1), 'ROLLBACK');
  assert.deepEqual(sessionCalls, ['rollback']);
  assert.equal(auditEvents.length, 0);
});

test('a concurrent duplicate caught by the unique index is also a 409', async () => {
  sessionPayload = payload({ provisional: false });
  const client = fakeClient();
  const originalQuery = client.query;
  client.query = async (sql, params) => {
    if (/INSERT INTO ficha_clinica/.test(sql)) {
      throw Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'ux_ficha_vigente_por_hc' });
    }
    return originalQuery(sql, params);
  };

  await assert.rejects(register(client), { status: 409, code: 'FICHA_VIGENTE_EXISTE' });
});
