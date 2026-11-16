import type { Meta, StoryObj } from '@storybook/react-vite'
import { Cie10BatchReviewView } from './Cie10BatchReviewView'
import type { CatalogoCie10Item, ItemLoteCie10, LoteCie10, OpcionCie10 } from '../../../types/cie10'

/* Datos: los ejemplos y las variantes del contrato de `GET /lotes/activo`. */

function opcion(partial: Partial<OpcionCie10> & Pick<OpcionCie10, 'codigo' | 'nombreCatalogo'>): OpcionCie10 {
    return {
        descripcionModelo: partial.nombreCatalogo,
        codigoInternoCatalogo: null,
        razonamiento: null,
        soporte: 'VALIDADO_INSTITUCIONAL',
        confianza: 'ALTA',
        distanciaRag: 0.1,
        informacionFaltante: [],
        ...partial,
    }
}

function item(partial: Partial<ItemLoteCie10> & Pick<ItemLoteCie10, 'codigoTraductor' | 'diagnostico'>): ItemLoteCie10 {
    const sugerencias = partial.sugerencias ?? []
    const principal = partial.principal === undefined ? sugerencias[0] ?? null : partial.principal
    return {
        runId: 'run-2026-10-17',
        cie10Original: '-1',
        sugerencias,
        razonamientoClinico: null,
        error: null,
        modelo: 'gpt-6-luna',
        procesadoEn: '2026-10-17T18:29:00.000Z',
        ragVersion: 'cie10-rag-2026-10-17',
        status: principal ? 'AUTOCODIFICADO' : 'REQUIERE_ATENCION',
        principal,
        finalCode: principal?.codigo ?? '',
        corrected: false,
        correctionComment: null,
        reviewed: false,
        ...partial,
    }
}

const RODILLA = item({
    codigoTraductor: 'REG-001',
    diagnostico: 'Esguince de rodilla',
    razonamientoClinico: 'El texto permite codificar una lesión de rodilla, pero no identifica la estructura exacta.',
    sugerencias: [
        opcion({
            codigo: 'S83.9', codigoInternoCatalogo: '4812', distanciaRag: 0.08,
            descripcionModelo: 'Esguince de estructuras de la rodilla',
            nombreCatalogo: 'Esguince de otras partes y las no especificadas de la rodilla',
            razonamiento: 'El diagnóstico indica una lesión ligamentaria de rodilla sin mayor especificidad.',
            informacionFaltante: ['Ligamento afectado', 'Lateralidad'],
        }),
        opcion({
            codigo: 'S83.8', codigoInternoCatalogo: '4811', confianza: 'MEDIA', distanciaRag: 0.17,
            descripcionModelo: 'Esguince de otras partes de la rodilla',
            nombreCatalogo: 'Esguince de otras partes de la rodilla',
            razonamiento: 'Es una alternativa cuando se conoce que la lesión pertenece a otra estructura de la rodilla.',
            informacionFaltante: ['Estructura afectada'],
        }),
        opcion({
            codigo: 'S83.6', codigoInternoCatalogo: '4813', confianza: 'BAJA', distanciaRag: 0.24,
            nombreCatalogo: 'Esguince y torcedura de otras partes y las no especificadas de la rodilla',
        }),
        opcion({ codigo: 'S83.5', codigoInternoCatalogo: '8959', confianza: 'BAJA', nombreCatalogo: 'Esguince que compromete el ligamento cruzado de la rodilla' }),
        opcion({ codigo: 'S83.4', codigoInternoCatalogo: '8958', confianza: 'BAJA', nombreCatalogo: 'Esguince que compromete los ligamentos laterales de la rodilla' }),
    ],
})

const REFERENCIA_EXTERNA = item({
    codigoTraductor: 'REG-003',
    diagnostico: 'Luxación de rótula derecha',
    sugerencias: [
        opcion({
            codigo: 'S83.004A', soporte: 'REFERENCIA_EXTERNA', confianza: 'MEDIA', distanciaRag: 0.19,
            nombreCatalogo: 'Luxación no especificada de rótula derecha',
            razonamiento: 'El código está respaldado por la referencia externa.',
        }),
    ],
})

const FUERA_DE_CATALOGO = item({
    codigoTraductor: 'REG-004',
    diagnostico: 'Síndrome cromosómico a estudio',
    sugerencias: [
        opcion({
            codigo: 'Q99.8', soporte: 'REQUIERE_ATENCION', confianza: 'BAJA', distanciaRag: null,
            nombreCatalogo: 'Otra anomalía cromosómica especificada',
            razonamiento: 'La IA propuso el código, pero no fue respaldado por las referencias recuperadas.',
            informacionFaltante: ['Confirmación citogenética'],
        }),
    ],
})

const SIN_INFORMACION = item({
    codigoTraductor: 'REG-005',
    diagnostico: 'control',
    razonamientoClinico: 'El texto no contiene información clínica suficiente para proponer una codificación.',
})

const ERROR_PROVEEDOR = item({
    codigoTraductor: 'REG-006',
    diagnostico: 'dx pendiente',
    error: 'OPENAI_RESPONSE_ERROR',
})

