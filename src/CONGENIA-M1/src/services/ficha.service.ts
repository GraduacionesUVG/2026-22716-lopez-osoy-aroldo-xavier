import { apiFetch } from './api.client'
import { APP_ENV, USE_ADENDAS_MOCK } from '../config/runtime'
import type { WarningSign, ExamDiagnosis, Observation } from '../types/patient-api'
import { listarAdendasMock, obtenerAdendaMock, resolverAdendaMock } from './adendas.mock'

export interface TenantOption {
    id: string
    name: string
    label: string
}

/** Permisos en una institucion, segun los grupos de Keycloak. */
export interface MeTenantAccess {
    tenantId: number
    funciones: string[]
    permissions: string[]
    name?: string
    label?: string
}

export interface MeProfile {
    subject: string
    displayName: string
    especialidad: string
    roles: string[]
    /** Etiqueta de la funcion de mayor prioridad; null sin funciones. */
    roleLabel?: string | null
    /** Union de permisos en todas las instituciones activas. */
    permissions?: string[]
    /** Permisos que no dependen de una institucion (solo superadmin). */
    globalPermissions?: string[]
    access?: MeTenantAccess[]
    tenants: string[]
    tenantOptions?: TenantOption[]
}

export interface FichaSummary {
    fichaId: string
    fichaRaizId: string
    revision: number
    estado: string
    estadoFicha: string
    fechaConsulta: string
    esVigente: boolean
    medico: string
    /** HC con la que quedó la ficha: la buscada o su provisional 'TMP-'. */
    historiaClinica?: string
    /** true si la ficha tiene HC provisional ('TMP-') pendiente de consolidar. */
    provisional?: boolean
    /**
     * Alta de la revisión, ISO con hora. El servidor todavía no la manda en este
     * listado (solo en `/fichas/pendientes`): ver `PENDIENTES-BACKEND.md`.
     */
    fechaCreacion?: string
}

/**
 * En que punto de la revision esta una adenda.
 *
 * Es distinto de `estadoFicha` (`BORRADOR | PENDIENTE | COMPLETA | VALIDADA`),
 * que describe la ficha y no la decision del revisor: una ficha `COMPLETA` no
 * dice si nacio de una adenda aprobada o si nunca tuvo adendas. Los tres tabs de
 * la bandeja necesitan este eje propio.
 *
 * Contrato en PENDIENTES-BACKEND.md seccion 13.
 */
export type EstadoAdenda = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'

