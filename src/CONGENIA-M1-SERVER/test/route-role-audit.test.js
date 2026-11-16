'use strict';

// Auditoria de permisos de la API: cada ruta registrada debe exigir exactamente
// el permiso que le asigna la matriz, y la matriz de config/access-policy.yaml
// debe coincidir con la que se fija aqui. Una ruta nueva sin declarar, o un
// cambio en el YAML, hace fallar esta prueba a proposito.

const test = require('node:test');
const assert = require('node:assert/strict');
const { POLICY, PERMISOS } = require('../src/utils/accessPolicy');

// Matriz esperada: funcion (subgrupo de /instituciones/<tenant>) -> permisos
// en esa institucion (playbook-roles.md, seccion 3).
const MATRIZ = {
  medicos: ['dashboard', 'fichas.crear'],
  genetistas: ['dashboard', 'fichas.crear', 'adendas.revisar', 'reporteria'],
  coordinadores: ['dashboard', 'fichas.crear', 'adendas.revisar', 'reporteria'],
  revisores: ['dashboard', 'cie10.corregir', 'reporteria'],
};
// El superadministrador tiene todos, mas los exclusivos (sin institucion).
const SUPERADMIN_EXCLUSIVOS = ['catalogos.administrar'];

function funcionesConPermiso(permiso) {
  return Object.entries(MATRIZ)
    .filter(([, permisos]) => permisos.includes(permiso))
    .map(([funcion]) => funcion)
    .sort();
}

const user = (permiso) => ({ authKind: 'oauth-user', permiso });
const authenticated = { authKind: 'oauth-user', permiso: null };
const catalogReader = { authKind: 'oauth-user-or-session-token', permiso: 'dashboard' };
const sessionToken = { authKind: 'session-token' };
const oauthClient = { authKind: 'oauth-client' };
const mcpToken = { authKind: 'mcp-token' };

// Prefijos de montaje: src/app.js.
const ROUTERS = [
  ['/v1', require('../src/routes/v1/catalog.routes')],
  ['/v1', require('../src/routes/v1/ficha.routes')],
  ['/v1', require('../src/routes/v1/patient.routes')],
  ['/v1', require('../src/routes/v1/upload.routes')],
  ['/api/v1', require('../src/routes/v1/integration.routes')],
  ['/api/v1', require('../src/routes/v1/ficha-api.routes')],
  ['/api/v1', require('../src/routes/v1/cie10.routes')],
  ['/api/v1', require('../src/routes/v1/reporting.routes')],
];

const ESPERADO = {
  // Catalogos: lectura para el dashboard o el formulario; escritura solo superadmin.
  'GET /v1/Regiones': catalogReader,
  'POST /v1/Region': user('catalogos.administrar'),
  'PUT /v1/Region/:id': user('catalogos.administrar'),
  'DELETE /v1/Region/:id': user('catalogos.administrar'),
  'GET /v1/Lateralidades': catalogReader,
  'POST /v1/Lateralidad': user('catalogos.administrar'),
  'PUT /v1/Lateralidad/:id': user('catalogos.administrar'),
  'DELETE /v1/Lateralidad/:id': user('catalogos.administrar'),
  'GET /v1/PartesCuerpo': catalogReader,
  'POST /v1/ParteCuerpo': user('catalogos.administrar'),
  'GET /v1/Signos': catalogReader,
  'GET /v1/Examenes': catalogReader,
  'GET /v1/AsistenciaParto': catalogReader,
  'GET /v1/ReferidoDe': catalogReader,
  'GET /v1/Sexos': catalogReader,
  'GET /v1/Familiares': catalogReader,
  'POST /v1/Familiar': user('catalogos.administrar'),

  // Busqueda y detalle del dashboard.
  'GET /v1/fichas': user('dashboard'),
  'GET /v1/fichas/:fichaId': user('dashboard'),

  // Formulario de captura: credencial de sesion de un solo uso, no un usuario.
  'POST /v1/patient': sessionToken,
  'POST /v1/uploads/presigned-url': sessionToken,
  'POST /api/v1/sessions/activate': sessionToken,

  // Integracion SADC: cliente OAuth con scope congenia.sessions:init.
  'POST /api/v1/sessions/init': oauthClient,
  // Registro manual desde el dashboard: crea una ficha.
  'POST /api/v1/sessions/manual': user('fichas.crear'),

  // Fichas y adendas.
  // Perfil y permisos: solo autenticado; responde aunque no tenga permisos.
  'GET /api/v1/me': authenticated,
  'GET /api/v1/sadc/pacientes': user('dashboard'),
  'POST /api/v1/pacientes/:pacienteId/uploads/presigned-url': user('dashboard'),
  'GET /api/v1/pacientes/:tenantId/:historiaClinica/fichas': user('dashboard'),
  'GET /api/v1/pacientes/:tenantId/:historiaClinica/ficha-vigente': user('dashboard'),
  'GET /api/v1/fichas/pendientes': user('dashboard'),
  'GET /api/v1/fichas/adendas': user('adendas.revisar'),
  'GET /api/v1/fichas/:id': user('dashboard'),
  'POST /api/v1/fichas/:id/revisiones': user('fichas.crear'),
  'POST /api/v1/fichas/:id/resolver': user('adendas.revisar'),
  'POST /api/v1/fichas/:id/aprobar': user('adendas.revisar'),
  'POST /api/v1/fichas/:id/rechazar': user('adendas.revisar'),

  // Correccion CIE-10.
  'GET /api/v1/cie10/sugerencias': user('cie10.corregir'),
  'GET /api/v1/cie10/sugerencias/:codigoTraductor': user('cie10.corregir'),
  'POST /api/v1/cie10/sugerencias/:codigoTraductor/decision': user('cie10.corregir'),
  'PUT /api/v1/cie10/sugerencias/:codigoTraductor/decision': user('cie10.corregir'),
  'GET /api/v1/cie10/decisiones': user('cie10.corregir'),
  'GET /api/v1/cie10/export-url': user('cie10.corregir'),
  'GET /api/v1/cie10/lotes': user('cie10.corregir'),
  'GET /api/v1/cie10/lotes/activo': user('cie10.corregir'),
  'GET /api/v1/cie10/lotes/:runId': user('cie10.corregir'),
  'GET /api/v1/cie10/catalogo': user('cie10.corregir'),
  'POST /api/v1/cie10/lotes/:runId/items/aceptar': user('cie10.corregir'),
  'POST /api/v1/cie10/lotes/:runId/items/:codigoTraductor/aceptar': user('cie10.corregir'),
  'PUT /api/v1/cie10/lotes/:runId/items/:codigoTraductor': user('cie10.corregir'),
  'POST /api/v1/cie10/lotes/:runId/clausula': user('cie10.corregir'),
  'POST /api/v1/cie10/lotes/:runId/confirmar': user('cie10.corregir'),

  // Reporteria y agente.
  'GET /api/v1/reporting/summary': user('reporteria'),
  'GET /api/v1/reporting/sigsa/top-diagnosticos': user('reporteria'),
  'GET /api/v1/reporting/sigsa/top-cie10': user('reporteria'),
  'GET /api/v1/reporting/sigsa/monthly': user('reporteria'),
  'GET /api/v1/reporting/congenia/monthly': user('reporteria'),
  'POST /api/v1/agent/conversations': user('reporteria'),
  'DELETE /api/v1/agent/conversations/:conversationId': user('reporteria'),
  'POST /api/v1/agent/query': user('reporteria'),
  // Endpoint MCP: token propio del servidor MCP, no un usuario.
  'POST /api/v1/reporting/mcp': mcpToken,
};

