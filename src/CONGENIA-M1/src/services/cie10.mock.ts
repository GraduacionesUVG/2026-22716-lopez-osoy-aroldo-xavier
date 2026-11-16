/**
 * @fileoverview Datos de prueba para la revisión CIE-10 por lote.
 *
 * Mismo criterio que `adendas.mock.ts`: no es un stub que devuelve siempre lo
 * mismo, sino una implementación del contrato de
 * `cie10-lote-pendientes-backend.md`. Pagina, filtra, valida cada aceptación y
 * corrección y devuelve los mismos errores que devolverá el servidor, porque
 * esa es la lógica que la pantalla necesita ejercitar.
 *
 * Los diez primeros diagnósticos son los de la corrida real del modelo
 * (`Sugerencias_Pendientes.json`); el resto se genera para que el lote tenga el
 * tamaño de un mes. Los `codigoInternoCatalogo` de los generados son inventados.
 */

import { ApiError } from './api.client'
import type {
    AceptacionLotePayload,
    AceptacionMasivaItem,
    CatalogoCie10Item,
    ConfirmacionLoteCie10,
    CorreccionLotePayload,
    EstadoLoteCie10,
    FiltroLotesCie10,
    FiltrosLoteCie10,
    ItemLoteCie10,
    LoteCie10,
    OpcionCie10,
    PaginaLotesCie10,
    ResumenLoteCie10,
    RevisionItemLote,
    SugerenciaCie10,
} from '../types/cie10'

/** Retardo simulado: suficiente para que se vea el estado de carga. */
const LATENCIA_MS = 320

const mockError = (status: number, code: string, message: string) => new ApiError(status, code, message, 'mock')

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Orden de llegada: `procesadoEn ASC, codigoTraductor ASC`. */
function comparar(a: SugerenciaCie10, b: SugerenciaCie10): number {
    return a.procesadoEn.localeCompare(b.procesadoEn) || a.codigoTraductor.localeCompare(b.codigoTraductor)
}

function opcion(
    codigo: string,
    codigoInternoCatalogo: string,
    nombreCatalogo: string,
    descripcionModelo = nombreCatalogo,
    razonamiento?: string,
): OpcionCie10 {
    return { codigo, descripcionModelo, codigoInternoCatalogo, nombreCatalogo, ...(razonamiento ? { razonamiento } : {}) }
}

/* ---------------------------------------------------------------------------
 * Los diez de la corrida real
 * ------------------------------------------------------------------------- */

function real(
    codigoTraductor: string,
    diagnostico: string,
    sugerencias: OpcionCie10[],
    razonamientoClinico: string,
    procesadoEn: string,
): SugerenciaCie10 {
    return {
        codigoTraductor, diagnostico, cie10Original: '-1', sugerencias, razonamientoClinico,
        error: null, modelo: 'gpt-4o-mini', procesadoEn,
    }
}

