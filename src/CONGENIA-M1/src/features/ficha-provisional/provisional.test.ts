import { describe, expect, it } from 'vitest'
import {
    isProvisionalHistory,
    localIsoDate,
    manualRegistrationErrorMessage,
    provisionalHistoryFor,
    validateManualRegistration,
} from './provisional'

describe('historia clínica provisional', () => {
    it('arma TMP-<institución>-<HC buscada>', () => {
        expect(provisionalHistoryFor('23', ' 12345678 ')).toBe('TMP-23-12345678')
    })

    it('reconoce el prefijo sin importar mayúsculas', () => {
        expect(isProvisionalHistory('TMP-23-1')).toBe(true)
        expect(isProvisionalHistory('tmp-23-1')).toBe(true)
        expect(isProvisionalHistory('12345678')).toBe(false)
        expect(isProvisionalHistory(undefined)).toBe(false)
    })
})

describe('validateManualRegistration', () => {
    const hoy = '2026-10-10'

    it('acepta nombre y fecha de hoy', () => {
        expect(validateManualRegistration({ nombre: 'Paciente Sintético', fechaConsulta: hoy }, hoy)).toEqual({})
    })

    it('exige el nombre', () => {
        expect(validateManualRegistration({ nombre: '   ', fechaConsulta: hoy }, hoy).nombre).toBeDefined()
    })

    it('limita el largo del nombre', () => {
        expect(validateManualRegistration({ nombre: 'a'.repeat(201), fechaConsulta: hoy }, hoy).nombre).toBeDefined()
    })

    it('rechaza fechas vacías y futuras', () => {
        expect(validateManualRegistration({ nombre: 'P', fechaConsulta: '' }, hoy).fechaConsulta).toBeDefined()
        expect(validateManualRegistration({ nombre: 'P', fechaConsulta: '2026-10-11' }, hoy).fechaConsulta).toBeDefined()
        expect(validateManualRegistration({ nombre: 'P', fechaConsulta: '2026-10-09' }, hoy)).toEqual({})
    })
})

describe('localIsoDate', () => {
    it('devuelve AAAA-MM-DD', () => {
        expect(localIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
})

describe('manualRegistrationErrorMessage', () => {
    it('traduce los rechazos del flujo provisional', () => {
        expect(manualRegistrationErrorMessage('PACIENTE_EXISTE_EN_SADC')).toContain('SADC')
        expect(manualRegistrationErrorMessage('SADC_UNAVAILABLE')).toContain('verificar')
        expect(manualRegistrationErrorMessage('FICHA_VIGENTE_EXISTE')).toContain('Ya existe')
    })

    it('deja pasar los códigos ajenos al flujo', () => {
        expect(manualRegistrationErrorMessage('INTERNAL_ERROR')).toBeNull()
        expect(manualRegistrationErrorMessage(undefined)).toBeNull()
    })
})
