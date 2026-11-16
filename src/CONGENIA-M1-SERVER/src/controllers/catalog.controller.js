'use strict';

const catalogService = require('../services/catalog.service');
const { recordAuditFailure, writeAuditEvent } = require('../services/audit.service');

// Catalog writes are not transactional with their audit row (the service uses
// autocommit queries), but the row is written before answering: a failed audit
// turns into a 500 so the change never goes unreported to the client.
function auditCatalog(req, { catalogo, accion, id, antes = null, despues = null }) {
  return writeAuditEvent(req, {
    tipoEvento: 'CATALOGO_MODIFICADO',
    entidadTipo: 'Catalogo',
    detalle: { catalogo, accion, id: id ?? null, antes, despues },
  });
}

function auditCatalogFailure(req, catalogo, accion, err) {
  return recordAuditFailure(req, {
    tipoEvento: 'CATALOGO_MODIFICADO',
    entidadTipo: 'Catalogo',
    detalle: { catalogo, accion, id: req.params?.id ?? null },
  }, err);
}

// ─────────────────────────────────────────────────────────────
// Región anatómica
// ─────────────────────────────────────────────────────────────

async function getRegiones(req, res, next) {
  try {
    res.json(await catalogService.getRegiones());
  } catch (err) { next(err); }
}

async function createRegion(req, res, next) {
  try {
    const { nombre, orden, activo } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ success: false, message: 'nombre es requerido' });
    if (orden === undefined || orden === null) return res.status(400).json({ success: false, message: 'orden es requerido' });
    const data = await catalogService.createRegion({ nombre: nombre.trim(), orden: Number(orden), activo });
    await auditCatalog(req, { catalogo: 'region_anatomica', accion: 'CREAR', id: data.region_id, despues: data });
    res.status(201).json({ success: true, data });
  } catch (err) {
    await auditCatalogFailure(req, 'region_anatomica', 'CREAR', err);
    next(err);
  }
}

async function updateRegion(req, res, next) {
  try {
    const antes = await catalogService.getRegionById(Number(req.params.id));
    const data = await catalogService.updateRegion(Number(req.params.id), req.body);
    await auditCatalog(req, { catalogo: 'region_anatomica', accion: 'ACTUALIZAR', id: data.region_id, antes, despues: data });
    res.json({ success: true, data });
  } catch (err) {
    await auditCatalogFailure(req, 'region_anatomica', 'ACTUALIZAR', err);
    next(err);
  }
}

