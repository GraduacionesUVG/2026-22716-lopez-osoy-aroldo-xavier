/**
 * @fileoverview Estudios de Gabinete Indicados.
 *
 * Las ultimas historias cubren la carga de archivos, que es lo que se reporto en
 * la evaluacion heuristica: elegir un PDF no producia ninguna senal en pantalla y
 * pasarse del peso maximo solo se sabia despues de enviar el formulario.
 *
 * pdf.js no esta simulado: el archivo que reciben es un PDF valido construido en
 * memoria, asi que la miniatura que se ve es su primera pagina rasterizada de verdad.
 * La subida al bucket si esta simulada, porque pega contra el backend; se interpone
 * window.fetch igual que en features/patient/FichaAdenda.stories.tsx.
 */

import { useEffect, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test'
import { ExamsSection, type ExamItem } from './ExamsSection'
import { TOASTER_PROPS } from '../../../config/toast'
import { crearArchivoPdfDePrueba, crearArchivoPesado } from '../../../utils/pdfPreview.mock'

const meta: Meta<typeof ExamsSection> = {
    title: 'forms/ExamsSection',
    component: ExamsSection,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
}

export default meta
type Story = StoryObj<typeof ExamsSection>

const initialItems: ExamItem[] = [
    {
        id: 'exam-1',
        title: 'Cariotipo (analisis cromosomico)',
    },
]

export const Default: Story = {
    render: () => {
        const [items, setItems] = useState(initialItems)

        const handleRemove = (id: string) => {
            setItems((prev) => prev.filter((item) => item.id !== id))
        }

        return (
            <ExamsSection
                title="Estudios de Gabinete Indicados"
                items={items}
                onRemove={handleRemove}
            />
        )
    },
}

/** Una ficha ya registrada: todo bloqueado y marcado con su vigencia. */
const storedExams: ExamItem[] = [
    { id: 'exam-1', title: 'Cariotipo (analisis cromosomico)', locked: true },
    { id: 'exam-2', title: 'Ecocardiograma', locked: true },
    { id: 'exam-3', title: 'Radiografia sustituida', locked: true, status: 'replaced' },
]

export const FichaRegistrada: Story = {
    args: { items: storedExams, readOnly: true },
}

/** En una adenda solo se agrega, y el alta puede declarar a que examen sustituye. */
export const Adenda: Story = {
    render: () => {
        const [items, setItems] = useState<ExamItem[]>(storedExams)
        return (
            <ExamsSection
                items={items}
                allowReplacement
                onAdd={(item) => setItems((prev) => [...prev, item])}
                onRemove={(id) => setItems((prev) => prev.filter((item) => item.locked || item.id !== id))}
            />
        )
    },
}

/* ------------------------------------------------------------------- */
/* Carga de archivos                                                     */
/* ------------------------------------------------------------------- */

const BUCKET_SIMULADO = 'https://bucket.demo/estudio'

/** Responde los dos saltos del upload: presigned URL y PUT del binario. */
function ConSubidaSimulada({ children }: { children: React.ReactNode }) {
    useEffect(() => {
        const original = window.fetch
        window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
            if (url.includes('/uploads/presigned-url')) {
                return new Response(JSON.stringify({
                    success: true,
                    data: {
                        presignedUrl: BUCKET_SIMULADO,
                        documentId: 'documento-demo',
                        objectKey: `uploads/estudio-${Date.now()}`,
                        headers: {},
                    },
                }), { status: 200, headers: { 'Content-Type': 'application/json' } })
            }
            if (url.startsWith(BUCKET_SIMULADO)) return new Response(null, { status: 200 })
            return original(input, init)
        }
        return () => { window.fetch = original }
    }, [])
    return <>{children}</>
}

function CargaDeArchivosDemo() {
    const [items, setItems] = useState<ExamItem[]>([])
    return (
        <ConSubidaSimulada>
            <ExamsSection
                items={items}
                onAdd={(item) => setItems((prev) => [...prev, item])}
                onRemove={(id) => setItems((prev) => prev.filter((item) => item.id !== id))}
            />
            <Toaster {...TOASTER_PROPS} />
        </ConSubidaSimulada>
    )
}

