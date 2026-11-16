/**
 * @fileoverview Anclas en el DOM de las secciones de la ficha.
 *
 * El pie del formulario salta a la primera seccion incompleta cuando el medico
 * intenta finalizar. Hace falta un id estable para `getElementById`, y tenerlo en
 * un solo sitio es lo que evita que un renombre deje el salto apuntando a la nada
 * sin que nada falle al compilar.
 *
 * Es el mismo criterio que `fichaItemAnchorId` en ui/MediaCard/anchor.ts, pero a
 * nivel de seccion en vez de a nivel de item.
 */

/** Claves de las secciones plegables de la ficha. */
export type SectionKey = 'appointment' | 'demographic' | 'alerts' | 'exams' | 'observations' | 'consent'

export const fichaSectionAnchorId = (key: SectionKey) => `ficha-seccion-${key}`

/** Nombre visible de cada seccion, tal como lo lee el medico en su cabecera. */
export const SECTION_LABELS: Record<SectionKey, string> = {
    appointment: 'Datos de la Consulta',
    demographic: 'Otros Demográficos',
    alerts:      'Signos de Alerta',
    exams:       'Estudios de Gabinete',
    observations: 'Observaciones',
    consent:     'Consentimiento',
}