const CORRIDA_REAL: SugerenciaCie10[] = [
    real('18752', 'cambios inflamatorios rinon derecho', [
        opcion('N10', '6001', 'Nefritis tubulointersticial aguda', 'Nefritis aguda', 'Los cambios inflamatorios renales sin cronicidad descrita apuntan a una nefritis aguda.'),
        opcion('N11', '6002', 'Nefritis tubulointersticial cronica', 'Nefritis crónica', 'Considerada si la inflamación es de larga evolución; el texto no lo aclara.'),
        opcion('N12', '6007', 'Nefritis tubulointersticial, no especificada como aguda o cronica', 'Nefritis tubulointersticial', 'Opción general cuando no se puede precisar si el cuadro es agudo o crónico.'),
        opcion('N13.9', '6018', 'Uropatia obstructiva y por reflujo, sin otra especificacion', 'Enfermedad del riñón, no especificada', 'La inflamación renal puede deberse a obstrucción o reflujo; menos probable sin más datos.'),
        opcion('N14', '6019', 'Afecciones tubulares y tubulointersticiales inducidas por drogas y por metales pesados', 'Enfermedad renal secundaria a otras condiciones', 'Solo aplicaría si hubiera exposición a fármacos o metales, que el texto no menciona.'),
    ], 'Se priorizó el código de nefritis aguda (N10) debido a que los cambios inflamatorios en el riñón suelen estar asociados a esta condición. Los códigos subsiguientes reflejan otras formas de inflamación renal y condiciones relacionadas, ordenados por especificidad y relevancia clínica.', '2026-09-25T04:06:30.781Z'),
    real('19103', 'teroseccion citencidades', [
        opcion('K63.8', '4746', 'Otras enfermedades especificadas del intestino'),
        opcion('K57.9', '4703', 'Enfermedad diverticular del intestino, parte no especificada, sin perforacion ni absceso', 'Enfermedad diverticular del intestino, no especificada'),
        opcion('K52.9', '4679', 'Colitis y gastroenteritis no infecciosas, no especificadas', 'Gastroenteritis y colitis no infecciosas, no especificadas'),
        opcion('K92.9', '4884', 'Enfermedad del sistema digestivo, no especificada'),
        opcion('K31.9', '4612', 'Enfermedad del estomago y del duodeno, no especificada', 'Enfermedad del estómago y duodeno, no especificada'),
    ], "Se priorizaron códigos relacionados con enfermedades del sistema digestivo, dado que el término 'teroseccion citencidades' sugiere una posible afección intestinal o gastrointestinal, aunque el término no es claro. Se eligieron códigos que abarcan condiciones no específicas del intestino y del sistema digestivo en general.", '2026-09-25T04:06:34.031Z'),
    real('19349', 'SECUELAS NEUROLOGICAS POST CIRUGIA', [
        opcion('G93.4', '3199', 'Encefalopatia no especificada', 'Síndrome post-conmocional'),
        opcion('G80.9', '3159', 'Paralisis cerebral infantil, sin otra especificacion', 'Parálisis cerebral, no especificada'),
        opcion('G81.9', '3163', 'Hemiplejia, no especificada', 'Parálisis, no especificada'),
        opcion('F07.9', '2422', 'Trastorno organico de la personalidad y del comportamiento, no especificado, debido a enfermedad, lesion y disfuncion cerebral', 'Trastorno de la personalidad y del comportamiento, no especificado'),
    ], 'Se priorizaron códigos relacionados con secuelas neurológicas y trastornos del sistema nervioso, considerando que el diagnóstico se refiere a consecuencias post cirugía que pueden afectar la función neurológica.', '2026-09-25T04:06:36.988Z'),
    real('19997', 'LIPOTIMIA POST DONACION SANGUINEA', [
        opcion('R55', '8179', 'Sincope y colapso', 'Lipotimia'),
        opcion('T81.8', '9700', 'Otras complicaciones de procedimientos, no clasificadas en otra parte', 'Otras complicaciones postoperatorias'),
        opcion('R42', '8121', 'Mareo y desvanecimiento', 'Mareos y vértigo'),
    ], 'La lipotimia es el diagnóstico principal, por lo que se clasifica primero. Las complicaciones postoperatorias y la atención médica durante la donación son relevantes, seguidas de síntomas asociados como fatiga y mareos.', '2026-09-25T04:06:39.688Z'),
    real('20491', 'meloscopatia', [
        opcion('I50.9', '3907', 'Insuficiencia cardiaca, no especificada', 'Insuficiencia cardíaca, no especificada'),
        opcion('I51.9', '3918', 'Enfermedad cardiaca, no especificada', 'Enfermedad cardíaca, no especificada'),
        opcion('I42.9', '3860', 'Cardiomiopatia, no especificada', 'Cardiomiopatía, no especificada'),
        opcion('I25.9', '3774', 'Enfermedad isquemica cronica del corazon, no especificada', 'Enfermedad isquémica del corazón, no especificada'),
        opcion('I46.9', '3888', 'Paro cardiaco, no especificado', 'Paro cardíaco, no especificado'),
    ], 'La meloscopatia parece referirse a una condición relacionada con el corazón, por lo que se priorizan códigos que abordan insuficiencia y enfermedades cardíacas. Se seleccionan códigos que son más generales y no especificados, dado que el término no es comúnmente reconocido en la clasificación médica estándar.', '2026-09-25T04:06:43.324Z'),
    real('21379', 'POST HOMBRO', [
        opcion('M75.1', '5716', 'Sindrome del manguito rotatorio', 'Síndrome del manguito rotador'),
        opcion('M75.0', '5715', 'Capsulitis adhesiva del hombro', 'Tendinitis del manguito rotador'),
        opcion('M75.2', '5717', 'Tendinitis del biceps', 'Bursitis subacromial'),
        opcion('M75.3', '5718', 'Tendinitis calcificante del hombro', 'Lesión del manguito rotador, no especificada'),
        opcion('M19.9', '5421', 'Artrosis, no especificada'),
    ], "Se priorizaron códigos relacionados con condiciones del hombro, específicamente aquellos que afectan el manguito rotador y la bursitis, dado que 'POST HOMBRO' sugiere un problema en esta área. Se incluyeron también opciones más generales como la artrosis para cubrir posibles diagnósticos alternativos.", '2026-09-25T04:06:46.777Z'),
    real('22691', 'ESGUINCE ROTULA', [
        opcion('S83.5', '8959', 'Esguinces y torceduras que comprometen el ligamento cruzado (anterior) (posterior) de la rodilla', 'Esguince y distensión de la rodilla'),
        opcion('S83.4', '8958', 'Esguinces y torceduras que comprometen los ligamentos laterales (externo) (interno) de la rodilla', 'Específico de esguince de ligamento colateral interno de la rodilla'),
        opcion('S83.3', '8957', 'Desgarro del cartilago articular de la rodilla, presente', 'Especificado de esguince de ligamento colateral externo de la rodilla'),
        opcion('S83.2', '8956', 'Desgarro de meniscos, presente', 'Especificado de esguince de ligamento cruzado anterior de la rodilla'),
        opcion('S83.1', '8955', 'Luxacion de la rodilla', 'Especificado de esguince de ligamento cruzado posterior de la rodilla'),
    ], 'Se priorizó el código S83.5 como el más general y relevante para un esguince de rodilla, seguido de códigos más específicos que detallan esguinces de ligamentos particulares en la rodilla.', '2026-09-25T04:06:49.761Z'),
    real('22849', 'LAPARTOMIA EXPLORADORA', [
        opcion('T81.0', '9692', 'Hemorragia y hematoma que complican un procedimiento, no clasificados en otra parte', 'Complicaciones de la cirugía, no clasificadas en otra parte'),
        opcion('K66.0', '4753', 'Adherencias peritoneales', 'Hemorragia peritoneal'),
        opcion('K92.2', '4882', 'Hemorragia gastrointestinal, no especificada', 'Hemorragia gastrointestinal, no clasificada en otra parte'),
        opcion('K40.9', '4632', 'Hernia inguinal unilateral o no especificada, sin obstruccion ni gangrena', 'Hernia inguinal, no clasificada en otra parte'),
        opcion('K63.9', '4747', 'Enfermedad del intestino, no especificada', 'Enfermedad intestinal, no clasificada en otra parte'),
    ], 'La laparotomía exploradora se realiza para investigar y tratar complicaciones abdominales, por lo que se priorizan códigos relacionados con complicaciones quirúrgicas y hemorragias, que son las razones más comunes para realizar este procedimiento.', '2026-09-25T04:06:55.540Z'),
    real('23306', 'ADERENCIAS', [
        opcion('K66.0', '4753', 'Adherencias peritoneales', 'Adherencias intraabdominales'),
        opcion('K66.1', '4754', 'Hemoperitoneo', 'Adherencias en el abdomen, no especificadas'),
        opcion('K66.9', '4756', 'Trastorno del peritoneo, no especificado', 'Trastorno de la cavidad abdominal, no especificado'),
        opcion('K40.9', '4632', 'Hernia inguinal unilateral o no especificada, sin obstruccion ni gangrena', 'Hernia inguinal, no especificada'),
        opcion('K57.9', '4703', 'Enfermedad diverticular del intestino, parte no especificada, sin perforacion ni absceso', 'Enfermedad diverticular del intestino, no especificada'),
    ], 'Las sugerencias se ordenaron priorizando los códigos más específicos relacionados con adherencias, comenzando por las adherencias intraabdominales, que son las más relevantes en este contexto.', '2026-09-25T04:06:58.462Z'),
    real('24593', 'IMPETIA', [
        opcion('L01.0', '4891', 'Impetigo [cualquier sitio anatomico] [cualquier organismo]', 'Impétigo contagioso'),
        opcion('L08.9', '4922', 'Infeccion local de la piel y del tejido subcutaneo, no especificada', 'Infección de la piel, no especificada'),
        opcion('L02.9', '4900', 'Absceso cutaneo, furunculo y antrax de sitio no especificado', 'Infección cutánea, no especificada'),
        opcion('L03.9', '4907', 'Celulitis de sitio no especificado', 'Celulitis, no especificada'),
        opcion('L04.9', '4914', 'Linfadenitis aguda de sitio no especificado', 'Linfadenitis, no especificada'),
    ], "Se priorizó el código L01.0, que corresponde específicamente al impétigo, dado que es la condición más relevante y precisa relacionada con el término 'impetia'. Los códigos subsiguientes son menos específicos y se relacionan con infecciones cutáneas generales.", '2026-09-25T04:07:01.486Z'),
]

