import { parseArgs, argString } from '../lib/args.js';
import { Pool } from 'pg';
import {
  type AgentAuditDetail,
  buildAgentReport,
  evaluateAgentCase,
  readAgentCases,
  writeAgentReport,
} from '../lib/agentEvaluation.js';

const args = parseArgs();
const casesFile = argString(args, 'cases', 'evaluation/agent/cases.agent.json');
const outputDir = argString(args, 'output-dir', 'output/evaluation');
const baseUrl = (process.env.AGENT_API_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const token = process.env.AGENT_API_TOKEN;
if (!token) throw new Error('AGENT_API_TOKEN is required');

const cases = readAgentCases(casesFile);
const auditDatabaseUrl = process.env.AGENT_AUDIT_DATABASE_URL;
if (cases.some((item) => item.expectedModelUsage && item.expectedModelUsage !== 'any') && !auditDatabaseUrl) {
  throw new Error('AGENT_AUDIT_DATABASE_URL is required when cases validate model usage');
}
const auditPool = auditDatabaseUrl ? new Pool({ connectionString: auditDatabaseUrl, max: 1 }) : null;

async function readAuditDetails(bodies: Array<Record<string, unknown> | null>): Promise<AgentAuditDetail[]> {
  if (!auditPool) return [];
  const auditIds = bodies.flatMap((body) => (
    body && typeof body.auditId === 'string' ? [body.auditId] : []
  ));
  if (auditIds.length === 0) return [];
  const result = await auditPool.query<{ detalle_json: AgentAuditDetail | string | null }>(
    `SELECT detalle_json
       FROM auditoria_evento
      WHERE evento_id = ANY($1::uuid[])
      ORDER BY fecha_hora`,
    [auditIds],
  );
  return result.rows.flatMap(({ detalle_json: detail }) => {
    if (!detail) return [];
    if (typeof detail === 'string') return [JSON.parse(detail) as AgentAuditDetail];
    return [detail];
  });
}

const results = [];
try {
  for (const item of cases) {
    const started = Date.now();
    let conversationId: string | null = null;
    try {
    const conversationResponse = await fetch(`${baseUrl}/api/v1/agent/conversations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const conversation = await conversationResponse.json().catch(() => ({})) as { conversationId?: unknown };
    if (!conversationResponse.ok || typeof conversation.conversationId !== 'string') {
      throw new Error(`Could not create agent conversation (HTTP ${conversationResponse.status})`);
    }
    conversationId = conversation.conversationId;

    const response = await fetch(`${baseUrl}/api/v1/agent/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ conversationId, question: item.question, evaluation: { questionId: item.questionId } }),
    });
    let body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const initialBody = body;
    let finalStatus = response.status;

    if (item.followUpAction && response.ok) {
      const actions = Array.isArray(body.suggestedActions) ? body.suggestedActions : [];
      const action = actions.find((candidate) => (
        candidate && typeof candidate === 'object'
        && (candidate as Record<string, unknown>).action === item.followUpAction?.action
        && typeof (candidate as Record<string, unknown>).resultId === 'string'
      )) as Record<string, unknown> | undefined;
      if (!action) throw new Error(`Response did not offer ${item.followUpAction.action}`);
      const followUp = await fetch(`${baseUrl}/api/v1/agent/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId,
          question: item.followUpAction.question,
          action: item.followUpAction.action,
          resultId: action.resultId,
          evaluation: { questionId: item.questionId, followUp: true },
        }),
      });
      body = await followUp.json().catch(() => ({})) as Record<string, unknown>;
      finalStatus = followUp.status;
    }

      const auditDetails = await readAuditDetails([initialBody, body]);
      results.push(evaluateAgentCase(item, {
        httpStatus: finalStatus,
        body,
        initialBody: item.followUpAction ? initialBody : null,
        auditDetails,
        latencyMs: Date.now() - started,
      }));
    } catch (error) {
      results.push(evaluateAgentCase(item, {
        httpStatus: 0,
        body: {},
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      if (conversationId) {
        await fetch(`${baseUrl}/api/v1/agent/conversations/${encodeURIComponent(conversationId)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => undefined);
      }
    }
  }
} finally {
  await auditPool?.end();
}

const report = buildAgentReport(casesFile, results);
writeAgentReport(report, outputDir);

console.log(JSON.stringify(report, null, 2));
