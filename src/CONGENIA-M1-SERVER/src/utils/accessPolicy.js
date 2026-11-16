'use strict';

// Permisos por institucion. La matriz funcion -> permisos vive en
// config/access-policy.yaml; este modulo la carga y la valida al arrancar (si
// es invalida, la API no inicia) y calcula que puede hacer cada usuario a
// partir del claim `groups` del access token:
//
//   /instituciones/254/medicos  -> permisos de medicos solo en la institucion 254
//   /superadministradores       -> todos los permisos en todas las instituciones
//
// Los roles planos (realm_access.roles) y el claim `tenants` no se usan para
// autorizar: no dicen que funcion tiene el usuario en cada institucion.

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const POLICY_PATH = path.join(__dirname, '..', '..', 'config', 'access-policy.yaml');
const EXENCIONES = Object.freeze(['no_autoaprobacion']);
const NOMBRE_FUNCION = /^[a-z][a-z0-9-]*$/;
const NOMBRE_PERMISO = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/;
const RUTA_GRUPO = /^\/[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;

function fail(message) {
  throw new Error(`access-policy.yaml: ${message}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireText(value, where) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${where} debe ser un texto`);
  return value.trim();
}

function requireInteger(value, where) {
  if (!Number.isInteger(value)) fail(`${where} debe ser un entero`);
  return value;
}

function requireNames(value, where) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    fail(`${where} debe ser una lista de nombres`);
  }
  if (new Set(value).size !== value.length) fail(`${where} tiene nombres repetidos`);
  return value;
}

function requireGroupPath(value, where) {
  const ruta = requireText(value, where);
  if (!RUTA_GRUPO.test(ruta)) fail(`${where} debe ser una ruta de grupo de Keycloak, como /instituciones`);
  return ruta;
}

/** Valida el texto de la politica y devuelve una copia inmutable. */
function parsePolicy(text) {
  let doc;
  try {
    doc = YAML.parse(text, { uniqueKeys: true });
  } catch (err) {
    fail(`YAML invalido: ${err.message}`);
  }
  if (!isPlainObject(doc)) fail('la politica debe ser un objeto');

  const version = requireInteger(doc.version, 'version');
  const instituciones = requireGroupPath(doc.instituciones, 'instituciones');

  if (!isPlainObject(doc.funciones) || Object.keys(doc.funciones).length === 0) {
    fail('funciones debe definir al menos una funcion');
  }
  const funciones = {};
  for (const [nombre, def] of Object.entries(doc.funciones)) {
    if (!NOMBRE_FUNCION.test(nombre)) fail(`la funcion "${nombre}" tiene un nombre invalido`);
    if (!isPlainObject(def)) fail(`funciones.${nombre} debe ser un objeto`);
    funciones[nombre] = Object.freeze({
      etiqueta: requireText(def.etiqueta, `funciones.${nombre}.etiqueta`),
      prioridad: requireInteger(def.prioridad, `funciones.${nombre}.prioridad`),
    });
  }

  if (!isPlainObject(doc.superadmin)) fail('superadmin debe ser un objeto');
  const sa = doc.superadmin;
  const grupoSuperadmin = requireGroupPath(sa.grupo, 'superadmin.grupo');
  if (grupoSuperadmin === instituciones || grupoSuperadmin.startsWith(`${instituciones}/`)) {
    fail('superadmin.grupo no puede estar dentro del grupo de instituciones');
  }
  if (sa.todas_las_instituciones !== true) fail('superadmin.todas_las_instituciones debe ser true');
  const exclusivos = requireNames(sa.permisos_exclusivos ?? [], 'superadmin.permisos_exclusivos');
  const exentoDe = requireNames(sa.exento_de ?? [], 'superadmin.exento_de');
  for (const regla of exentoDe) {
    if (!EXENCIONES.includes(regla)) fail(`superadmin.exento_de: regla desconocida "${regla}"`);
  }

  if (!isPlainObject(doc.permisos) || Object.keys(doc.permisos).length === 0) {
    fail('permisos debe definir al menos un permiso');
  }
  const permisos = {};
  for (const [nombre, def] of Object.entries(doc.permisos)) {
    if (!NOMBRE_PERMISO.test(nombre)) fail(`el permiso "${nombre}" tiene un nombre invalido`);
    if (!isPlainObject(def)) fail(`permisos.${nombre} debe ser un objeto`);
    const otorgan = requireNames(def.funciones, `permisos.${nombre}.funciones`);
    for (const funcion of otorgan) {
      if (!funciones[funcion]) fail(`permisos.${nombre}: la funcion "${funcion}" no existe`);
    }
    const exclusivo = exclusivos.includes(nombre);
    if (otorgan.length === 0 && !exclusivo) fail(`el permiso "${nombre}" no lo otorga ninguna funcion`);
    if (otorgan.length > 0 && exclusivo) fail(`el permiso "${nombre}" es exclusivo del superadmin y no puede tener funciones`);
    permisos[nombre] = Object.freeze({
      descripcion: requireText(def.descripcion, `permisos.${nombre}.descripcion`),
      funciones: Object.freeze([...otorgan]),
    });
  }
  for (const nombre of exclusivos) {
    if (!permisos[nombre]) fail(`superadmin.permisos_exclusivos: el permiso "${nombre}" no existe`);
  }

  return Object.freeze({
    version,
    instituciones,
    funciones: Object.freeze(funciones),
    permisos: Object.freeze(permisos),
    superadmin: Object.freeze({
      grupo: grupoSuperadmin,
      etiqueta: requireText(sa.etiqueta, 'superadmin.etiqueta'),
      prioridad: requireInteger(sa.prioridad, 'superadmin.prioridad'),
      permisosExclusivos: Object.freeze([...exclusivos]),
      exentoDe: Object.freeze([...exentoDe]),
    }),
  });
}

