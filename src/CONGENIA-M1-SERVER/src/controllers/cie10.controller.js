'use strict';

const {
  acceptBatchItem,
  acceptBatchItems,
  acceptBatchClause,
  confirmBatch,
  createDecision,
  failureAuditDetail,
  getSugerencia,
  latestExportUrl,
  listActiveBatch,
  listBatch,
  listBatches,
  listDecisiones,
  listSugerencias,
  saveBatchCorrection,
  searchCatalog,
  updateDecision,
} = require('../services/cie10.service');
const {
  auditContext,
  recordAuditFailure,
} = require('../services/audit.service');

async function sugerencias(req, res, next) {
  try {
    if (req.query?.estado !== 'PENDIENTE') {
      const err = new Error('estado must be PENDIENTE');
      err.status = 400;
      err.code = 'INVALID_ESTADO';
      throw err;
    }
    const result = await listSugerencias({ query: req.query ?? {} });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function sugerencia(req, res, next) {
  try {
    const result = await getSugerencia(req.params.codigoTraductor);
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function decidir(req, res, next) {
  try {
    const result = await createDecision({
      codigoTraductor: req.params.codigoTraductor,
      payload: req.body ?? {},
      userAuth: req.userAuth,
      audit: auditContext(req),
    });
    res.set('Cache-Control', 'no-store');
    return res.status(201).json(result);
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'CIE10_DECISION_FALLIDA',
      entidadTipo: 'Cie10',
      entidadId: req.params.codigoTraductor,
      detalle: failureAuditDetail(err, req.params.codigoTraductor, req.body ?? {}),
    }, err);
    return next(err);
  }
}

async function corregir(req, res, next) {
  try {
    const result = await updateDecision({
      codigoTraductor: req.params.codigoTraductor,
      payload: req.body ?? {},
      userAuth: req.userAuth,
      audit: auditContext(req),
    });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'CIE10_DECISION_FALLIDA',
      entidadTipo: 'Cie10',
      entidadId: req.params.codigoTraductor,
      detalle: failureAuditDetail(err, req.params.codigoTraductor, req.body ?? {}),
    }, err);
    return next(err);
  }
}

async function decisiones(req, res, next) {
  try {
    const result = await listDecisiones({ userAuth: req.userAuth, query: req.query ?? {} });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function exportUrl(req, res, next) {
  try {
    const result = await latestExportUrl();
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function loteActivo(req, res, next) {
  try {
    const result = await listActiveBatch({ userAuth: req.userAuth, query: req.query ?? {} });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function lotes(req, res, next) {
  try {
    const result = await listBatches({ query: req.query ?? {} });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function lote(req, res, next) {
  try {
    const result = await listBatch({
      runId: req.params.runId,
      userAuth: req.userAuth,
      query: req.query ?? {},
    });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function catalogo(req, res, next) {
  try {
    const result = await searchCatalog(req.query ?? {});
    res.set('Cache-Control', 'private, max-age=60');
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function corregirItemLote(req, res, next) {
  try {
    const result = await saveBatchCorrection({
      runId: req.params.runId,
      codigoTraductor: req.params.codigoTraductor,
      payload: req.body ?? {},
      userAuth: req.userAuth,
      audit: auditContext(req),
    });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function aceptarItemLote(req, res, next) {
  try {
    const result = await acceptBatchItem({
      runId: req.params.runId,
      codigoTraductor: req.params.codigoTraductor,
      payload: req.body ?? {},
      userAuth: req.userAuth,
      audit: auditContext(req),
    });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function aceptarItemsLote(req, res, next) {
  try {
    const result = await acceptBatchItems({
      runId: req.params.runId,
      payload: req.body ?? {},
      userAuth: req.userAuth,
      audit: auditContext(req),
    });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function aceptarClausula(req, res, next) {
  try {
    const result = await acceptBatchClause({
      runId: req.params.runId,
      clauseVersion: req.body?.clauseVersion,
      userAuth: req.userAuth,
      audit: auditContext(req),
    });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'CIE10_LOTE_CONFIRMACION_FALLIDA', entidadTipo: 'Cie10Run',
      entidadId: req.params.runId, detalle: { runId: req.params.runId, phase: 'clause' },
    }, err);
    return next(err);
  }
}

async function confirmarLote(req, res, next) {
  try {
    const result = await confirmBatch({
      runId: req.params.runId,
      userAuth: req.userAuth,
      audit: auditContext(req),
    });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'CIE10_LOTE_CONFIRMACION_FALLIDA', entidadTipo: 'Cie10Run',
      entidadId: req.params.runId, detalle: { runId: req.params.runId, phase: 'confirm' },
    }, err);
    return next(err);
  }
}

module.exports = {
  aceptarItemLote,
  aceptarItemsLote,
  aceptarClausula,
  catalogo,
  confirmarLote,
  corregirItemLote,
  corregir,
  decidir,
  decisiones,
  exportUrl,
  loteActivo,
  lote,
  lotes,
  sugerencia,
  sugerencias,
};
