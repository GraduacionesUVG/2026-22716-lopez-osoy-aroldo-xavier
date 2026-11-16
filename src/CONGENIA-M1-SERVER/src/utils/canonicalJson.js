'use strict';

/**
 * JSON con las claves de cada objeto ordenadas, sin espacios.
 *
 * jsonb no conserva el orden de las claves: un hash calculado sobre
 * JSON.stringify del body no se puede recalcular desde la fila guardada. Este
 * formato si, porque no depende del orden de entrada.
 */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : canonicalJson(item))).join(',')}]`;
  }
  const entries = Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
  return `{${entries.join(',')}}`;
}

module.exports = { canonicalJson };