/* ---------------------------------------------------------------------------
 * Relleno generado
 * ------------------------------------------------------------------------- */

interface Plantilla {
    diagnostico: string
    sugerencias: OpcionCie10[]
    razonamientoClinico: string | null
    error?: string
}

const PLANTILLAS: Plantilla[] = [
    {
        diagnostico: 'Emb. Adolescente',
        sugerencias: [
            opcion('Z34.9', '10301', 'Supervision de embarazo normal no especificado'),
            opcion('Z35.6', '10309', 'Supervision de primigesta muy joven'),
            opcion('Z34.0', '10299', 'Supervision de primer embarazo normal'),
            opcion('O09.6', '6611', 'Supervision de embarazo en adolescente', 'Embarazo en adolescente'),
            opcion('Z33', '10298', 'Estado de embarazo, incidental'),
        ],
        razonamientoClinico: 'El texto describe un embarazo en una paciente adolescente sin complicaciones mencionadas, por lo que se priorizan los códigos de supervisión de embarazo.',
    },
    {
        diagnostico: 'FARINGOAMIGDALITIS',
        sugerencias: [
            opcion('J03.9', '4101', 'Amigdalitis aguda, no especificada'),
            opcion('J02.9', '4097', 'Faringitis aguda, no especificada'),
            opcion('J06.9', '4110', 'Infeccion aguda de las vias respiratorias superiores, no especificada'),
            opcion('J35.0', '4180', 'Amigdalitis cronica'),
        ],
        razonamientoClinico: 'La faringoamigdalitis afecta faringe y amígdalas; se priorizó la amigdalitis aguda por ser la presentación más frecuente.',
    },
    {
        diagnostico: 'dolor abd',
        sugerencias: [
            opcion('R10.4', '8098', 'Otros dolores abdominales y los no especificados'),
            opcion('R10.1', '8095', 'Dolor abdominal localizado en parte superior'),
            opcion('R10.3', '8097', 'Dolor localizado en otras partes inferiores del abdomen'),
            opcion('K59.0', '4718', 'Constipacion'),
            opcion('K30', '4600', 'Dispepsia'),
        ],
        razonamientoClinico: "La abreviatura 'abd' corresponde a abdominal; sin localización se prioriza el dolor abdominal no especificado.",
    },
    {
        diagnostico: 'HTA',
        sugerencias: [
            opcion('I10', '3700', 'Hipertension esencial (primaria)'),
            opcion('I11.9', '3702', 'Enfermedad cardiaca hipertensiva sin insuficiencia cardiaca (congestiva)'),
            opcion('I15.9', '3719', 'Hipertension secundaria, no especificada'),
        ],
        razonamientoClinico: 'HTA es la abreviatura habitual de hipertensión arterial; sin más datos se asume hipertensión esencial.',
    },
    {
        diagnostico: 'DM tipo 2 descompensada',
        sugerencias: [
            opcion('E11.9', '1950', 'Diabetes mellitus no insulinodependiente, sin mencion de complicacion'),
            opcion('E11.6', '1947', 'Diabetes mellitus no insulinodependiente, con otras complicaciones especificadas'),
            opcion('E11.8', '1948', 'Diabetes mellitus no insulinodependiente, con complicaciones no especificadas'),
            opcion('E14.9', '1970', 'Diabetes mellitus, no especificada, sin mencion de complicacion'),
            opcion('R73.9', '8160', 'Hiperglicemia, no especificada'),
        ],
        razonamientoClinico: "Se interpreta DM como diabetes mellitus tipo 2; 'descompensada' sugiere complicación, pero sin especificar cuál.",
    },
    {
        diagnostico: 'cefalea tensional',
        sugerencias: [
            opcion('G44.2', '3120', 'Cefalea debida a tension'),
            opcion('R51', '8180', 'Cefalea'),
            opcion('G43.9', '3115', 'Migraña, no especificada'),
        ],
        razonamientoClinico: 'El término corresponde directamente a la cefalea de tipo tensional.',
    },
    {
        diagnostico: 'IVU',
        sugerencias: [
            opcion('N39.0', '6090', 'Infeccion de vias urinarias, sitio no especificado'),
            opcion('N30.0', '6040', 'Cistitis aguda'),
            opcion('N30.9', '6048', 'Cistitis, no especificada'),
            opcion('N10', '6001', 'Nefritis tubulointersticial aguda'),
        ],
        razonamientoClinico: 'IVU es la abreviatura de infección de vías urinarias; sin localización se prioriza el sitio no especificado.',
    },
    {
        diagnostico: 'lumbalgia mecanica',
        sugerencias: [
            opcion('M54.5', '5890', 'Lumbago no especificado'),
            opcion('M54.4', '5889', 'Lumbago con ciatica'),
            opcion('M51.2', '5860', 'Otros desplazamientos especificados de disco intervertebral'),
            opcion('S33.5', '8700', 'Esguinces y torceduras de la columna lumbar'),
        ],
        razonamientoClinico: 'La lumbalgia mecánica corresponde a dolor lumbar sin irradiación mencionada.',
    },
    {
        diagnostico: 'x/ ilegible ##',
        sugerencias: [],
        razonamientoClinico: null,
        error: 'El modelo no pudo interpretar el texto del diagnóstico.',
    },
]