function registeredRoutes() {
  const routes = new Map();
  for (const [prefix, router] of ROUTERS) {
    for (const layer of router.stack.filter((candidate) => candidate.route)) {
      for (const method of Object.keys(layer.route.methods)) {
        const key = `${method.toUpperCase()} ${prefix}${layer.route.path}`;
        const guard = layer.route.stack.map((handler) => handler.handle).find((handle) => handle.authKind);
        routes.set(key, guard ?? null);
      }
    }
  }
  return routes;
}

test('access-policy.yaml grants exactly the permissions of the matrix', () => {
  assert.deepEqual(Object.keys(POLICY.funciones).sort(), Object.keys(MATRIZ).sort());
  for (const permiso of PERMISOS) {
    assert.deepEqual([...POLICY.permisos[permiso].funciones].sort(), funcionesConPermiso(permiso), `${permiso} does not match the matrix`);
  }
  assert.deepEqual([...POLICY.superadmin.permisosExclusivos], SUPERADMIN_EXCLUSIVOS);
  assert.deepEqual([...POLICY.superadmin.exentoDe], []);
});

test('the reviewer does not author or resolve adendas, the coordinator does', () => {
  assert.ok(!MATRIZ.revisores.includes('adendas.revisar'));
  assert.ok(!MATRIZ.revisores.includes('fichas.crear'));
  assert.ok(MATRIZ.coordinadores.includes('fichas.crear'));
  assert.ok(MATRIZ.coordinadores.includes('adendas.revisar'));
});

test('every API route is declared in the role audit', () => {
  const routes = registeredRoutes();
  const undeclared = [...routes.keys()].filter((key) => !(key in ESPERADO));
  const missing = Object.keys(ESPERADO).filter((key) => !routes.has(key));
  assert.deepEqual(undeclared, [], 'routes without an entry in the role audit');
  assert.deepEqual(missing, [], 'audit entries for routes that do not exist');
  assert.equal(routes.size, 60);
});

test('every API route has the protection the matrix assigns to it', () => {
  const usados = new Set();
  for (const [key, guard] of registeredRoutes()) {
    const expected = ESPERADO[key];
    assert.ok(guard, `${key} is anonymous`);
    assert.equal(guard.authKind, expected.authKind, `${key} authenticates with the wrong mechanism`);
    if ('permiso' in expected) {
      assert.equal(guard.requiredPermission, expected.permiso, `${key} must require ${expected.permiso}`);
      if (expected.permiso) usados.add(expected.permiso);
    } else {
      assert.equal(guard.requiredPermission, undefined, `${key} is not a user route and must not declare a permission`);
    }
  }
  // Ningun permiso del YAML queda sin una ruta que lo exija.
  assert.deepEqual([...usados].sort(), [...PERMISOS].sort());
});