export interface StoredWarningSign {
    signoId: string
    signDescription: string
    partCatalogId: number
    partName: string
    regionId: number
    regionName: string
    imageUrl?: string | null
    addedInRevision: boolean
    /** Id del signo que lo sustituyo. Ausente mientras el servidor no persista el vinculo. */
    replacedBySignoId?: string | null
    /** Direccion inversa: a que signo vigente sustituye este alta. Misma pendiente. */
    replacesSignoId?: string | null
}
export interface StoredExam {
    examenId: string
    examDescription: string
    examUrl?: string | null
    addedInRevision: boolean
    /** Id del examen que lo sustituyo. Ausente mientras el servidor no persista el vinculo. */
    replacedByExamenId?: string | null
    /** Direccion inversa: a que examen vigente sustituye este alta. Misma pendiente. */
    replacesExamenId?: string | null
}
/** Las observaciones no se sustituyen: solo se agregan, asi que no llevan vinculo. */
export interface StoredObservation {
    observacionId: string
    observationText: string
    addedInRevision: boolean
    /** Alta de la observacion, ISO con hora. */
    fechaCreacion?: string
}
export interface FichaDetail {
    fichaId: string
    pacienteId: string
    fichaRaizId: string
    revision: number
    estadoFicha: string
    /** Ausente mientras el servidor no lo exponga; la bandeja lo trata como PENDIENTE. */
    estadoRevision?: EstadoAdenda
    esVigente: boolean
    motivoSolicitud?: string | null
    /** Momento en que se solicito la adenda. Lo pinta la cabecera de la revision. */
    fechaCreacion?: string
    paciente: { nombre: string; historiaClinica: string; tenantId: string }
    consulta: { fechaConsulta: string; diagnosticoTexto: string }
    medico: { nombre: string; especialidad: string }
    demographic: {
        referralSourceId: number | null
        birthMethodId: number | null
        /** Ausente mientras el servidor no lo exponga (PENDIENTES-BACKEND.md, seccion 15). */
        sexId?: number | null
        affectedRelatives: boolean | null
        affectedRelativesCategoryIds: number[]
        affectedUnderageRelatives: number
        affectedAdultRelatives: number
        affectedCommunityMembers: 'SI' | 'NO' | 'DESCONOCIDO' | null
    }
    consent: {
        consentimientoId: string
        tipoFirmante: string
        nombreFirmante: string
        idiomaConsentimiento: string
        aceptacionTerminos: boolean
        aceptacionContacto: boolean
        fechaHoraAceptacion: string
        firmaEvidenciaTecnica?: Record<string, unknown>
        firmaUrl?: string | null
        pdfUrl?: string | null
        estadoConsentimiento: string
        medico?: { nombre: string; especialidad: string }
    } | null
    warningSigns: StoredWarningSign[]
    examDiagnoses: StoredExam[]
    /** Ausente mientras el servidor no lo exponga (PENDIENTES-BACKEND.md, seccion 16). */
    observations?: StoredObservation[]
}
export interface PendingFicha extends Omit<FichaSummary, 'estado'> {
    pacienteId: string
    motivoSolicitud: string
    fechaCreacion: string
    paciente: FichaDetail['paciente']
}
/** Un alta de revision puede declarar a que registro vigente sustituye. */
export interface RevisionWarningSign extends WarningSign {
    replacesSignoId?: string
}
export interface RevisionExam extends ExamDiagnosis {
    replacesExamenId?: string
}
export interface RevisionPayload {
    motivo: string
    warningSigns: RevisionWarningSign[]
    examDiagnoses: RevisionExam[]
    /** Solo altas. Ausente si la adenda no agrega ninguna. */
    observations?: Observation[]
}
export interface RevisionResult { fichaId: string; revision: number; estadoFicha: string }

/* ---------------------------------------------------------------------------
 * Bandeja de adendas del dashboard
 *
 * Ninguno de estos dos endpoints existe todavia. El contrato esta escrito en
 * PENDIENTES-BACKEND.md secciones 10 y 11, y aqui se implementa contra el;
 * mientras no aterrice, `USE_MOCK` desvia a `adendas.mock.ts`, que filtra,
 * ordena y pagina de verdad para que la pantalla se ejercite entera.
 * ------------------------------------------------------------------------- */

/** Una adenda tal como la lista la bandeja. Es el resumen, no la ficha. */
export interface AdendaResumen {
    fichaId: string
    fichaRaizId: string
    revision: number
    estadoRevision: EstadoAdenda
    /** ISO `YYYY-MM-DD`: el dia en que el pediatra solicito el cambio. */
    fechaSolicitud: string
    /** Pediatra que la solicita. Es lo que pinta la card. */
    medicoSolicitante: string
    motivoSolicitud: string
    paciente: FichaDetail['paciente']
}

export interface AdendaSearchParams {
    estado: EstadoAdenda
    /** Nombre del paciente, numero de historia clinica o nombre del pediatra. */
    q?: string
    /** `YYYY-MM-DD`, inclusive, sobre la fecha de solicitud. */
    desde?: string
    hasta?: string
    page?: number
    pageSize?: number
}

export interface AdendaSearchResult {
    items: AdendaResumen[]
    total: number
    page: number
    pageSize: number
}

