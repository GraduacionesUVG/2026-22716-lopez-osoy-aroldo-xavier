import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api.client', () => ({ apiFetch: vi.fn() }))

import { apiFetch } from './api.client'
import { MAX_UPLOAD_BYTES, uploadImageFile, validateUploadFile } from './upload.service'

afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetAllMocks()
})

describe('uploadImageFile', () => {
    it('sends the signed metadata headers on the binary PUT for a revision', async () => {
        const file = new File(['synthetic'], 'exam.png', { type: 'image/png' })
        const headers = {
            'x-amz-meta-patient-id': 'patient-id',
            'x-amz-meta-tenant-id': '254',
            'x-amz-meta-category': 'exam',
            'x-amz-meta-size-bytes': String(file.size),
            'x-amz-meta-upload-purpose': 'revision',
        }
        vi.mocked(apiFetch).mockResolvedValue({ success: true, data: {
            presignedUrl: 'https://storage.example.test/signed',
            documentId: 'document-id', objectKey: 'test/exam.png', headers,
        } })
        const put = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
        vi.stubGlobal('fetch', put)

        await expect(uploadImageFile(file, 'exam', 'patient-id')).resolves.toBe('test/exam.png')
        expect(apiFetch).toHaveBeenCalledWith('/api/v1/pacientes/patient-id/uploads/presigned-url', expect.objectContaining({ auth: 'bearer' }))
        expect(put).toHaveBeenCalledWith('https://storage.example.test/signed', {
            method: 'PUT', body: file, headers: { ...headers, 'Content-Type': 'image/png' },
        })
    })

    it('preserves initial uploads whose presign response has no metadata headers', async () => {
        const file = new File(['synthetic'], 'photo.jpg', { type: 'image/jpeg' })
        vi.mocked(apiFetch).mockResolvedValue({ success: true, data: {
            presignedUrl: 'https://storage.example.test/initial',
            documentId: 'document-id', objectKey: 'test/photo.jpg',
        } })
        const put = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
        vi.stubGlobal('fetch', put)

        await expect(uploadImageFile(file, 'profile')).resolves.toBe('test/photo.jpg')
        expect(apiFetch).toHaveBeenCalledWith('/v1/uploads/presigned-url', expect.objectContaining({ auth: 'session' }))
        expect(put).toHaveBeenCalledWith('https://storage.example.test/initial', {
            method: 'PUT', body: file, headers: { 'Content-Type': 'image/jpeg' },
        })
    })
})

describe('uploadImageFile con URL vencida', () => {
    it('pide una URL nueva y reintenta una vez cuando el bucket responde 403', async () => {
        const file = new File(['synthetic'], 'exam.png', { type: 'image/png' })
        const sse = { 'x-amz-server-side-encryption': 'AES256' }
        vi.mocked(apiFetch)
            .mockResolvedValueOnce({ success: true, data: {
                presignedUrl: 'https://storage.example.test/vencida', documentId: 'd1', objectKey: 'test/d1.png', headers: sse,
            } })
            .mockResolvedValueOnce({ success: true, data: {
                presignedUrl: 'https://storage.example.test/nueva', documentId: 'd2', objectKey: 'test/d2.png', headers: sse,
            } })
        const put = vi.fn()
            .mockResolvedValueOnce(new Response(null, { status: 403 }))
            .mockResolvedValueOnce(new Response(null, { status: 200 }))
        vi.stubGlobal('fetch', put)

        // Devuelve la clave de la URL que sí se usó.
        await expect(uploadImageFile(file, 'exam')).resolves.toBe('test/d2.png')
        expect(apiFetch).toHaveBeenCalledTimes(2)
        expect(put).toHaveBeenNthCalledWith(2, 'https://storage.example.test/nueva', {
            method: 'PUT', body: file, headers: { ...sse, 'Content-Type': 'image/png' },
        })
    })

    it('no reintenta más de una vez', async () => {
        const file = new File(['synthetic'], 'exam.png', { type: 'image/png' })
        vi.mocked(apiFetch).mockResolvedValue({ success: true, data: {
            presignedUrl: 'https://storage.example.test/x', documentId: 'd', objectKey: 'test/d.png',
        } })
        const put = vi.fn().mockResolvedValue(new Response(null, { status: 403 }))
        vi.stubGlobal('fetch', put)

        await expect(uploadImageFile(file, 'exam')).rejects.toThrow('HTTP 403')
        expect(put).toHaveBeenCalledTimes(2)
    })

    it('un error distinto de 403 no pide otra URL', async () => {
        const file = new File(['synthetic'], 'exam.png', { type: 'image/png' })
        vi.mocked(apiFetch).mockResolvedValue({ success: true, data: {
            presignedUrl: 'https://storage.example.test/x', documentId: 'd', objectKey: 'test/d.png',
        } })
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))

        await expect(uploadImageFile(file, 'exam')).rejects.toThrow('HTTP 500')
        expect(apiFetch).toHaveBeenCalledTimes(1)
    })
})

describe('validateUploadFile', () => {
    const pdf = (bytes: number) => new File([new Uint8Array(bytes)], 'estudio.pdf', { type: 'application/pdf' })

    it('acepta un PDF dentro del limite en exam', () => {
        expect(validateUploadFile(pdf(2048), 'exam')).toBeNull()
    })

    it('rechaza el PDF en profile, donde solo van imagenes', () => {
        expect(validateUploadFile(pdf(2048), 'profile')).toBe('Solo se aceptan JPG, PNG o WebP')
    })

    it('rechaza un formato fuera de la lista nombrando los aceptados', () => {
        const txt = new File(['notas'], 'resultados.txt', { type: 'text/plain' })
        expect(validateUploadFile(txt, 'exam')).toBe('Solo se aceptan JPG, PNG, WebP o PDF')
    })

    it('rechaza un archivo vacio', () => {
        expect(validateUploadFile(pdf(0), 'exam')).toBe('El archivo está vacío')
    })

    it('rechaza por peso diciendo cuanto pesa, no solo que se paso', () => {
        expect(validateUploadFile(pdf(MAX_UPLOAD_BYTES + 1), 'exam'))
            .toBe('El archivo pesa 10.0 MB y el máximo es 10 MB')
    })

    it('acepta justo en el limite', () => {
        expect(validateUploadFile(pdf(MAX_UPLOAD_BYTES), 'exam')).toBeNull()
    })

    // El formulario avisa al elegir el archivo y el servicio vuelve a comprobar al
    // subir. Que compartan funcion es lo que evita que digan cosas distintas.
    it('uploadImageFile lanza el mismo mensaje que la validacion', async () => {
        const grande = pdf(MAX_UPLOAD_BYTES + 1)
        await expect(uploadImageFile(grande, 'exam')).rejects.toThrow(
            validateUploadFile(grande, 'exam') as string,
        )
        expect(apiFetch).not.toHaveBeenCalled()
    })
})
