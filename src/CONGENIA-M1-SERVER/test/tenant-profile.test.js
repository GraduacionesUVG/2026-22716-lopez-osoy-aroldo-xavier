'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/config/db');
const { getMe } = require('../src/services/ficha.service');
const { userWithGroups, grupo, SUPERADMIN } = require('./helpers/userAuth');

async function withCatalog(rows, fn) {
  const originalQuery = db.query;
  const calls = [];
  db.query = async (_sql, params) => {
    calls.push(params);
    return { rows };
  };
  try {
    return await fn(calls);
  } finally {
    db.query = originalQuery;
  }
}

test('superadmin receives every active institution with every permission', async () => {
  await withCatalog([
    { id_tenant: 23, nombre: 'Institucion 23' },
    { id_tenant: 254, nombre: 'SADC' },
  ], async (calls) => {
    const profile = await getMe(userWithGroups([SUPERADMIN], { roles: ['congenia-superadmin'] }));

    assert.equal(calls[0], undefined, 'reads the whole active catalog');
    assert.deepEqual(profile.tenants, ['23', '254']);
    assert.deepEqual(profile.tenantOptions.map((option) => option.label), ['23 - Institucion 23', '254 - SADC']);
    assert.equal(profile.roleLabel, 'Superadministrador');
    assert.deepEqual(profile.globalPermissions, ['catalogos.administrar']);
    assert.ok(profile.permissions.includes('catalogos.administrar'));
    assert.deepEqual(profile.access.map((entry) => entry.tenantId), [23, 254]);
    assert.deepEqual(profile.access[0].permissions,
      ['dashboard', 'fichas.crear', 'adendas.revisar', 'cie10.corregir', 'reporteria']);
    assert.deepEqual(profile.roles, ['congenia-superadmin'], 'roles are kept for compatibility');
  });
});

test('permissions are reported per institution and as a flat union', async () => {
  await withCatalog([
    { id_tenant: 23, nombre: 'Institucion 23' },
    { id_tenant: 254, nombre: 'SADC' },
  ], async (calls) => {
    const profile = await getMe(userWithGroups([grupo(254, 'medicos'), grupo(23, 'coordinadores')]));

    assert.deepEqual(calls[0], [[23, 254]]);
    assert.deepEqual(profile.access, [
      {
        tenantId: 23,
        name: 'Institucion 23',
        label: '23 - Institucion 23',
        funciones: ['coordinadores'],
        permissions: ['dashboard', 'fichas.crear', 'adendas.revisar', 'reporteria'],
      },
      {
        tenantId: 254,
        name: 'SADC',
        label: '254 - SADC',
        funciones: ['medicos'],
        permissions: ['dashboard', 'fichas.crear'],
      },
    ]);
    assert.deepEqual(profile.permissions, ['dashboard', 'fichas.crear', 'adendas.revisar', 'reporteria']);
    assert.deepEqual(profile.globalPermissions, []);
    assert.equal(profile.roleLabel, 'Coordinador', 'the highest-priority function names the user');
  });
});

test('an inactive institution is not exposed even if the token has it', async () => {
  await withCatalog([{ id_tenant: 23, nombre: 'Institucion 23' }], async () => {
    const profile = await getMe(userWithGroups([grupo(23, 'medicos'), grupo(254, 'medicos')]));

    assert.deepEqual(profile.tenants, ['23']);
    assert.deepEqual(profile.tenantOptions, [{ id: '23', name: 'Institucion 23', label: '23 - Institucion 23' }]);
    assert.deepEqual(profile.access.map((entry) => entry.tenantId), [23]);
  });
});

test('a user without valid groups gets an empty profile instead of an error', async () => {
  await withCatalog([], async (calls) => {
    const profile = await getMe(userWithGroups(['/SADC-Congenia', '/medicos', '/instituciones/254']));

    assert.equal(calls.length, 0, 'no catalog query without institutions');
    assert.deepEqual(profile.access, []);
    assert.deepEqual(profile.permissions, []);
    assert.deepEqual(profile.tenants, []);
    assert.equal(profile.roleLabel, null);
  });
});
