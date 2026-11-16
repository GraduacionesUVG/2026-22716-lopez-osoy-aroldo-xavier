'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fichaApiRouter = require('../src/routes/v1/ficha-api.routes');
const catalogRouter = require('../src/routes/v1/catalog.routes');
const cie10Router = require('../src/routes/v1/cie10.routes');
const reportingRouter = require('../src/routes/v1/reporting.routes');

function authPermission(router, method, path) {
  const layer = router.stack.find((candidate) =>
    candidate.route?.path === path && candidate.route.methods[method]
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} route is registered`);
  const guard = layer.route.stack.find((handler) => 'requiredPermission' in handler.handle);
  return guard?.handle.requiredPermission;
}

test('adenda routes enforce author and reviewer permissions at the API route', () => {
  assert.equal(authPermission(fichaApiRouter, 'post', '/fichas/:id/revisiones'), 'fichas.crear');
  for (const path of ['/fichas/:id/resolver', '/fichas/:id/aprobar', '/fichas/:id/rechazar']) {
    assert.equal(authPermission(fichaApiRouter, 'post', path), 'adendas.revisar');
  }
  // La bandeja solo sirve a quien revisa.
  assert.equal(authPermission(fichaApiRouter, 'get', '/fichas/adendas'), 'adendas.revisar');
  // /me responde aunque el usuario no tenga permisos.
  assert.equal(authPermission(fichaApiRouter, 'get', '/me'), null);
});

test('CIE-10 dashboard routes require cie10.corregir', () => {
  for (const [method, path] of [
    ['get', '/cie10/sugerencias'],
    ['get', '/cie10/sugerencias/:codigoTraductor'],
    ['post', '/cie10/sugerencias/:codigoTraductor/decision'],
    ['put', '/cie10/sugerencias/:codigoTraductor/decision'],
    ['get', '/cie10/decisiones'],
  ]) {
    assert.equal(authPermission(cie10Router, method, path), 'cie10.corregir');
  }
});

test('reporting and agent routes require reporteria', () => {
  for (const [method, path] of [
    ['get', '/reporting/summary'],
    ['get', '/reporting/sigsa/top-diagnosticos'],
    ['get', '/reporting/sigsa/top-cie10'],
    ['get', '/reporting/sigsa/monthly'],
    ['get', '/reporting/congenia/monthly'],
    ['post', '/agent/conversations'],
    ['delete', '/agent/conversations/:conversationId'],
    ['post', '/agent/query'],
  ]) {
    assert.equal(authPermission(reportingRouter, method, path), 'reporteria');
  }
});

test('catalog mutations require catalogos.administrar and reads require a known caller', () => {
  for (const [method, path] of [
    ['post', '/Region'],
    ['put', '/Region/:id'],
    ['delete', '/Region/:id'],
    ['post', '/Lateralidad'],
    ['put', '/Lateralidad/:id'],
    ['delete', '/Lateralidad/:id'],
    ['post', '/ParteCuerpo'],
    ['post', '/Familiar'],
  ]) {
    assert.equal(authPermission(catalogRouter, method, path), 'catalogos.administrar');
  }
  const readers = ['/Regiones', '/Lateralidades', '/PartesCuerpo', '/Signos', '/Examenes',
    '/AsistenciaParto', '/ReferidoDe', '/Familiares'];
  for (const path of readers) {
    assert.equal(authPermission(catalogRouter, 'get', path), 'dashboard', `GET ${path} is not anonymous`);
  }
  for (const layer of catalogRouter.stack.filter((candidate) => candidate.route)) {
    const guarded = layer.route.stack.some((handler) => typeof handler.handle.requiredPermission === 'string');
    assert.ok(guarded, `${Object.keys(layer.route.methods)} ${layer.route.path} has no auth middleware`);
  }
});

test('every API route authenticates its caller', () => {
  const routers = {
    '/v1 catalog': catalogRouter,
    '/api/v1 ficha': fichaApiRouter,
    '/v1 ficha': require('../src/routes/v1/ficha.routes'),
    '/v1 patient': require('../src/routes/v1/patient.routes'),
    '/v1 upload': require('../src/routes/v1/upload.routes'),
    '/api/v1 integration': require('../src/routes/v1/integration.routes'),
    '/api/v1 cie10': cie10Router,
    '/api/v1 reporting': reportingRouter,
  };
  let checked = 0;
  for (const [name, router] of Object.entries(routers)) {
    for (const layer of router.stack.filter((candidate) => candidate.route)) {
      const kinds = layer.route.stack.map((handler) => handler.handle.authKind).filter(Boolean);
      assert.ok(kinds.length > 0, `${name}: ${Object.keys(layer.route.methods)} ${layer.route.path} is anonymous`);
      checked += 1;
    }
  }
  assert.ok(checked >= 30, `expected every route to be inspected, saw ${checked}`);
});
