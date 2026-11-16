'use strict';

const { Router } = require('express');
const { createPatient } = require('../../controllers/patient.controller');
const { requireXSessionToken } = require('../../middleware/requireXSessionToken');

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Patient
 *     description: Registro de ficha clínica completa
 */

/**
 * @openapi
 * /v1/patient:
 *   post:
 *     tags: [Patient]
 *     summary: Registra una ficha clínica completa
 *     description: >
 *       Recibe el formulario de la ficha clínica del frontend, crea los registros
 *       de paciente, médico, consentimiento, signos de alerta y exámenes en una
 *       transacción atómica, y dispara la generación del PDF de consentimiento.
 *
 *       **Prerequisito**: La sesión de integración debe estar ACTIVA
 *       (haber llamado previamente a `POST /api/v1/sessions/activate`).
 *
 *       El navegador usa únicamente la capability temporal X-Session-Token recibida
 *       por el sistema externo en `POST /api/v1/sessions/init`.
 *     security:
 *       - XSessionToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PatientRegistrationRequest'
 *     responses:
 *       201:
 *         description: Ficha registrada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PatientRegistrationResponse'
 *       400:
 *         description: Payload inválido, campos faltantes o X-Session-Token inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SessionInitErrorResponse'
 *       401:
 *         description: Sesión ausente o inactiva
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Sesión ya consumida o ficha ya registrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       410:
 *         description: Sesión expirada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/patient',
  requireXSessionToken(),
  createPatient
);

module.exports = router;