const CORREGIDO = item({
    codigoTraductor: 'REG-007',
    diagnostico: 'malestar general',
    sugerencias: [opcion({ codigo: 'R53', codigoInternoCatalogo: '8170', confianza: 'BAJA', nombreCatalogo: 'Malestar y fatiga' })],
    status: 'CORREGIDO_POR_MEDICO',
    finalCode: 'R69',
    corrected: true,
    correctionComment: null,
    reviewed: true,
})

const NEUMONIA = item({
    codigoTraductor: 'REG-002',
    diagnostico: 'Neumonía',
    sugerencias: [
        opcion({
            codigo: 'J18.9', codigoInternoCatalogo: '3201', distanciaRag: 0.06,
            descripcionModelo: 'Neumonía no especificada', nombreCatalogo: 'Neumonía, organismo no especificado',
            razonamiento: 'El diagnóstico no identifica un microorganismo.',
        }),
        opcion({ codigo: 'J15.9', codigoInternoCatalogo: '3190', confianza: 'MEDIA', nombreCatalogo: 'Neumonia bacteriana, no especificada' }),
    ],
})

const ACEPTADO = { ...NEUMONIA, reviewed: true }

const HTA = item({
    codigoTraductor: 'REG-008',
    diagnostico: 'HTA',
    sugerencias: [
        opcion({ codigo: 'I10', codigoInternoCatalogo: '3700', nombreCatalogo: 'Hipertension esencial (primaria)', razonamiento: 'HTA es la abreviatura habitual de hipertensión arterial.' }),
        opcion({ codigo: 'I15.9', codigoInternoCatalogo: '3719', confianza: 'MEDIA', nombreCatalogo: 'Hipertension secundaria, no especificada' }),
    ],
})

/** Una sola tabla, en el orden del servidor: lo que pide más atención, arriba. */
const ITEMS = [ERROR_PROVEEDOR, SIN_INFORMACION, FUERA_DE_CATALOGO, REFERENCIA_EXTERNA, RODILLA, CORREGIDO, ACEPTADO, HTA]

const LOTE: LoteCie10 = {
    runId: 'run-2026-10-17',
    periodo: '2026-09',
    status: 'PENDIENTE_REVISION',
    ragVersion: 'cie10-rag-2026-10-17',
    model: 'gpt-6-luna',
    finishedAt: '2026-10-17T18:30:00.000Z',
    clause: {
        version: 'v1',
        text: 'Reconozco que la autocodificación fue generada con inteligencia artificial y debe ser revisada bajo mi criterio profesional.',
    },
    clauseAccepted: false,
    clauseAcceptedAt: null,
    confirmed: false,
    confirmedAt: null,
    items: ITEMS,
    total: ITEMS.length,
    page: 1,
    pageSize: 20,
    counts: { pendientes: 6 },
}

/** Después de confirmar todo llega como CONFIRMADO; `corrected` distingue lo corregido. */
const LOTE_CONFIRMADO: LoteCie10 = {
    ...LOTE,
    status: 'CONFIRMADO',
    clauseAccepted: true,
    clauseAcceptedAt: '2026-10-17T19:20:00.000Z',
    confirmed: true,
    confirmedAt: '2026-10-17T19:20:05.000Z',
    items: [CORREGIDO, ACEPTADO, { ...HTA, reviewed: true }].map((i) => ({ ...i, status: 'CONFIRMADO' as const })),
    total: 3,
    counts: { pendientes: 0 },
}

const CATALOGO: CatalogoCie10Item[] = [
    { codigo: 'R69', descripcion: 'Causas de morbilidad desconocidas y no especificadas', codigoInterno: '8199', enCatalogoInstitucional: true, enReferenciaExterna: true },
    { codigo: 'S83.6', descripcion: 'Esguince y torcedura de otras partes y las no especificadas de la rodilla', codigoInterno: '4813', enCatalogoInstitucional: true, enReferenciaExterna: true },
    { codigo: 'S83.004A', descripcion: 'Luxación no especificada de rótula derecha', codigoInterno: null, enCatalogoInstitucional: false, enReferenciaExterna: true },
]

/** Catálogo de prueba: filtra en memoria, sin servicio. */
async function buscarCatalogo(q: string): Promise<CatalogoCie10Item[]> {
    const termino = q.trim().toLowerCase()
    return CATALOGO.filter((c) => c.codigo.toLowerCase().startsWith(termino) || c.descripcion.toLowerCase().includes(termino))
}

/** Las pendientes con sugerencias: las que se pueden marcar. */
const PENDIENTES_SELECCIONABLES = [FUERA_DE_CATALOGO, REFERENCIA_EXTERNA, RODILLA, HTA].map((i) => i.codigoTraductor)

