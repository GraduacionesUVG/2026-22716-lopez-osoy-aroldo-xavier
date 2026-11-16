'use strict';

const { Router } = require('express');
const ctrl = require('../../controllers/cie10.controller');
const { requireOAuthUser } = require('../../middleware/requireOAuthUser');

const router = Router();
const requireReviewer = requireOAuthUser({ permission: 'cie10.corregir' });

router.get('/cie10/sugerencias', requireReviewer, ctrl.sugerencias);
router.get('/cie10/sugerencias/:codigoTraductor', requireReviewer, ctrl.sugerencia);
router.post('/cie10/sugerencias/:codigoTraductor/decision', requireReviewer, ctrl.decidir);
router.put('/cie10/sugerencias/:codigoTraductor/decision', requireReviewer, ctrl.corregir);
router.get('/cie10/decisiones', requireReviewer, ctrl.decisiones);
router.get('/cie10/export-url', requireReviewer, ctrl.exportUrl);
router.get('/cie10/lotes', requireReviewer, ctrl.lotes);
router.get('/cie10/lotes/activo', requireReviewer, ctrl.loteActivo);
router.get('/cie10/lotes/:runId', requireReviewer, ctrl.lote);
router.get('/cie10/catalogo', requireReviewer, ctrl.catalogo);
router.post('/cie10/lotes/:runId/items/aceptar', requireReviewer, ctrl.aceptarItemsLote);
router.post('/cie10/lotes/:runId/items/:codigoTraductor/aceptar', requireReviewer, ctrl.aceptarItemLote);
router.put('/cie10/lotes/:runId/items/:codigoTraductor', requireReviewer, ctrl.corregirItemLote);
router.post('/cie10/lotes/:runId/clausula', requireReviewer, ctrl.aceptarClausula);
router.post('/cie10/lotes/:runId/confirmar', requireReviewer, ctrl.confirmarLote);

module.exports = router;