/** Entrega un archivo al input oculto, que es lo que hace el selector del sistema. */
function elegirArchivo(canvasElement: HTMLElement, file: File) {
    const input = canvasElement.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('No se encontro el input de archivo')
    const datos = new DataTransfer()
    datos.items.add(file)
    fireEvent.change(input, { target: { files: datos.files } })
}

async function abrirModal(canvasElement: HTMLElement) {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Agregar examen sugerido/ }))
    return canvas
}

/**
 * Modal abierto y listo para probar con un archivo del disco. Es la historia para
 * revisar el arreglo a mano: al elegir un PDF aparece su primera pagina, el nombre
 * y el peso, y al agregar sale la confirmacion.
 */
export const SubirArchivo: Story = {
    render: () => <CargaDeArchivosDemo />,
    play: async ({ canvasElement }) => {
        await abrirModal(canvasElement)
    },
}

/**
 * El arreglo del comentario: un PDF se previsualiza con su primera pagina, igual
 * que una imagen.
 */
export const PdfConVistaPrevia: Story = {
    render: () => <CargaDeArchivosDemo />,
    play: async ({ canvasElement }) => {
        const canvas = await abrirModal(canvasElement)

        elegirArchivo(canvasElement, crearArchivoPdfDePrueba())

        // Nombre y peso salen de inmediato; la miniatura tarda lo que pdf.js demore
        // en levantar su worker y rasterizar la pagina.
        await expect(canvas.getByText('informe-cariotipo.pdf')).toBeInTheDocument()
        await waitFor(
            () => expect(canvas.getByAltText('Vista previa de informe-cariotipo.pdf')).toBeInTheDocument(),
            { timeout: 20000 },
        )
        await expect(canvas.getByText('Archivo listo para subir')).toBeInTheDocument()
        // La miniatura se encoge para caber: el boton la abre en grande.
        await expect(canvas.getByRole('button', { name: 'Ver imagen completa' })).toBeInTheDocument()
    },
}

/**
 * Pasarse del peso se avisa al elegir el archivo, no despues de enviar, y el
 * mensaje trae el peso real para poder compararlo con el limite.
 */
export const ArchivoDemasiadoGrande: Story = {
    render: () => <CargaDeArchivosDemo />,
    play: async ({ canvasElement }) => {
        const canvas = await abrirModal(canvasElement)

        elegirArchivo(canvasElement, crearArchivoPesado('estudio-pesado.pdf', 'application/pdf', 11 * 1024 * 1024))

        const aviso = await canvas.findByRole('alert')
        await expect(aviso).toHaveTextContent('El archivo pesa 11.0 MB y el máximo es 10 MB')
        // Se rechaza entero: no queda una tarjeta sugiriendo que algo se adjunto.
        await expect(canvas.queryByText('estudio-pesado.pdf')).not.toBeInTheDocument()
    },
}

/**
 * Un formato no aceptado se explica bajo la zona de carga. Antes este mensaje
 * salia como error del campo "Nombre del examen", que no era donde estaba el problema.
 */
export const TipoNoPermitido: Story = {
    render: () => <CargaDeArchivosDemo />,
    play: async ({ canvasElement }) => {
        const canvas = await abrirModal(canvasElement)

        elegirArchivo(canvasElement, new File(['notas'], 'resultados.txt', { type: 'text/plain' }))

        const avisos = await canvas.findAllByRole('alert')
        await expect(avisos).toHaveLength(1)
        await expect(avisos[0]).toHaveTextContent('Solo se aceptan JPG, PNG, WebP o PDF')
        // El error pertenece al uploader: el nombre se pide en el paso siguiente.
        await expect(canvas.getByText('Paso 1 de 2')).toBeInTheDocument()
        await expect(canvas.queryByLabelText(/Nombre del examen/)).not.toBeInTheDocument()
    },
}
