/**
 * @fileoverview Textos de aviso compartidos entre secciones de la ficha.
 *
 * "Datos de la Consulta" y "Otros Demograficos" quedan congeladas al finalizar el
 * registro: el orquestador les pasa readOnly={fixedSections} y el flujo de adendas
 * solo admite altas en Signos de Alerta y Estudios de Gabinete. El aviso vive aqui
 * para que ambas digan exactamente lo mismo y no se desincronicen al editar una.
 */

export const AVISO_SECCION_IRREVERSIBLE =
    'Al enviar el registro, esta sección quedará fija: no se podrá modificar mediante una adenda.'

/**
 * Precaucion antes de fotografiar a un menor, en el paso de captura de Signos de Alerta.
 *
 * No dice "evita el rostro" a proposito: el consentimiento pide expresamente
 * fotografias del rostro, porque algunas enfermedades geneticas se reconocen por
 * rasgos faciales (InformedConsentContent.ts, seccion 2). El aviso se limita a lo
 * que el medico decide al encuadrar.
 *
 * Complementa, no sustituye, la barrera que ya existe: el orquestador mantiene la
 * seccion deshabilitada hasta que el representante legal firma.
 *
 * @compliance HIPAA 164.502(b) - minimo dato necesario
 */
export const AVISO_IMAGEN_MENOR =
    'Imagen clínica de un menor. Capture solo lo clínicamente necesario y cuide que no aparezcan'
    + ' terceros ni datos identificables ajenos al hallazgo, conforme al consentimiento informado.'
