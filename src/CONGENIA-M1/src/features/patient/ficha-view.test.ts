import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('../../services/upload.service', () => ({ uploadImageFile: vi.fn() }))
import { RegistrationOrchestratorView, type RegistrationOrchestratorViewProps } from '../../components/forms/RegistrationOrchestratorView/RegistrationOrchestratorView'

const base: RegistrationOrchestratorViewProps = {
    patientName: 'Paciente de prueba', numeroExpediente: '00001234', fechaConsulta: '2026-09-10',
    medicoConsulta: 'Médico solicitante', consentDoctorName: 'Médico original', especialidad: 'Genética', diagnosticos: '',
    initialAlertSigns: [{ id: 'existing-sign', title: 'Signo original' }],
    initialExams: [{ id: 'existing-exam', title: 'Examen original' }],
    initialSignatureData: 'data:image/png;base64,dGVzdA==', initialSignerName: 'Firmante de prueba', initialSignerRelation: 'Representante legal',
}
const render = (props: Partial<RegistrationOrchestratorViewProps>) => renderToStaticMarkup(createElement(RegistrationOrchestratorView, { ...base, ...props }))

describe('registered ficha modes', () => {
    it('view shows stored signs with no remove, add, or submission controls', () => {
        const html = render({ mode: 'view', initialOpenSection: 'alerts' })
        expect(html).toContain('Signo original')
        expect(html).not.toContain('aria-label="Eliminar"')
        expect(html).not.toContain('Agregar signo de alerta')
        expect(html).not.toContain('Finalizar registro')
        expect(html).not.toContain('Revisar ficha')
        expect(html).not.toContain('Solicitar cambios')
    })
    // El boton ya no se apaga mientras no haya altas: apagarlo dejaba al medico sin
    // saber que le faltaba. Ahora queda pulsable y es el intento el que explica y
    // lleva a Signos de Alerta.
    // La adenda va en dos pasos: primero la ficha en lectura, con un boton que se ve
    // para empezarla; juntos en una pantalla, los medicos no hallaban el inicio.
    it('append opens the ficha read-only first, with a visible button to start the addendum', () => {
        const html = render({ mode: 'append', onRequestChanges: async () => {} })
        expect(html).toContain('Datos de la Consulta')
        expect(html).not.toContain('Agregar signo de alerta')
        expect(html).not.toContain('Agregar examen sugerido')
        expect(html).not.toContain('Agregar observación')
        expect(html).not.toContain('Enviar adenda')
        const start = html.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*Solicitar adenda(?:(?!<\/button>)[\s\S])*<\/button>/)?.[0]
        expect(start).toBeDefined()
        expect(start).not.toMatch(/^<button\b[^>]*\bdisabled=""/)
    })
    it('append capture keeps only the three sections that accept additions', () => {
        const html = render({ mode: 'append', initialFaseAdenda: 'captura', onRequestChanges: async () => {} })
        expect(html).not.toContain('Datos de la Consulta')
        expect(html).not.toContain('Otros Demográficos')
        expect(html).not.toContain('Solicitar adenda')
        for (const seccion of ['Agregar signo de alerta', 'Agregar examen sugerido', 'Agregar observación', 'Cancelar adenda']) {
            expect(html).toContain(seccion)
        }
        // La cabecera cambia su aviso: ya no se lee la ficha, se agrega.
        expect(html).toContain('Nueva adenda: agregue signos de alerta')
    })
    it('append capture retains locked signs, allows additions and explains what submission needs', () => {
        const html = render({ mode: 'append', initialFaseAdenda: 'captura', onRequestChanges: async () => {} })
        expect(html).toContain('Signo original')
        expect(html).toContain('Agregar signo de alerta')
        expect(html).not.toContain('aria-label="Eliminar"')
        const action = html.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*Enviar adenda(?:(?!<\/button>)[\s\S])*<\/button>/)?.[0]
        expect(action).toBeDefined()
        expect(action).not.toMatch(/^<button\b[^>]*\bdisabled=""/)
        expect(html).toContain('Agregue al menos un signo de alerta, un estudio de gabinete o una observación')
    })
    it('append still refuses to start or submit without a handler for the request', () => {
        const lectura = render({ mode: 'append' })
        const start = lectura.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*Solicitar adenda(?:(?!<\/button>)[\s\S])*<\/button>/)?.[0]
        expect(start).toMatch(/^<button\b[^>]*\bdisabled=""/)

        const captura = render({ mode: 'append', initialFaseAdenda: 'captura' })
        const action = captura.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*Enviar adenda(?:(?!<\/button>)[\s\S])*<\/button>/)?.[0]
        expect(action).toMatch(/^<button\b[^>]*\bdisabled=""/)
    })
    // El pie del alta nombra lo que falta antes de que el medico pulse nada.
    it('create lists the incomplete sections next to the finalize button', () => {
        const html = render({ initialOpenSection: 'appointment' })
        expect(html).toContain('Falta completar')
        expect(html).toContain('Datos de la Consulta')
        expect(html).toContain('Otros Demográficos')
        // Incompleta, el boton dice lo que hara: revisar, no enviar.
        const action = html.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*Revisar ficha(?:(?!<\/button>)[\s\S])*<\/button>/)?.[0]
        expect(action).toBeDefined()
        expect(action).not.toMatch(/^<button\b[^>]*\bdisabled=""/)
        expect(html).not.toContain('Finalizar registro')
    })
    it('append locks appointment selectors and demographic controls', () => {
        const appointment = render({ mode: 'append', initialOpenSection: 'appointment' })
        // Referido de, lugar de parto y sexo del paciente.
        expect((appointment.match(/<select[^>]+disabled=""/g) ?? [])).toHaveLength(3)
        const demographics = render({ mode: 'append', initialOpenSection: 'demographic' })
        expect((demographics.match(/<button[^>]+disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(5)
    })
    it('never shows the consent of a registered ficha, signature included', () => {
        for (const mode of ['view', 'append'] as const) {
            const html = render({ mode, initialOpenSection: 'consent' })
            expect(html).not.toContain('alt="Firma registrada"')
            expect(html).not.toContain('Consentimiento Informado')
            expect(html).not.toContain('Firmante de prueba')
            expect(html).not.toContain('<canvas')
            expect(html).not.toContain('Firmar documento')
            expect(html).not.toContain('Se ha firmado el consentimiento')
        }
        // En la alta el documento vive en un modal cerrado: la seccion solo ofrece abrirlo.
        expect(render({ initialOpenSection: 'consent' })).toContain('Firmar documento')
    })
    it('shows the registered-ficha notices in the sticky header, never on a new one', () => {
        const notice = 'Este paciente ya tiene una ficha asignada.'
        expect(render({ mode: 'view', headerNotices: [{ text: notice }] })).toContain(notice)
        expect(render({ mode: 'append', headerNotices: [{ text: notice }] })).toContain(notice)
        expect(render({})).not.toContain(notice)
    })
    it('separates the pending addendum notice from the informative one', () => {
        const html = render({
            mode: 'view',
            headerNotices: [{ text: 'Ya tiene ficha' }, { text: 'Adenda pendiente', tone: 'pending' }],
        })
        const clase = (texto: string) => html.match(new RegExp(`class="([^"]*)"[^>]*>${texto}`))?.[1] ?? ''
        expect(clase('Ya tiene ficha')).toContain('noticeBadge')
        expect(clase('Adenda pendiente')).toContain('noticePending')
    })
    // El aviso de "aqui puedes agregar una adenda" comparte el ambar del pendiente: en
    // azul se leia como decorado y el medico no veia que la accion estaba a su alcance.
    it('gives the actionable addendum notice the same amber as the pending one', () => {
        const html = render({
            mode: 'append',
            headerNotices: [{ text: 'Puedes agregar una adenda', tone: 'action' }],
        })
        const clase = html.match(/class="([^"]*)"[^>]*>Puedes agregar una adenda/)?.[1] ?? ''
        expect(clase).toContain('noticeAction')
        expect(clase).not.toContain('noticeBadge')
    })
    // La regla que deja fija la cabecera de la seccion se engancha por atributo: CSS
    // Modules cifra los nombres de clase, asi que la hoja del orquestador no tiene otro
    // asidero para nombrarla. Si el atributo se cae, el pegado se apaga sin avisar y
    // nada mas lo delata.
    it('keeps the hook the sticky section header depends on', () => {
        const cabeceras = (html: string) => html.match(/<button[^>]*data-section-header=""[^>]*>/g) ?? []

        const alta = cabeceras(render({ initialOpenSection: 'appointment' }))
        // Consulta, demográficos, consentimiento, signos, estudios y observaciones.
        expect(alta).toHaveLength(6)
        for (const cabecera of alta) expect(cabecera).toContain('aria-expanded')

        // La adenda no monta el consentimiento: en la lectura quedan las otras cinco,
        // y en la captura solo las tres que admiten altas.
        expect(cabeceras(render({ mode: 'append', initialOpenSection: 'alerts' }))).toHaveLength(5)
        expect(cabeceras(render({ mode: 'append', initialFaseAdenda: 'captura' }))).toHaveLength(3)
    })
    it('marks replaced items and sinks them below the active ones', () => {
        const html = render({
            mode: 'view',
            initialOpenSection: 'alerts',
            initialAlertSigns: [
                { id: 'old', title: 'Signo sustituido', locked: true, status: 'replaced' },
                { id: 'current', title: 'Signo vigente', locked: true },
            ],
        })
        expect(html).toContain('CAMBIADA')
        expect(html).toContain('ACTIVA')
        expect(html.indexOf('Signo vigente')).toBeLessThan(html.indexOf('Signo sustituido'))
    })
    it('derives the replaced state from an addition that points at an existing sign', () => {
        const html = render({
            mode: 'append',
            initialOpenSection: 'alerts',
            initialAlertSigns: [
                { id: 'old', title: 'Signo sustituido', locked: true },
                { id: 'new', title: 'Signo nuevo', replacesId: 'old' },
            ],
        })
        expect(html.indexOf('Signo nuevo')).toBeLessThan(html.indexOf('Signo sustituido'))
        expect(html).toContain('CAMBIADA')
    })
    it('observations wait for the signature in a new ficha and stay read-only in a registered one', () => {
        const sinFirma = render({ initialSignatureData: null, initialOpenSection: 'observations' })
        expect(sinFirma).toContain('Observaciones')
        expect(sinFirma).not.toContain('Agregar observación')

        const conFirma = render({ initialOpenSection: 'observations' })
        expect(conFirma).toContain('Agregar observación')

        const registrada = render({
            mode: 'view',
            initialOpenSection: 'observations',
            initialObservaciones: [{ id: 'o-1', text: 'Nota registrada', locked: true }],
        })
        expect(registrada).toContain('Nota registrada')
        expect(registrada).not.toContain('Agregar observación')

        // En una adenda se pueden agregar, sin tocar las ya registradas.
        const adenda = render({
            mode: 'append',
            initialFaseAdenda: 'captura',
            initialObservaciones: [{ id: 'o-1', text: 'Nota registrada', locked: true }],
        })
        expect(adenda).toContain('Agregar observación')
        expect(adenda).not.toContain('aria-label="Eliminar"')
    })
    it('default create mode asks to review until the ficha is complete, then offers to finalize', () => {
        expect(render({})).toContain('Revisar ficha')

        const completa = render({
            initialReferidoDe: '1', initialLugarDeParto: '2', initialSexo: '1',
            initialFamiliaresAfectados: 0, initialAfectadosComunidad: 0,
            initialConsentValues: { 'autorizacion-principal': true, 'aceptacion-final': true },
        })
        expect(completa).toContain('Finalizar registro')
        expect(completa).not.toContain('Revisar ficha')
    })
})
