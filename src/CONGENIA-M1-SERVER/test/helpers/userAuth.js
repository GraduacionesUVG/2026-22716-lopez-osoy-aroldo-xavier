'use strict';

// Arma un req.userAuth igual al que produce requireOAuthUser, a partir de las
// rutas de grupo del token: las pruebas no inventan permisos a mano.

const { accessFromGroups, tenantsOf } = require('../../src/utils/accessPolicy');

function userWithGroups(groups, extra = {}) {
  const access = accessFromGroups(groups);
  return {
    type: 'oidc-user',
    subject: 'user-subject',
    username: 'usuario.prueba',
    displayName: 'Usuario Prueba',
    specialty: 'Genetica',
    roles: [],
    tenants: tenantsOf({ access }).map(String),
    access,
    ...extra,
  };
}

const grupo = (tenant, funcion) => `/instituciones/${tenant}/${funcion}`;
const SUPERADMIN = '/superadministradores';

module.exports = { userWithGroups, grupo, SUPERADMIN };
