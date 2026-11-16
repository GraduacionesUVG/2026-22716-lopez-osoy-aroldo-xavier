/**
 * @fileoverview Tipos de la revisión CIE-10 por lote.
 *
 * La forma del contrato de `cie10-lote-pendientes-backend.md`: el servidor
 * procesa con el modelo los diagnósticos escritos a mano (`cie10Original: "-1"`)
 * en lotes por mes, y el revisor acepta una de las sugerencias o elige otra
 * del catálogo.
 */

/** Una sugerencia del modelo, ya cruzada con el catálogo CIE-10 interno. */
export interface OpcionCie10 {
    codigo: string
    /** Lo que el modelo dijo del código. Puede no coincidir con el catálogo. */
    descripcionModelo: string
    codigoInternoCatalogo: string | null
    /** Nombre oficial del catálogo: es lo que se le muestra al revisor. */
    nombreCatalogo: string
    /**
     * Por qué el modelo propone este código; se muestra en el globo "i".
     * Opcional mientras el pipeline no lo genere.
     */
    razonamiento?: string | null
    soporte?: 'VALIDADO_INSTITUCIONAL' | 'REFERENCIA_EXTERNA' | 'REQUIERE_ATENCION'
    confianza?: 'ALTA' | 'MEDIA' | 'BAJA'
    distanciaRag?: number | null
    informacionFaltante?: string[]
}

/** Un diagnóstico pendiente de revisar, con las sugerencias ordenadas por prioridad. */
export interface SugerenciaCie10 {
    runId?: string
    codigoTraductor: string
    diagnostico: string
    /** `"-1"` cuando el diagnóstico no traía código. */
    cie10Original: string
    /** Una principal y hasta nueve alternativas, de mayor a menor pertinencia. */
    sugerencias: OpcionCie10[]
    razonamientoClinico: string | null
    /** Distinto de `null` si el modelo falló con este diagnóstico: solo se puede rechazar. */
    error: string | null
    modelo: string
    /** ISO 8601. */
    procesadoEn: string
    ragVersion?: string | null
}

export interface ItemLoteCie10 extends SugerenciaCie10 {
    status: 'AUTOCODIFICADO' | 'CORREGIDO_POR_MEDICO' | 'REQUIERE_ATENCION' | 'CONFIRMADO'
    principal: OpcionCie10 | null
    /** Código resultante; vacío cuando la IA no encontró una codificación válida. */
    finalCode: string
    corrected: boolean
    correctionComment: string | null
    /**
     * El médico ya lo aceptó o lo corrigió. Propuesto en
     * `cie10-lote-pendientes-backend.md`: mientras el servidor no lo mande llega
     * `undefined` y la fila se ve como pendiente.
     */
    reviewed?: boolean
}

export type ConfianzaCie10 = NonNullable<OpcionCie10['confianza']>

/**
 * Filtros de la tabla del lote, que aplica el servidor (la tabla está paginada).
 * Propuestos en `cie10-lote-pendientes-backend.md`.
 */
export interface FiltrosLoteCie10 {
    /** Confianza de la sugerencia principal. Las filas sin sugerencias solo salen sin este filtro. */
    confianza?: ConfianzaCie10
    /** Texto dentro de la descripción médica, sin distinguir mayúsculas ni acentos. */
    q?: string
}

/** Propuesto en `cie10-lote-pendientes-backend.md`. Cuenta todo el lote, sin filtros ni página. */
export interface ConteosLoteCie10 {
    /** Ítems que nadie ha aceptado ni corregido. */
    pendientes: number
}

export type EstadoLoteCie10 = 'PENDIENTE_REVISION' | 'CONFIRMADO'

/** Pestañas de la lista de lotes: sin confirmar, o ya confirmados. */
export type FiltroLotesCie10 = 'PENDIENTES' | 'REVISADOS'

/** Una tarjeta de la lista de lotes. Propuesto en `cie10-lote-pendientes-backend.md`. */
export interface ResumenLoteCie10 {
    runId: string
    /** `YYYY-MM`: el mes de los diagnósticos que procesó el lote. */
    periodo: string
    status: EstadoLoteCie10
    /** ISO 8601: cuándo terminó de procesarse. */
    finishedAt: string | null
    /** Diagnósticos del lote. */
    total: number
    /** Sin aceptar ni corregir. */
    pendientes: number
    confirmedAt: string | null
}

export interface PaginaLotesCie10 {
    items: ResumenLoteCie10[]
    /** Lotes del filtro pedido. */
    total: number
    page: number
    pageSize: number
    /** Para los contadores de las dos pestañas. */
    counts: { pendientes: number; revisados: number }
}

export interface LoteCie10 {
    runId: string
    /** Propuesto: `YYYY-MM`, el mes de los diagnósticos. Va en el título de la tabla. */
    periodo?: string
    status: EstadoLoteCie10
    ragVersion: string | null
    model: string
    finishedAt: string | null
    clause: { version: string; text: string }
    clauseAccepted: boolean
    clauseAcceptedAt: string | null
    confirmed: boolean
    confirmedAt: string | null
    items: ItemLoteCie10[]
    /** Ítems que cumplen los filtros, o de todo el lote si no se filtró. */
    total: number
    page: number
    pageSize: number
    /** Propuesto. `undefined` hasta que el servidor lo mande. */
    counts?: ConteosLoteCie10
}

/** `POST /lotes/:runId/items/:codigoTraductor/aceptar` (propuesto). */
export interface AceptacionLotePayload {
    codigo: string
    /** 1-based: el lugar de la sugerencia aceptada en `sugerencias`. */
    posicion: number
    sugerenciasMostradas: number
}

/** Una fila de `POST /lotes/:runId/items/aceptar` (propuesto): aceptar varias de una vez. */
export interface AceptacionMasivaItem extends AceptacionLotePayload {
    codigoTraductor: string
}

/**
 * `PUT /lotes/:runId/items/:codigoTraductor`. Propuesto: sin `comentario` (la
 * corrección en el lote es solo el código), y con `sugerenciasMostradas`.
 */
export interface CorreccionLotePayload {
    codigo: string
    sugerenciasMostradas?: number
    /**
     * Propuesto: el médico eligió a propósito un código que no está en el
     * catálogo vigente. Sin esto, un código fuera de catálogo se rechaza.
     */
    fueraDeCatalogo?: boolean
}

export interface RevisionItemLote {
    codigoTraductor: string
    codigoFinal: string
    comentario: string | null
    corrected: boolean
    updatedAt: string
}

export interface ConfirmacionLoteCie10 {
    runId: string
    confirmed: true
    total: number
}

export interface CatalogoCie10Item {
    codigo: string
    descripcion: string
    codigoInterno: string | null
    enCatalogoInstitucional: boolean
    enReferenciaExterna: boolean
}
