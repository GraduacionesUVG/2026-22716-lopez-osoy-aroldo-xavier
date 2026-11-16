'use strict';

/**
 * Historia clinica provisional: la ficha de un paciente cuya HC no existe en
 * SADC se guarda como 'TMP-<id_tenant>-<HC buscada>' hasta consolidarse.
 *
 * El formato lo fija tambien el CHECK ck_ficha_provisional_formato
 * (db/init/10_ficha_provisional.sql); si cambia aqui, cambia alla.
 */

const PROVISIONAL_PREFIX = 'TMP-';
// 48 = 64 (ficha_clinica.historia_clinica) - 'TMP-' - tenant - '-'.
const REFERRED_HISTORY_PATTERN = /^[A-Za-z0-9-]{1,48}$/;

function isProvisionalHistory(historiaClinica) {
  return typeof historiaClinica === 'string'
    && historiaClinica.trim().toUpperCase().startsWith(PROVISIONAL_PREFIX);
}

/** La HC que escribio el medico: corta, sin espacios ni prefijo TMP-. */
function isValidReferredHistory(historiaClinica) {
  return typeof historiaClinica === 'string'
    && REFERRED_HISTORY_PATTERN.test(historiaClinica)
    && !isProvisionalHistory(historiaClinica);
}

function provisionalHistoryFor(tenantId, historiaClinica) {
  return `${PROVISIONAL_PREFIX}${tenantId}-${historiaClinica}`;
}

module.exports = {
  PROVISIONAL_PREFIX,
  isProvisionalHistory,
  isValidReferredHistory,
  provisionalHistoryFor,
};