function generar(indice: number, procesadoEn: Date): SugerenciaCie10 {
    const plantilla = PLANTILLAS[indice % PLANTILLAS.length]
    return {
        codigoTraductor: String(25000 + indice),
        diagnostico: plantilla.diagnostico,
        cie10Original: '-1',
        sugerencias: plantilla.sugerencias,
        razonamientoClinico: plantilla.razonamientoClinico,
        error: plantilla.error ?? null,
        modelo: 'gpt-4o-mini',
        procesadoEn: procesadoEn.toISOString(),
    }
}

function relleno(desde: string, cantidad: number, primerIndice = 0): SugerenciaCie10[] {
    const base = new Date(desde).getTime()
    return Array.from({ length: cantidad }, (_, i) => generar(primerIndice + i, new Date(base + (i + 1) * 3000)))
}

/* ---------------------------------------------------------------------------
 * Revisión por lote
 *
 * La lista de lotes, leer un lote con filtros y paginación, aceptar una o
 * varias filas, corregir solo con el código, los conteos y el bloqueo de la
 * confirmación mientras quede algo sin revisar.
 * ------------------------------------------------------------------------- */

const LOTE_RUN_ID = 'run-2026-10-17'
const LOTE_RAG_VERSION = 'cie10-rag-2026-10-17'
const LOTE_MODELO = 'gpt-6-luna'
const CLAUSULA = {
    version: 'v1',
    text: 'Reconozco que la autocodificación fue generada con inteligencia artificial y debe ser revisada bajo mi criterio profesional.',
}
/** Lo que entra en una página de la tabla, con margen: "Aceptar seleccionadas" nunca pasa de ahí. */
const MAX_ACEPTACION_MASIVA = 50
/** El formato propuesto en el contrato: admite los de referencia externa, como `S83.004A`. */
const FORMATO_CODIGO_LOTE = /^[A-Z]\d{2}(\.[0-9A-Z]{1,4})?$/

type OpcionLoteBase = Partial<OpcionCie10> & Pick<OpcionCie10, 'codigo' | 'nombreCatalogo'>

function opcionLote(base: OpcionLoteBase): OpcionCie10 {
    return {
        descripcionModelo: base.nombreCatalogo,
        codigoInternoCatalogo: null,
        razonamiento: null,
        soporte: 'VALIDADO_INSTITUCIONAL',
        confianza: 'ALTA',
        distanciaRag: 0.1,
        informacionFaltante: [],
        ...base,
    }
}

function itemLote(
    codigoTraductor: string,
    diagnostico: string,
    sugerencias: OpcionCie10[],
    razonamientoClinico: string | null,
    procesadoEn: string,
    error: string | null = null,
): SugerenciaCie10 {
    return {
        runId: LOTE_RUN_ID, codigoTraductor, diagnostico, cie10Original: '-1', sugerencias,
        razonamientoClinico, error, modelo: LOTE_MODELO, procesadoEn, ragVersion: LOTE_RAG_VERSION,
    }
}

