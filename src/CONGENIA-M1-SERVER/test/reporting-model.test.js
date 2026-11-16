'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LLM_API_KEY = 'test-only';
process.env.LLM_MODEL = 'gpt-6-luna';
process.env.LLM_REASONING_EFFORT = 'low';
const { callModel } = require('../src/services/reporting.service');

test('Luna tool planning uses Responses with the configured reasoning effort', async (t) => {
  let request = 0;
  t.mock.method(global, 'fetch', async (url, options) => {
    request += 1;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-6-luna');
    assert.deepEqual(body.reasoning, { effort: 'low' });
    assert.equal(body.store, false);
    assert.equal(body.parallel_tool_calls, false);
    assert.match(body.instructions, /No uses\s+Markdown/);
    assert.match(body.instructions, /<strong>/);
    assert.match(body.instructions, /No agregues una\s+tabla por defecto/);
    if (request === 1) assert.equal(body.input, 'Agrupa los registros SIGSA por sexo');
    assert.ok(body.tools.every((tool) => tool.type === 'function' && tool.name && tool.parameters && tool.strict === false));
    return request === 1
      ? { ok: true, json: async () => ({ output: [
        { type: 'reasoning', summary: [] },
        { type: 'function_call', call_id: 'call-1', name: 'sigsa_group_by_dimension', arguments: '{"dimension":"sexo"}' },
      ], usage: { input_tokens: 20, output_tokens: 10 } }) }
      : { ok: true, json: async () => ({ output: [
        { type: 'message', content: [{ type: 'output_text', text: '{"status":"success","answer":"Resultado por sexo."}' }] },
      ], usage: { input_tokens: 30, output_tokens: 5 } }) };
  });
  const result = await callModel('Agrupa los registros SIGSA por sexo', [], {
    executeTool: async () => ({ source: 'SIGSA', result: [{ sexo: 'F', total: 2 }], answer: 'Resultado.' }),
  });
  assert.equal(result.parsed.answer, 'Resultado por sexo.');
  assert.equal(result.lastToolResult.source, 'SIGSA');
  assert.equal(result.usage.inputTokens, 50);
  assert.equal(result.usage.apiCalls, 2);
  assert.equal(typeof result.modelLatencyMs, 'number');
});

test('Responses text output preserves blocked decisions', async (t) => {
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ output: [
    { type: 'message', content: [{ type: 'output_text', text: '{"status":"blocked","source":"OUT_OF_SCOPE"}' }] },
  ] }) }));
  assert.equal((await callModel('Una pregunta fuera del alcance')).parsed.status, 'blocked');
});

test('transient semantic metadata never becomes the visible tool result', async (t) => {
  let request = 0;
  t.mock.method(global, 'fetch', async () => {
    request += 1;
    return request === 1
      ? { ok: true, json: async () => ({ output: [
        { type: 'function_call', call_id: 'semantic-1', name: 'describe_semantic_model', arguments: '{"source":"CONGENIA"}' },
      ] }) }
      : { ok: true, json: async () => ({ output: [
        { type: 'message', content: [{ type: 'output_text', text: '{"status":"success","source":"CONGENIA","answer":"<p>Puedo realizar consultas agregadas.</p>"}' }] },
      ] }) };
  });

  const result = await callModel('¿Qué análisis agregados puedes realizar?', [], {
    executeTool: async () => ({
      source: 'CONGENIA',
      result: [{ version: 'reporting-semantic-v1', fields: ['diagnostico'] }],
      answer: 'Metadatos internos.',
      transient: true,
    }),
  });

  assert.equal(result.lastToolResult, null);
  assert.equal(result.parsed.answer, '<p>Puedo realizar consultas agregadas.</p>');
});

test('Responses receives only the bounded visible conversation context', async (t) => {
  let request = 0;
  t.mock.method(global, 'fetch', async (_url, options) => {
    request += 1;
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-6-luna');
    assert.deepEqual(body.reasoning, { effort: 'low' });
    assert.equal(body.store, false);
    if (request === 1) {
      assert.equal(body.input[0].role, 'user');
      assert.match(body.input[1].content, /Z54\.9/);
      assert.equal(body.input[2].content, '¿Qué significa ese código?');
      return { ok: true, json: async () => ({ output: [
        { type: 'function_call', call_id: 'call-1', name: 'sigsa_lookup_cie10', arguments: '{"code":"Z54.9"}' },
      ] }) };
    }
    return { ok: true, json: async () => ({ output: [
      { type: 'message', content: [{ type: 'output_text', text: '{"status":"success","answer":"Descripción encontrada."}' }] },
    ] }) };
  });

  const result = await callModel('¿Qué significa ese código?', [{
    question: '¿Cuál es el código más común?',
    answer: 'El código más común es Z54.9.',
    source: 'SIGSA',
    result: [{ valor: 'Z54.9', total: 17951 }],
  }], {
    executeTool: async (name, args) => ({ source: 'SIGSA', result: [{ codigo: args.code }], answer: name }),
  });
  assert.equal(result.parsed.answer, 'Descripción encontrada.');
  assert.equal(result.toolTrace[0].name, 'sigsa_lookup_cie10');
});

test('Provider failures do not expose the provider payload', async (t) => {
  t.mock.method(global, 'fetch', async () => ({ ok: false }));
  await assert.rejects(callModel('Una pregunta'), { code: 'LLM_ERROR', status: 502 });
});

test('Responses stops a conversation after twelve tool calls', async (t) => {
  let request = 0;
  t.mock.method(global, 'fetch', async () => {
    request += 1;
    return { ok: true, json: async () => ({ output: [
      {
        type: 'function_call',
        call_id: `call-${request}`,
        name: 'describe_semantic_model',
        arguments: '{"source":"SIGSA"}',
      },
    ] }) };
  });

  let executions = 0;
  await assert.rejects(callModel('Realiza una consulta demasiado compleja', [], {
    executeTool: async () => {
      executions += 1;
      return { source: 'SIGSA', result: [], answer: 'Continúa.' };
    },
  }), { code: 'AGENT_TOOL_LIMIT', status: 422 });
  assert.equal(executions, 12);
  assert.equal(request, 13);
});