const meta: Meta<typeof Cie10BatchReviewView> = {
    title: 'Dashboard/Cie10BatchReviewView',
    component: Cie10BatchReviewView,
    parameters: { layout: 'padded' },
    args: {
        lote: LOTE,
        loading: false,
        filtros: { confianza: '', q: '' },
        onFiltrosChange: () => {},
        onBuscar: () => {},
        filtrando: false,
        cantidad: 3,
        onCantidadChange: () => {},
        verDetalle: true,
        onVerDetalleChange: () => {},
        page: 1,
        pages: 1,
        onCambiarPagina: () => {},
        selecciones: {},
        onSeleccionar: () => {},
        editando: new Set(),
        onEditar: () => {},
        seleccionadas: new Set(),
        onSeleccionarFila: () => {},
        onSeleccionarTodas: () => {},
        onAceptarSeleccionadas: () => {},
        busy: null,
        onAceptar: () => {},
        onRechazar: () => {},
        rechazo: { item: null, enviando: false, onCancelar: () => {}, onEnviar: () => {} },
        buscarCatalogo,
        accepted: false,
        onAcceptedChange: () => {},
        onConfirmar: () => {},
    },
}

export default meta
type Story = StoryObj<typeof Cie10BatchReviewView>

export const Cargando: Story = {
    args: { loading: true, lote: null },
}

/** El servidor no encontró el lote del enlace. */
export const SinLote: Story = {
    args: { lote: null },
}

/**
 * La vista completa: filtros arriba, el aviso de lo que falta con la tuerca, y
 * una fila por caso del contrato (error del proveedor, sin información, fuera
 * del catálogo, referencia externa, por revisar, corregida, aceptada).
 */
export const Revision: Story = {}

/** Filtrada por confianza alta y "rodilla": la tabla solo trae lo que calza. */
export const ConFiltros: Story = {
    args: {
        filtros: { confianza: 'ALTA', q: 'rodilla' },
        filtrando: true,
        lote: { ...LOTE, items: [RODILLA], total: 1 },
    },
}

/** Los filtros no dejaron nada. */
export const SinResultados: Story = {
    args: {
        filtros: { confianza: 'BAJA', q: 'fractura' },
        filtrando: true,
        lote: { ...LOTE, items: [], total: 0 },
    },
}

/** Dos filas marcadas: el botón del pie dice cuántas va a aceptar. */
export const FilasSeleccionadas: Story = {
    args: { seleccionadas: new Set([RODILLA.codigoTraductor, HTA.codigoTraductor]) },
}

/** Todas las pendientes de la página marcadas con la casilla del encabezado. */
export const TodasSeleccionadas: Story = {
    args: { seleccionadas: new Set(PENDIENTES_SELECCIONABLES) },
}

export const AceptandoSeleccionadas: Story = {
    args: { seleccionadas: new Set(PENDIENTES_SELECCIONABLES), busy: 'masivo' },
}

/** Con la tuerca en 5: la fila crece una línea por opción, no más. */
export const CincoSugerencias: Story = {
    args: { cantidad: 5 },
}

/** Con la tuerca en 1: solo la principal. */
export const UnaSugerencia: Story = {
    args: { cantidad: 1 },
}

/**
 * Detalle de la IA apagado en la tuerca: sin "i" en las sugerencias. Lo que no
 * es del catálogo institucional conserva el triángulo, con su aviso al pasar el mouse.
 */
export const SinDetalleDeLaIA: Story = {
    args: { verDetalle: false },
}

/** El médico marcó la segunda opción antes de aceptar. */
export const AlternativaMarcada: Story = {
    args: { selecciones: { [RODILLA.codigoTraductor]: 'S83.8' } },
}

export const Aceptando: Story = {
    args: { busy: RODILLA.codigoTraductor },
}

/** "Cambiar" en una fila ya corregida: vuelven las opciones y los botones. */
export const CambiandoDecision: Story = {
    args: { editando: new Set([CORREGIDO.codigoTraductor]) },
}

export const ModalDeRechazo: Story = {
    args: { rechazo: { ...meta.args!.rechazo!, item: RODILLA } },
}

/** Fila sin sugerencias: el modal pide el código en vez de "rechazar". */
export const ModalIngresarCodigo: Story = {
    args: { rechazo: { ...meta.args!.rechazo!, item: SIN_INFORMACION } },
}

export const GuardandoCorreccion: Story = {
    args: {
        busy: RODILLA.codigoTraductor,
        rechazo: { ...meta.args!.rechazo!, item: RODILLA, enviando: true },
    },
}

/** Todo revisado y la cláusula marcada: arriba la pastilla verde y ya se puede confirmar. */
export const ListoParaConfirmar: Story = {
    args: {
        accepted: true,
        lote: { ...LOTE, items: [CORREGIDO, ACEPTADO], total: 2, counts: { pendientes: 0 } },
    },
}

/** Con la cláusula marcada pero filas pendientes, el botón sigue bloqueado. */
export const ConfirmacionBloqueada: Story = {
    args: { accepted: true },
}

export const Confirmando: Story = {
    args: {
        accepted: true,
        busy: 'confirm',
        lote: { ...LOTE, counts: { pendientes: 0 } },
    },
}

/** Solo lectura: el código final y su estado, sin tuerca, casillas ni acciones. */
export const LoteConfirmado: Story = {
    args: { lote: LOTE_CONFIRMADO, accepted: true },
}

export const VariasPaginas: Story = {
    args: {
        lote: { ...LOTE, total: 120, page: 2 },
        page: 2,
        pages: 6,
    },
}
