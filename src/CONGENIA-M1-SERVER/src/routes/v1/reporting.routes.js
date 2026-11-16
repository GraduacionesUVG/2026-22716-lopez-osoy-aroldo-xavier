'use strict';

const { Router } = require('express');
const ctrl = require('../../controllers/reporting.controller');
const { requireOAuthUser } = require('../../middleware/requireOAuthUser');

const router = Router();
const requireReporter = requireOAuthUser({ permission: 'reporteria' });

router.get('/reporting/summary', requireReporter, ctrl.dashboardSummary);
router.get('/reporting/sigsa/top-diagnosticos', requireReporter, ctrl.sigsaTopDiagnosticos);
router.get('/reporting/sigsa/top-cie10', requireReporter, ctrl.sigsaTopCie10);
router.get('/reporting/sigsa/monthly', requireReporter, ctrl.sigsaMonthly);
router.get('/reporting/congenia/monthly', requireReporter, ctrl.congeniaMonthlyEndpoint);
router.post('/agent/conversations', requireReporter, ctrl.createConversation);
router.delete('/agent/conversations/:conversationId', requireReporter, ctrl.deleteConversation);
router.post('/agent/query', requireReporter, ctrl.agentQuery);
router.post('/reporting/mcp', ctrl.mcpEndpoint);

module.exports = router;
