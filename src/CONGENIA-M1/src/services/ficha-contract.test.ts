import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('./api.client', () => ({ apiFetch: vi.fn() }))
import { apiFetch } from './api.client'
import { createManualSession } from './session.service'
import { listFichasPaciente, crearRevision, rechazar, getMe } from './ficha.service'

describe('versioned ficha API contracts', () => {
    beforeEach(() => vi.clearAllMocks())
    it('writes the response institution and history, never the Nursera patient id', async () => {
        await createManualSession({ id: 999, idTenant: 25, historiaClinica: '00001234', nombreCompleto: 'Paciente de prueba' }, 'test-token')
        const [, options] = vi.mocked(apiFetch).mock.calls[0]
        expect(JSON.parse(String(options?.body)).paciente).toEqual({ historiaClinica: '00001234', tenantId: '25', nombre: 'Paciente de prueba' })
    })
    it('encodes the string history and uses bearer authentication for sensitive reads and writes', async () => {
        await listFichasPaciente('25', '0000/1234')
        expect(apiFetch).toHaveBeenLastCalledWith('/api/v1/pacientes/25/0000%2F1234/fichas', { auth: 'bearer', sensitive: true })
        await getMe()
        expect(apiFetch).toHaveBeenLastCalledWith('/api/v1/me', { auth: 'bearer', sensitive: true })
        await crearRevision('fixture-id', { motivo: 'Agregado', warningSigns: [], examDiagnoses: [{ examDescription: 'Examen' }] })
        expect(vi.mocked(apiFetch).mock.calls.at(-1)?.[1]).toMatchObject({ auth: 'bearer', sensitive: true, method: 'POST' })
        await rechazar('fixture-id', 'Falta información')
        expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls.at(-1)?.[1]?.body))).toEqual({ motivo: 'Falta información' })
    })
})
