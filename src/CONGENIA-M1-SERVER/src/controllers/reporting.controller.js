'use strict';

const {
  congeniaMonthly,
  congeniaSummary,
  callReportingTool,
  listReportingTools,
  queryAgent,
  sigsaMonthly: sigsaMonthlyService,
  summary,
  topCie10,
  topDiagnosticos,
} = require('../services/reporting.service');
const { auditContext } = require('../services/audit.service');
const {
  createAgentConversation,
  deleteAgentConversation,
  withAgentConversation,
} = require('../services/reporting-conversation.service');

async function dashboardSummary(req, res, next) {
  try {
    const [sigsa, congenia] = await Promise.all([summary(), congeniaSummary()]);
    res.set('Cache-Control', 'no-store');
    return res.json({ sigsa, congenia });
  } catch (err) {
    return next(err);
  }
}

async function sigsaTopCie10(req, res, next) {
  try {
    const result = await topCie10(req.query?.limit);
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function sigsaMonthly(req, res, next) {
  try {
    const result = await sigsaMonthlyService();
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function sigsaTopDiagnosticos(req, res, next) {
  try {
    const result = await topDiagnosticos(req.query?.limit);
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function congeniaMonthlyEndpoint(_req, res, next) {
  try {
    const result = await congeniaMonthly();
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function agentQuery(req, res, next) {
  try {
    const question = req.body?.question;
    const conversationId = req.body?.conversationId;
    const requestedAction = req.body?.action;
    const requestedResultId = req.body?.resultId;
    const result = conversationId
      ? await withAgentConversation({
        conversationId,
        ownerSub: req.userAuth.subject,
        question,
      }, (history) => queryAgent({
        question,
        audit: auditContext(req),
        history,
        conversationId,
        requestedAction,
        requestedResultId,
      }))
      : await queryAgent({ question, audit: auditContext(req), requestedAction, requestedResultId });
    res.set('Cache-Control', 'no-store');
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function createConversation(req, res, next) {
  try {
    const result = await createAgentConversation(req.userAuth.subject);
    res.set('Cache-Control', 'no-store');
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

async function deleteConversation(req, res, next) {
  try {
    await deleteAgentConversation(req.params.conversationId, req.userAuth.subject);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

function requireMcpToken(req) {
  const expected = process.env.REPORTING_MCP_TOKEN;
  if (!expected) {
    const err = new Error('REPORTING_MCP_TOKEN no está configurado.');
    err.status = 503;
    err.code = 'MCP_TOKEN_NOT_CONFIGURED';
    throw err;
  }
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token || token !== expected) {
    const err = new Error('Bearer token inválido.');
    err.status = 401;
    err.code = 'MCP_UNAUTHORIZED';
    throw err;
  }
}

async function mcpEndpoint(req, res, next) {
  try {
    requireMcpToken(req);
    const { id = null, method, params = {} } = req.body ?? {};
    let result;

    if (method === 'tools/list') {
      result = { tools: listReportingTools() };
    } else if (method === 'tools/call') {
      const sessionId = String(params.context?.sessionId ?? 'default').slice(0, 100);
      const toolResult = await callReportingTool(params.name, params.arguments ?? {}, {
        ownerSub: 'mcp-service',
        conversationId: `mcp:${sessionId}`,
      });
      result = {
        content: [{ type: 'text', text: toolResult.answer }],
        structuredContent: {
          source: toolResult.source,
          result: toolResult.result,
          resultId: toolResult.resultId ?? null,
          validatedQueryId: toolResult.validatedQueryId ?? null,
          blocks: toolResult.blocks ?? [],
        },
      };
    } else if (method === 'ping') {
      result = {};
    } else {
      return res.status(400).json({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: 'Method not found' },
      });
    }

    res.set('Cache-Control', 'no-store');
    return res.json({ jsonrpc: '2.0', id, result });
  } catch (err) {
    return next(err);
  }
}
mcpEndpoint.authKind = 'mcp-token';

module.exports = {
  agentQuery,
  createConversation,
  congeniaMonthlyEndpoint,
  dashboardSummary,
  deleteConversation,
  mcpEndpoint,
  sigsaMonthly,
  sigsaTopCie10,
  sigsaTopDiagnosticos,
};