function loadPolicy(file = POLICY_PATH) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`access-policy.yaml: no se pudo leer ${file}: ${err.message}`);
  }
  return parsePolicy(text);
}

const POLICY = loadPolicy();

/** Todos los permisos, en el orden del YAML. */
const PERMISOS = Object.freeze(Object.keys(POLICY.permisos));
/** Permisos que se otorgan por institucion (todos menos los exclusivos del superadmin). */
const PERMISOS_POR_INSTITUCION = Object.freeze(
  PERMISOS.filter((permiso) => !POLICY.superadmin.permisosExclusivos.includes(permiso))
);

const PERMISOS_DE_FUNCION = new Map(Object.keys(POLICY.funciones).map((funcion) => [funcion, new Set()]));
for (const [permiso, def] of Object.entries(POLICY.permisos)) {
  for (const funcion of def.funciones) PERMISOS_DE_FUNCION.get(funcion).add(permiso);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// /instituciones/<id sin ceros a la izquierda>/<funcion>
const GRUPO_INSTITUCION = new RegExp(`^${escapeRegex(POLICY.instituciones)}/([1-9]\\d{0,8})/([a-z][a-z0-9-]*)$`);

const SIN_ACCESO = Object.freeze({ superadmin: false, porInstitucion: new Map() });

/**
 * Permisos por institucion a partir de las rutas de grupo del token. Grupos
 * con otra forma, o funciones que no estan en la politica, no otorgan nada.
 */
function accessFromGroups(groups) {
  const lista = Array.isArray(groups) ? groups.filter((grupo) => typeof grupo === 'string') : [];
  let superadmin = false;
  const porInstitucion = new Map();
  for (const crudo of lista) {
    const grupo = crudo.trim();
    if (grupo === POLICY.superadmin.grupo) {
      superadmin = true;
      continue;
    }
    const match = GRUPO_INSTITUCION.exec(grupo);
    if (!match) continue;
    const funcion = match[2];
    const permisos = PERMISOS_DE_FUNCION.get(funcion);
    if (!permisos) continue;
    const tenantId = Number.parseInt(match[1], 10);
    const entrada = porInstitucion.get(tenantId) ?? { funciones: new Set(), permisos: new Set() };
    entrada.funciones.add(funcion);
    for (const permiso of permisos) entrada.permisos.add(permiso);
    porInstitucion.set(tenantId, entrada);
  }
  return Object.freeze({ superadmin, porInstitucion });
}

function assertPermiso(permiso) {
  if (!Object.prototype.hasOwnProperty.call(POLICY.permisos, permiso)) {
    throw new Error(`Permiso desconocido en access-policy.yaml: ${permiso}`);
  }
  return permiso;
}

function accessOf(userAuth) {
  return userAuth?.access ?? SIN_ACCESO;
}

function normalizeTenant(value) {
  const raw = String(value ?? '').trim();
  return /^[1-9]\d{0,8}$/.test(raw) ? Number.parseInt(raw, 10) : null;
}

function isSuperAdmin(userAuth) {
  return accessOf(userAuth).superadmin === true;
}

/** ¿Tiene el permiso en esa institucion? */
function can(userAuth, permiso, tenantId) {
  assertPermiso(permiso);
  const access = accessOf(userAuth);
  if (access.superadmin) return true;
  if (POLICY.superadmin.permisosExclusivos.includes(permiso)) return false;
  const tenant = normalizeTenant(tenantId);
  if (tenant === null) return false;
  return access.porInstitucion.get(tenant)?.permisos.has(permiso) === true;
}

/** ¿Tiene el permiso en al menos una institucion? (control de entrada a la ruta) */
function hasPermissionAnywhere(userAuth, permiso) {
  assertPermiso(permiso);
  const access = accessOf(userAuth);
  if (access.superadmin) return true;
  for (const entrada of access.porInstitucion.values()) {
    if (entrada.permisos.has(permiso)) return true;
  }
  return false;
}

/**
 * Instituciones donde tiene el permiso, para filtrar consultas. El
 * superadministrador devuelve `all: true` y una lista vacia.
 */
function tenantScope(userAuth, permiso) {
  assertPermiso(permiso);
  const access = accessOf(userAuth);
  if (access.superadmin) return { all: true, tenants: [] };
  const tenants = [...access.porInstitucion.entries()]
    .filter(([, entrada]) => entrada.permisos.has(permiso))
    .map(([tenantId]) => tenantId)
    .sort((a, b) => a - b);
  return { all: false, tenants };
}

/** Instituciones en las que el usuario tiene alguna funcion. */
function tenantsOf(userAuth) {
  return [...accessOf(userAuth).porInstitucion.keys()].sort((a, b) => a - b);
}

/** ¿Queda exento de una regla de negocio? Solo el superadministrador, segun el YAML. */
function isExempt(userAuth, regla) {
  return isSuperAdmin(userAuth) && POLICY.superadmin.exentoDe.includes(regla);
}

/** Etiqueta de la funcion de mayor prioridad que tenga en cualquier institucion. */
function roleLabelOf(userAuth) {
  const access = accessOf(userAuth);
  if (access.superadmin) return POLICY.superadmin.etiqueta;
  let mejor = null;
  for (const entrada of access.porInstitucion.values()) {
    for (const funcion of entrada.funciones) {
      const def = POLICY.funciones[funcion];
      if (!mejor || def.prioridad > mejor.prioridad) mejor = def;
    }
  }
  return mejor?.etiqueta ?? null;
}

function ordenarPermisos(set) {
  return PERMISOS.filter((permiso) => set.has(permiso));
}

function ordenarFunciones(set) {
  return [...set].sort((a, b) => POLICY.funciones[b].prioridad - POLICY.funciones[a].prioridad);
}

/**
 * Permisos para GET /me. `activeTenantIds` son las instituciones activas del
 * catalogo: una institucion dada de baja no aparece aunque el token la traiga.
 */
function accessSummary(userAuth, activeTenantIds) {
  const activos = new Set((activeTenantIds ?? []).map(Number));
  const access = accessOf(userAuth);
  if (access.superadmin) {
    return {
      access: [...activos].sort((a, b) => a - b).map((tenantId) => ({
        tenantId,
        funciones: [],
        permissions: [...PERMISOS_POR_INSTITUCION],
      })),
      permissions: [...PERMISOS],
      globalPermissions: [...POLICY.superadmin.permisosExclusivos],
      roleLabel: roleLabelOf(userAuth),
    };
  }
  const entradas = [...access.porInstitucion.entries()]
    .filter(([tenantId]) => activos.has(tenantId))
    .sort(([a], [b]) => a - b);
  const union = new Set();
  for (const [, entrada] of entradas) for (const permiso of entrada.permisos) union.add(permiso);
  return {
    access: entradas.map(([tenantId, entrada]) => ({
      tenantId,
      funciones: ordenarFunciones(entrada.funciones),
      permissions: ordenarPermisos(entrada.permisos),
    })),
    permissions: ordenarPermisos(union),
    globalPermissions: [],
    roleLabel: entradas.length > 0 ? roleLabelOf(userAuth) : null,
  };
}

module.exports = {
  PERMISOS,
  POLICY,
  accessFromGroups,
  accessSummary,
  assertPermiso,
  can,
  hasPermissionAnywhere,
  isExempt,
  isSuperAdmin,
  loadPolicy,
  parsePolicy,
  roleLabelOf,
  tenantScope,
  tenantsOf,
};
