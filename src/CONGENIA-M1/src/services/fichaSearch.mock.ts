/**
 * @fileoverview Datos de prueba para la búsqueda de fichas.
 *
 * No es un stub que devuelve siempre lo mismo: filtra y pagina de verdad,
 * porque esa es justamente la lógica que después replicará el backend y la que
 * la UI necesita ejercitar (estado vacío, "Cargar más", filtros combinados).
 *
 * `filterFichas` y `paginate` se exportan aparte de las funciones asíncronas
 * para poder probarlas sin esperar el retardo simulado.
 *
 * Ningún dato de aquí es real. Ver `PENDIENTES-BACKEND.md`.
 */

import type {
    FichaDetalle,
    FichaResumen,
    FichaSearchParams,
    FichaSearchResult,
} from '../types/ficha-search'
import { ApiError } from './api.client'

/** Retardo simulado: suficiente para que se vea el estado de carga. */
const LATENCIA_MS = 350

/**
 * Ventana que se aplica cuando la búsqueda llega sin fechas.
 *
 * El frontend deja el filtro vacío a propósito, así que es el servidor el que
 * acota: un listado sin límites es la petición más rentable para quien quiera
 * extraer datos. El mock lo replica para que en desarrollo se vea el mismo
 * comportamiento que en producción.
 *
 * @compliance HIPAA 164.502(b) - mínimo dato necesario
 */
export const DIAS_VENTANA_POR_DEFECTO = 30

function isoLocal(fecha: Date): string {
    // `toISOString()` pasa por UTC y en Guatemala adelanta un día por la tarde.
    const mes = String(fecha.getMonth() + 1).padStart(2, '0')
    const dia = String(fecha.getDate()).padStart(2, '0')
    return `${fecha.getFullYear()}-${mes}-${dia}`
}

/** Fecha ISO de hace `dias` días, en hora local. */
function haceDias(dias: number): string {
    const fecha = new Date()
    fecha.setDate(fecha.getDate() - dias)
    return isoLocal(fecha)
}

/**
 * Antigüedad de cada ficha de prueba, en días.
 *
 * Relativas a hoy y no fechas fijas: con fechas quemadas, el mock envejece y en
 * unos meses la ventana por defecto no devolvería nada. Las seis primeras caen
 * dentro de los 30 días para que la pantalla tenga algo que mostrar sin filtros.
 */
const ANTIGUEDAD_DIAS = [2, 5, 9, 14, 21, 28, 36, 49, 64, 81, 105, 131, 161, 196, 241]

export const MOCK_FICHAS: readonly FichaResumen[] = [
    { fichaId: 'f-001', nombrePaciente: 'Rachel Castro Morales',     fechaConsulta: haceDias(ANTIGUEDAD_DIAS[0]), historiaClinica: '00445566777', idTenant: 23 },
    { fichaId: 'f-002', nombrePaciente: 'Diego Armando Ruiz',        fechaConsulta: haceDias(ANTIGUEDAD_DIAS[1]), historiaClinica: '00445566778', idTenant: 23 },
    { fichaId: 'f-003', nombrePaciente: 'María José Xoc Chávez',     fechaConsulta: haceDias(ANTIGUEDAD_DIAS[2]), historiaClinica: '00445566779', idTenant: 23 },
    { fichaId: 'f-004', nombrePaciente: 'Luis Fernando Pérez',       fechaConsulta: haceDias(ANTIGUEDAD_DIAS[3]), historiaClinica: '00445566780', idTenant: 17 },
    { fichaId: 'f-005', nombrePaciente: 'Ana Lucía Menchú',          fechaConsulta: haceDias(ANTIGUEDAD_DIAS[4]), historiaClinica: '00445566781', idTenant: 17 },
    { fichaId: 'f-006', nombrePaciente: 'Carlos Estuardo Godoy',     fechaConsulta: haceDias(ANTIGUEDAD_DIAS[5]), historiaClinica: '00445566782', idTenant: 23 },
    { fichaId: 'f-007', nombrePaciente: 'Sofía Isabel Ramírez',      fechaConsulta: haceDias(ANTIGUEDAD_DIAS[6]), historiaClinica: '00445566783', idTenant: 41 },
    { fichaId: 'f-008', nombrePaciente: 'Josué Alejandro Tzoc',      fechaConsulta: haceDias(ANTIGUEDAD_DIAS[7]), historiaClinica: '00445566784', idTenant: 41 },
    { fichaId: 'f-009', nombrePaciente: 'Valeria Nicole Herrera',    fechaConsulta: haceDias(ANTIGUEDAD_DIAS[8]), historiaClinica: '00445566785', idTenant: 23 },
    { fichaId: 'f-010', nombrePaciente: 'Mateo Sebastián Arriola',   fechaConsulta: haceDias(ANTIGUEDAD_DIAS[9]), historiaClinica: '00445566786', idTenant: 17 },
    { fichaId: 'f-011', nombrePaciente: 'Camila Andrea Batz',        fechaConsulta: haceDias(ANTIGUEDAD_DIAS[10]), historiaClinica: '00445566787', idTenant: 23 },
    { fichaId: 'f-012', nombrePaciente: 'Emilio Rodrigo Salazar',    fechaConsulta: haceDias(ANTIGUEDAD_DIAS[11]), historiaClinica: '00445566788', idTenant: 41 },
    { fichaId: 'f-013', nombrePaciente: 'Gabriela Mishell Coy',      fechaConsulta: haceDias(ANTIGUEDAD_DIAS[12]), historiaClinica: '00445566789', idTenant: 17 },
    { fichaId: 'f-014', nombrePaciente: 'Andrés Felipe Marroquín',   fechaConsulta: haceDias(ANTIGUEDAD_DIAS[13]), historiaClinica: '00445566790', idTenant: 23 },
    { fichaId: 'f-015', nombrePaciente: 'Renata Alejandra Ixcot',    fechaConsulta: haceDias(ANTIGUEDAD_DIAS[14]), historiaClinica: '00445566791', idTenant: 41 },
]

