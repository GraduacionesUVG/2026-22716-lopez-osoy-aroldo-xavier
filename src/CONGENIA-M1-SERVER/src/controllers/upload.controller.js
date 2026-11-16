'use strict';

const db = require('../config/db');
const {
  generatePresignedUploadUrl,
  generatePresignedPatientUploadUrl,
  CATEGORY_PATH,
} = require('../services/upload.service');
const { logError } = require('../config/logger');
const { userCanAccessTenant } = require('../utils/tenant');
const { recordAuditFailure, writeAuditEvent } = require('../services/audit.service');

const VALID_CATEGORIES = Object.keys(CATEGORY_PATH);

async function createPresignedUrl(req, res, next) {
  try {
    const { category, contentType, sizeBytes } = req.body ?? {};

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: 'INVALID_CATEGORY',
        message: `category must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    const { audit, ...result } = await generatePresignedUploadUrl({
      redisKey: req.redisSessionKey,
      category,
      contentType,
      sizeBytes,
    });

    await writeAuditEvent(req, {
      tipoEvento: 'URL_PREFIRMADA_GENERADA',
      entidadTipo: 'Archivo',
      entidadId: result.documentId,
      actor: audit.actor,
      idTenant: audit.idTenant,
      detalle: { flujo: 'sesion', category, contentType, sizeBytes, objectKey: result.objectKey },
    });
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'URL_PREFIRMADA_GENERADA',
      entidadTipo: 'Archivo',
      detalle: { flujo: 'sesion', category: req.body?.category ?? null },
    }, err);
    if (['INVALID_CATEGORY', 'INVALID_CONTENT_TYPE', 'INVALID_FILE_SIZE'].includes(err.code)) {
      return res.status(400).json({ error: err.code, message: err.message });
    }
    if (err.code === 'SESSION_NOT_FOUND') {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND', message: err.message });
    }
    logError('PRESIGNED_URL_GENERATION_FAILED', {
      code: err.code,
      status: err.status,
      message: err.message,
      category: req.body?.category,
    });
    next(err);
  }
}

async function createPatientPresignedUrl(req, res, next) {
  try {
    const { category, contentType, sizeBytes } = req.body ?? {};
    const pacienteId = String(req.params.pacienteId ?? '').trim();

    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: 'INVALID_CATEGORY',
        message: `category must be one of: ${VALID_CATEGORIES.join(', ')}`,
      });
    }

    if (!pacienteId) {
      return res.status(400).json({
        error: 'INVALID_PATIENT_ID',
        message: 'pacienteId is required',
      });
    }

    const lookup = await db.query(
      `SELECT id_tenant
         FROM ficha_clinica
        WHERE paciente_id = $1
        ORDER BY es_vigente DESC, fecha_creacion DESC
        LIMIT 1`,
      [pacienteId]
    );

    const tenantId = lookup.rows[0]?.id_tenant;
    if (!tenantId || !userCanAccessTenant(req.userAuth, tenantId)) {
      return res.status(404).json({
        success: false,
        error: 'PATIENT_NOT_FOUND',
        message: 'Patient not found',
      });
    }

    const result = await generatePresignedPatientUploadUrl({
      pacienteId,
      tenantId,
      category,
      contentType,
      sizeBytes,
    });

    await writeAuditEvent(req, {
      tipoEvento: 'URL_PREFIRMADA_GENERADA',
      entidadTipo: 'Paciente',
      entidadId: pacienteId,
      idTenant: tenantId,
      detalle: { flujo: 'paciente', category, contentType, sizeBytes, objectKey: result.objectKey },
    });
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    await recordAuditFailure(req, {
      tipoEvento: 'URL_PREFIRMADA_GENERADA',
      entidadTipo: 'Paciente',
      entidadId: req.params?.pacienteId,
      detalle: { flujo: 'paciente', category: req.body?.category ?? null },
    }, err);
    if (['INVALID_CATEGORY', 'INVALID_CONTENT_TYPE', 'INVALID_FILE_SIZE', 'INVALID_PATIENT_ID'].includes(err.code)) {
      return res.status(400).json({ error: err.code, message: err.message });
    }
    logError('PATIENT_PRESIGNED_URL_GENERATION_FAILED', {
      code: err.code,
      status: err.status,
      message: err.message,
      pacienteId: req.params?.pacienteId,
      category: req.body?.category,
      userId: req.userAuth?.sub,
    });
    next(err);
  }
}

module.exports = { createPresignedUrl, createPatientPresignedUrl };