/** Que se hace con un cambio concreto de la adenda. */
export interface DecisionCambio {
    tipo: 'SIGNO' | 'EXAMEN' | 'OBSERVACION'
    id: string
    decision: 'APROBADO' | 'RECHAZADO'
}

export const ADENDAS_PAGE_SIZE = 12

/**
 * Solo se puede encender fuera de produccion, aunque alguien olvide apagarlo:
 * una bandeja de revision con pacientes inventados es peor que una vacia.
 */
const USE_MOCK = USE_ADENDAS_MOCK
    ? ['1', 'true', 'yes', 'on'].includes(USE_ADENDAS_MOCK.trim().toLowerCase())
    : ['development', 'dev', 'test'].includes(APP_ENV.trim().toLowerCase())

function buildAdendasQuery({ estado, q, desde, hasta, page, pageSize }: AdendaSearchParams): string {
    const params = new URLSearchParams()

    params.set('estado', estado)
    // Los vacios no se mandan: `?q=` es un filtro por cadena vacia, no "sin filtro".
    if (q?.trim()) params.set('q', q.trim())
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    params.set('page', String(page ?? 1))
    params.set('pageSize', String(pageSize ?? ADENDAS_PAGE_SIZE))

    return params.toString()
}

export async function listarAdendas(params: AdendaSearchParams): Promise<AdendaSearchResult> {
    if (USE_MOCK) return listarAdendasMock(params)

    return apiFetch<AdendaSearchResult>(`/api/v1/fichas/adendas?${buildAdendasQuery(params)}`, readOptions)
}

/**
 * Ficha completa de la adenda que se esta revisando.
 *
 * Envuelve a `getFicha` en vez de llamarla directo para que la pantalla de
 * revision siga funcionando con el mock encendido: sin esto, la bandeja listaria
 * adendas ficticias cuyo detalle daria 404.
 */
export async function obtenerAdenda(fichaId: string): Promise<FichaDetail> {
    if (USE_MOCK) return obtenerAdendaMock(fichaId)

    return getFicha(fichaId)
}

/**
 * Resuelve la adenda cambio por cambio, en una sola llamada.
 *
 * Es atomica a proposito: media adenda aplicada y media pendiente dejaria la
 * ficha en un estado que nadie sabria leer despues.
 */
export async function resolverAdenda(fichaId: string, decisiones: DecisionCambio[]): Promise<RevisionResult> {
    if (USE_MOCK) return resolverAdendaMock(fichaId, decisiones)

    return apiFetch<RevisionResult>(`${fichaPath(fichaId)}/resolver`, {
        ...readOptions,
        method: 'POST',
        body: JSON.stringify({ decisiones }),
    })
}

const readOptions = { auth: 'bearer', sensitive: true } as const
const fichaPath = (id: string) => `/api/v1/fichas/${encodeURIComponent(id)}`

export const getMe = () => apiFetch<MeProfile>('/api/v1/me', readOptions)
export const listFichasPaciente = (tenantId: string, historiaClinica: string) =>
    apiFetch<FichaSummary[]>(`/api/v1/pacientes/${encodeURIComponent(tenantId)}/${encodeURIComponent(historiaClinica)}/fichas`, readOptions)
export const getFicha = (id: string) => apiFetch<FichaDetail>(fichaPath(id), readOptions)
export const listarPendientes = () => apiFetch<PendingFicha[]>('/api/v1/fichas/pendientes', readOptions)
export const crearRevision = (id: string, payload: RevisionPayload) =>
    apiFetch<RevisionResult>(`${fichaPath(id)}/revisiones`, { ...readOptions, method: 'POST', body: JSON.stringify(payload) })
export const aprobar = (id: string) =>
    apiFetch<RevisionResult>(`${fichaPath(id)}/aprobar`, { ...readOptions, method: 'POST' })
export const rechazar = (id: string, motivo: string) =>
    apiFetch<RevisionResult>(`${fichaPath(id)}/rechazar`, { ...readOptions, method: 'POST', body: JSON.stringify({ motivo }) })