/**
 * Normaliza para comparar: minúsculas y sin acentos.
 *
 * Sin esto "maria" no encontraría a "María", que es exactamente lo que un médico
 * escribe cuando busca con prisa.
 */
function normalizar(texto: string): string {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
}

/** Palabras normalizadas de un texto, sin vacíos. */
function tokens(texto: string): string[] {
    return normalizar(texto).split(/\s+/).filter(Boolean)
}

/**
 * ¿El nombre contiene todas las palabras buscadas?
 *
 * Compara **palabras completas**, no fragmentos, porque es lo único que podrá
 * hacer el backend: `paciente.nombre_enc` está cifrado y la búsqueda se resuelve
 * contra un índice ciego de hashes por palabra (ver `PENDIENTES-BACKEND.md`).
 * Un hash no admite `LIKE`, así que "Cast" no encontrará a "Castro".
 *
 * Que el mock se comporte igual evita que la interfaz quede probada contra una
 * búsqueda más permisiva de la que va a existir en producción.
 *
 * Todas las palabras del término deben estar (AND): "María Castro" no trae a
 * cualquier María, y el orden no importa.
 */
function coincideNombre(nombre: string, buscados: string[]): boolean {
    const presentes = new Set(tokens(nombre))
    return buscados.every((palabra) => presentes.has(palabra))
}

/**
 * Aplica texto libre y rango de fechas. Ambos filtros son opcionales y se
 * combinan con AND.
 *
 * El texto busca por nombre (palabras completas) **o** por número de historia
 * clínica. La historia clínica sí admite coincidencia parcial: no está cifrada,
 * así que el backend puede resolverla con un `LIKE` normal.
 *
 * Las fechas son ISO `YYYY-MM-DD`, que ordena igual como texto que como fecha:
 * por eso la comparación con `>=` / `<=` de cadenas es correcta aquí, y evita
 * construir `Date` (y con ella, líos de zona horaria).
 */
