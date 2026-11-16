'use strict';

const { registerFicha } = require('../services/patient.service');
const { auditContext, getClientIp, recordAuditFailure } = require('../services/audit.service');
const { resolveSignatureInput, parseSignaturePng } = require('../services/consent-signature.service');

const VALID_TIPO_FIRMANTE = ['PADRE', 'MADRE', 'TUTOR', 'REPRESENTANTE_LEGAL'];
const VALID_IDIOMA = ['ESPANOL', 'QEQCHI', 'IXIL'];
const VALID_COMUNIDAD = ['SI', 'NO', 'DESCONOCIDO'];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isNonNegativeInt(v) {
  return Number.isInteger(v) && v >= 0;
}

function isPositiveInt(v) {
  return Number.isInteger(v) && v > 0;
}

function validateObservations(body, errors) {
  if (body.observations === undefined) return;
  if (!Array.isArray(body.observations)) {
    errors.push('observations must be an array');
    return;
  }
  body.observations.forEach((item, i) => {
    if (!isNonEmptyString(item?.observationText)) {
      errors.push(`observations[${i}].observationText is required`);
      return;
    }
    const text = item.observationText.trim();
    if (text.length > 1000) {
      errors.push(`observations[${i}].observationText exceeds 1000 characters`);
    }
  });
}

function validateBody(body) {
  const errors = [];
  const consent = body.consent ?? {};

  // ── Top-level fields ─────────────────────────────────────────────────────
  // tokenPreviousInfo has been replaced by the X-Session-Token header (handled by middleware)
  if (!isPositiveInt(body.referralSourceId)) {
    errors.push('referralSourceId must be a positive integer');
  }
  if (body.birthMethodId !== null && body.birthMethodId !== undefined && !isPositiveInt(body.birthMethodId)) {
    errors.push('birthMethodId must be a positive integer or null');
  }
  if (!isPositiveInt(body.sexId)) {
    errors.push('sexId must be a positive integer');
  }
  if (typeof body.affectedRelatives !== 'boolean') {
    errors.push('affectedRelatives must be a boolean');
  }
  if (!Array.isArray(body.affectedRelativesCategoryIds)) {
    errors.push('affectedRelativesCategoryIds must be an array');
  } else if (body.affectedRelativesCategoryIds.some((id) => !isPositiveInt(id))) {
    errors.push('each affectedRelativesCategoryIds item must be a positive integer');
  }
  if (!isNonNegativeInt(body.affectedUnderageRelatives)) {
    errors.push('affectedUnderageRelatives must be a non-negative integer');
  }
  if (!isNonNegativeInt(body.affectedAdultRelatives)) {
    errors.push('affectedAdultRelatives must be a non-negative integer');
  }
  if (!VALID_COMUNIDAD.includes(body.affectedCommunityMembers)) {
    errors.push(`affectedCommunityMembers must be one of: ${VALID_COMUNIDAD.join(', ')}`);
  }

  // ── warningSigns ─────────────────────────────────────────────────────────
  if (!Array.isArray(body.warningSigns)) {
    errors.push('warningSigns must be an array');
  } else {
    body.warningSigns.forEach((s, i) => {
      if (!isNonEmptyString(s.signDescription)) {
        errors.push(`warningSigns[${i}].signDescription is required`);
      } else if (s.signDescription.trim().length > 300) {
        errors.push(`warningSigns[${i}].signDescription exceeds 300 characters`);
      }
      if (!isPositiveInt(s.partCatalogId)) {
        errors.push(`warningSigns[${i}].partCatalogId must be a positive integer`);
      }
    });
  }

  // ── examDiagnoses ─────────────────────────────────────────────────────────
  if (!Array.isArray(body.examDiagnoses)) {
    errors.push('examDiagnoses must be an array');
  } else {
    body.examDiagnoses.forEach((e, i) => {
      if (!isNonEmptyString(e.examDescription)) {
        errors.push(`examDiagnoses[${i}].examDescription is required`);
      } else if (e.examDescription.trim().length > 300) {
        errors.push(`examDiagnoses[${i}].examDescription exceeds 300 characters`);
      }
    });
  }

  // ── observations ─────────────────────────────────────────────────────────
  validateObservations(body, errors);

  // ── consent ───────────────────────────────────────────────────────────────
  if (!VALID_TIPO_FIRMANTE.includes(consent.tipoFirmante)) {
    errors.push(`consent.tipoFirmante must be one of: ${VALID_TIPO_FIRMANTE.join(', ')}`);
  }
  if (!isNonEmptyString(consent.nombreFirmante)) {
    errors.push('consent.nombreFirmante is required');
  }
  if (!VALID_IDIOMA.includes(consent.idiomaConsentimiento)) {
    errors.push(`consent.idiomaConsentimiento must be one of: ${VALID_IDIOMA.join(', ')}`);
  }
  if (consent.aceptacionTerminos !== true) {
    errors.push('consent.aceptacionTerminos must be true');
  }
  if (typeof consent.aceptacionContacto !== 'boolean') {
    errors.push('consent.aceptacionContacto must be a boolean');
  }
  if (!consent.firmaEvidenciaTecnica || typeof consent.firmaEvidenciaTecnica !== 'object' || Array.isArray(consent.firmaEvidenciaTecnica)) {
    errors.push('consent.firmaEvidenciaTecnica must be a non-null object');
  }
  try {
    parseSignaturePng(resolveSignatureInput(consent));
  } catch (err) {
    if (err.code !== 'INVALID_SIGNATURE_PNG') throw err;
    errors.push(err.message);
  }

  return errors;
}

async function createPatient(req, res, next) {
  try {
    const body = req.body ?? {};

    const errors = validateBody(body);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD', details: errors });
    }

    const ip = getClientIp(req);

    // req.redisSessionKey is set by requireXSessionToken middleware.
    // systemId is read from the Redis session payload inside registerFicha.
    const result = await registerFicha({
      redisSessionKey: req.redisSessionKey,
      body,
      ip,
      audit: auditContext(req),
    });

    return res.status(result.alreadySubmitted ? 200 : 201).json({ success: true, ...result, data: result });
  } catch (err) {
    await recordAuditFailure(req, { tipoEvento: 'FICHA_CREADA', entidadTipo: 'Ficha' }, err);
    if (['SESSION_CONSUMED', 'SESSION_PROCESSING', 'SESSION_PENDING'].includes(err.code)) {
      return res.status(err.status ?? 409).json({ error: err.code, message: err.message });
    }
    if (err.code === 'FICHA_VIGENTE_EXISTE') {
      return res.status(409).json({ error: 'FICHA_VIGENTE_EXISTE', message: err.message });
    }
    if (err.code === 'FICHA_ALREADY_EXISTS') {
      return res.status(409).json({ error: 'FICHA_ALREADY_EXISTS', message: err.message });
    }
    if (err.code === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: err.message });
    }
    if (['INVALID_UPLOAD_REFERENCE', 'INVALID_SEX_ID', 'INVALID_SIGNATURE_PNG'].includes(err.code)) {
      return res.status(400).json({ error: err.code, message: err.message });
    }
    next(err);
  }
}

module.exports = { createPatient };