async function deleteRegion(req, res, next) {
  try {
    const antes = await catalogService.getRegionById(Number(req.params.id));
    await catalogService.deleteRegion(Number(req.params.id));
    await auditCatalog(req, { catalogo: 'region_anatomica', accion: 'ELIMINAR', id: Number(req.params.id), antes });
    res.status(204).send();
  } catch (err) {
    await auditCatalogFailure(req, 'region_anatomica', 'ELIMINAR', err);
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Lateralidad
// ─────────────────────────────────────────────────────────────

async function getLateralidades(req, res, next) {
  try {
    res.json(await catalogService.getLateralidades());
  } catch (err) { next(err); }
}

async function createLateralidad(req, res, next) {
  try {
    const { codigo, nombre, orden, activo } = req.body;
    if (!codigo?.trim()) return res.status(400).json({ success: false, message: 'codigo es requerido' });
    if (!nombre?.trim()) return res.status(400).json({ success: false, message: 'nombre es requerido' });
    if (orden === undefined || orden === null) return res.status(400).json({ success: false, message: 'orden es requerido' });
    const data = await catalogService.createLateralidad({ codigo: codigo.trim(), nombre: nombre.trim(), orden: Number(orden), activo });
    await auditCatalog(req, { catalogo: 'lateralidad', accion: 'CREAR', id: data.lateralidad_id, despues: data });
    res.status(201).json({ success: true, data });
  } catch (err) {
    await auditCatalogFailure(req, 'lateralidad', 'CREAR', err);
    next(err);
  }
}

async function updateLateralidad(req, res, next) {
  try {
    const antes = await catalogService.getLateralidadById(Number(req.params.id));
    const data = await catalogService.updateLateralidad(Number(req.params.id), req.body);
    await auditCatalog(req, { catalogo: 'lateralidad', accion: 'ACTUALIZAR', id: data.lateralidad_id, antes, despues: data });
    res.json({ success: true, data });
  } catch (err) {
    await auditCatalogFailure(req, 'lateralidad', 'ACTUALIZAR', err);
    next(err);
  }
}

async function deleteLateralidad(req, res, next) {
  try {
    const antes = await catalogService.getLateralidadById(Number(req.params.id));
    await catalogService.deleteLateralidad(Number(req.params.id));
    await auditCatalog(req, { catalogo: 'lateralidad', accion: 'ELIMINAR', id: Number(req.params.id), antes });
    res.status(204).send();
  } catch (err) {
    await auditCatalogFailure(req, 'lateralidad', 'ELIMINAR', err);
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Parte del cuerpo
// ─────────────────────────────────────────────────────────────

async function getPartesCuerpo(req, res, next) {
  try {
    if (req.query.groupBy === 'region') {
      const data = await catalogService.getPartesCuerpoByRegion();
      return res.json(data);
    }
    const data = await catalogService.getPartesCuerpo();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function createParteCuerpo(req, res, next) {
  try {
    const { region_id, nombre, orden, requiere_lateralidad, permite_linea_media, activo } = req.body;

    if (!region_id) return res.status(400).json({ success: false, message: 'region_id es requerido' });
    if (!nombre?.trim()) return res.status(400).json({ success: false, message: 'nombre es requerido' });

    const created = await catalogService.createParteCuerpo({
      region_id: Number(region_id),
      nombre: nombre.trim(),
      orden: orden !== undefined ? Number(orden) : 0,
      requiere_lateralidad: requiere_lateralidad !== undefined ? Boolean(requiere_lateralidad) : true,
      permite_linea_media: permite_linea_media !== undefined ? Boolean(permite_linea_media) : true,
      activo: activo !== undefined ? Boolean(activo) : true,
    });

    await auditCatalog(req, { catalogo: 'parte_del_cuerpo', accion: 'CREAR', id: created.parte_id, despues: created });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    await auditCatalogFailure(req, 'parte_del_cuerpo', 'CREAR', err);
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Signo catálogo
// ─────────────────────────────────────────────────────────────

async function getSignos(req, res, next) {
  try {
    const data = await catalogService.getSignos();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Examen catálogo
// ─────────────────────────────────────────────────────────────

async function getExamenes(req, res, next) {
  try {
    const data = await catalogService.getExamenes();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Asistencia parto
// ─────────────────────────────────────────────────────────────

async function getAsistenciaParto(req, res, next) {
  try {
    const data = await catalogService.getAsistenciaParto();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Referido de
// ─────────────────────────────────────────────────────────────

async function getReferidoDe(req, res, next) {
  try {
    const data = await catalogService.getReferidoDe();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Sexo
// ─────────────────────────────────────────────────────────────

async function getSexos(req, res, next) {
  try {
    const data = await catalogService.getSexos();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// Familiar catálogo
// ─────────────────────────────────────────────────────────────

async function getFamiliares(req, res, next) {
  try {
    const data = await catalogService.getFamiliares();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function createFamiliar(req, res, next) {
  try {
    const { nombre } = req.body;

    if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
      return res.status(400).json({ success: false, message: 'nombre es requerido' });
    }

    const created = await catalogService.createFamiliar({ nombre: nombre.trim() });
    await auditCatalog(req, { catalogo: 'familiar_catalogo', accion: 'CREAR', id: created.familiar_catalogo_id, despues: created });
    res.status(201).json({ success: true, data: created });
  } catch (err) {
    await auditCatalogFailure(req, 'familiar_catalogo', 'CREAR', err);
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────

module.exports = {
  getRegiones,
  createRegion,
  updateRegion,
  deleteRegion,
  getLateralidades,
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
