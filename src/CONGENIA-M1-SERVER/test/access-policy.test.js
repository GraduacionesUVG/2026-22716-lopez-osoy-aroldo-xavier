'use strict';

// Politica de permisos (config/access-policy.yaml): validacion al arrancar y
// calculo de permisos por institucion desde las rutas de grupo del token.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  accessFromGroups,
  can,
  hasPermissionAnywhere,
  isExempt,
  isSuperAdmin,
  parsePolicy,
  roleLabelOf,
  tenantScope,
} = require('../src/utils/accessPolicy');
const { userWithGroups, grupo, SUPERADMIN } = require('./helpers/userAuth');

const YAML_REAL = fs.readFileSync(path.join(__dirname, '..', 'config', 'access-policy.yaml'), 'utf8');

// ── Validacion del YAML ────────────────────────────────────────────────────

test('the shipped policy is valid', () => {
  assert.doesNotThrow(() => parsePolicy(YAML_REAL));
});

function invalida(cambio, mensaje) {
  assert.throws(() => parsePolicy(cambio(YAML_REAL)), mensaje);
}

test('an invalid policy refuses to load', () => {
  invalida(() => 'funciones: [', /YAML invalido/);
  invalida(() => '- solo\n- una lista', /debe ser un objeto/);
  invalida((y) => y.replace('funciones: [revisores]', 'funciones: [inexistentes]'), /la funcion "inexistentes" no existe/);
  invalida((y) => y.replace('funciones: [revisores]', 'funciones: []'), /no lo otorga ninguna funcion/);
  invalida((y) => y.replace('permisos_exclusivos: [catalogos.administrar]', 'permisos_exclusivos: [catalogos.administrar, catalogos.borrar]'),
    /el permiso "catalogos.borrar" no existe/);
  invalida((y) => y.replace('todas_las_instituciones: true', 'todas_las_instituciones: false'), /debe ser true/);
  invalida((y) => y.replace('exento_de: []', 'exento_de: [todo]'), /regla desconocida/);
  invalida((y) => y.replace('grupo: /superadministradores', 'grupo: /instituciones/admins'), /dentro del grupo de instituciones/);
  invalida((y) => y.replace('    prioridad: 10', '    prioridad: diez'), /debe ser un entero/);
  invalida((y) => y.replace('  medicos:\n    etiqueta: Médico', '  medicos:\n    etiqueta: Médico\n  medicos:\n    etiqueta: Otro'),
    /YAML invalido/);
});

// ── Lectura de grupos ──────────────────────────────────────────────────────

test('group paths grant the function permissions only in their institution', () => {
  const access = accessFromGroups([grupo(254, 'medicos'), grupo(23, 'revisores')]);
  assert.equal(access.superadmin, false);
  assert.deepEqual([...access.porInstitucion.keys()].sort(), [23, 254]);
  assert.deepEqual([...access.porInstitucion.get(254).permisos].sort(), ['dashboard', 'fichas.crear']);
  assert.deepEqual([...access.porInstitucion.get(23).permisos].sort(), ['cie10.corregir', 'dashboard', 'reporteria']);
});

test('unknown, malformed or parent groups grant nothing', () => {
  const access = accessFromGroups([
    '/SADC-Congenia',
    '/SADC-Congenia/Admin',
    '/medicos',
    '/instituciones',
    '/instituciones/254',
    '/instituciones/254/inexistentes',
    '/instituciones/0254/medicos',
    '/instituciones/abc/medicos',
    '/instituciones/254/medicos/extra',
    'instituciones/254/medicos',
    '/superadministradores/otro',
    null,
    42,
  ]);
  assert.equal(access.superadmin, false);
  assert.equal(access.porInstitucion.size, 0);
  assert.deepEqual(accessFromGroups(undefined).porInstitucion.size, 0);
});

test('the superadmin group grants everything everywhere, without exemptions', () => {
  const superadmin = userWithGroups([SUPERADMIN]);
  assert.ok(isSuperAdmin(superadmin));
  assert.ok(can(superadmin, 'adendas.revisar', 777));
  assert.ok(can(superadmin, 'catalogos.administrar', null));
  assert.deepEqual(tenantScope(superadmin, 'dashboard'), { all: true, tenants: [] });
  assert.ok(!isExempt(superadmin, 'no_autoaprobacion'), 'separation of duties also applies to the superadmin');
  assert.equal(roleLabelOf(superadmin), 'Superadministrador');
});

// ── Decisiones por institucion ─────────────────────────────────────────────

test('a mixed user keeps each function in its own institution', () => {
  // Medico en la 254 y coordinador en la 23.
  const mixto = userWithGroups([grupo(254, 'medicos'), grupo(23, 'coordinadores')]);

  assert.ok(can(mixto, 'fichas.crear', 254));
  assert.ok(!can(mixto, 'adendas.revisar', 254), 'its coordinator role in 23 does not apply in 254');
  assert.ok(can(mixto, 'adendas.revisar', 23));
  assert.ok(!can(mixto, 'cie10.corregir', 23));
  assert.ok(!can(mixto, 'dashboard', 777), 'no access to an institution without a group');

  assert.deepEqual(tenantScope(mixto, 'dashboard'), { all: false, tenants: [23, 254] });
  assert.deepEqual(tenantScope(mixto, 'adendas.revisar'), { all: false, tenants: [23] });
  assert.ok(hasPermissionAnywhere(mixto, 'adendas.revisar'));
  assert.ok(!hasPermissionAnywhere(mixto, 'catalogos.administrar'));
  assert.ok(!isExempt(mixto, 'no_autoaprobacion'));
  assert.equal(roleLabelOf(mixto), 'Coordinador');
});

test('a user without groups, or built without the middleware, has no permissions', () => {
  for (const usuario of [userWithGroups([]), { roles: ['congenia-superadmin'], tenants: ['23'] }, null]) {
    assert.ok(!can(usuario, 'dashboard', 23));
    assert.ok(!hasPermissionAnywhere(usuario, 'dashboard'));
    assert.ok(!isSuperAdmin(usuario));
    assert.equal(roleLabelOf(usuario), null);
  }
});

test('asking for an unknown permission is a programming error', () => {
  assert.throws(() => can(userWithGroups([SUPERADMIN]), 'fichas.borrar', 23), /Permiso desconocido/);
});
