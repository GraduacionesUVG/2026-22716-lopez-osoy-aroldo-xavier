'use strict';

/**
 * Consulta de pacientes en Nursera (SADC) desde el servidor.
 *
 * Dos usos: la busqueda de la ficha (findPatient), que antes salia del
 * navegador sin autenticacion ni auditoria y ahora pasa por la API con la
 * institucion del token; y la confirmacion de que una HC no existe antes de
 * aceptar una ficha provisional (patientExists). Si Nursera no responde se
 * falla cerrado (503, o 504 si vence el tiempo limite).
 *
 * GET {NURSERA_API_BASE_URL}/Paciente?idTenant=&historiaClinica=
 * Nursera responde 200 con `valores` vacio cuando no encuentra al paciente.
 *
 * Los logs registran solo el estado HTTP, nunca la HC ni el cuerpo.
 */

const { logError } = require('../config/logger');

const DEFAULT_BASE_URL = 'https://api.nursera.app';
const TIMEOUT_MS = 10_000;
// La busqueda de la ficha conserva el limite que tenia en el navegador.
const SEARCH_TIMEOUT_MS = 20_000;

function appError(status, code, message) {
  const err = new Error(message ?? code);
  err.status = status;
  err.code = code;
  return err;
}

function baseUrl() {
  const configured = process.env.NURSERA_API_BASE_URL;
  const value = typeof configured === 'string' && configured.trim() ? configured.trim() : DEFAULT_BASE_URL;
  return value.replace(/\/+$/, '');
}

function unavailable() {
  return appError(503, 'SADC_UNAVAILABLE', 'No se pudo verificar la historia clinica en SADC');
}

function timedOut() {
  return appError(504, 'SADC_TIMEOUT', 'SADC no respondio dentro del tiempo limite');
}

/** Lista `valores` de Nursera para esa HC en ese tenant. No hay cache. */
async function lookup({ tenantId, historiaClinica, timeoutMs }) {
  const query = new URLSearchParams({
    idTenant: String(tenantId),
    historiaClinica: String(historiaClinica).trim(),
  });

  let response;
  try {
    response = await fetch(`${baseUrl()}/Paciente?${query}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    logError('NURSERA_LOOKUP_FAILED', { reason: err.name });
    throw err.name === 'TimeoutError' ? timedOut() : unavailable();
  }

  if (!response.ok) {
    logError('NURSERA_LOOKUP_FAILED', { status: response.status });
    throw unavailable();
  }

  let envelope;
  try {
    envelope = await response.json();
  } catch {
    logError('NURSERA_LOOKUP_FAILED', { reason: 'INVALID_JSON' });
    throw unavailable();
  }

  if (!envelope || envelope.error) {
    logError('NURSERA_LOOKUP_FAILED', { reason: 'ENVELOPE_ERROR' });
    throw unavailable();
  }

  return Array.isArray(envelope.valores) ? envelope.valores : [];
}

/** true si Nursera tiene un paciente con esa HC en ese tenant. */
async function patientExists({ tenantId, historiaClinica }) {
  try {
    return (await lookup({ tenantId, historiaClinica, timeoutMs: TIMEOUT_MS })).length > 0;
  } catch (err) {
    // El alta provisional falla cerrado igual ante un timeout.
    if (err.code === 'SADC_TIMEOUT') throw unavailable();
    throw err;
  }
}

/**
 * Paciente de Nursera para la busqueda de la ficha, o null si no existe.
 * Solo se devuelve si pertenece a la institucion consultada: el servidor no
 * reenvia al navegador un paciente de otro tenant aunque Nursera lo entregue.
 */
async function findPatient({ tenantId, historiaClinica }) {
  const valores = await lookup({ tenantId, historiaClinica, timeoutMs: SEARCH_TIMEOUT_MS });
  const origen = valores[0];
  if (!origen) return null;
  if (typeof origen.historiaClinica !== 'string' || !origen.historiaClinica.trim() || origen.idInstitucion == null) {
    logError('NURSERA_LOOKUP_FAILED', { reason: 'INVALID_PATIENT' });
    throw appError(502, 'SADC_INVALID_RESPONSE', 'SADC devolvio un paciente sin historia clinica o institucion');
  }
  if (String(origen.idInstitucion).trim() !== String(tenantId)) {
    logError('NURSERA_LOOKUP_FAILED', { reason: 'TENANT_MISMATCH' });
    throw appError(502, 'SADC_INVALID_RESPONSE', 'SADC devolvio un paciente de otra institucion');
  }
  return {
    idPaciente: origen.idPaciente ?? null,
    idInstitucion: origen.idInstitucion,
    nombres: typeof origen.nombres === 'string' ? origen.nombres : '',
    apellidos: typeof origen.apellidos === 'string' ? origen.apellidos : '',
    historiaClinica: origen.historiaClinica,
  };
}

module.exports = { patientExists, findPatient, lookup, SEARCH_TIMEOUT_MS };
