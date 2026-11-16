import { describe, expect, it } from 'vitest'
import { buildRevisionPayload, fichaToView } from './ficha.mapper'
import type { FichaDetail } from '../../services/ficha.service'

const makeFicha = (): FichaDetail => ({
    fichaId: 'ficha-prueba', pacienteId: 'paciente-prueba', fichaRaizId: 'raiz-prueba', revision: 2, estadoFicha: 'PENDIENTE', esVigente: false,
    paciente: { nombre: 'Paciente de prueba', historiaClinica: '00001234', tenantId: '25' },
    consulta: { fechaConsulta: '2026-09-10', diagnosticoTexto: 'Diagnóstico' },
    medico: { nombre: 'Médico de prueba', especialidad: 'Genética' },
    demographic: { referralSourceId: 1, birthMethodId: 2, affectedRelatives: false, affectedRelativesCategoryIds: [], affectedUnderageRelatives: 0, affectedAdultRelatives: 0, affectedCommunityMembers: 'NO' },
    consent: { consentimientoId: 'consentimiento-prueba', idiomaConsentimiento: 'ESPANOL', estadoConsentimiento: 'ACEPTADO', tipoFirmante: 'REPRESENTANTE_LEGAL', nombreFirmante: 'Firmante de prueba', aceptacionTerminos: true, aceptacionContacto: false, firmaUrl: 'https://files.example/signature', fechaHoraAceptacion: '2026-09-10T12:00:00Z', medico: { nombre: 'Médico original', especialidad: 'Pediatría' } },
    warningSigns: [{ signoId: 'a', signDescription: 'Original', partCatalogId: 3, regionId: 1, partName: 'Mano', regionName: 'Extremidades', addedInRevision: false }],
    examDiagnoses: [{ examenId: 'b', examDescription: 'Original', examUrl: 'https://files.example/exam', addedInRevision: false }],
})

