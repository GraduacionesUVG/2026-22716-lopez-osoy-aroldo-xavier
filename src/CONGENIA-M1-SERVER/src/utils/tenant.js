'use strict';

const { can, tenantScope } = require('./accessPolicy');

function normalizeTenantId(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  return Number.parseInt(raw, 10);
}

/**
 * Instituciones donde el usuario tiene `permiso` (por defecto, leer fichas).
 * El superadministrador devuelve una lista vacia: no se filtra por institucion.
 */
function getUserTenants(userAuth, permiso = 'dashboard') {
  return tenantScope(userAuth, permiso).tenants;
}

/** ¿Tiene `permiso` (por defecto, leer fichas) en esa institucion? */
function userCanAccessTenant(userAuth, tenantId, permiso = 'dashboard') {
  const normalized = normalizeTenantId(tenantId);
  if (!Number.isInteger(normalized)) return false;
  return can(userAuth, permiso, normalized);
}

module.exports = {
  getUserTenants,
  normalizeTenantId,
  userCanAccessTenant,
};
