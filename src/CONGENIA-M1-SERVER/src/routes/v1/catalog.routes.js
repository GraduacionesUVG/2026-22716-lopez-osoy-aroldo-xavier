'use strict';

const { Router } = require('express');
const ctrl = require('../../controllers/catalog.controller');
const { requireOAuthUser } = require('../../middleware/requireOAuthUser');
const { requireCatalogReader: buildCatalogReader } = require('../../middleware/requireCatalogReader');

const router = Router();
const requireSuperAdmin = requireOAuthUser({ permission: 'catalogos.administrar' });
// Lecturas: medico autenticado o sesion de captura activa (nunca anonimas).
const requireCatalogReader = buildCatalogReader();

// ── Región anatómica ──────────────────────────────────────────

/**
 * @openapi
 * /v1/Regiones:
 *   get:
 *     tags: [Catalog]
 *     summary: Lista regiones anatómicas
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RegionAnatomica'
 */
router.get('/Regiones', requireCatalogReader, ctrl.getRegiones);

/**
 * @openapi
 * /v1/Region:
 *   post:
 *     tags: [Catalog]
 *     summary: Crea una región anatómica
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegionInput'
 *     responses:
 *       201:
 *         description: Creado
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CreatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/RegionAnatomica'
 *       400:
 *         description: Validación fallida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/Region', requireSuperAdmin, ctrl.createRegion);

/**
 * @openapi
 * /v1/Region/{id}:
 *   put:
 *     tags: [Catalog]
 *     summary: Actualiza una región anatómica
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegionInput'
 *     responses:
 *       200:
 *         description: Actualizado
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CreatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/RegionAnatomica'
 *       404:
 *         description: No encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/Region/:id', requireSuperAdmin, ctrl.updateRegion);

/**
 * @openapi
 * /v1/Region/{id}:
 *   delete:
 *     tags: [Catalog]
 *     summary: Elimina una región anatómica
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Eliminado
 *       404:
 *         description: No encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/Region/:id', requireSuperAdmin, ctrl.deleteRegion);

// ── Lateralidad ───────────────────────────────────────────────

/**
 * @openapi
 * /v1/Lateralidades:
 *   get:
 *     tags: [Catalog]
 *     summary: Lista lateralidades
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Lateralidad'
 */
router.get('/Lateralidades', requireCatalogReader, ctrl.getLateralidades);

/**
 * @openapi
 * /v1/Lateralidad:
 *   post:
 *     tags: [Catalog]
 *     summary: Crea una lateralidad
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LateralidadInput'
 *     responses:
 *       201:
 *         description: Creado
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CreatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Lateralidad'
 *       400:
 *         description: Validación fallida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/Lateralidad', requireSuperAdmin, ctrl.createLateralidad);

/**
 * @openapi
 * /v1/Lateralidad/{id}:
 *   put:
 *     tags: [Catalog]
 *     summary: Actualiza una lateralidad
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LateralidadInput'
 *     responses:
 *       200:
 *         description: Actualizado
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CreatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Lateralidad'
 *       404:
 *         description: No encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put('/Lateralidad/:id', requireSuperAdmin, ctrl.updateLateralidad);

/**
 * @openapi
 * /v1/Lateralidad/{id}:
 *   delete:
 *     tags: [Catalog]
 *     summary: Elimina una lateralidad
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Eliminado
 *       404:
 *         description: No encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/Lateralidad/:id', requireSuperAdmin, ctrl.deleteLateralidad);

// ── Parte del cuerpo ──────────────────────────────────────────

/**
 * @openapi
 * /v1/PartesCuerpo:
 *   get:
 *     tags: [Catalog]
 *     summary: Lista todas las partes del cuerpo
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ParteCuerpo'
 */
router.get('/PartesCuerpo', requireCatalogReader, ctrl.getPartesCuerpo);

/**
 * @openapi
 * /v1/ParteCuerpo:
 *   post:
 *     tags: [Catalog]
 *     summary: Crea una nueva parte del cuerpo
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ParteCuerpoInput'
 *     responses:
 *       201:
 *         description: Creado
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CreatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/ParteCuerpo'
 *       400:
 *         description: Validación fallida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/ParteCuerpo', requireSuperAdmin, ctrl.createParteCuerpo);

// ── Signos de alerta ──────────────────────────────────────────

/**
 * @openapi
 * /v1/Signos:
 *   get:
 *     tags: [Catalog]
 *     summary: Lista signos de alerta activos
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SignoCatalogo'
 */
router.get('/Signos', requireCatalogReader, ctrl.getSignos);

// ── Exámenes ──────────────────────────────────────────────────

/**
 * @openapi
 * /v1/Examenes:
 *   get:
 *     tags: [Catalog]
 *     summary: Lista exámenes activos
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ExamenCatalogo'
 */
router.get('/Examenes', requireCatalogReader, ctrl.getExamenes);

// ── Asistencia parto  (read-only) ─────────────────────────────

/**
 * @openapi
 * /v1/AsistenciaParto:
 *   get:
 *     tags: [Catalog]
 *     summary: Lista tipos de asistencia al parto
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AsistenciaParto'
 */
router.get('/AsistenciaParto', requireCatalogReader, ctrl.getAsistenciaParto);

// ── Referido de  (read-only) ──────────────────────────────────

/**
 * @openapi
 * /v1/ReferidoDe:
 *   get:
 *     tags: [Catalog]
 *     summary: Lista fuentes de referimiento
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ReferidoDe'
 */
router.get('/ReferidoDe', requireCatalogReader, ctrl.getReferidoDe);

// ── Sexo (read-only) ──────────────────────────────────────────

/**
 * @openapi
 * /v1/Sexos:
 *   get:
 *     tags: [Catalog]
 *     summary: Lista sexos del paciente
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   sexo_id:
 *                     type: integer
 *                   codigo:
 *                     type: string
 *                   nombre:
 *                     type: string
 */
router.get('/Sexos', requireCatalogReader, ctrl.getSexos);

// ── Familiar catálogo ─────────────────────────────────────────

/**
 * @openapi
 * /v1/Familiares:
 *   get:
 *     tags: [Catalog]
 *     summary: Lista familiares del catálogo
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FamiliarCatalogo'
 */
router.get('/Familiares', requireCatalogReader, ctrl.getFamiliares);

/**
 * @openapi
 * /v1/Familiar:
 *   post:
 *     tags: [Catalog]
 *     summary: Crea un nuevo familiar en el catálogo
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FamiliarInput'
 *     responses:
 *       201:
 *         description: Creado
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/CreatedResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/FamiliarCatalogo'
 *       400:
 *         description: Validación fallida
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/Familiar', requireSuperAdmin, ctrl.createFamiliar);

module.exports = router;