describe('append payload', () => {
    it('sends only additions and does not send persisted download URLs or fields from the signed sections', () => {
        const result = buildRevisionPayload('  Se agrega examen  ', {
            alertSigns: [
                { id: 'old-sign', locked: true, title: 'Original', imageSrc: 'https://files.example/signed', parteDelCuerpo: { regionValue: '1', parteValue: '2' } },
                { id: 'new-sign', title: 'Nuevo', imageResourceId: 'uploads/new', parteDelCuerpo: { regionValue: '1', parteValue: '3' } },
            ],
            exams: [{ id: 'old-exam', locked: true, title: 'Original' }, { id: 'new-exam', title: 'Nuevo examen' }],
        })
        expect(result).toEqual({ motivo: 'Se agrega examen', warningSigns: [{ signDescription: 'Nuevo', partCatalogId: 3, imageResourceId: 'uploads/new', replacesSignoId: undefined }], examDiagnoses: [{ examDescription: 'Nuevo examen', examResourceId: undefined, replacesExamenId: undefined }] })
        expect(JSON.stringify(result)).not.toContain('signed')
    })
    it('rejects an empty delta, empty or overlong reason, and invalid catalog identifiers', () => {
        const empty = { alertSigns: [], exams: [] }
        expect(() => buildRevisionPayload('Motivo', empty)).toThrow(/al menos/)
        expect(() => buildRevisionPayload('  ', empty)).toThrow(/motivo/)
        expect(() => buildRevisionPayload('x'.repeat(501), empty)).toThrow(/500/)
        expect(() => buildRevisionPayload('Motivo', { ...empty, alertSigns: [{ id: 'a', title: 'Signo', parteDelCuerpo: { regionValue: '1', parteValue: 'mano' } }] })).toThrow(/parte del cuerpo/)
    })
    it('preserves the external history as a string and locks every stored child', () => {
        const view = fichaToView(makeFicha())
        expect(view.numeroExpediente).toBe('00001234')
        expect(view.initialAlertSigns?.[0].locked).toBe(true)
        expect(view.initialExams?.[0].locked).toBe(true)
        expect(view.initialAlertSigns?.[0].imageResourceId).toBeUndefined()
        // El consentimiento no llega al cliente: no se pinta en una ficha ya registrada.
        expect(view.initialSignerName).toBeUndefined()
        expect(view.initialSignatureData).toBeUndefined()
        expect(view.consentDoctorName).toBeUndefined()
        expect(view.initialSignerRelation).toBeUndefined()
        expect(JSON.stringify(view)).not.toContain('files.example/signature')
    })
    it('carries the replacement link in both directions', () => {
        const payload = buildRevisionPayload('Sustituye una foto', {
            alertSigns: [{ id: 'new-sign', title: 'Nuevo', replacesId: 'old-sign', parteDelCuerpo: { regionValue: '1', parteValue: '3' } }],
            exams: [{ id: 'new-exam', title: 'Nuevo examen', replacesId: 'old-exam' }],
        })
        expect(payload.warningSigns[0].replacesSignoId).toBe('old-sign')
        expect(payload.examDiagnoses[0].replacesExamenId).toBe('old-exam')
    })
    it('reads the persisted replacement state, defaulting to active when absent', () => {
        const base = makeFicha()
        const view = fichaToView({
            ...base,
            warningSigns: [{ ...base.warningSigns[0], replacedBySignoId: 'newer-sign' }],
            examDiagnoses: [{ ...base.examDiagnoses[0], replacedByExamenId: 'newer-exam' }],
        })
        expect(view.initialAlertSigns?.[0].status).toBe('replaced')
        expect(view.initialExams?.[0].status).toBe('replaced')
        const untouched = fichaToView(base)
        expect(untouched.initialAlertSigns?.[0].status).toBe('active')
        expect(untouched.initialExams?.[0].status).toBe('active')
    })
    it('sends only the new observations, trimmed, and omits the field when there are none', () => {
        const conObservacion = buildRevisionPayload('Agrego una nota', {
            alertSigns: [],
            exams: [],
            observaciones: [
                { id: 'o-old', text: 'Ya registrada', locked: true },
                { id: 'o-new', text: '  Nota nueva de la adenda  ' },
            ],
        })
        // Una adenda con solo una observacion es valida.
        expect(conObservacion).toEqual({
            motivo: 'Agrego una nota',
            warningSigns: [],
            examDiagnoses: [],
            observations: [{ observationText: 'Nota nueva de la adenda' }],
        })

        const sinObservacion = buildRevisionPayload('Agrego examen', {
            alertSigns: [],
            exams: [{ id: 'e-new', title: 'Examen' }],
            observaciones: [{ id: 'o-old', text: 'Ya registrada', locked: true }],
        })
        expect(sinObservacion).not.toHaveProperty('observations')
    })
    it('reads stored observations as locked items, tolerating a server that does not send them yet', () => {
        const base = makeFicha()
        const view = fichaToView({
            ...base,
            observations: [{ observacionId: 'o-1', observationText: 'Nota', addedInRevision: false, fechaCreacion: '2026-09-10T12:00:00Z' }],
        })
        expect(view.initialObservaciones).toEqual([expect.objectContaining({ id: 'o-1', text: 'Nota', locked: true })])
        expect(view.initialObservaciones?.[0].fecha).toBeTruthy()
        expect(fichaToView(base).initialObservaciones).toEqual([])
    })
    it('reads the sex catalog id, leaving it empty for fichas registered before the field existed', () => {
        const base = makeFicha()
        expect(fichaToView({ ...base, demographic: { ...base.demographic, sexId: 3 } }).initialSexo).toBe('3')
        expect(fichaToView({ ...base, demographic: { ...base.demographic, sexId: null } }).initialSexo).toBe('')
        expect(fichaToView(base).initialSexo).toBe('')
    })
})
