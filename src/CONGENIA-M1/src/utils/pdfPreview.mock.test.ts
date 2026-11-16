/**
 * @fileoverview Comprueba que el PDF de prueba es realmente un PDF.
 *
 * El fixture se arma a mano y su tabla xref apunta por desplazamiento de bytes:
 * cambiar una linea del generador sin recalcular esos numeros produce un archivo
 * que pdf.js abre en modo recuperacion o directamente rechaza, y las historias
 * que dependen de el fallarian por un motivo que no tiene que ver con el
 * componente. Esta prueba lo detecta aqui.
 *
 * Usa el build legacy porque corre en Node: solo se abre el documento y se lee
 * su texto, sin rasterizar, asi que no hace falta un canvas.
 */

import { describe, expect, it } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { crearArchivoPdfDePrueba, crearPdfDePrueba } from './pdfPreview.mock'

async function abrir(texto: string) {
    return getDocument({
        data: new TextEncoder().encode(texto),
        useWasm: false,
        useSystemFonts: false,
    }).promise
}

describe('crearPdfDePrueba', () => {
    it('produce un PDF de una pagina que pdf.js abre sin recuperar la xref', async () => {
        const pdf = await abrir(crearPdfDePrueba())
        expect(pdf.numPages).toBe(1)

        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 1 })
        expect(viewport.width).toBe(420)
        expect(viewport.height).toBe(300)

        await pdf.cleanup()
    })

    it('conserva el texto que se le pide dibujar', async () => {
        const pdf = await abrir(crearPdfDePrueba(['Estudio de gabinete', 'Resultado normal']))
        const page = await pdf.getPage(1)
        const contenido = await page.getTextContent()
        const texto = contenido.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')

        expect(texto).toContain('Estudio de gabinete')
        expect(texto).toContain('Resultado normal')

        await pdf.cleanup()
    })

    it('escapa los parentesis, que en PDF delimitan cadenas', async () => {
        const pdf = await abrir(crearPdfDePrueba(['Cariotipo (sangre periferica)']))
        const page = await pdf.getPage(1)
        const contenido = await page.getTextContent()
        const texto = contenido.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')

        expect(texto).toContain('Cariotipo (sangre periferica)')

        await pdf.cleanup()
    })

    it('entrega un File con el tipo que espera la validacion de subida', () => {
        const archivo = crearArchivoPdfDePrueba()
        expect(archivo.type).toBe('application/pdf')
        expect(archivo.name).toBe('informe-cariotipo.pdf')
        expect(archivo.size).toBeGreaterThan(0)
    })
})
