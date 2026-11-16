import fs from 'node:fs';
import { parseArgs, argString } from '../lib/args.js';
import {
  type AgentEvaluationReport,
  buildAgentReport,
  writeAgentReport,
} from '../lib/agentEvaluation.js';

const args = parseArgs();
const reportFiles = argString(args, 'reports')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
if (reportFiles.length < 2) throw new Error('--reports requires at least two comma-separated report files');

const reports = reportFiles.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')) as AgentEvaluationReport);
const combined = buildAgentReport(
  reportFiles.join(','),
  reports.flatMap((report) => report.results),
);
writeAgentReport(combined, argString(args, 'output-dir', 'output/evaluation-combined'));
console.log(JSON.stringify(combined.totals, null, 2));
