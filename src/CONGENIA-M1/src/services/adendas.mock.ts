/**
 * @fileoverview Datos de prueba para la bandeja de adendas.
 *
 * Mismo criterio que `fichaSearch.mock.ts`: no es un stub que devuelve siempre
 * lo mismo, sino una implementacion del contrato de PENDIENTES-BACKEND.md
 * (secciones 10 y 11). Filtra, ordena, pagina y resuelve de verdad, porque esa
 * es la logica que despues replicara el backend y la que la pantalla necesita
 * ejercitar: tabs vacios, adenda de un solo cambio, alta sin sustitucion,
 * decisiones mixtas.
 *
 * `filtrarAdendas` y `paginar` se exportan aparte de las funciones asincronas
 * para poder probarlas sin esperar el retardo simulado.
 *
 * Ningun dato de aqui es real.
 */

import type {
    AdendaResumen,
    AdendaSearchParams,
    AdendaSearchResult,
    DecisionCambio,
    EstadoAdenda,
    FichaDetail,
    RevisionResult,
    StoredExam,
    StoredWarningSign,
    StoredObservation,
} from './ficha.service'
import { ApiError } from './api.client'

/** Retardo simulado: suficiente para que se vea el estado de carga. */
const LATENCIA_MS = 320

/**
 * Ventana que se aplica a las adendas ya resueltas cuando no llegan fechas.
 *
 * A diferencia de la busqueda de fichas, **no se aplica al tab de pendientes**:
 * ahi el conjunto ya esta acotado por definicion -solo lo que falta revisar- y
 * esconder una adenda de hace cinco semanas seria esconder trabajo por hacer.
 * Las aprobadas y rechazadas si crecen sin techo, y ahi la ventana vale para lo
 * mismo que en la busqueda.
 *
 * @compliance HIPAA 164.502(b) - minimo dato necesario
 */
export const DIAS_VENTANA_POR_DEFECTO = 30

function isoLocal(fecha: Date): string {
    // `toISOString()` pasa por UTC y en Guatemala adelanta un dia por la tarde.
    const mes = String(fecha.getMonth() + 1).padStart(2, '0')
    const dia = String(fecha.getDate()).padStart(2, '0')
    return `${fecha.getFullYear()}-${mes}-${dia}`
}

/** Fecha ISO de hace `dias` dias, en hora local. */
function haceDias(dias: number): string {
    const fecha = new Date()
    fecha.setDate(fecha.getDate() - dias)
    return isoLocal(fecha)
}

/**
 * Imagen de relleno como SVG embebido.
 *
 * Se genera en vez de versionar binarios: pesa nada, deja claro de un vistazo
 * que es un placeholder, y ejercita la misma ruta de `<img src>` que tendra la
 * URL prefirmada del bucket.
 */
