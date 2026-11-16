'use strict';

const { Router } = require('express');
const { postInit, postManualInit, postActivateSession } = require('../../controllers/integration.controller');
const { requireOAuthClient } = require('../../middleware/requireOAuthClient');
const { requireOAuthUser } = require('../../middleware/requireOAuthUser');
const { requireXSessionToken } = require('../../middleware/requireXSessionToken');

const router = Router();

/**
 * @openapi
 * /api/v1/sessions/init:
 *   post:
 *     tags: [Integration]
 *     summary: Crea una sesion de integracion desde un sistema externo
 *     description: >
 *       Llamado por el sistema externo para iniciar el flujo de registro
 *       de ficha. Verifica el Bearer token OAuth, encripta el payload del
 *       paciente y devuelve un token de un solo uso con la URL del formulario.
 *     security:
 *       - OAuthClientCredentials: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SessionInitRequest'
 *     responses:
 *       200:
 *         description: Sesion creada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SessionInitResponse'
 *       400:
 *         description: Payload invalido o campos requeridos faltantes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SessionInitErrorResponse'
 *       401:
 *         description: Bearer token requerido o invalido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Scope OAuth requerido ausente o cliente no autorizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/sessions/init', requireOAuthClient('congenia.sessions:init'), postInit);

/**
 * @openapi
 * /api/v1/sessions/manual:
 *   post:
 *     tags: [Integration]
 *     summary: Crea una sesion para un medico autenticado
 *     description: La identidad y el rol medico se toman del JWT, no del cuerpo de la peticion.
 *     security:
 *       - OIDCUser: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ManualSessionInitRequest'
 *     responses:
 *       200:
 *         description: Capability temporal creada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SessionInitResponse'
 *       401:
 *         description: Token ausente o invalido
 *       403:
 *         description: El usuario no tiene el rol medico
 */
router.post('/sessions/manual', requireOAuthUser({ permission: 'fichas.crear' }), postManualInit);

/**
 * @openapi
 * /api/v1/sessions/activate:
 *   post:
 *     tags: [Integration]
 *     summary: Activa una sesion y retorna los datos de la ficha
 *     description: >
 *       Llamado por el frontend al cargar el formulario de ficha clinica.
 *       Si la sesion esta PENDIENTE la activa. Si ya esta ACTIVA devuelve
 *       los mismos datos sin crear duplicado. Retorna 409 solo si la ficha
 *       ya fue completada.
 *     security:
 *       - XSessionToken: []
 *     responses:
 *       200:
 *         description: Sesion activada o ya activa
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SessionActivateResponse'
 *       404:
 *         description: Token no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Sesion ya consumida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       410:
 *         description: Sesion expirada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/sessions/activate', requireXSessionToken(), postActivateSession);

module.exports = router;
