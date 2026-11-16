'use strict';

const {
  approveRevision,
  createRevision,
  getDashboardDetail,
  getFichaDetail,
  getFichaVigente,
  getMe,
  listAdendas,
  listFichasPaciente,
  listPendingFichas,
  rejectRevision,
  resolveRevision,
  searchAuditDetail,
  searchFichas,
} = require('../services/ficha.service');
const {
  auditContext,
  getClientIp,
  recordAuditFailure,
  writeAuditEvent,
} = require('../services/audit.service');

// Reads of clinical data are fail-closed: the audit row is written before the
// response, and if it cannot be written the client gets a 500 instead of the
// data. Mutations write their events inside their own transaction (services).

async function me(req, res, next) {
  try {
    res.set('Cache-Control', 'no-store');
    return res.json(await getMe(req.userAuth));
  } catch (err) {
    return next(err);
  }
}

async function search(req, res, next) {
  try {
    const result = await searchFichas({ userAuth: req.userAuth, query: req.query ?? {} });
    await writeAuditEvent(req, {
      tipoEvento: 'FICHA_BUSQUEDA',
      entidadTipo: 'Ficha',
      detalle: { ...searchAuditDetail(req.query ?? {}), resultCount: result.items.length, total: result.total },
    });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'FICHA_BUSQUEDA',
      entidadTipo: 'Ficha',
      detalle: searchAuditDetail(req.query ?? {}),
    }, err);
    return next(err);
  }
}

async function dashboardDetail(req, res, next) {
  try {
    const result = await getDashboardDetail({ fichaId: req.params.fichaId, userAuth: req.userAuth });
    await writeAuditEvent(req, {
      tipoEvento: 'FICHA_LEIDA',
      entidadTipo: 'Ficha',
      entidadId: req.params.fichaId,
      idTenant: result.idTenant,
      detalle: { vista: 'dashboard' },
    });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'FICHA_LEIDA',
      entidadTipo: 'Ficha',
      entidadId: req.params.fichaId,
      detalle: { vista: 'dashboard' },
    }, err);
    return next(err);
  }
}

async function listPaciente(req, res, next) {
  try {
    const result = await listFichasPaciente({
      tenantId: req.params.tenantId,
      historiaClinica: req.params.historiaClinica,
      userAuth: req.userAuth,
    });
    await writeAuditEvent(req, {
      tipoEvento: 'FICHA_LISTADA',
      entidadTipo: 'Ficha',
      idTenant: req.params.tenantId,
      detalle: { vista: 'historial', fichaIds: result.map((item) => item.fichaId) },
    });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'FICHA_LISTADA',
      entidadTipo: 'Ficha',
      idTenant: req.params.tenantId,
      detalle: { vista: 'historial' },
    }, err);
    return next(err);
  }
}

async function vigentePaciente(req, res, next) {
  try {
    const result = await getFichaVigente({
      tenantId: req.params.tenantId,
      historiaClinica: req.params.historiaClinica,
      userAuth: req.userAuth,
    });
    await writeAuditEvent(req, {
      tipoEvento: 'FICHA_LISTADA',
      entidadTipo: 'Ficha',
      entidadId: result.ficha?.fichaId ?? null,
      idTenant: req.params.tenantId,
      detalle: { vista: 'vigente', encontrada: result.ficha !== null },
    });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'FICHA_LISTADA',
      entidadTipo: 'Ficha',
      idTenant: req.params.tenantId,
      detalle: { vista: 'vigente' },
    }, err);
    return next(err);
  }
}

async function apiDetail(req, res, next) {
  try {
    const result = await getFichaDetail({ fichaId: req.params.id, userAuth: req.userAuth });
    await writeAuditEvent(req, {
      tipoEvento: 'FICHA_LEIDA',
      entidadTipo: 'Ficha',
      entidadId: req.params.id,
      idTenant: result.paciente?.tenantId,
      detalle: { vista: 'detalle', revision: result.revision },
    });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'FICHA_LEIDA',
      entidadTipo: 'Ficha',
      entidadId: req.params.id,
      detalle: { vista: 'detalle' },
    }, err);
    return next(err);
  }
}

async function pending(req, res, next) {
  try {
    const result = await listPendingFichas({ userAuth: req.userAuth });
    await writeAuditEvent(req, {
      tipoEvento: 'FICHA_LISTADA',
      entidadTipo: 'Ficha',
      detalle: { vista: 'pendientes', fichaIds: result.map((item) => item.fichaId) },
    });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'FICHA_LISTADA',
      entidadTipo: 'Ficha',
      detalle: { vista: 'pendientes' },
    }, err);
    return next(err);
  }
}

async function adendas(req, res, next) {
  try {
    const result = await listAdendas({ userAuth: req.userAuth, query: req.query ?? {} });
    await writeAuditEvent(req, {
      tipoEvento: 'ADENDA_BUSQUEDA',
      entidadTipo: 'Ficha',
      detalle: { ...searchAuditDetail(req.query ?? {}), estado: req.query?.estado ?? 'PENDIENTE', resultCount: result.items.length, total: result.total },
    });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'ADENDA_BUSQUEDA',
      entidadTipo: 'Ficha',
      detalle: { ...searchAuditDetail(req.query ?? {}), estado: req.query?.estado ?? null },
    }, err);
    return next(err);
  }
}

async function revision(req, res, next) {
  try {
    const result = await createRevision({
      fichaId: req.params.id,
      payload: req.body ?? {},
      userAuth: req.userAuth,
      ip: getClientIp(req),
      audit: auditContext(req),
    });
    return res.status(201).json(result);
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'ADENDA_SOLICITADA',
      entidadTipo: 'Ficha',
      entidadId: req.params.id,
    }, err);
    return next(err);
  }
}

async function resolve(req, res, next) {
  try {
    return res.json(await resolveRevision({
      fichaId: req.params.id,
      decisiones: req.body?.decisiones ?? [],
      userAuth: req.userAuth,
      ip: getClientIp(req),
      audit: auditContext(req),
    }));
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'ADENDA_RESUELTA',
      entidadTipo: 'Ficha',
      entidadId: req.params.id,
    }, err);
    return next(err);
  }
}

async function approve(req, res, next) {
  try {
    return res.json(await approveRevision({
      fichaId: req.params.id,
      userAuth: req.userAuth,
      ip: getClientIp(req),
      audit: auditContext(req),
    }));
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'ADENDA_RESUELTA',
      entidadTipo: 'Ficha',
      entidadId: req.params.id,
      detalle: { via: 'aprobar' },
    }, err);
    return next(err);
  }
}

async function reject(req, res, next) {
  try {
    return res.json(await rejectRevision({
      fichaId: req.params.id,
      motivo: req.body?.motivo,
      userAuth: req.userAuth,
      ip: getClientIp(req),
      audit: auditContext(req),
    }));
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'ADENDA_RESUELTA',
      entidadTipo: 'Ficha',
      entidadId: req.params.id,
      detalle: { via: 'rechazar' },
    }, err);
    return next(err);
  }
}

module.exports = {
  adendas,
  apiDetail,
  approve,
  dashboardDetail,
  listPaciente,
  me,
  pending,
  reject,
  resolve,
  revision,
  search,
  vigentePaciente,
};
