/**
 * @fileoverview Estados del ImageUploader.
 *
 * Las historias son estaticas a proposito: pasan la miniatura ya resuelta por
 * props, sin pdf.js ni archivos reales, para que cada estado se pueda comparar
 * de un vistazo y quede documentado en autodocs. El recorrido de verdad
 * (elegir archivo -> rasterizar -> subir) vive en forms/ExamsSection.
 */

import type { Meta, StoryObj } from '@storybook/react-vite'
import { ImageUploader } from './ImageUploader'

const meta: Meta<typeof ImageUploader> = {
    title: 'UI/ImageUploader',
    component: ImageUploader,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
    args: {
        onClear: () => {},
    },
}

export default meta
type Story = StoryObj<typeof ImageUploader>

/** Hace de primera pagina ya rasterizada, sin depender de pdf.js en una historia estatica. */
const paginaRasterizada = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160">
        <rect width="120" height="160" fill="#ffffff"/>
        <rect x="14" y="16" width="64" height="7" fill="#003E69"/>
        <rect x="14" y="34" width="92" height="3" fill="#A1A1A1"/>
        <rect x="14" y="43" width="92" height="3" fill="#A1A1A1"/>
        <rect x="14" y="52" width="70" height="3" fill="#A1A1A1"/>
        <rect x="14" y="70" width="92" height="3" fill="#A1A1A1"/>
        <rect x="14" y="79" width="84" height="3" fill="#A1A1A1"/>
        <rect x="14" y="100" width="46" height="5" fill="#45779E"/>
    </svg>`,
)}`

const fotoDeHallazgo = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
        <rect width="120" height="120" fill="#AED3F2"/>
        <circle cx="60" cy="48" r="22" fill="#6794BA"/>
        <path d="M14 108 L48 66 L74 96 L92 78 L110 108 Z" fill="#45779E"/>
    </svg>`,
)}`

const DE_GABINETE = {
    label: 'Archivo (opcional)',
    accept: 'image/jpeg,image/png,image/webp,application/pdf',
    hint: 'JPG, PNG, WebP o PDF de hasta 10 MB',
}

export const Default: Story = {
    args: {
        label: 'Foto',
        text: 'Elegir imagen',
        accept: 'image/*',
        onClear: undefined,
    },
}

export const Disabled: Story = {
    args: {
        label: 'Foto',
        text: 'Elegir imagen',
        accept: 'image/*',
        disabled: true,
        onClear: undefined,
    },
}

/** Con la ayuda visible, el peso maximo se conoce antes de elegir y no despues de fallar. */
export const ConAyuda: Story = {
    args: {
        ...DE_GABINETE,
        text: 'Elegir archivo',
        onClear: undefined,
    },
}

/**
 * Sin acceso a camara, para secciones donde tomar una foto no aplica.
 * Por defecto la camara se muestra: en Android era justo lo que faltaba.
 */
export const SinCamara: Story = {
    args: {
        ...DE_GABINETE,
        text: 'Elegir archivo',
        showCamera: false,
        onClear: undefined,
    },
}

/** Una imagen elegida: miniatura, nombre, peso y confirmacion de que quedo lista. */
export const ConImagenSeleccionada: Story = {
    args: {
        ...DE_GABINETE,
        text: 'Otro archivo',
        fileName: 'ecocardiograma.jpg',
        fileSizeBytes: 842_000,
        fileKind: 'image',
        previewSrc: fotoDeHallazgo,
        previewState: 'ready',
    },
}

/** Mientras pdf.js rasteriza la pagina 1. Antes este momento no se distinguia de "no pasó nada". */
export const PdfRenderizando: Story = {
    args: {
        ...DE_GABINETE,
        text: 'Otro archivo',
        fileName: 'informe-cariotipo.pdf',
        fileSizeBytes: 1_468_000,
        fileKind: 'pdf',
        previewState: 'loading',
    },
}

/**
 * El arreglo del comentario de la evaluacion: un PDF se previsualiza igual que
 * una imagen, con su primera pagina a la vista.
 */
export const PdfConPreview: Story = {
    args: {
        ...DE_GABINETE,
        text: 'Otro archivo',
        fileName: 'informe-cariotipo.pdf',
        fileSizeBytes: 1_468_000,
        fileKind: 'pdf',
        previewSrc: paginaRasterizada,
        previewState: 'ready',
    },
}

/**
 * PDF cifrado o corrupto: no hay miniatura, pero el archivo sigue adjunto y se
 * dice, para que el fallo del dibujo no se lea como que no se cargo nada.
 */
export const PdfSinPreview: Story = {
    args: {
        ...DE_GABINETE,
        text: 'Otro archivo',
        fileName: 'estudio-protegido.pdf',
        fileSizeBytes: 3_100_000,
        fileKind: 'pdf',
        previewState: 'unavailable',
    },
}

/** Rechazo por peso, con el peso real del archivo para que el limite sea comparable. */
export const ArchivoDemasiadoGrande: Story = {
    args: {
        ...DE_GABINETE,
        text: 'Elegir archivo',
        error: 'El archivo pesa 14.2 MB y el máximo es 10 MB',
        onClear: undefined,
    },
}

/** Rechazo por formato. El mensaje vive bajo el uploader, no en el campo de nombre. */
export const TipoNoPermitido: Story = {
    args: {
        ...DE_GABINETE,
        text: 'Elegir archivo',
        error: 'Solo se aceptan JPG, PNG, WebP o PDF',
        onClear: undefined,
    },
}

/** Durante el PUT al bucket. Quitar el archivo queda bloqueado hasta que termine. */
export const Subiendo: Story = {
    args: {
        ...DE_GABINETE,
        text: 'Otro archivo',
        fileName: 'informe-cariotipo.pdf',
        fileSizeBytes: 1_468_000,
        fileKind: 'pdf',
        previewSrc: paginaRasterizada,
        previewState: 'ready',
        uploadState: 'uploading',
        disabled: true,
    },
}

/** Subida confirmada. */
export const Subido: Story = {
    args: {
        ...DE_GABINETE,
        text: 'Otro archivo',
        fileName: 'informe-cariotipo.pdf',
        fileSizeBytes: 1_468_000,
        fileKind: 'pdf',
        previewSrc: paginaRasterizada,
        previewState: 'ready',
        uploadState: 'uploaded',
    },
}
