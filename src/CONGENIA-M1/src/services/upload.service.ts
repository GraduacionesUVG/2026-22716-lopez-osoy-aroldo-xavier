/**
 * @fileoverview Servicio de subida de imágenes mediante presigned URLs - POST /v1/uploads/presigned-url.
 *
 * Flujo:
 *  1. El frontend solicita al backend un presigned PUT URL para el bucket.
 *  2. El frontend sube el binario directamente a SeaweedFS - los bytes nunca pasan por el backend.
 *
 * El objectKey devuelto se referencia como imageResourceId / examResourceId
 * al llamar después a POST /v1/patient.
 *
 * @compliance ISO 27001 A.13.2 - transferencia segura: la imagen viaja al bucket, no por la app
 * @compliance HIPAA 164.312(e) - cifrado en tránsito garantizado por TLS en producción
 */

import { apiFetch } from './api.client'
import { formatFileSize } from '../utils/formatFileSize'

export type UploadCategory = 'profile' | 'exam'

/** 10 MiB. Se muestra al usuario como "10 MB" para no obligarlo a leer jerga binaria. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const MAX_UPLOAD_LABEL = '10 MB'

export const ALLOWED_TYPES: Record<UploadCategory, ReadonlySet<string>> = {
    profile: new Set(['image/jpeg', 'image/png', 'image/webp']),
    exam: new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
}

/** Formatos aceptados por categoría, para los textos de ayuda del formulario. */
export const ALLOWED_TYPES_LABEL: Record<UploadCategory, string> = {
    profile: 'JPG, PNG o WebP',
    exam: 'JPG, PNG, WebP o PDF',
}

/**
 * Comprueba tipo y peso de un archivo antes de intentar subirlo.
 *
 * Existe aparte de `uploadImageFile` para que el formulario avise en el momento
 * de elegir el archivo y no después de que el usuario mande el formulario. Al
 * ser la misma función, el aviso temprano y el error de subida nunca se
 * contradicen.
 *
 * @returns El mensaje a mostrar, o null si el archivo es válido.
 */
export function validateUploadFile(file: File, category: UploadCategory): string | null {
    if (!ALLOWED_TYPES[category].has(file.type)) {
        return `Solo se aceptan ${ALLOWED_TYPES_LABEL[category]}`
    }
    if (file.size <= 0) {
        return 'El archivo está vacío'
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        return `El archivo pesa ${formatFileSize(file.size)} y el máximo es ${MAX_UPLOAD_LABEL}`
    }
    return null
}

interface PresignedUrlData {
    presignedUrl: string
    documentId:   string
    objectKey:    string
    headers?:     Record<string, string>
}

interface PresignedUrlApiResponse {
    success: boolean
    data:    PresignedUrlData
}

/**
 * Solicita un presigned PUT URL al backend.
 * apiFetch adjunta automáticamente el X-Session-Token en este POST.
 */
async function requestPresignedUrl(file: File, category: UploadCategory, pacienteId?: string): Promise<PresignedUrlData> {
    const path = pacienteId ? `/api/v1/pacientes/${encodeURIComponent(pacienteId)}/uploads/presigned-url` : '/v1/uploads/presigned-url'
    const res = await apiFetch<PresignedUrlApiResponse>(path, {
        auth: pacienteId ? 'bearer' : 'session',
        sensitive: true,
        method: 'POST',
        body:   JSON.stringify({ category, contentType: file.type, sizeBytes: file.size }),
    })
    return res.data
}

/** PUT del binario a la URL firmada, con las cabeceras que el backend firmó. */
function putToBucket(file: File, { presignedUrl, headers }: PresignedUrlData): Promise<Response> {
    return fetch(presignedUrl, {
        method:  'PUT',
        body:    file,
        headers: { ...headers, 'Content-Type': file.type || 'application/octet-stream' },
    })
}

/**
 * Sube un archivo al bucket:
 *  1. Solicita presigned PUT URL al backend justo antes de subir.
 *  2. Hace PUT del binario directamente al bucket (usando la URL firmada, sin headers de la app).
 *  3. Si el bucket responde 403 —la URL venció, p. ej. porque la pestaña quedó
 *     suspendida entre la firma y el envío—, pide una URL nueva y reintenta una vez.
 *
 * @param file     - Archivo seleccionado por el usuario.
 * @param category - 'profile' para fotos de signos de alerta | 'exam' para imágenes de exámenes.
 * @returns objectKey - Referencia completa y validada del objeto en el bucket.
 */
export async function uploadImageFile(file: File, category: UploadCategory, pacienteId?: string): Promise<string> {
    const invalido = validateUploadFile(file, category)
    if (invalido) {
        throw new Error(invalido)
    }

    let signed = await requestPresignedUrl(file, category, pacienteId)
    let uploadRes = await putToBucket(file, signed)

    // La URL vence a los pocos minutos (S3_PRESIGN_EXPIRY_SECONDS). Una URL nueva
    // trae otro objectKey, que es el que se devuelve y se referencia en la ficha.
    if (uploadRes.status === 403) {
        signed = await requestPresignedUrl(file, category, pacienteId)
        uploadRes = await putToBucket(file, signed)
    }

    if (!uploadRes.ok) {
        throw new Error(`Error al subir imagen al bucket: HTTP ${uploadRes.status}`)
    }

    return signed.objectKey
}