function imagenPlaceholder(texto: string, fondo: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
        <rect width="640" height="480" fill="${fondo}"/>
        <rect x="16" y="16" width="608" height="448" fill="none" stroke="#003E69" stroke-width="4"/>
        <text x="320" y="250" font-family="Montserrat, sans-serif" font-size="28"
              font-weight="600" fill="#003E69" text-anchor="middle">${texto}</text>
    </svg>`

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/** Un cambio tal como se declara en la plantilla de una adenda de prueba. */
interface CambioFixture {
    tipo: 'SIGNO' | 'EXAMEN' | 'OBSERVACION'
    /**
     * Nombre del registro vigente al que sustituye. Ausente = alta que no cambia nada.
     * Las observaciones nunca lo llevan: solo se agregan.
     */
    anterior?: string
    nuevo: string
}

interface AdendaFixture {
    fichaId: string
    paciente: { nombre: string; historiaClinica: string; tenantId: string }
    medicoSolicitante: string
    diasAtras: number
    estadoRevision: EstadoAdenda
    motivoSolicitud: string
    diagnostico: string
    /** Signos y examenes que ya estaban y que ninguna adenda toca. */
    signosIntactos: string[]
    examenesIntactos: string[]
    cambios: CambioFixture[]
}

const FIXTURES: readonly AdendaFixture[] = [
    {
        fichaId: 'ad-001',
        paciente: { nombre: 'Rachel Castro Morales', historiaClinica: '00445566777', tenantId: '23' },
        medicoSolicitante: 'Dr. Marco Paez',
        diasAtras: 2,
        estadoRevision: 'PENDIENTE',
        diagnostico: 'Síndrome de Down, malformación de ojos',
        motivoSolicitud:
            'Al revisar el expediente con la madre noté que las fotografías del primer registro ' +
            'no correspondían al hallazgo descrito: la imagen del dedo meñique se tomó de la mano ' +
            'derecha y el hallazgo es en la izquierda. Adjunto las fotografías corregidas.\n\n' +
            'Además, la descripción del paladar quedó incompleta - se documentó como "paladar ' +
            'hendido" sin precisar que es una hendidura submucosa, que es lo que corresponde ' +
            'según la valoración de otorrinolaringología.\n\n' +
            'Por último agrego el cariotipo, que llegó del laboratorio después de cerrar la ficha.',
        signosIntactos: ['Pliegue palmar único'],
        examenesIntactos: ['Ultrasonido abdominal'],
        cambios: [
            { tipo: 'SIGNO',  anterior: 'Dedo meñique torcido', nuevo: 'Clinodactilia del quinto dedo (mano izq.)' },
            { tipo: 'SIGNO',  anterior: 'Paladar hendido',      nuevo: 'Hendidura palatina submucosa' },
            { tipo: 'EXAMEN', nuevo: 'Cariotipo (análisis cromosómico)' },
            {
                tipo: 'OBSERVACION',
                nuevo:
                    'La madre aclara que la abuela materna tuvo un hijo con rasgos similares que falleció en el primer año.\n' +
                    'Conviene considerarlo al valorar el patrón de herencia.',
            },
        ],
    },
    {
        fichaId: 'ad-002',
        paciente: { nombre: 'Diego Armando Ruiz', historiaClinica: '00445566778', tenantId: '23' },
        medicoSolicitante: 'Dra. Lucía Morán',
        diasAtras: 4,
        estadoRevision: 'PENDIENTE',
        diagnostico: 'Cardiopatía congénita en estudio',
        motivoSolicitud:
            'La fotografía del soplo cardíaco quedó desenfocada y no permite valorar la ' +
            'coloración de la piel. Sustituyo la imagen por una tomada con mejor luz.',
        signosIntactos: ['Cianosis peribucal', 'Hipotonía generalizada'],
        examenesIntactos: ['Ecocardiograma'],
        // Un solo cambio: la navegacion entre cambios debe desaparecer.
        cambios: [
            { tipo: 'SIGNO', anterior: 'Soplo cardíaco', nuevo: 'Soplo sistólico grado III/VI' },
        ],
    },
    {
        fichaId: 'ad-003',
        paciente: { nombre: 'María José Xoc Chávez', historiaClinica: '00445566779', tenantId: '23' },
        medicoSolicitante: 'Dr. Marco Paez',
        // Fuera de la ventana de 30 dias: una pendiente vieja NO debe esconderse.
        diasAtras: 41,
        estadoRevision: 'PENDIENTE',
        diagnostico: 'Displasia esquelética en estudio',
        motivoSolicitud:
            'Agrego la radiografía de columna que el laboratorio entregó tarde. No sustituye ' +
            'ningún estudio previo, es información nueva.',
        signosIntactos: ['Talla baja desproporcionada', 'Macrocefalia relativa'],
        examenesIntactos: ['Serie ósea'],
        cambios: [
            { tipo: 'EXAMEN', nuevo: 'Radiografía de columna lumbosacra' },
        ],
    },
    {
        fichaId: 'ad-004',
        paciente: { nombre: 'Luis Fernando Pérez', historiaClinica: '00445566780', tenantId: '23' },
        medicoSolicitante: 'Dr. Marco Paez',
        diasAtras: 8,
        estadoRevision: 'APROBADA',
        diagnostico: 'Labio y paladar hendido',
        motivoSolicitud: 'Corrección de la lateralidad del labio hendido: es izquierdo, no derecho.',
        signosIntactos: ['Fístula preauricular'],
        examenesIntactos: [],
        cambios: [
            { tipo: 'SIGNO', anterior: 'Labio hendido derecho', nuevo: 'Labio hendido izquierdo' },
        ],
    },
    {
        fichaId: 'ad-005',
        paciente: { nombre: 'Ana Lucía Menchú', historiaClinica: '00445566781', tenantId: '23' },
        medicoSolicitante: 'Dra. Lucía Morán',
        diasAtras: 16,
        estadoRevision: 'APROBADA',
        diagnostico: 'Microcefalia',
        motivoSolicitud: 'Agrego el resultado de la resonancia magnética cerebral.',
        signosIntactos: ['Perímetro cefálico bajo percentil 3'],
        examenesIntactos: ['Tamiz metabólico'],
        cambios: [
            { tipo: 'EXAMEN', nuevo: 'Resonancia magnética cerebral' },
        ],
    },
    {
        fichaId: 'ad-006',
        paciente: { nombre: 'Carlos Estuardo Godoy', historiaClinica: '00445566782', tenantId: '23' },
        medicoSolicitante: 'Dr. Jorge Similox',
        diasAtras: 11,
        estadoRevision: 'RECHAZADA',
        diagnostico: 'Acondroplasia',
        motivoSolicitud: 'Sustituyo la fotografía de las extremidades por una de cuerpo completo.',
        signosIntactos: ['Rizomelia', 'Frente prominente'],
        examenesIntactos: ['Radiografía de huesos largos'],
        cambios: [
            { tipo: 'SIGNO', anterior: 'Acortamiento de extremidades', nuevo: 'Acortamiento rizomélico de extremidades' },
        ],
    },
    {
        fichaId: 'ad-007',
        paciente: { nombre: 'Sofía Isabel Ramírez', historiaClinica: '00445566783', tenantId: '23' },
        medicoSolicitante: 'Dr. Marco Paez',
        // Fuera de la ventana: una rechazada vieja solo aparece si se piden fechas.
        diasAtras: 52,
        estadoRevision: 'RECHAZADA',
        diagnostico: 'Síndrome de Turner en estudio',
        motivoSolicitud: 'Quiero cambiar la descripción del cuello alado.',
        signosIntactos: ['Cuello alado', 'Linfedema de manos'],
        examenesIntactos: ['Cariotipo (análisis cromosómico)'],
        cambios: [
            { tipo: 'SIGNO', anterior: 'Cuello alado', nuevo: 'Pterigium colli' },
        ],
    },
]

const MANO    = { partCatalogId: 31, partName: 'Mano',   regionId: 3, regionName: 'Extremidades superiores' }
const CARA    = { partCatalogId: 12, partName: 'Labio',  regionId: 1, regionName: 'Cabeza y cuello' }
const CUELLO  = { partCatalogId: 14, partName: 'Cuello', regionId: 1, regionName: 'Cabeza y cuello' }
const TORAX   = { partCatalogId: 21, partName: 'Tórax',  regionId: 2, regionName: 'Tronco' }
const PIERNA  = { partCatalogId: 44, partName: 'Pierna', regionId: 4, regionName: 'Extremidades inferiores' }

/**
 * Localizacion anatomica plausible segun el nombre del hallazgo.
 *
 * Una rotacion por indice repartia las partes al azar y dejaba cosas como
 * "Labio hendido - Mano" en pantalla. En datos de prueba que se usan para
 * revisar el diseno, un chip que se contradice con el titulo distrae tanto como
 * un fallo de verdad.
 */
function parteDe(nombre: string) {
    const texto = nombre.toLowerCase()
    if (/labio|paladar|hendidura|palatina|frente|cefálic|cefalic|microcefal/.test(texto)) return CARA
    if (/cuello|pterigium|alado/.test(texto))                                            return CUELLO
    if (/dedo|mano|palmar|clinodactilia|linfedema|preauricular/.test(texto))              return MANO
    if (/pierna|extremidad|rizom|talla|acortamiento/.test(texto))                         return PIERNA
    return TORAX
}

function construirFicha(fixture: AdendaFixture): FichaDetail {
    const warningSigns: StoredWarningSign[] = []
    const examDiagnoses: StoredExam[] = []
    const observations: StoredObservation[] = []

    const signo = (id: string, nombre: string, addedInRevision: boolean): StoredWarningSign => ({
        signoId: id,
        signDescription: nombre,
        ...parteDe(nombre),
        imageUrl: imagenPlaceholder(nombre, addedInRevision ? '#D4F3FF' : '#E2E8F0'),
        addedInRevision,
    })

    const examen = (id: string, nombre: string, addedInRevision: boolean): StoredExam => ({
        examenId: id,
        examDescription: nombre,
        examUrl: imagenPlaceholder(nombre, addedInRevision ? '#D4F3FF' : '#E2E8F0'),
        addedInRevision,
    })

    fixture.signosIntactos.forEach((nombre, i) => {
        warningSigns.push(signo(`${fixture.fichaId}-s-int-${i}`, nombre, false))
    })
    fixture.examenesIntactos.forEach((nombre, i) => {
        examDiagnoses.push(examen(`${fixture.fichaId}-e-int-${i}`, nombre, false))
    })

    fixture.cambios.forEach((cambio, i) => {
        if (cambio.tipo === 'OBSERVACION') {
            observations.push({
                observacionId: `${fixture.fichaId}-o-new-${i}`,
                observationText: cambio.nuevo,
                addedInRevision: true,
                fechaCreacion: haceDias(fixture.diasAtras),
            })
            return
        }

        if (cambio.tipo === 'SIGNO') {
            const nuevoId = `${fixture.fichaId}-s-new-${i}`
            if (cambio.anterior) {
                const anteriorId = `${fixture.fichaId}-s-old-${i}`
                warningSigns.push({ ...signo(anteriorId, cambio.anterior, false), replacedBySignoId: nuevoId })
                warningSigns.push({ ...signo(nuevoId, cambio.nuevo, true), replacesSignoId: anteriorId })
            } else {
                warningSigns.push(signo(nuevoId, cambio.nuevo, true))
            }
            return
        }

        const nuevoId = `${fixture.fichaId}-e-new-${i}`
        if (cambio.anterior) {
            const anteriorId = `${fixture.fichaId}-e-old-${i}`
            examDiagnoses.push({ ...examen(anteriorId, cambio.anterior, false), replacedByExamenId: nuevoId })
            examDiagnoses.push({ ...examen(nuevoId, cambio.nuevo, true), replacesExamenId: anteriorId })
        } else {
            examDiagnoses.push(examen(nuevoId, cambio.nuevo, true))
        }
    })

    return {
        fichaId: fixture.fichaId,
        pacienteId: `pac-${fixture.paciente.historiaClinica}`,
        fichaRaizId: `${fixture.fichaId}-raiz`,
        revision: 2,
        estadoFicha: fixture.estadoRevision === 'PENDIENTE' ? 'PENDIENTE' : 'COMPLETA',
        estadoRevision: fixture.estadoRevision,
        esVigente: fixture.estadoRevision === 'APROBADA',
        motivoSolicitud: fixture.motivoSolicitud,
        fechaCreacion: haceDias(fixture.diasAtras),
        paciente: fixture.paciente,
        consulta: {
            fechaConsulta: haceDias(fixture.diasAtras + 6),
            diagnosticoTexto: fixture.diagnostico,
        },
        medico: { nombre: fixture.medicoSolicitante, especialidad: 'Pediatría' },
        demographic: {
            referralSourceId: null,
            birthMethodId: null,
            affectedRelatives: true,
            affectedRelativesCategoryIds: [],
            affectedUnderageRelatives: 2,
            affectedAdultRelatives: 3,
            affectedCommunityMembers: 'NO',
        },
        // El revisor no necesita el consentimiento: lo que no se manda no se filtra.
        consent: null,
        warningSigns,
        examDiagnoses,
        observations,
    }
}

/**
 * Estado mutable del mock.
 *
 * Resolver una adenda la mueve de tab de verdad, para que en desarrollo se vea
 * el efecto completo del guardado en vez de que la fila siga ahi como si nada.
 */
const FICHAS = new Map<string, FichaDetail>(
    FIXTURES.map((fixture) => [fixture.fichaId, construirFicha(fixture)]),
)

function aResumen(ficha: FichaDetail): AdendaResumen {
    return {
        fichaId: ficha.fichaId,
        fichaRaizId: ficha.fichaRaizId,
        revision: ficha.revision,
        estadoRevision: ficha.estadoRevision ?? 'PENDIENTE',
        fechaSolicitud: ficha.fechaCreacion ?? ficha.consulta.fechaConsulta,
        medicoSolicitante: ficha.medico.nombre,
        motivoSolicitud: ficha.motivoSolicitud ?? '',
        paciente: ficha.paciente,
    }
}

/** Normaliza para comparar: minusculas y sin acentos. */
function normalizar(texto: string): string {
    return texto.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/** Palabras normalizadas de un texto, sin vacios. */
function tokens(texto: string): string[] {
    return normalizar(texto).split(/\s+/).filter(Boolean)
}

/**
 * Todas las palabras buscadas estan en el nombre, como palabras completas.
 *
 * Es la misma regla que `fichaSearch.mock.ts`, y por el mismo motivo: el nombre
 * del paciente esta cifrado y solo se puede buscar contra un indice ciego de
 * hashes por palabra, que no admite fragmentos. "Cast" no encuentra a "Castro".
 */
function coincideNombre(nombre: string, buscados: string[]): boolean {
    const presentes = new Set(tokens(nombre))
    return buscados.every((palabra) => presentes.has(palabra))
}

/**
 * Filtra por estado, texto libre y rango de fechas de solicitud, con AND.
 *
 * El texto busca por nombre del paciente (palabras completas), por historia
 * clinica o por nombre del pediatra. Los dos ultimos admiten coincidencia
 * parcial: ni el numero de expediente ni el nombre del medico -que viene de
 * Keycloak- estan cifrados, asi que el backend los resuelve con un `LIKE`.
 *
 * Las fechas son ISO `YYYY-MM-DD`, que ordena igual como texto que como fecha:
 * por eso comparar cadenas con `>=` / `<=` es correcto, y evita construir `Date`
 * (y con ella, lios de zona horaria).
 */
export function filtrarAdendas(
    items: readonly AdendaResumen[],
    { estado, q, desde, hasta }: AdendaSearchParams,
): AdendaResumen[] {
    const termino = q?.trim() ?? ''
    const buscados = termino ? tokens(termino) : []
    const terminoNormalizado = normalizar(termino)

    return items.filter((adenda) => {
        if (adenda.estadoRevision !== estado) return false

        if (buscados.length > 0) {
            const coincide =
                coincideNombre(adenda.paciente.nombre, buscados) ||
                adenda.paciente.historiaClinica.includes(termino) ||
                normalizar(adenda.medicoSolicitante).includes(terminoNormalizado)
            if (!coincide) return false
        }

        if (desde && adenda.fechaSolicitud < desde) return false
        if (hasta && adenda.fechaSolicitud > hasta) return false

        return true
    })
}

export function paginar<T>(items: readonly T[], page: number, pageSize: number): T[] {
    const inicio = (page - 1) * pageSize
    return items.slice(inicio, inicio + pageSize)
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function listarAdendasMock(params: AdendaSearchParams): Promise<AdendaSearchResult> {
    await delay(LATENCIA_MS)

    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 12

    // La ventana por defecto solo acota lo ya resuelto (ver DIAS_VENTANA_POR_DEFECTO).
    const acotar = params.estado !== 'PENDIENTE' && !params.desde && !params.hasta
    const conVentana: AdendaSearchParams = acotar
        ? { ...params, desde: haceDias(DIAS_VENTANA_POR_DEFECTO) }
        : params

    const resumenes = [...FICHAS.values()].map(aResumen)
    // Mas reciente primero, igual que el `ORDER BY fecha_creacion DESC` del contrato.
    const filtradas = filtrarAdendas(resumenes, conVentana)
        .sort((a, b) => b.fechaSolicitud.localeCompare(a.fechaSolicitud))

    return {
        items: paginar(filtradas, page, pageSize),
        total: filtradas.length,
        page,
        pageSize,
    }
}

export async function obtenerAdendaMock(fichaId: string): Promise<FichaDetail> {
    await delay(LATENCIA_MS)

    const ficha = FICHAS.get(fichaId)
    if (!ficha) {
        throw new ApiError(404, 'ADENDA_NOT_FOUND', 'La adenda no existe en el conjunto de prueba.', 'mock')
    }

    return structuredClone(ficha)
}

/**
 * Aplica las decisiones sobre el conjunto en memoria.
 *
 * Replica las reglas del contrato: exige una decision por cada alta, descarta
 * las rechazadas devolviendo a vigente lo que sustituian, y no deja resolver dos
 * veces la misma adenda.
 */
export async function resolverAdendaMock(
    fichaId: string,
    decisiones: DecisionCambio[],
): Promise<RevisionResult> {
    await delay(LATENCIA_MS)

    const ficha = FICHAS.get(fichaId)
    if (!ficha) {
        throw new ApiError(404, 'ADENDA_NOT_FOUND', 'La adenda no existe en el conjunto de prueba.', 'mock')
    }
    if ((ficha.estadoRevision ?? 'PENDIENTE') !== 'PENDIENTE') {
        throw new ApiError(409, 'ADENDA_YA_RESUELTA', 'Esta adenda ya fue resuelta.', 'mock')
    }

    const altas = [
        ...ficha.warningSigns.filter((s) => s.addedInRevision).map((s) => s.signoId),
        ...ficha.examDiagnoses.filter((e) => e.addedInRevision).map((e) => e.examenId),
        ...(ficha.observations ?? []).filter((o) => o.addedInRevision).map((o) => o.observacionId),
    ]
    const decididos = new Set(decisiones.map((d) => d.id))
    if (altas.some((id) => !decididos.has(id))) {
        throw new ApiError(400, 'DECISION_INCOMPLETA', 'Falta decidir al menos un cambio de la adenda.', 'mock')
    }

    const rechazados = new Set(decisiones.filter((d) => d.decision === 'RECHAZADO').map((d) => d.id))
    const aprobados = altas.filter((id) => !rechazados.has(id))

    // Un alta rechazada desaparece, y lo que sustituia vuelve a quedar vigente.
    ficha.warningSigns = ficha.warningSigns
        .filter((s) => !rechazados.has(s.signoId))
        .map((s) => (s.replacedBySignoId && rechazados.has(s.replacedBySignoId)
            ? { ...s, replacedBySignoId: null }
            : s))
    ficha.examDiagnoses = ficha.examDiagnoses
        .filter((e) => !rechazados.has(e.examenId))
        .map((e) => (e.replacedByExamenId && rechazados.has(e.replacedByExamenId)
            ? { ...e, replacedByExamenId: null }
            : e))

    // Una observacion no sustituye nada: rechazada, simplemente no entra.
    ficha.observations = (ficha.observations ?? []).filter((o) => !rechazados.has(o.observacionId))

    ficha.estadoRevision = aprobados.length > 0 ? 'APROBADA' : 'RECHAZADA'
    ficha.estadoFicha = 'COMPLETA'
    ficha.esVigente = aprobados.length > 0

    return { fichaId, revision: ficha.revision, estadoFicha: ficha.estadoFicha }
}
