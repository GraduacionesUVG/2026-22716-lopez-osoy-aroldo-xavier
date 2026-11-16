'use strict';

const {
  initSession,
  activateSession,
  hasVigenteFicha,
} = require('../services/integration.service');
// Como modulo y no desestructurado: las pruebas reemplazan patientExists.
const nursera = require('../services/nursera.client');
const { normalizeTenantId, userCanAccessTenant } = require('../utils/tenant');
const {
  isProvisionalHistory,
  isValidReferredHistory,
  provisionalHistoryFor,
} = require('../utils/provisional');
const { getClientIp, recordAuditFailure, writeAuditEvent } = require('../services/audit.service');

function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function appError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  return err;
}

/** AAAA-MM-DD real y no posterior a hoy (UTC, que nunca va detras de Guatemala). */
function isValidConsultationDate(value, hoy) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime())
    && parsed.toISOString().slice(0, 10) === value
    && value <= hoy;
}

async function postInit(req, res, next) {
  try {
    const body = req.body ?? {};
    const p = body.paciente ?? {};
    const c = body.consulta ?? {};
    const m = body.medico ?? {};

    const missing = [];
    if (!isNonEmpty(p.patientId)) missing.push('paciente.patientId is required');
    if (!isNonEmpty(p.nombre)) missing.push('paciente.nombre is required');
    if (!isNonEmpty(c.fechaConsulta)) missing.push('consulta.fechaConsulta is required');
    if (!isNonEmpty(c.diagnosticoTexto)) missing.push('consulta.diagnosticoTexto is required');
    if (!isNonEmpty(m.medicoId)) missing.push('medico.medicoId is required');
    if (!isNonEmpty(m.nombre)) missing.push('medico.nombre is required');
    if (!isNonEmpty(m.especialidad)) missing.push('medico.especialidad is required');

    if (missing.length > 0) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD', details: missing });
    }
    // TMP- es el espacio de las fichas provisionales: SADC no puede usarlo.
    if (isProvisionalHistory(p.patientId) || isProvisionalHistory(p.historiaClinica)) {
      return res.status(400).json({
        error: 'INVALID_HISTORIA_CLINICA',
        details: ['El prefijo TMP- esta reservado para fichas provisionales'],
      });
    }

    const authContext = req.integrationAuth;

    if (!authContext) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Bearer token is required' });
    }

    const result = await initSession({
      authContext,
      body,
      ip: getClientIp(req),
    });

    await writeAuditEvent(req, {
      tipoEvento: 'SESION_INTEGRACION_CREADA',
      entidadTipo: 'Sesion',
      idTenant: authContext.tenantId,
      detalle: { systemId: authContext.systemId, expiresIn: result.expiresIn },
    });
    res.set('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'SESION_INTEGRACION_CREADA',
      entidadTipo: 'Sesion',
      idTenant: req.integrationAuth?.tenantId,
      detalle: { systemId: req.integrationAuth?.systemId ?? null },
    }, err);
    if (err.code === 'UNAUTHORIZED') {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: err.message });
    }
    next(err);
  }
}

