import type { User } from 'oidc-client-ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getMe, type MeProfile } from '../../services/ficha.service'
import { loadMe, resetMeCache } from './me'

vi.mock('../../services/ficha.service', () => ({ getMe: vi.fn() }))

const conToken = (access_token: string) => ({ access_token }) as User
const perfil = { subject: 's', permissions: ['dashboard'] } as MeProfile

describe('loadMe', () => {
    beforeEach(() => {
        resetMeCache()
        vi.mocked(getMe).mockReset()
    })

    it('con el mismo token comparte la petición', async () => {
        vi.mocked(getMe).mockResolvedValue(perfil)

        const [a, b] = await Promise.all([loadMe(conToken('t1')), loadMe(conToken('t1'))])

        expect(a).toBe(perfil)
        expect(b).toBe(perfil)
        expect(getMe).toHaveBeenCalledTimes(1)
    })

    it('un token nuevo vuelve a consultar: puede traer otros grupos', async () => {
        vi.mocked(getMe).mockResolvedValue(perfil)

        await loadMe(conToken('t1'))
        await loadMe(conToken('t2'))

        expect(getMe).toHaveBeenCalledTimes(2)
    })

    it('un fallo no queda guardado', async () => {
        vi.mocked(getMe).mockRejectedValueOnce(new Error('caído')).mockResolvedValueOnce(perfil)

        await expect(loadMe(conToken('t1'))).rejects.toThrow('caído')
        await expect(loadMe(conToken('t1'))).resolves.toBe(perfil)
        expect(getMe).toHaveBeenCalledTimes(2)
    })
})
