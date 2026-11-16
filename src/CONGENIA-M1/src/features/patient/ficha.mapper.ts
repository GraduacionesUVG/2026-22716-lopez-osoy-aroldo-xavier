import type { FichaDetail, RevisionPayload } from '../../services/ficha.service'
import type { FichaFormState } from '../ficha-clinica/fichaClinica.mapper'
import type { RegistrationOrchestratorViewProps } from '../../components/forms/RegistrationOrchestratorView/RegistrationOrchestratorView'
import { observacionesParaEnviar } from '../ficha-clinica/observaciones'

const formatoFecha = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'short', year: 'numeric' })

/** Fecha corta para las observaciones guardadas. Si no se puede leer, no se muestra. */
function fechaCorta(iso?: string): string | undefined {
    if (!iso) return undefined
    const fecha = new Date(iso)
    return Number.isNaN(fecha.getTime()) ? undefined : formatoFecha.format(fecha)
}

/**
 * Traduce la ficha vigente a las props de la vista.
 *
 * El consentimiento no se propaga: en una ficha ya registrada no se vuelve a mostrar, y la
 * firma del tutor no tiene por que llegar al estado del cliente para no pintarse nunca.
 */
export function fichaToView(ficha: FichaDetail): RegistrationOrchestratorViewProps {
    const d = ficha.demographic
    const isPdfUrl = (url?: string | null) => {
        if (!url) return false
        try {
            return new URL(url).pathname.toLowerCase().endsWith('.pdf')
        } catch {
            return url.split('?')[0]?.toLowerCase().endsWith('.pdf') ?? false
        }
    }
    return {
        patientName: ficha.paciente.nombre,
        numeroExpediente: ficha.paciente.historiaClinica,
        fechaConsulta: ficha.consulta.fechaConsulta?.slice(0, 10),
        medicoConsulta: ficha.medico.nombre,
        especialidad: ficha.medico.especialidad,
        diagnosticos: ficha.consulta.diagnosticoTexto,
        initialReferidoDe: d.referralSourceId == null ? '' : String(d.referralSourceId),
        initialLugarDeParto: d.birthMethodId == null ? '' : String(d.birthMethodId),
        initialSexo: d.sexId == null ? '' : String(d.sexId),
        initialFamiliaresAfectados: d.affectedRelatives == null ? null : d.affectedRelatives ? 1 : 0,
        initialMenoresEnHogar: d.affectedUnderageRelatives,
        initialAdultosEnHogar: d.affectedAdultRelatives,
        initialQuienAfectado: d.affectedRelativesCategoryIds.map(String),
        initialAfectadosComunidad: d.affectedCommunityMembers == null ? null : ({ SI: 1, NO: 0, DESCONOCIDO: 2 } as const)[d.affectedCommunityMembers],
        initialAlertSigns: ficha.warningSigns.map((sign) => ({
            id: sign.signoId, title: sign.signDescription, locked: true,
            imageSrc: sign.imageUrl ?? undefined,
            status: sign.replacedBySignoId ? 'replaced' : 'active',
            chips: [sign.partName, sign.regionName].filter(Boolean),
            parteDelCuerpo: { parteValue: String(sign.partCatalogId), regionValue: String(sign.regionId) },
        })),
        initialExams: ficha.examDiagnoses.map((exam) => ({
            id: exam.examenId, title: exam.examDescription, locked: true,
            imageSrc: exam.examUrl && !isPdfUrl(exam.examUrl) ? exam.examUrl : undefined,
            documentUrl: exam.examUrl ?? undefined,
            status: exam.replacedByExamenId ? 'replaced' : 'active',
        })),
        initialObservaciones: (ficha.observations ?? []).map((observacion) => ({
            id: observacion.observacionId,
            text: observacion.observationText,
            locked: true,
            fecha: fechaCorta(observacion.fechaCreacion),
        })),
    }
}

/** Una revisión envía únicamente altas; los registros originales los copia el servidor. */
export function buildRevisionPayload(
    motivo: string,
    form: Pick<FichaFormState, 'alertSigns' | 'exams'> & Partial<Pick<FichaFormState, 'observaciones'>>,
): RevisionPayload {
    const normalized = motivo.trim()
    if (!normalized || normalized.length > 500) throw new Error('Describa el motivo del cambio (máximo 500 caracteres).')
    const signs = form.alertSigns.filter((item) => !item.locked)
    const exams = form.exams.filter((item) => !item.locked)
    const observations = observacionesParaEnviar((form.observaciones ?? []).filter((item) => !item.locked))
    if (!signs.length && !exams.length && !observations) {
        throw new Error('Agregue al menos un signo de alerta, examen u observación.')
    }
    return {
        motivo: normalized,
        warningSigns: signs.map((item) => {
            const partCatalogId = Number(item.parteDelCuerpo?.parteValue)
            if (!Number.isInteger(partCatalogId) || partCatalogId <= 0) throw new Error('Seleccione una parte del cuerpo válida.')
            return { signDescription: item.title.trim().slice(0, 300), partCatalogId, imageResourceId: item.imageResourceId, replacesSignoId: item.replacesId }
        }),
        examDiagnoses: exams.map((item) => ({ examDescription: item.title.trim().slice(0, 300), examResourceId: item.imageResourceId, replacesExamenId: item.replacesId })),
        ...(observations ? { observations } : {}),
    }
}
