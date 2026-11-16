'use strict';

const db = require('../config/db');

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Returns the next available smallint PK for tables that use
 * a manually managed integer primary key (not serial).
 * Runs inside the caller's transaction client.
 *
 * @param {import('pg').PoolClient} client
 * @param {string} table  - Table name (trusted, never user input)
 * @param {string} pkCol  - Primary key column name
 * @returns {Promise<number>}
 */
async function nextSmallintId(client, table, pkCol) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(${pkCol}), 0) + 1 AS next_id FROM ${table}`
  );
  return rows[0].next_id;
}

function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

// ─────────────────────────────────────────────────────────────
// Región anatómica
// ─────────────────────────────────────────────────────────────

async function getRegiones() {
  const { rows } = await db.query(
    `SELECT region_id, nombre, orden, activo
     FROM region_anatomica
     ORDER BY orden, region_id`
  );
  return rows;
}

async function getRegionById(id) {
  const { rows } = await db.query(
    `SELECT region_id, nombre, orden, activo FROM region_anatomica WHERE region_id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

async function createRegion({ nombre, orden, activo = true }) {
  const { rows } = await db.query(
    `INSERT INTO region_anatomica (nombre, orden, activo)
     VALUES ($1, $2, $3)
     RETURNING region_id, nombre, orden, activo`,
    [nombre, orden, activo]
  );
  return rows[0];
}

async function updateRegion(id, { nombre, orden, activo }) {
  const sets = [];
  const vals = [];
  if (nombre !== undefined) { sets.push(`nombre = $${sets.length + 1}`); vals.push(nombre); }
  if (orden  !== undefined) { sets.push(`orden = $${sets.length + 1}`);  vals.push(orden); }
  if (activo !== undefined) { sets.push(`activo = $${sets.length + 1}`); vals.push(activo); }

  if (sets.length === 0) throw badRequest('No hay campos para actualizar');

  vals.push(id);
  const { rows } = await db.query(
    `UPDATE region_anatomica SET ${sets.join(', ')} WHERE region_id = $${vals.length}
     RETURNING region_id, nombre, orden, activo`,
    vals
  );
  if (rows.length === 0) throw badRequest('Región no encontrada');
  return rows[0];
}

async function deleteRegion(id) {
  const { rowCount } = await db.query(
    `DELETE FROM region_anatomica WHERE region_id = $1`, [id]
  );
  if (rowCount === 0) throw badRequest('Región no encontrada');
}

// ─────────────────────────────────────────────────────────────
// Lateralidad
// ─────────────────────────────────────────────────────────────

async function getLateralidades() {
  const { rows } = await db.query(
    `SELECT lateralidad_id, codigo, nombre, orden, activo
     FROM lateralidad
     ORDER BY orden, lateralidad_id`
  );
  return rows;
}

