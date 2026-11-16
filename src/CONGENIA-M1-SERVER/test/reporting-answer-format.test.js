'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeAgentAnswer } = require('../src/utils/sanitizeAgentAnswer');

test('agent answers preserve only the approved presentation HTML', () => {
  const answer = sanitizeAgentAnswer(
    '<p>Hay <strong>12</strong> casos de <code>N39.0</code>.</p>'
    + '<script>alert(1)</script><a href="https://example.com">Más</a>'
    + '<em style="color:red">detalle</em><br class="x">fin'
  );

  assert.equal(answer, '<p>Hay <strong>12</strong> casos de <code>N39.0</code>.</p>Másdetallefin');
  assert.doesNotMatch(answer, /script|href|style|class/);
});

test('plain agent answers remain compatible', () => {
  assert.equal(sanitizeAgentAnswer('Se encontraron 12 registros.'), 'Se encontraron 12 registros.');
});
