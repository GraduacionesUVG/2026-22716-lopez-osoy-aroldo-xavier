'use strict';

// Como modulo y no desestructurado: las pruebas reemplazan findPatient.
const nursera = require('../services/nursera.client');
const { writeAuditEvent, recordAuditFailure } = require('../services/audit.service');
const { normalizeTenantId, userCanAccessTenant } = require('../utils/tenant');
const { patientNameTokenHex } = require('../utils/patientName');

function appError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  return err;
}

const HISTORIA_CLINICA = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/;
const SADC_ERRORS = new Set(['SADC_UNAVAILABLE', 'SADC_TIMEOUT', 'SADC_INVALID_RESPONSE']);

/**
 * Detalle de bitacora sin PHI: la historia clinica se guarda como el mismo
 * HMAC que usan las busquedas de nombre, de modo que dos consultas de la misma
 * HC se pueden correlacionar sin que la HC quede en claro.
 */
function auditDetail(historiaClinica, extra = {}) {
  const hc = String(historiaClinica ?? '').trim();
  return { hcTokenHash: hc ? patientNameTokenHex(hc.toLowerCase()) : null, ...extra };
}

/**
 * GET /api/v1/sadc/pacientes?idTenant=&historiaClinica=
 *
 * Consulta del paciente en SADC hecha por el servidor con el usuario
 * autenticado. La institucion debe ser una de las del token; si el usuario
 * tiene una sola, puede omitirse. La respuesta es PHI: no se cachea.
 */
async function buscarPaciente(req, res, next) {
  const historiaClinica = String(req.query?.historiaClinica ?? '').trim();
  let tenantId = null;
  try {
    if (!HISTORIA_CLINICA.test(historiaClinica)) {
      throw appError(400, 'INVALID_HISTORIA_CLINICA', 'historiaClinica is required');
    }

    const requested = req.query?.idTenant;
    if (requested != null && String(requested).trim() !== '') {
      tenantId = normalizeTenantId(requested);
      if (!Number.isInteger(tenantId)) {
        throw appError(400, 'INVALID_TENANT', 'idTenant must be numeric');
      }
    } else {
      const tenants = (req.userAuth?.tenants ?? []).map(normalizeTenantId).filter(Number.isInteger);
      if (tenants.length !== 1) {
        throw appError(400, 'TENANT_REQUIRED', 'idTenant is required when the user has several institutions');
      }
      [tenantId] = tenants;
    }

    if (!userCanAccessTenant(req.userAuth, tenantId)) {
      throw appError(403, 'TENANT_FORBIDDEN', 'The institution is not assigned to the authenticated user');
    }

    const paciente = await nursera.findPatient({ tenantId, historiaClinica });
    await writeAuditEvent(req, {
      tipoEvento: 'SADC_PACIENTE_CONSULTADO',
      entidadTipo: 'Paciente',
      idTenant: tenantId,
      statusCode: paciente ? 200 : 404,
      detalle: auditDetail(historiaClinica, { encontrado: Boolean(paciente) }),
    });

    res.set('Cache-Control', 'no-store');
    if (!paciente) {
      return res.status(404).json({ success: false, error: 'PATIENT_NOT_FOUND', message: 'No se encontró historia clínica' });
    }
    return res.json({ success: true, data: paciente });
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'SADC_PACIENTE_CONSULTADO',
      entidadTipo: 'Paciente',
      idTenant: tenantId,
      detalle: auditDetail(historiaClinica),
    }, err);
    const known = (err.status >= 400 && err.status < 500) || SADC_ERRORS.has(err.code);
    if (known) {
      res.set('Cache-Control', 'no-store');
      return res.status(err.status).json({ success: false, error: err.code, message: err.message });
    }
    return next(err);
  }
}

module.exports = { buscarPaciente };
