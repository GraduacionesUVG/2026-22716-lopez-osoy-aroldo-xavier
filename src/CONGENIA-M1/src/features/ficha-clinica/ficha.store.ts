/**
 * @fileoverview Store global de la ficha clínica en curso.
 *
 * Mantiene el estado del formulario en memoria mientras el médico llena la ficha.
 * La persistencia (borrador / finalizado) se delega al backend via HTTP
 */

import { create } from 'zustand'
import { buildFichaClinica, type SadcContext, type FichaFormState } from './fichaClinica.mapper'
import type { FichaClinica } from '../../types/ficha'

const EMPTY_FORM: FichaFormState = {
    referidoDe:          '',
    lugarDeParto:        '',
    sexo:                '',
    familiaresAfectados: null,
    menoresEnHogar:      0,
    adultosEnHogar:      0,
    quienAfectado:       [],
    afectadosComunidad:  null,
    alertSigns:          [],
    exams:               [],
    observaciones:       [],
    consentValues:       {},
    signatureData:       null,
    signerName:          '',
    signerRelation:      'Madre',
}

interface FichaStore {
    sadcContext: SadcContext | null
    formState:   FichaFormState
    isDirty:     boolean

    // Inicializa el contexto SADC al abrir la ficha de un paciente 
    setSadcContext: (ctx: SadcContext) => void

    // Actualiza uno o más campos del formulario y marca isDirty 
    updateFormState: (patch: Partial<FichaFormState>) => void

    // Resetea el formulario (al cerrar la ficha o tras finalizar el registro)
    resetForm: () => void

    /// Construye el objeto FichaClinica listo para enviar al backend
    // Retorna null si el contexto SADC no está inicializado
    
    buildFicha: (estado?: 'borrador' | 'finalizado') => FichaClinica | null
}

export const useFichaStore = create<FichaStore>((set, get) => ({
    sadcContext: null,
    formState:   EMPTY_FORM,
    isDirty:     false,

    setSadcContext: (ctx) => {
        set({ sadcContext: ctx, isDirty: false })
    },

    updateFormState: (patch) => {
        set((prev) => ({
            formState: { ...prev.formState, ...patch },
            isDirty: true,
        }))
    },

    resetForm: () => {
        set({ formState: EMPTY_FORM, isDirty: false })
    },

    buildFicha: (estado = 'borrador') => {
        const { sadcContext, formState } = get()
        if (!sadcContext) return null
        return buildFichaClinica(sadcContext, formState, estado)
    },
}))
