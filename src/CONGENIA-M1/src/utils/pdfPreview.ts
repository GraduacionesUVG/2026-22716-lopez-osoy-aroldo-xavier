/**
 * @fileoverview Miniatura de la primera página de un PDF.
 *
 * El formulario de Estudios de Gabinete acepta imágenes y PDFs. Las imágenes se
 * previsualizan con un FileReader, pero un PDF necesita interpretarse, así que
 * se rasteriza su primera página con pdf.js y se devuelve como data URL: así el
 * usuario ve lo mismo que vería con una imagen y confirma que subió el archivo
 * correcto.
 *
 * Por qué canvas y no <object>/<iframe>: el CSP de producción (nginx.conf) trae
 * `object-src 'none'` y no declara `frame-src`, de modo que un visor nativo
 * apuntando a un blob: queda bloqueado al desplegar. Un canvas no pasa por esas
 * directivas y `img-src` ya admite `data:`.
 *
 * @compliance ISO 27001 A.14.2 - el PDF se procesa en el navegador; el archivo
 *             no sale del dispositivo para generar la vista previa.
 */

// Solo la URL del worker, no el worker: es una cadena y no arrastra pdf.js al
// bundle inicial. La librería entra por import() dinámico, en su propio chunk.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

type PdfjsModule = typeof import('pdfjs-dist')

let pdfjsPromise: Promise<PdfjsModule> | null = null

/** Carga pdf.js una sola vez y deja el worker apuntado a nuestro asset servido en el mismo origen. */
function loadPdfjs(): Promise<PdfjsModule> {
    pdfjsPromise ??= import('pdfjs-dist').then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
        return pdfjs
    })
    return pdfjsPromise
}

/**
 * Rasteriza la primera página de un PDF y la devuelve como data URL PNG.
 *
 * @param file     - PDF elegido por el usuario. Ya debe venir validado por `validateUploadFile`.
 * @param maxWidth - Ancho máximo de la miniatura en píxeles CSS.
 * @throws Si el archivo no es un PDF legible (corrupto, cifrado o sin páginas).
 */
export async function renderPdfFirstPage(file: File, maxWidth = 640): Promise<string> {
    const pdfjs = await loadPdfjs()
    const data = await file.arrayBuffer()

    const loadingTask = pdfjs.getDocument({
        data,
        // El CSP de producción es `script-src 'self'`, sin 'wasm-unsafe-eval'. El
        // wasm de pdf.js solo acelera JBIG2/JPEG2000, que no hacen falta para una
        // miniatura, así que se apaga y se evita la violación de CSP.
        useWasm: false,
        // Las fuentes base-14 no incrustadas caen a una fuente del sistema, en vez
        // de exigir que sirvamos el paquete standard_fonts de pdf.js.
        useSystemFonts: true,
    })

    const pdf = await loadingTask.promise
    try {
        if (pdf.numPages < 1) {
            throw new Error('El PDF no tiene páginas')
        }
        const page = await pdf.getPage(1)
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: Math.min(maxWidth / base.width, 2) })

        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const context = canvas.getContext('2d')
        if (!context) {
            throw new Error('El navegador no permitió dibujar la vista previa')
        }
        // Fondo blanco: un PDF sin fondo propio saldría transparente y el PNG se
        // vería negro sobre superficies oscuras.
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, canvas.width, canvas.height)

        await page.render({ canvas, viewport }).promise
        return canvas.toDataURL('image/png')
    } finally {
        // En pdf.js 6 el ciclo de vida del worker cuelga del loading task, no del
        // documento. Sin esto queda un worker vivo por cada PDF que el usuario
        // abra y descarte.
        void loadingTask.destroy()
    }
}