export function filterFichas(
    items: readonly FichaResumen[],
    { q, desde, hasta }: FichaSearchParams,
): FichaResumen[] {
    const termino = q?.trim() ?? ''
    const buscados = termino ? tokens(termino) : []

    return items.filter((ficha) => {
        if (buscados.length > 0) {
            const coincide =
                coincideNombre(ficha.nombrePaciente, buscados) ||
                ficha.historiaClinica.includes(termino)
            if (!coincide) return false
        }

        if (desde && ficha.fechaConsulta < desde) return false
        if (hasta && ficha.fechaConsulta > hasta) return false

        return true
    })
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): T[] {
    const inicio = (page - 1) * pageSize
    return items.slice(inicio, inicio + pageSize)
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function searchFichasMock(params: FichaSearchParams = {}): Promise<FichaSearchResult> {
    await delay(LATENCIA_MS)

    const page = params.page ?? 1
    const pageSize = params.pageSize ?? 12

    // Sin ninguna fecha, el servidor impone su ventana. Basta con que venga una
    // de las dos para respetar lo que el médico pidió.
    const conVentana: FichaSearchParams =
        params.desde || params.hasta
            ? params
            : { ...params, desde: haceDias(DIAS_VENTANA_POR_DEFECTO) }

    // Más reciente primero, igual que el `ORDER BY fecha_consulta DESC` del contrato.
    const filtradas = filterFichas(MOCK_FICHAS, conVentana)
        .sort((a, b) => b.fechaConsulta.localeCompare(a.fechaConsulta))

    return {
        items: paginate(filtradas, page, pageSize),
        total: filtradas.length,
        page,
        pageSize,
    }
}

/**
 * Imagen de relleno como SVG embebido.
 *
 * Se genera en vez de versionar binarios: pesa nada, deja claro de un vistazo
 * que es un placeholder, y ejercita la misma ruta de `<img src>` que tendrá la
 * URL prefirmada del bucket.
 */
function imagenPlaceholder(texto: string): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
        <rect width="640" height="480" fill="#8AB3D6"/>
        <rect x="16" y="16" width="608" height="448" fill="none" stroke="#003E69" stroke-width="4"/>
        <text x="320" y="250" font-family="Montserrat, sans-serif" font-size="34"
              font-weight="600" fill="#003E69" text-anchor="middle">${texto}</text>
    </svg>`

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const FECHA_LARGA = new Intl.DateTimeFormat('es-GT', { dateStyle: 'long' })

function formatearFecha(iso: string): string {
    // Partir el ISO a mano evita que `new Date('2026-07-07')` se corra un día
    // hacia atrás al interpretarlo como UTC en husos negativos, que es el caso
    // de Guatemala.
    const [anio, mes, dia] = iso.split('-').map(Number)
    return FECHA_LARGA.format(new Date(anio, mes - 1, dia))
}

export async function getFichaByIdMock(fichaId: string): Promise<FichaDetalle> {
    await delay(LATENCIA_MS)

    const resumen = MOCK_FICHAS.find((ficha) => ficha.fichaId === fichaId)
    if (!resumen) {
        throw new ApiError(404, 'FICHA_NOT_FOUND', 'No se encontró la ficha solicitada', 'mock')
    }

    // Derivado del id para que cada ficha se vea distinta pero siempre igual a
    // sí misma entre recargas.
    const variante = Number(resumen.fichaId.slice(-3)) % 3

    return {
        fichaId: resumen.fichaId,
        nombrePaciente: resumen.nombrePaciente,
        historiaClinica: resumen.historiaClinica,
        idTenant: resumen.idTenant,

        datosConsulta: {
            fechaConsulta: formatearFecha(resumen.fechaConsulta),
            medicoConsulta: 'Dr. Nicolás Castro',
            especialidad: 'Pediatra',
            diagnosticos: 'Síndrome de Down, malformación de ojos',
            referidoDe: { value: 'comadrona', label: 'Comadrona' },
            lugarDeParto: { value: 'hospital_local', label: 'Hospital local' },
            sexo: { value: '2', label: 'Femenino' },
        },

        otrosDemograficos: {
            familiaresAfectados: 1,
            menoresEnHogar: 2,
            adultosEnHogar: 3,
            quienAfectado: variante === 0 ? ['hermano', 'madre'] : ['hermana'],
            afectadosComunidad: variante === 2 ? 2 : 1,
        },

        signosAlerta: [
            {
                id: `${resumen.fichaId}-signo-1`,
                nombre: 'Dedo meñique torcido',
                parteDelCuerpo: {
                    regionValue: 'extremidades_superiores',
                    parteValue: 'mano',
                    lateralidad: 'izquierda',
                },
                parteDelCuerpoLabel: 'Mano (Izq.)',
                imagenUrl: imagenPlaceholder('Signo de alerta 1'),
            },
            {
                id: `${resumen.fichaId}-signo-2`,
                nombre: 'Paladar hendido',
                parteDelCuerpo: {
                    regionValue: 'cabeza_cuello',
                    parteValue: 'labio',
                },
                parteDelCuerpoLabel: 'Labio',
                imagenUrl: imagenPlaceholder('Signo de alerta 2'),
            },
        ],

        examenesSugeridos: [
            {
                id: `${resumen.fichaId}-examen-1`,
                nombre: 'Cariotipo (análisis cromosómico)',
                imagenUrl: imagenPlaceholder('Examen'),
                nombreArchivo: 'cariotipo.png',
            },
            // Sin adjunto a propósito: el visor tiene que aguantar ambos casos.
            {
                id: `${resumen.fichaId}-examen-2`,
                nombre: 'Ultrasonido renal',
            },
        ],

        observaciones: [
            {
                id: `${resumen.fichaId}-observacion-1`,
                texto:
                    'La madre refiere que un primo materno presentó rasgos similares al nacer.\n' +
                    'Se sugiere valorar interconsulta con genética en el próximo control.',
                fecha: resumen.fechaConsulta,
            },
        ],
    }
}
