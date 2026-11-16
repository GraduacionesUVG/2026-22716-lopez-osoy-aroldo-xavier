'use strict';

const { Router } = require('express');
const { createPresignedUrl } = require('../../controllers/upload.controller');
const { requireXSessionToken } = require('../../middleware/requireXSessionToken');

const router = Router();

/**
 * @openapi
 * /v1/uploads/presigned-url:
 *   post:
 *     tags: [Uploads]
 *     summary: Genera un presigned URL para subir un documento al bucket
 *     description: >
 *       Recibe la capability temporal X-Session-Token de una sesión activa.
 *       Devuelve un presigned PUT URL para que el frontend suba directamente a SeaweedFS
 *       sin pasar los datos binarios por el backend.
 *
 *       El path en el bucket sigue la convención:
 *       `{env}/tenants/{tenant}/patients/{patientId}/{category}/{documentId}.{extension}`
 *
 *       El `objectKey` devuelto en la respuesta debe usarse como referencia en
 *       `imageResourceId` / `examResourceId` al llamar luego a `POST /v1/patient`.
 *     security:
 *       - XSessionToken: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, contentType, sizeBytes]
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [exam, profile]
 *                 description: Categoría del documento a subir.
 *               contentType:
 *                 type: string
 *                 enum: [image/jpeg, image/png, image/webp, application/pdf]
 *               sizeBytes:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: Presigned URL generado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     presignedUrl:
 *                       type: string
 *                       description: URL firmada para hacer PUT del archivo.
 *                     documentId:
 *                       type: string
 *                       description: UUID generado para el documento.
 *                     objectKey:
 *                       type: string
 *                       description: Ruta completa del objeto en el bucket.
 *       400:
 *         description: Categoría inválida o X-Session-Token inválido
 *       401:
 *         description: Sesión ausente o inactiva
 */
router.post(
  '/uploads/presigned-url',
  requireXSessionToken(),
  createPresignedUrl
);

module.exports = router;
