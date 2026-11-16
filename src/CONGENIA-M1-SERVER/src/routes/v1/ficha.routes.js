'use strict';

const { Router } = require('express');
const ctrl = require('../../controllers/ficha.controller');
const { requireOAuthUser } = require('../../middleware/requireOAuthUser');

const router = Router();
const requireClinicalUser = requireOAuthUser({ permission: 'dashboard' });

router.get('/fichas', requireClinicalUser, ctrl.search);
router.get('/fichas/:fichaId', requireClinicalUser, ctrl.dashboardDetail);

module.exports = router;