/** Los ejemplos y las variantes del contrato, uno por caso. */
const VARIANTES_LOTE: SugerenciaCie10[] = [
    itemLote('REG-001', 'Esguince de rodilla', [
        opcionLote({
            codigo: 'S83.9', codigoInternoCatalogo: '4812', distanciaRag: 0.08,
            descripcionModelo: 'Esguince de estructuras de la rodilla',
            nombreCatalogo: 'Esguince de otras partes y las no especificadas de la rodilla',
            razonamiento: 'El diagnóstico indica una lesión ligamentaria de rodilla sin mayor especificidad.',
            informacionFaltante: ['Ligamento afectado', 'Lateralidad'],
        }),
        opcionLote({
            codigo: 'S83.8', codigoInternoCatalogo: '4811', confianza: 'MEDIA', distanciaRag: 0.17,
            nombreCatalogo: 'Esguince de otras partes de la rodilla',
            razonamiento: 'Es una alternativa cuando se conoce que la lesión pertenece a otra estructura de la rodilla.',
            informacionFaltante: ['Estructura afectada'],
        }),
    ], 'El texto permite codificar una lesión de rodilla, pero no identifica la estructura exacta.', '2026-10-17T18:29:00.000Z'),
    itemLote('REG-002', 'Neumonía', [
        opcionLote({
            codigo: 'J18.9', codigoInternoCatalogo: '3201', distanciaRag: 0.06,
            descripcionModelo: 'Neumonía no especificada', nombreCatalogo: 'Neumonía, organismo no especificado',
            razonamiento: 'El diagnóstico no identifica un microorganismo.',
        }),
    ], null, '2026-10-17T18:29:05.000Z'),
    itemLote('REG-003', 'Luxación de rótula derecha', [
        opcionLote({
            codigo: 'S83.004A', soporte: 'REFERENCIA_EXTERNA', confianza: 'MEDIA', distanciaRag: 0.19,
            nombreCatalogo: 'Luxación no especificada de rótula derecha',
            razonamiento: 'El código está respaldado por la referencia externa.',
        }),
        opcionLote({
            codigo: 'S83.0', codigoInternoCatalogo: '4802', confianza: 'MEDIA', distanciaRag: 0.22,
            nombreCatalogo: 'Luxacion de la rotula',
            razonamiento: 'Código institucional sin lateralidad.',
        }),
    ], null, '2026-10-17T18:29:10.000Z'),
    itemLote('REG-004', 'Síndrome cromosómico a estudio', [
        opcionLote({
            codigo: 'Q99.8', soporte: 'REQUIERE_ATENCION', confianza: 'BAJA', distanciaRag: null,
            nombreCatalogo: 'Otra anomalía cromosómica especificada',
            razonamiento: 'La IA propuso el código, pero no fue respaldado por las referencias recuperadas.',
            informacionFaltante: ['Confirmación citogenética'],
        }),
    ], null, '2026-10-17T18:29:15.000Z'),
    itemLote('REG-005', 'control', [],
        'El texto no contiene información clínica suficiente para proponer una codificación.', '2026-10-17T18:29:20.000Z'),
    itemLote('REG-006', 'dx pendiente', [], null, '2026-10-17T18:29:25.000Z', 'OPENAI_RESPONSE_ERROR'),
    itemLote('REG-007', 'malestar general', [
        opcionLote({
            codigo: 'R53', codigoInternoCatalogo: '8170', confianza: 'BAJA', distanciaRag: 0.31,
            nombreCatalogo: 'Malestar y fatiga',
            razonamiento: 'El texto describe malestar sin otros datos.',
        }),
    ], null, '2026-10-17T18:29:30.000Z'),
]

const CONFIANZAS: NonNullable<OpcionCie10['confianza']>[] = ['ALTA', 'ALTA', 'MEDIA', 'ALTA', 'BAJA']

/** Los ítems de la cola de siempre, con soporte y confianza para el lote. */
function aLote(item: SugerenciaCie10, indice: number): SugerenciaCie10 {
    const confianzaPrincipal = CONFIANZAS[indice % CONFIANZAS.length]
    return {
        ...item,
        runId: LOTE_RUN_ID,
        ragVersion: LOTE_RAG_VERSION,
        modelo: LOTE_MODELO,
        sugerencias: item.sugerencias.map((opcionBase, posicion) => ({
            ...opcionBase,
            soporte: posicion === 0 && indice % 7 === 3 ? 'REFERENCIA_EXTERNA' : 'VALIDADO_INSTITUCIONAL',
            confianza: posicion === 0 ? confianzaPrincipal : posicion === 1 ? 'MEDIA' : 'BAJA',
            distanciaRag: Number((0.05 + posicion * 0.06).toFixed(2)),
            informacionFaltante: posicion === 0 && confianzaPrincipal !== 'ALTA' ? ['Localización', 'Tiempo de evolución'] : [],
        })),
    }
}

/** Códigos que el médico puede elegir aunque ningún ítem los sugiera. */
const CATALOGO_EXTRA: CatalogoCie10Item[] = [
    { codigo: 'R69', descripcion: 'Causas de morbilidad desconocidas y no especificadas', codigoInterno: '8199', enCatalogoInstitucional: true, enReferenciaExterna: true },
    { codigo: 'Z00.0', descripcion: 'Examen medico general', codigoInterno: '10001', enCatalogoInstitucional: true, enReferenciaExterna: true },
    { codigo: 'A09.0', descripcion: 'Otras gastroenteritis y colitis de origen infeccioso', codigoInterno: '102', enCatalogoInstitucional: true, enReferenciaExterna: true },
    { codigo: 'S83.6', descripcion: 'Esguince y torcedura de otras partes y las no especificadas de la rodilla', codigoInterno: '4813', enCatalogoInstitucional: true, enReferenciaExterna: true },
    { codigo: 'J15.9', descripcion: 'Neumonia bacteriana, no especificada', codigoInterno: '3190', enCatalogoInstitucional: true, enReferenciaExterna: true },
]

interface RevisionMock {
    codigo: string
    comentario: string | null
    corregido: boolean
    posicion: number | null
    sugerenciasMostradas: number | null
    updatedAt: string
}

/** Un lote del mock con todo lo que el servidor guardaría de él. */
interface LoteMock {
    runId: string
    /** `YYYY-MM`: el mes de los diagnósticos. */
    periodo: string
    finishedAt: string
    items: SugerenciaCie10[]
    revisiones: Map<string, RevisionMock>
    clausulaAceptadaEn: string | null
    confirmadoEn: string | null
}

