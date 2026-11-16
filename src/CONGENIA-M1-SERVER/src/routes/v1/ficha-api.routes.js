'use strict';

const { Router } = require('express');
const ctrl = require('../../controllers/ficha.controller');
const { createPatientPresignedUrl } = require('../../controllers/upload.controller');
const { requireOAuthUser } = require('../../middleware/requireOAuthUser');
const sadc = require('../../controllers/sadc.controller');

const router = Router();
// Cada ruta exige un permiso de config/access-policy.yaml en alguna
// institucion; el servicio lo vuelve a revisar en la institucion de la ficha.
const requireAuthenticated = requireOAuthUser({ permission: null });
const requireClinicalUser = requireOAuthUser({ permission: 'dashboard' });
const requireAuthor = requireOAuthUser({ permission: 'fichas.crear' });
const requireReviewer = requireOAuthUser({ permission: 'adendas.revisar' });

router.get('/me', requireAuthenticated, ctrl.me);
// Busqueda en SADC hecha por el servidor: institucion del token y bitacora.
router.get('/sadc/pacientes', requireClinicalUser, sadc.buscarPaciente);
router.post('/pacientes/:pacienteId/uploads/presigned-url', requireClinicalUser, createPatientPresignedUrl);
router.get('/pacientes/:tenantId/:historiaClinica/fichas', requireClinicalUser, ctrl.listPaciente);
router.get('/pacientes/:tenantId/:historiaClinica/ficha-vigente', requireClinicalUser, ctrl.vigentePaciente);
router.get('/fichas/pendientes', requireClinicalUser, ctrl.pending);
router.get('/fichas/adendas', requireReviewer, ctrl.adendas);
router.get('/fichas/:id', requireClinicalUser, ctrl.apiDetail);
router.post('/fichas/:id/revisiones', requireAuthor, ctrl.revision);
router.post('/fichas/:id/resolver', requireReviewer, ctrl.resolve);
router.post('/fichas/:id/aprobar', requireReviewer, ctrl.approve);
router.post('/fichas/:id/rechazar', requireReviewer, ctrl.reject);

module.exports = router;