async function getLateralidadById(id) {
  const { rows } = await db.query(
    `SELECT lateralidad_id, codigo, nombre, orden, activo FROM lateralidad WHERE lateralidad_id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

async function createLateralidad({ codigo, nombre, orden, activo = true }) {
  const { rows } = await db.query(
    `INSERT INTO lateralidad (codigo, nombre, orden, activo)
     VALUES ($1, $2, $3, $4)
     RETURNING lateralidad_id, codigo, nombre, orden, activo`,
    [codigo, nombre, orden, activo]
  );
  return rows[0];
}

async function updateLateralidad(id, { codigo, nombre, orden, activo }) {
  const sets = [];
  const vals = [];
  if (codigo !== undefined) { sets.push(`codigo = $${sets.length + 1}`); vals.push(codigo); }
  if (nombre !== undefined) { sets.push(`nombre = $${sets.length + 1}`); vals.push(nombre); }
  if (orden  !== undefined) { sets.push(`orden = $${sets.length + 1}`);  vals.push(orden); }
  if (activo !== undefined) { sets.push(`activo = $${sets.length + 1}`); vals.push(activo); }

  if (sets.length === 0) throw badRequest('No hay campos para actualizar');

  vals.push(id);
  const { rows } = await db.query(
    `UPDATE lateralidad SET ${sets.join(', ')} WHERE lateralidad_id = $${vals.length}
     RETURNING lateralidad_id, codigo, nombre, orden, activo`,
    vals
  );
  if (rows.length === 0) throw badRequest('Lateralidad no encontrada');
  return rows[0];
}

async function deleteLateralidad(id) {
  const { rowCount } = await db.query(
    `DELETE FROM lateralidad WHERE lateralidad_id = $1`, [id]
  );
  if (rowCount === 0) throw badRequest('Lateralidad no encontrada');
}

// ─────────────────────────────────────────────────────────────
// Parte del cuerpo
// ─────────────────────────────────────────────────────────────

async function getPartesCuerpo() {
  const { rows } = await db.query(
    `SELECT p.parte_id, p.region_id, r.nombre AS region_nombre,
            p.nombre, p.orden, p.requiere_lateralidad,
            p.permite_linea_media, p.activo
     FROM parte_del_cuerpo p
     JOIN region_anatomica r ON r.region_id = p.region_id
     ORDER BY r.orden, p.orden, p.parte_id`
  );
  return rows;
}

async function getPartesCuerpoByRegion() {
  const { rows } = await db.query(
    `SELECT r.region_id, r.nombre AS region, r.orden,
            p.parte_id, p.nombre AS parte_nombre, p.orden AS parte_orden,
            p.requiere_lateralidad, p.permite_linea_media
     FROM region_anatomica r
     JOIN parte_del_cuerpo p ON p.region_id = r.region_id
     WHERE r.activo = true AND p.activo = true
     ORDER BY r.orden, p.orden, p.parte_id`
  );

  // Group by region
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.region_id)) {
      map.set(row.region_id, {
        regionId: row.region_id,
        region:   row.region,
        orden:    row.orden,
        partes:   [],
      });
    }
    map.get(row.region_id).partes.push({
      parteId:             row.parte_id,
      nombre:              row.parte_nombre,
      orden:               row.parte_orden,
      requiereLateralidad: row.requiere_lateralidad,
      permiteLineaMedia:   row.permite_linea_media,
    });
  }
  return [...map.values()];
}

async function createParteCuerpo({ region_id, nombre, orden = 0, requiere_lateralidad = true, permite_linea_media = true, activo = true }) {
  const { rows } = await db.query(
    `INSERT INTO parte_del_cuerpo
       (region_id, nombre, orden, requiere_lateralidad, permite_linea_media, activo)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING parte_id, region_id, nombre, orden,
               requiere_lateralidad, permite_linea_media, activo`,
    [region_id, nombre, orden, requiere_lateralidad, permite_linea_media, activo]
  );
  return rows[0];
}

// ─────────────────────────────────────────────────────────────
// Signo catálogo  (read-only)
// ─────────────────────────────────────────────────────────────

async function getSignos() {
  const { rows } = await db.query(
    `SELECT signo_catalogo_id, nombre_normalizado, categoria,
            descripcion_medica, activo, fecha_creacion
     FROM signo_catalogo
     WHERE activo = true
     ORDER BY signo_catalogo_id`
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────
// Examen catálogo  (read-only)
// ─────────────────────────────────────────────────────────────

async function getExamenes() {
  const { rows } = await db.query(
    `SELECT examen_catalogo_id, nombre_normalizado, tipo,
            descripcion, activo, fecha_creacion
     FROM examen_catalogo
     WHERE activo = true
     ORDER BY examen_catalogo_id`
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────
// Asistencia parto  (read-only catalog)
// ─────────────────────────────────────────────────────────────

async function getAsistenciaParto() {
  const { rows } = await db.query(
    `SELECT asistencia_parto_id, nombre
     FROM asistencia_parto
     ORDER BY asistencia_parto_id`
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────
// Referido de  (read-only catalog)
// ─────────────────────────────────────────────────────────────

async function getReferidoDe() {
  const { rows } = await db.query(
    `SELECT referido_de_id, nombre
     FROM referido_de
     ORDER BY referido_de_id`
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────
// Sexo  (read-only catalog)
// ─────────────────────────────────────────────────────────────

async function getSexos() {
  const { rows } = await db.query(
    `SELECT sexo_id, codigo, nombre
     FROM sexo_catalogo
     WHERE activo = true
     ORDER BY orden, sexo_id`
  );
  return rows;
}

// ─────────────────────────────────────────────────────────────
// Familiar catálogo
// ─────────────────────────────────────────────────────────────

async function getFamiliares() {
  const { rows } = await db.query(
    `SELECT familiar_catalogo_id, nombre
     FROM familiar_catalogo
     ORDER BY familiar_catalogo_id`
  );
  return rows;
}

async function createFamiliar({ nombre }) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const familiar_catalogo_id = await nextSmallintId(
      client,
      'familiar_catalogo',
      'familiar_catalogo_id'
    );

    await client.query(
      `INSERT INTO familiar_catalogo (familiar_catalogo_id, nombre)
       VALUES ($1, $2)`,
      [familiar_catalogo_id, nombre]
    );

    await client.query('COMMIT');
    return { familiar_catalogo_id, nombre };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────

module.exports = {
  getPartesCuerpoByRegion,
  getRegiones,
  getRegionById,
  createRegion,
  updateRegion,
  deleteRegion,
  getLateralidades,
  getLateralidadById,
  createLateralidad,
  updateLateralidad,
  deleteLateralidad,
  getPartesCuerpo,
  createParteCuerpo,
  getSignos,
  getExamenes,
  getAsistenciaParto,
  getReferidoDe,
  getSexos,
  getFamiliares,
  createFamiliar,
};