let LOTES: LoteMock[] = []
let CATALOGO: CatalogoCie10Item[] = []

const conRunId = (runId: string) => (item: SugerenciaCie10): SugerenciaCie10 => ({ ...structuredClone(item), runId })

/**
 * Un lote ya confirmado: todo aceptado, salvo lo que no traía código, que se
 * corrigió a mano. Así se ve como se ve uno real en la pestaña de revisados.
 */
function loteConfirmado(runId: string, periodo: string, finishedAt: string, primerIndice: number, cantidad: number, confirmadoEn: string): LoteMock {
    const items = relleno(finishedAt, cantidad, primerIndice).map(aLote).map(conRunId(runId))
    const revisiones = new Map<string, RevisionMock>(items.map((item) => {
        const principal = item.sugerencias[0]
        const revision: RevisionMock = principal
            ? { codigo: principal.codigo, comentario: null, corregido: false, posicion: 1, sugerenciasMostradas: 3, updatedAt: confirmadoEn }
            : { codigo: 'R69', comentario: null, corregido: true, posicion: null, sugerenciasMostradas: 3, updatedAt: confirmadoEn }
        return [item.codigoTraductor, revision]
    }))
    return { runId, periodo, finishedAt, items, revisiones, clausulaAceptadaEn: confirmadoEn, confirmadoEn }
}

/** Vuelve al estado inicial. Lo usan las pruebas; la pantalla nunca. */
export function reiniciarLoteMock(): void {
    const ahora = new Date().toISOString()

    // El lote grande: las variantes del contrato, la corrida real y relleno.
    const principal: LoteMock = {
        runId: LOTE_RUN_ID,
        periodo: '2026-09',
        finishedAt: '2026-10-17T18:30:00.000Z',
        items: [...VARIANTES_LOTE, ...[...CORRIDA_REAL, ...relleno('2026-10-17T18:30:00.000Z', 60)].map(aLote)].map(conRunId(LOTE_RUN_ID)),
        // Una aceptada y una corregida, para que la tabla no arranque toda pendiente.
        revisiones: new Map([
            ['REG-002', { codigo: 'J18.9', comentario: null, corregido: false, posicion: 1, sugerenciasMostradas: 1, updatedAt: ahora }],
            ['REG-007', { codigo: 'R69', comentario: null, corregido: true, posicion: null, sugerenciasMostradas: 1, updatedAt: ahora }],
        ]),
        clausulaAceptadaEn: null,
        confirmadoEn: null,
    }

    // Uno chico sin tocar, para que la pestaña de pendientes tenga más de uno.
    const agosto: LoteMock = {
        runId: 'run-2026-09-16',
        periodo: '2026-08',
        finishedAt: '2026-09-16T17:05:00.000Z',
        items: relleno('2026-09-16T17:00:00.000Z', 12, 100).map(aLote).map(conRunId('run-2026-09-16')),
        revisiones: new Map(),
        clausulaAceptadaEn: null,
        confirmadoEn: null,
    }

    // Un año de meses ya confirmados (julio 2026 hacia atrás): más de una página
    // en la pestaña de revisados, para que la paginación se pueda probar.
    const revisados = Array.from({ length: 12 }, (_, i) => {
        const mes = new Date(Date.UTC(2026, 6 - i, 1))
        const periodo = `${mes.getUTCFullYear()}-${String(mes.getUTCMonth() + 1).padStart(2, '0')}`
        // Se procesa a mediados del mes siguiente y se confirma una semana después.
        const procesado = new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + 1, 14, 16, 40))
        const confirmado = new Date(procesado.getTime() + 6 * 86_400_000)
        const runId = `run-${procesado.toISOString().slice(0, 10)}`
        return loteConfirmado(runId, periodo, procesado.toISOString(), 200 + i * 30, 8 + (i * 5) % 14, confirmado.toISOString())
    })

    LOTES = [principal, agosto, ...revisados]

    const porCodigo = new Map<string, CatalogoCie10Item>()
    for (const sugerida of LOTES.flatMap((l) => l.items).flatMap((i) => i.sugerencias)) {
        porCodigo.set(sugerida.codigo, {
            codigo: sugerida.codigo,
            descripcion: sugerida.nombreCatalogo,
            codigoInterno: sugerida.codigoInternoCatalogo,
            enCatalogoInstitucional: sugerida.soporte === 'VALIDADO_INSTITUCIONAL',
            enReferenciaExterna: sugerida.soporte !== 'REQUIERE_ATENCION',
        })
    }
    for (const extra of CATALOGO_EXTRA) porCodigo.set(extra.codigo, extra)
    // Lo que la IA propuso sin respaldo no está en el catálogo: no se puede elegir a mano.
    CATALOGO = [...porCodigo.values()].filter((c) => c.enCatalogoInstitucional || c.enReferenciaExterna)
}

reiniciarLoteMock()

const sinAcentos = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Filtros de `GET /lotes/:runId`: confianza de la principal y texto en la descripción. */
function cumpleFiltros(item: SugerenciaCie10, { confianza, q }: FiltrosLoteCie10): boolean {
    if (confianza && item.sugerencias[0]?.confianza !== confianza) return false
    const termino = sinAcentos(q?.trim() ?? '')
    return !termino || sinAcentos(item.diagnostico).includes(termino)
}

/** El orden del servidor: lo que pide más atención, arriba. */
function prioridad(item: SugerenciaCie10): number {
    const principal = item.sugerencias[0]
    if (item.error || !principal) return 0
    if (principal.soporte === 'REQUIERE_ATENCION') return 1
    if (principal.confianza === 'BAJA') return 2
    if (principal.confianza === 'MEDIA') return 3
    return 4
}

