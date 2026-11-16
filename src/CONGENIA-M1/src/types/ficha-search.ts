/**
 * @fileoverview Tipos de búsqueda y lectura de fichas ya registradas.
 *
 * Son el modelo de LECTURA del dashboard, deliberadamente distinto del modelo de
 * captura de `types/ficha.ts`. Dos diferencias que justifican el archivo aparte:
 *
 *   1. Las imágenes viajan como URL prefirmada del bucket (`imagenUrl`), no como
 *      base64. En captura el base64 existe porque la foto se acaba de tomar y
 *      todavía no se sube; al leer una ficha guardada el binario vive en
 *      SeaweedFS y lo que llega es un enlace temporal.
 *   2. No hay consentimiento ni firma. El visor del genetista no los muestra, y
 *      lo que no se muestra no se pide: la firma es PHI pesada sin consumidor en
 *      este flujo.
 *
 * @compliance HIPAA 164.502(b) - mínimo dato necesario
 */

import type {
    FamiliarAfectado,
    ParteSeleccionada,
    RespuestaTernaria,
} from './ficha'

// Búsqueda

/**
 * Lo que pinta una card del listado. Solo los cuatro campos visibles más el id
 * con el que se abre el detalle: el listado nunca necesita la ficha completa.
 */
export interface FichaResumen {
    fichaId: string
    nombrePaciente: string
    /** ISO `YYYY-MM-DD`. */
    fechaConsulta: string
    historiaClinica: string
    idTenant: number
}

export interface FichaSearchParams {
    /** Texto libre: nombre del paciente o número de historia clínica. */
    q?: string
    /** ISO `YYYY-MM-DD`, inclusivo. */
    desde?: string
    /** ISO `YYYY-MM-DD`, inclusivo. */
    hasta?: string
    /** 1-based. */
    page?: number
    pageSize?: number
}

export interface FichaSearchResult {
    items: FichaResumen[]
    total: number
    page: number
    pageSize: number
}

// Detalle

/**
 * Valor de catálogo ya resuelto por el backend.
 *
 * El `value` es el código que guarda la base; el `label` es lo que lee el médico.
 * Que vengan juntos le ahorra al visor cargar los catálogos completos solo para
 * traducir dos campos.
 */
export interface OpcionSeleccionada {
    value: string
    label: string
}

export interface SignoAlertaDetalle {
    id: string
    nombre: string
    parteDelCuerpo: ParteSeleccionada
    /**
     * Localización ya legible, p. ej. `"Mano (Izq.)"`.
     *
     * La arma el backend por la misma razón que `referidoDe` trae `label`:
     * traducir los códigos de `parteDelCuerpo` obligaría al visor a cargar el
     * catálogo anatómico entero para pintar dos palabras.
     */
    parteDelCuerpoLabel?: string
    /** URL prefirmada del bucket. Ausente si la imagen ya no se pudo resolver. */
    imagenUrl?: string
}

export interface EstudioIndicadoDetalle {
    id: string
    nombre: string
    /** URL prefirmada del bucket. Los exámenes pueden no llevar adjunto. */
    imagenUrl?: string
    nombreArchivo?: string
}

export interface ObservacionDetalle {
    id: string
    texto: string
    /** Ya formateada para mostrar, como `fechaConsulta`. */
    fecha?: string
}

export interface DatosConsultaDetalle {
    /** Ya formateada para mostrar; el visor no reformatea. */
    fechaConsulta: string
    medicoConsulta: string
    especialidad: string
    /** Texto libre del SADC, tal como se registró. */
    diagnosticos: string
    referidoDe: OpcionSeleccionada | null
    lugarDeParto: OpcionSeleccionada | null
    /** Ausente mientras el servidor no lo exponga (PENDIENTES-BACKEND.md, seccion 15). */
    sexo?: OpcionSeleccionada | null
}

export interface OtrosDemograficosDetalle {
    familiaresAfectados: RespuestaTernaria | null
    menoresEnHogar: number
    adultosEnHogar: number
    quienAfectado: FamiliarAfectado[]
    afectadosComunidad: RespuestaTernaria | null
}

/**
 * Una ficha completa en modo lectura.
 *
 * Sin `consentimiento`: ver la nota de cabecera.
 */
export interface FichaDetalle {
    fichaId: string
    nombrePaciente: string
    historiaClinica: string
    idTenant: number
    datosConsulta: DatosConsultaDetalle
    otrosDemograficos: OtrosDemograficosDetalle
    signosAlerta: SignoAlertaDetalle[]
    examenesSugeridos: EstudioIndicadoDetalle[]
    /** Ausente mientras el servidor no lo exponga (PENDIENTES-BACKEND.md, seccion 16). */
    observaciones?: ObservacionDetalle[]
}
