/**
 * @fileoverview Peso de un archivo en texto legible para el usuario.
 *
 * Se usa tanto en el mensaje de error de carga como en la tarjeta del archivo
 * elegido, para que el usuario compare el peso real contra el limite sin tener
 * que traducir bytes.
 */

const KB = 1024
const MB = 1024 * 1024

/**
 * Formatea bytes con divisores binarios y etiquetas coloquiales (KB / MB),
 * que es como las lee un medico. El limite de subida se expresa en la misma
 * escala, asi que "10.4 MB" contra "10 MB" se compara de un vistazo.
 */
export function formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
    if (bytes < KB) return `${Math.round(bytes)} B`
    if (bytes < MB) return `${Math.round(bytes / KB)} KB`
    return `${(bytes / MB).toFixed(1)} MB`
}