function aItemLote(lote: LoteMock, item: SugerenciaCie10): ItemLoteCie10 {
    const principal = item.sugerencias[0] ?? null
    const revision = lote.revisiones.get(item.codigoTraductor)
    const corrected = revision?.corregido ?? false
    return {
        ...item,
        principal,
        status: lote.confirmadoEn
            ? 'CONFIRMADO'
            : corrected ? 'CORREGIDO_POR_MEDICO' : principal ? 'AUTOCODIFICADO' : 'REQUIERE_ATENCION',
        finalCode: revision?.codigo ?? principal?.codigo ?? '',
        corrected,
        correctionComment: revision?.comentario ?? null,
        reviewed: revision !== undefined,
    }
}

function buscarLote(runId: string): LoteMock {
    const lote = LOTES.find((l) => l.runId === runId)
    if (!lote) throw mockError(404, 'CIE10_BATCH_NOT_FOUND', 'El lote no existe.')
    return lote
}

/** El lote abierto a cambios y el ítem dentro de él. */
function buscarEnLote(runId: string, codigoTraductor: string): { lote: LoteMock; item: SugerenciaCie10 } {
    const lote = buscarLote(runId)
    if (lote.confirmadoEn) throw mockError(409, 'CIE10_BATCH_ALREADY_CONFIRMED', 'El lote ya fue confirmado.')
    const item = lote.items.find((i) => i.codigoTraductor === codigoTraductor)
    if (!item) throw mockError(404, 'CIE10_NOT_FOUND', 'El registro no pertenece a este lote.')
    return { lote, item }
}

const sinRevisar = (lote: LoteMock) => lote.items.filter((i) => !lote.revisiones.has(i.codigoTraductor)).length

const estadoDe = (lote: LoteMock): EstadoLoteCie10 => (lote.confirmadoEn ? 'CONFIRMADO' : 'PENDIENTE_REVISION')

function aResumen(lote: LoteMock): ResumenLoteCie10 {
    return {
        runId: lote.runId,
        periodo: lote.periodo,
        status: estadoDe(lote),
        finishedAt: lote.finishedAt,
        total: lote.items.length,
        pendientes: sinRevisar(lote),
        confirmedAt: lote.confirmadoEn,
    }
}

/** `GET /lotes?estado=`: los más recientes primero. */
export async function listarLotesMock(filtro: FiltroLotesCie10, page: number, pageSize: number): Promise<PaginaLotesCie10> {
    await delay(LATENCIA_MS)

    const revisado = (lote: LoteMock) => lote.confirmadoEn !== null
    const filtrados = LOTES
        .filter((lote) => (filtro === 'REVISADOS') === revisado(lote))
        .sort((a, b) => b.periodo.localeCompare(a.periodo))
    const inicio = (page - 1) * pageSize

    return structuredClone({
        items: filtrados.slice(inicio, inicio + pageSize).map(aResumen),
        total: filtrados.length,
        page,
        pageSize,
        counts: {
            pendientes: LOTES.filter((l) => !revisado(l)).length,
            revisados: LOTES.filter(revisado).length,
        },
    })
}

/** `GET /lotes/:runId`: un lote con sus ítems, filtrados y paginados. */
export async function obtenerLoteMock(runId: string, page: number, pageSize: number, filtros: FiltrosLoteCie10 = {}): Promise<LoteCie10> {
    await delay(LATENCIA_MS)

    const lote = buscarLote(runId)
    const filtrados = lote.items
        .filter((item) => cumpleFiltros(item, filtros))
        .sort((a, b) => prioridad(a) - prioridad(b) || comparar(a, b))
    const inicio = (page - 1) * pageSize
    const confirmado = lote.confirmadoEn !== null

    const respuesta: LoteCie10 = {
        runId: lote.runId,
        periodo: lote.periodo,
        status: estadoDe(lote),
        ragVersion: LOTE_RAG_VERSION,
        model: LOTE_MODELO,
        finishedAt: lote.finishedAt,
        clause: CLAUSULA,
        clauseAccepted: lote.clausulaAceptadaEn !== null,
        clauseAcceptedAt: lote.clausulaAceptadaEn,
        confirmed: confirmado,
        confirmedAt: lote.confirmadoEn,
        items: filtrados.slice(inicio, inicio + pageSize).map((item) => aItemLote(lote, item)),
        total: filtrados.length,
        page,
        pageSize,
        counts: { pendientes: sinRevisar(lote) },
    }
    return structuredClone(respuesta)
}

/** Lanza el error del servidor si la aceptación no calza con el ítem. */
function validarAceptacion(item: SugerenciaCie10, payload: AceptacionLotePayload): OpcionCie10 {
    const elegida = item.sugerencias[payload.posicion - 1]
    if (!elegida || elegida.codigo !== payload.codigo) {
        throw mockError(400, 'SUGERENCIA_INVALIDA', 'El código aceptado no está en esa posición de las sugerencias.')
    }
    if (payload.sugerenciasMostradas < payload.posicion) {
        throw mockError(400, 'SUGERENCIAS_MOSTRADAS_INVALIDAS', 'La sugerencia aceptada no estaba entre las mostradas.')
    }
    return elegida
}

function guardarAceptacion(lote: LoteMock, codigoTraductor: string, payload: AceptacionLotePayload, updatedAt: string): RevisionItemLote {
    lote.revisiones.set(codigoTraductor, {
        codigo: payload.codigo, comentario: null, corregido: false,
        posicion: payload.posicion, sugerenciasMostradas: payload.sugerenciasMostradas, updatedAt,
    })
    return { codigoTraductor, codigoFinal: payload.codigo, comentario: null, corrected: false, updatedAt }
}

