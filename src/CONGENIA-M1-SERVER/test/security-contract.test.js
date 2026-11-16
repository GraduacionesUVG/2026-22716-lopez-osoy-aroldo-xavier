'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { encryptSessionKey, decryptSessionKey } = require('../src/utils/sessionTokenCrypto');
const { validateUpload } = require('../src/services/upload.service');
const { validateUploadReferences } = require('../src/services/patient.service');
const { getSessionTtlSeconds } = require('../src/services/integration.service');
const { getRealmRoles, getGroupClaims } = require('../src/middleware/requireOAuthUser');
const { getClientTenant } = require('../src/middleware/requireOAuthClient');
const { resolveAuthorizedTenant } = require('../src/services/integration.service');
const { userCanAccessTenant } = require('../src/utils/tenant');
const { userWithGroups, grupo, SUPERADMIN } = require('./helpers/userAuth');
const {
  normalizeSearchText,
  patientNameTokenHex,
  tokenizePatientName,
} = require('../src/utils/patientName');

const TEST_KEY = Buffer.alloc(32, 0xa5).toString('hex');

test('session capability encrypts and authenticates the scoped Redis key', () => {
  process.env.APP_ENCRYPTION_KEY = TEST_KEY;
  const redisKey = `patient:session:${'a'.repeat(64)}`;
  const encrypted = encryptSessionKey(redisKey);

  assert.notEqual(encrypted, redisKey);
  assert.equal(decryptSessionKey(encrypted), redisKey);

  const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(() => decryptSessionKey(tampered));
});

test('session TTL is bounded for session capabilities', () => {
  process.env.SESSION_EXPIRY_MINUTES = '60';
  assert.equal(getSessionTtlSeconds(), 3600);

  process.env.SESSION_EXPIRY_MINUTES = '121';
  assert.throws(() => getSessionTtlSeconds(), (err) => err.code === 'SESSION_CONFIG_INVALID');
});

test('interactive access only accepts roles from the signed realm_access claim', () => {
  assert.deepEqual(getRealmRoles({ realm_access: { roles: ['medico', 'offline_access'] } }), [
    'medico',
    'offline_access',
  ]);
  assert.deepEqual(getRealmRoles({ roles: ['medico'] }), []);
  assert.deepEqual(getRealmRoles({ realm_access: { roles: 'medico' } }), []);
});

test('interactive access reads group paths only from the signed groups claim', () => {
  assert.deepEqual(getGroupClaims({ groups: ['/instituciones/23/medicos', '/instituciones/23/medicos'] }), [
    '/instituciones/23/medicos',
  ]);
  assert.deepEqual(getGroupClaims({ groups: '/instituciones/23/medicos' }), []);
  assert.deepEqual(getGroupClaims({ groups: [1, null, '/superadministradores'] }), ['/superadministradores']);
  // El claim plano `tenants` ya no da acceso.
  assert.deepEqual(getGroupClaims({ tenants: ['23'] }), []);
});

test('only superadmin bypasses tenant membership', () => {
  assert.equal(userCanAccessTenant(userWithGroups([grupo(23, 'revisores')]), 254), false);
  assert.equal(userCanAccessTenant(userWithGroups([grupo(23, 'revisores')]), 23), true);
  assert.equal(userCanAccessTenant(userWithGroups([SUPERADMIN]), 254), true);
  assert.equal(userCanAccessTenant(userWithGroups([]), 23), false);
  // Un usuario armado sin el middleware (sin access) no tiene acceso.
  assert.equal(userCanAccessTenant({ roles: ['congenia-superadmin'], tenants: ['23'] }, 23), false);
});

test('integration tenant comes from the OAuth client and cannot be overridden', () => {
  assert.equal(getClientTenant({ tenant_id: '254' }), '254');
  assert.equal(getClientTenant({ tenant_id: 'invalid' }), null);
  assert.equal(resolveAuthorizedTenant({ tenantId: '254' }, '254'), 254);
  assert.equal(resolveAuthorizedTenant({ tenantId: '254' }), 254);
  assert.throws(
    () => resolveAuthorizedTenant({ tenantId: '254' }, '23'),
    (err) => err.code === 'TENANT_FORBIDDEN' && err.status === 403
  );
  assert.throws(
    () => resolveAuthorizedTenant({}, '254'),
    (err) => err.code === 'TENANT_CLAIM_REQUIRED' && err.status === 403
  );
});

test('patient name search tokens are accent and case insensitive full words', () => {
  process.env.PATIENT_NAME_TOKEN_HMAC_KEY = TEST_KEY;

  assert.equal(normalizeSearchText('María   José López'), 'maria jose lopez');
  assert.deepEqual(tokenizePatientName('María José maria'), ['maria', 'jose']);
  assert.equal(patientNameTokenHex('maria'), patientNameTokenHex('maria'));
  assert.notEqual(patientNameTokenHex('maria'), patientNameTokenHex('mar'));
});

test('upload validation binds MIME types to category and enforces size', () => {
  process.env.S3_UPLOAD_MAX_BYTES = '1024';

  assert.deepEqual(
    validateUpload({ category: 'profile', contentType: 'image/png', sizeBytes: 512 }),
    { contentType: 'image/png', extension: 'png' }
  );
  assert.deepEqual(
    validateUpload({ category: 'exam', contentType: 'application/pdf', sizeBytes: 1024 }),
    { contentType: 'application/pdf', extension: 'pdf' }
  );
  assert.throws(
    () => validateUpload({ category: 'profile', contentType: 'application/pdf', sizeBytes: 10 }),
    (err) => err.code === 'INVALID_CONTENT_TYPE'
  );
  assert.throws(
    () => validateUpload({ category: 'exam', contentType: 'image/png', sizeBytes: 1025 }),
    (err) => err.code === 'INVALID_FILE_SIZE'
  );
});

test('patient payload accepts only object keys issued to the same session and category', () => {
  const profileKey = 'test/tenants/sadc/patients/patient/profile/image.png';
  const examKey = 'test/tenants/sadc/patients/patient/exams/result.pdf';
  const session = {
    uploads: [
      { objectKey: profileKey, category: 'profile' },
      { objectKey: examKey, category: 'exam' },
    ],
  };

  assert.doesNotThrow(() => validateUploadReferences({
    warningSigns: [{ imageResourceId: profileKey }],
    examDiagnoses: [{ examResourceId: examKey }],
  }, session));

  assert.throws(
    () => validateUploadReferences({
      warningSigns: [{ imageResourceId: examKey }],
      examDiagnoses: [],
    }, session),
    (err) => err.code === 'INVALID_UPLOAD_REFERENCE'
  );

  // Redis Lua representa una lista vacia como objeto al reserializar la sesion.
  assert.doesNotThrow(() => validateUploadReferences({
    warningSigns: [],
    examDiagnoses: [],
  }, { uploads: {} }));
});
