/**
 * @fileoverview Tipos del contrato POST /v1/patient 
 *
 * Refleja exactamente lo que el backend valida y persiste.
 * No usar para representación interna del formulario - tomar de base ficha.ts.
 *
 * @compliance HIPAA 164.312(b) - payload auditado vía X-Request-Id en apiFetch
 * @compliance HIPAA 164.514    - mínimo dato necesario: no se envía PHI más allá de lo requerido
 */

export type TipoFirmante = 'PADRE' | 'MADRE' | 'TUTOR' | 'REPRESENTANTE_LEGAL'

export type IdiomaConsentimiento = 'ESPANOL' | 'QEQCHI' | 'IXIL'

export type AfectadoComunidad = 'SI' | 'NO' | 'DESCONOCIDO'

export interface WarningSign {
    signDescription: string
    partCatalogId:   number
    /** objectKey validado de POST /v1/uploads/presigned-url. */
    imageResourceId?: string
}

export interface ExamDiagnosis {
    examDescription: string
    /** objectKey validado de POST /v1/uploads/presigned-url. */
    examResourceId?: string
}

/** Texto libre del medico, hasta 1000 caracteres. */
export interface Observation {
    observationText: string
}

export interface ConsentPayload {
    tipoFirmante:         TipoFirmante
    nombreFirmante:       string
    idiomaConsentimiento: IdiomaConsentimiento
    /** true cuando autorizacion-principal Y aceptacion-final están aceptadas */
    aceptacionTerminos:   boolean
    /** true cuando el firmante acepta contacto futuro (declaración opcional) */
    aceptacionContacto:   boolean
    /** Metadatos de la captura y declaraciones. Nunca la imagen de la firma. */
    firmaEvidenciaTecnica: Record<string, unknown>
    /** PNG de la firma como data URL. El servidor lo guarda en S3, no en la base. */
    firmaPng:             string
}

export interface PatientRegistrationPayload {
    referralSourceId:             number
    birthMethodId:                number | null
    /** Id del catálogo GET /v1/Sexos. Obligatorio. */
    sexId:                        number
    /** true si hay al menos un familiar afectado (ternaria 1 o 2 del formulario) */
    affectedRelatives:            boolean
    affectedRelativesCategoryIds: number[]
    affectedUnderageRelatives:    number
    affectedAdultRelatives:       number
    affectedCommunityMembers:     AfectadoComunidad
    warningSigns:                 WarningSign[]
    examDiagnoses:                ExamDiagnosis[]
    /**
     * Ausente si no hay ninguna: asi una ficha sin observaciones no depende de que
     * el servidor ya las acepte (PENDIENTES-BACKEND.md, seccion 16).
     */
    observations?:                Observation[]
    consent:                      ConsentPayload
}

export interface PatientRegistrationResponse {
    fichaId:          string
    consentimientoId: string
    /**
     * Sello de tiempo de la aceptacion, en ISO 8601 y con hora del servidor.
     * Es el mismo valor que persiste `consentimiento.fecha_hora_aceptacion` y
     * que imprime el PDF; no debe sustituirse por la hora del navegador.
     */
    fechaHoraAceptacion?: string
}
