/**
 * @fileoverview Versiones de una ficha, para el selector del visor.
 *
 * Cada adenda aprobada crea una fila nueva con su propio `fichaId`; lo que las
 * hermana es `fichaRaizId`. El backend no expone "las versiones de esta ficha":
 * `listFichasPaciente` devuelve TODAS las del paciente, de todos los linajes, así
 * que el recorte se hace aquí.
 *
 * La lógica vive aparte del componente porque es lo único de esta pantalla que
 * se puede probar sin montar nada.
 */

import type { FichaSummary } from '../../../services/ficha.service'

/** Un borrador abandonado no es una versión de la ficha. Mismo criterio que `App.tsx`. */
const ESTADO_BORRADOR = 'BORRADOR'

/** Revisión que aún espera resolución del genetista. */
const ESTADO_PENDIENTE = 'PENDIENTE'

/**
 * Las versiones que pertenecen al mismo linaje que `fichaId`, de la más antigua
 * a la más reciente.
 *
 * El linaje se deduce de la propia lista: `FichaDetalle` -el modelo de lectura
 * del dashboard- no trae `fichaRaizId`, así que se localiza la ficha abierta
 * entre los resultados y se toma el suyo.
 *
 * Devuelve `[]` si la ficha abierta no aparece en la lista. Sin saber a qué
 * linaje pertenece, cualquier recorte sería adivinado, y un selector que ofrece
 * versiones de otra consulta es peor que no tener selector.
 */
export function versionesDelLinaje(fichas: FichaSummary[], fichaId: string): FichaSummary[] {
    const actual = fichas.find((ficha) => ficha.fichaId === fichaId)
    if (!actual) return []

    return fichas
        .filter((ficha) =>
            ficha.fichaRaizId === actual.fichaRaizId &&
            // La que se está viendo nunca se descarta: si se filtrara, el select
            // quedaría con un valor que no está entre sus opciones y se pintaría
            // en blanco.
            (ficha.fichaId === fichaId || estadoDe(ficha) !== ESTADO_BORRADOR),
        )
        .sort((a, b) => a.revision - b.revision)
}

/**
 * El estado vigente del registro.
 *
 * `estado` es el campo antiguo y `estadoFicha` el que manda; se leen los dos en
 * ese orden por la misma razón que en `App.tsx`: hay respuestas que todavía solo
 * traen uno.
 */
function estadoDe(ficha: FichaSummary): string {
    return ficha.estadoFicha ?? ficha.estado
}

/**
 * `20 ago 2026`. Se piden los campos sueltos en vez de `dateStyle: 'medium'`
 * porque en `es-GT` ese estilo sale numérico (`20/08/2026`) y en una lista de
 * versiones el mes en letra se lee de un vistazo.
 */
const FECHA_CORTA = new Intl.DateTimeFormat('es-GT', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
})

/**
 * Fecha en que se creó la revisión, ya legible.
 *
 * Vacía si el servidor todavía no manda `fechaCreacion` -ver
 * `PENDIENTES-BACKEND.md`- o si lo que manda no es una fecha. Repetir
 * `fechaConsulta` como sustituto no serviría: es la misma en todas las
 * revisiones del linaje, así que no distinguiría una versión de otra.
 */
function fechaLegible(iso: string | undefined): string {
    if (!iso) return ''

    const fecha = new Date(iso)
    return Number.isNaN(fecha.getTime()) ? '' : FECHA_CORTA.format(fecha)
}

/**
 * Etiqueta de una versión en el selector, p. ej. `"Versión 03 (actual) - 20 ago 2026"`.
 *
 * La vigente se marca porque es la que cuenta como la ficha del paciente, y la
 * pendiente porque todavía no lo es: sigue en la bandeja del genetista y
 * presentarla como una versión más sin avisar sería engañoso.
 */
export function etiquetaVersion(ficha: FichaSummary): string {
    const numero = `Versión ${String(ficha.revision).padStart(2, '0')}`

    const marca = ficha.esVigente
        ? ' (actual)'
        : estadoDe(ficha) === ESTADO_PENDIENTE ? ' (pendiente)' : ''

    const fecha = fechaLegible(ficha.fechaCreacion)

    return `${numero}${marca}${fecha ? ` - ${fecha}` : ''}`
}