/**
 * `POST /lotes/:runId/items/aceptar`: varias filas en una llamada. Todo o nada,
 * como una transacción: si una no calza, no se guarda ninguna.
 */
export async function aceptarItemsLoteMock(runId: string, items: AceptacionMasivaItem[]): Promise<{ aceptados: RevisionItemLote[] }> {
    await delay(LATENCIA_MS)

    if (items.length === 0 || items.length > MAX_ACEPTACION_MASIVA) {
        throw mockError(400, 'ACEPTACION_MASIVA_INVALIDA', `Se aceptan de 1 a ${MAX_ACEPTACION_MASIVA} registros por llamada.`)
    }
    const lote = buscarLote(runId)
    if (lote.confirmadoEn) throw mockError(409, 'CIE10_BATCH_ALREADY_CONFIRMED', 'El lote ya fue confirmado.')

    // Primero se valida todo; solo entonces se escribe.
    for (const fila of items) {
        const { item } = buscarEnLote(runId, fila.codigoTraductor)
        if (lote.revisiones.get(fila.codigoTraductor)?.corregido) {
            throw mockError(409, 'CIE10_YA_CORREGIDO', 'Un registro ya tiene una corrección médica: acéptelo uno por uno.')
        }
        validarAceptacion(item, fila)
    }
    const updatedAt = new Date().toISOString()
    return { aceptados: items.map(({ codigoTraductor, ...payload }) => guardarAceptacion(lote, codigoTraductor, payload, updatedAt)) }
}

export async function aceptarItemLoteMock(
    runId: string,
    codigoTraductor: string,
    payload: AceptacionLotePayload,
): Promise<RevisionItemLote> {
    await delay(LATENCIA_MS)

    const { lote, item } = buscarEnLote(runId, codigoTraductor)
    validarAceptacion(item, payload)
    return guardarAceptacion(lote, codigoTraductor, payload, new Date().toISOString())
}

export async function guardarCorreccionLoteMock(
    runId: string,
    codigoTraductor: string,
    payload: CorreccionLotePayload,
): Promise<RevisionItemLote> {
    await delay(LATENCIA_MS)

    const { lote } = buscarEnLote(runId, codigoTraductor)
    const codigo = payload.codigo.trim().toUpperCase()
    if (!FORMATO_CODIGO_LOTE.test(codigo)) {
        throw mockError(400, 'FORMATO_CIE10', 'El código no tiene formato CIE-10.')
    }
    // Fuera del catálogo solo pasa si el médico lo eligió a propósito.
    if (!payload.fueraDeCatalogo && !CATALOGO.some((c) => c.codigo === codigo)) {
        throw mockError(400, 'CIE10_FUERA_DE_CATALOGO', 'El código no está en el catálogo CIE-10 vigente.')
    }
    // Propuesto: la corrección del lote es solo el código, sin justificación.
    const comentario = null

    const updatedAt = new Date().toISOString()
    lote.revisiones.set(codigoTraductor, {
        codigo, comentario, corregido: true, posicion: null,
        sugerenciasMostradas: payload.sugerenciasMostradas ?? null, updatedAt,
    })
    return { codigoTraductor, codigoFinal: codigo, comentario, corrected: true, updatedAt }
}

export async function buscarCatalogoCie10Mock(q: string): Promise<CatalogoCie10Item[]> {
    await delay(LATENCIA_MS / 2)

    const termino = sinAcentos(q.trim())
    if (termino.length < 2) return []
    const porCodigo = (c: CatalogoCie10Item) => sinAcentos(c.codigo).startsWith(termino)

    return structuredClone(
        CATALOGO
            .filter((c) => porCodigo(c) || sinAcentos(c.descripcion).includes(termino))
            .sort((a, b) => Number(porCodigo(b)) - Number(porCodigo(a))
                || Number(b.enCatalogoInstitucional) - Number(a.enCatalogoInstitucional)
                || a.codigo.localeCompare(b.codigo))
            .slice(0, 12),
    )
}

export async function aceptarClausulaLoteMock(runId: string, clauseVersion: string): Promise<void> {
    await delay(LATENCIA_MS)

    const lote = buscarLote(runId)
    if (clauseVersion !== CLAUSULA.version) throw mockError(409, 'CIE10_CLAUSE_OUTDATED', 'La cláusula cambió; vuelva a leerla.')
    if (lote.confirmadoEn) throw mockError(409, 'CIE10_BATCH_ALREADY_CONFIRMED', 'El lote ya fue confirmado o no existe.')
    lote.clausulaAceptadaEn = new Date().toISOString()
}

export async function confirmarLoteMock(runId: string): Promise<ConfirmacionLoteCie10> {
    await delay(LATENCIA_MS)

    const lote = buscarLote(runId)
    if (!lote.clausulaAceptadaEn) throw mockError(409, 'CIE10_CLAUSE_REQUIRED', 'Debe aceptar la cláusula vigente antes de confirmar.')
    if (lote.confirmadoEn) throw mockError(409, 'CIE10_BATCH_ALREADY_CONFIRMED', 'El lote ya fue confirmado.')
    const pendientes = sinRevisar(lote)
    if (pendientes > 0) {
        throw mockError(422, 'CIE10_BATCH_INCOMPLETE', `${pendientes} registros sin aceptar ni corregir.`)
    }

    lote.confirmadoEn = new Date().toISOString()
    return { runId, confirmed: true, total: lote.items.length }
}
