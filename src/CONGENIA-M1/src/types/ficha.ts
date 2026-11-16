/**
 * @fileoverview Tipos de la ficha clínica.
 *
 * Secciones OBLIGATORIAS:
 *  - DatosConsulta
 *  - OtrosDemograficos
 *  - Consentimiento (con firma y declaraciones)
 *
 * Secciones OPCIONALES:
 *  - SignosAlerta (fotos con nombre obligatorio)
 *  - ExamenesSugeridos (fotos con nombre obligatorio)
 *
 * @compliance HIPAA 164.312 - mínimo dato necesario
 * @compliance HL7 FHIR R4 - mapeable a Observation y Condition
 */

// Datos de la Consulta 

export type ReferidoDe =
  | 'primer_nivel_salud'
  | 'comadrona'
  | 'medico_privado'
  | 'otro'

export type LugardeParto =
  | 'comadrona'
  | 'primer_nivel'
  | 'segundo_nivel'
  | 'hospital_local'
  | 'otro'

/**
 * Mapeado desde Consulta_DiagnosticoCongenia del contrato SADC.
 */
export interface DiagnosticoConsulta {
    id: number
    nombre: string
}

/**
 * Combina datos del contrato SADC + campos del médico.
 */
export interface DatosConsulta {
    // viene del SADC
    fechaConsulta: string
    // viene del SADC
    idConsulta: number
    // viene del SADC
    especialidad: string
    // viene del SADC
    diagnosticos: DiagnosticoConsulta[]
    // llena el médico
    referidoDe: ReferidoDe | null
    // llena el médico 
    lugarDeParto: LugardeParto | null
    // llena el médico - id del catálogo /v1/Sexos
    sexo: string | null
}

// Otros Demográficos 

export type FamiliarAfectado =
  // Núcleo familiar directo
  | 'madre'
  | 'padre'
  | 'hermano'
  | 'hermana'
  // Lado materno
  | 'abuela_materna'
  | 'abuelo_materno'
  | 'tia_materna'
  | 'tio_materno'
  | 'prima_materna'
  | 'primo_materno'
  // Lado paterno
  | 'abuela_paterna'
  | 'abuelo_paterno'
  | 'tia_paterna'
  | 'tio_paterno'
  | 'prima_paterna'
  | 'primo_paterno'
  // Otros
  | 'otro_familiar'
  | 'desconoce'

export type RespuestaTernaria = 0 | 1 | 2

export interface OtrosDemograficos {
    familiaresAfectados: RespuestaTernaria
    menoresEnHogar: number
    adultosEnHogar: number
    quienAfectado: FamiliarAfectado[]
    afectadosComunidad: RespuestaTernaria
}

// Signos de Alerta

export type RegionAnatomica =
  | 'cabeza_cuello'
  | 'tronco'
  | 'extremidades_superiores'
  | 'extremidades_inferiores'
  | 'genitales_perine'
  | 'general_otro'

export type Lateralidad =
  | 'izquierda'
  | 'derecha'
  | 'bilateral'

/**
 * Localización anatómica jerárquica: región → parte → lateralidad opcional.
 * La lateralidad solo aplica a partes pares del cuerpo.
 */
export interface ParteSeleccionada {
    regionValue: RegionAnatomica
    parteValue: string
    lateralidad?: Lateralidad
}

/**
 * Un signo de alerta individual.
 * La foto es OBLIGATORIA.
 */
export interface SignoAlerta {
    id: string
    nombre: string
    parteDelCuerpo: ParteSeleccionada
    nombreArchivo: string
    imagenBase64: string
}

// Estudios de Gabinete Indicados 

/**
 * Un examen indicado por el médico.
 * La imagen de referencia siempre debe tener nombre si se agrega.
 */
export interface EstudiosIndicados {
    id: string
    nombre: string
    nombreArchivo?: string
    imagenBase64?: string
}

// Observaciones

/**
 * Texto libre del medico. Puede haber varias, y en una adenda solo se agregan.
 */
export interface Observacion {
    id: string
    texto: string
}

// Consentimiento

export type RelacionFirmante =
  | 'padre'
  | 'madre'
  | 'tutor_legal'

/**
 * Declaraciones individuales del consentimiento informado.
 * Cada una tiene su propio checkbox en la UI.
 */
export interface DeclaracionConsentimiento {
    id: string
    titulo: string
    descripcion: string
    obligatoria: boolean
    aceptada: boolean
}

/**
 * Datos del firmante 
 */
export interface DatosFirmante {
    nombreCompleto: string
    relacion: RelacionFirmante
}

// Consentimiento Informado

export interface Consentimiento {
    // Lista de declaraciones con su estado de aceptación 
    declaraciones: DeclaracionConsentimiento[]
    // Datos del representante legal que firma 
    firmante: DatosFirmante | null
    // Firma digital en base64 - OBLIGATORIA si se completó el consentimiento
    firmaBase64: string | null
    completado: boolean
    fechaFirma?: string  // ISO 8601
    codigoDocumento?: string
}

// Ficha completa 

/**
 * Estado de completado por sección.
 */
export interface ProgresoFicha {
    datosConsulta: boolean
    otrosDemograficos: boolean
    consentimiento: boolean
}

/**
 * La ficha clínica completa.
 * Este objeto completo es lo que se cifra con crypto.ts al guardar como borrador en localStorage.
 */
export interface FichaClinica {
    idConsulta: number
    idTenant: number
    estado: 'borrador' | 'finalizado'
    progreso: ProgresoFicha
    ultimaModificacion: string

    // Sección 1 - OBLIGATORIA 
    datosConsulta: DatosConsulta
    // Sección 2 - OBLIGATORIA 
    otrosDemograficos: OtrosDemograficos
    // Sección 3 
    signosAlerta: SignoAlerta[]
    // Sección 4 
    examenesSugeridos: EstudiosIndicados[]
    // Opcional
    observaciones: Observacion[]
    //  Sección 5 - OBLIGATORIA 
    consentimiento: Consentimiento
}