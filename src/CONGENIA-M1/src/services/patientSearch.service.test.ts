import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./api.client', async () => {
    const actual = await vi.importActual<typeof import('./api.client')>('./api.client')
    return { ...actual, apiFetch: vi.fn() }
})

import { apiFetch, ApiError } from './api.client'
import { searchPatient } from './patientSearch.service'

afterEach(() => {
    vi.resetAllMocks()
})

describe('searchPatient', () => {
    it('consulta el SADC a través de la API con el token del médico y sin caché', async () => {
        vi.mocked(apiFetch).mockResolvedValue({ success: true, data: {
            idPaciente: 9, idInstitucion: 254, historiaClinica: 'HC-100', nombres: 'Ana', apellidos: 'López',
        } })

        await expect(searchPatient({ historiaClinica: ' HC-100 ', idTenant: '254' })).resolves.toEqual({
            id: 9, idTenant: 254, nombreCompleto: 'Ana López', historiaClinica: 'HC-100',
        })
        expect(apiFetch).toHaveBeenCalledWith(
            '/api/v1/sadc/pacientes?idTenant=254&historiaClinica=HC-100',
            expect.objectContaining({ auth: 'bearer', sensitive: true, timeoutMs: 25_000 }),
        )
    })

    it.each([
        [404, 404],
        [403, 403],
        [504, 408],
        [408, 408],
        [503, 503],
        [0, 0],
    ])('traduce el %s de la API al estado %s que usa la pantalla', async (status, expected) => {
        vi.mocked(apiFetch).mockRejectedValue(new ApiError(status, 'X', 'x', 'req'))
        await expect(searchPatient({ historiaClinica: 'HC-1', idTenant: '254' })).rejects.toMatchObject({
            name: 'PatientSearchError', status: expected,
        })
    })
})