async function postManualInit(req, res, next) {
  try {
    const body = req.body ?? {};
    const paciente = body.paciente ?? {};
    const historyValid = isNonEmpty(paciente.historiaClinica);
    const patientIdValid =
      (typeof paciente.patientId === 'string' && isNonEmpty(paciente.patientId)) ||
      (typeof paciente.patientId === 'number' && Number.isFinite(paciente.patientId));

    if ((!patientIdValid && !historyValid) || !isNonEmpty(paciente.nombre)) {
      return res.status(400).json({
        error: 'INVALID_PAYLOAD',
        details: ['paciente.historiaClinica (or paciente.patientId) and paciente.nombre are required'],
      });
    }

    if (!req.userAuth) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Bearer token is required' });
    }

    // Registrar una ficha exige fichas.crear en esa institucion, no solo acceso.
    const tenantId = normalizeTenantId(paciente.tenantId);
    if (!Number.isInteger(tenantId) || !userCanAccessTenant(req.userAuth, tenantId, 'fichas.crear')) {
      return res.status(403).json({
        error: 'TENANT_FORBIDDEN',
        message: 'Select an institution assigned by Keycloak',
      });
    }

    const provisional = body.provisional === true;
    const historiaBuscada = String(paciente.historiaClinica ?? paciente.patientId).trim();
    const hoy = new Date().toISOString().slice(0, 10);
    let historiaClinica = historiaBuscada;
    let fechaConsulta = isNonEmpty(body.consulta?.fechaConsulta) ? body.consulta.fechaConsulta : hoy;
    let diagnosticoTexto = typeof body.consulta?.diagnosticoTexto === 'string'
      ? body.consulta.diagnosticoTexto.trim()
      : '';

    if (provisional) {
      if (!isValidReferredHistory(historiaBuscada)) {
        throw appError(400, 'INVALID_HISTORIA_CLINICA', 'La historia clinica no tiene un formato valido');
      }
      if (!isValidConsultationDate(fechaConsulta, hoy)) {
        throw appError(400, 'INVALID_FECHA_CONSULTA', 'La fecha de consulta no es valida o es futura');
      }
      // Despues de la autorizacion: un usuario sin el tenant no puede usar
      // este endpoint para sondear que HC existen en SADC.
      if (await nursera.patientExists({ tenantId, historiaClinica: historiaBuscada })) {
        throw appError(409, 'PACIENTE_EXISTE_EN_SADC', 'La historia clinica existe en SADC; busque al paciente de nuevo');
      }
      historiaClinica = provisionalHistoryFor(tenantId, historiaBuscada);
      if (await hasVigenteFicha(tenantId, historiaClinica)) {
        throw appError(409, 'FICHA_VIGENTE_EXISTE', 'Ya existe una ficha provisional para esta historia clinica');
      }
      // La ficha provisional no trae diagnostico de SADC.
      diagnosticoTexto = '';
    } else if (isProvisionalHistory(historiaBuscada)) {
      throw appError(400, 'INVALID_HISTORIA_CLINICA', 'El prefijo TMP- esta reservado para fichas provisionales');
    }

    const result = await initSession({
      authContext: {
        systemId: process.env.OIDC_WEB_CLIENT_ID || 'congenia-web',
        tenantId,
      },
      body: {
        paciente: {
          patientId: provisional ? historiaClinica : String(paciente.patientId ?? paciente.historiaClinica),
          historiaClinica,
          tenantId,
          nombre: paciente.nombre.trim(),
        },
        consulta: {
          fechaConsulta,
          diagnosticoTexto,
        },
        medico: {
          medicoId: req.userAuth.subject,
          username: req.userAuth.username,
          nombre: req.userAuth.displayName,
          especialidad: req.userAuth.specialty,
        },
        provisional: provisional ? { historiaClinicaReferida: historiaBuscada } : null,
      },
      ip: getClientIp(req),
      origenCreacion: 'MANUAL',
    });

    await writeAuditEvent(req, {
      tipoEvento: 'SESION_INTEGRACION_MANUAL',
      entidadTipo: 'Sesion',
      idTenant: tenantId,
      detalle: { expiresIn: result.expiresIn, provisional },
    });
    res.set('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'SESION_INTEGRACION_MANUAL',
      entidadTipo: 'Sesion',
      idTenant: req.body?.paciente?.tenantId,
    }, err);
    next(err);
  }
}

async function postActivateSession(req, res, next) {
  try {
    const { auditActor, ...result } = await activateSession(req.redisSessionKey, getClientIp(req));
    await writeAuditEvent(req, {
      tipoEvento: 'SESION_INTEGRACION_ACTIVADA',
      entidadTipo: 'Ficha',
      entidadId: result.fichaId,
      idTenant: result.paciente?.tenantId,
      // X-Session-Token carries no identity; the session names its medico.
      actor: auditActor,
      detalle: {
        sessionId: result.sessionId,
        origenCreacion: result.origenCreacion,
        alreadyActive: result.alreadyActive,
      },
    });
    res.set('Cache-Control', 'no-store');
    return res.status(200).json(result);
  } catch (err) {
    await recordAuditFailure(req, { tipoEvento: 'SESION_INTEGRACION_ACTIVADA', entidadTipo: 'Ficha' }, err);
    if (err.code === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }
    if (err.code === 'SESSION_EXPIRED') {
      return res.status(410).json({ error: 'SESSION_EXPIRED', message: err.message });
    }
    if (err.code === 'SESSION_CONSUMED') {
      return res.status(409).json({ error: 'SESSION_CONSUMED' });
    }
    next(err);
  }
}

module.exports = { postInit, postManualInit, postActivateSession };
