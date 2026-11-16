/**
 * @fileoverview Schema de validación para Signos de Alerta.
 *
 * @compliance HIPAA 164.312 - integridad de datos clínicos
 */

import { z } from 'zod'

const RegionAnatomicaValues = [
    'cabeza_cuello',
    'tronco',
    'extremidades_superiores',
    'extremidades_inferiores',
    'genitales_perine',
    'general_otro',
] as const

const LateralidadValues = ['izquierda', 'derecha', 'bilateral'] as const

const ParteSeleccionadaSchema = z.object({
    regionValue: z.enum(RegionAnatomicaValues, { error: 'Región anatómica inválida' }),
    parteValue: z.string().min(1, 'Parte del cuerpo requerida'),
    lateralidad: z.enum(LateralidadValues).optional(),
})

export const SignoAlertaSchema = z.object({
    id: z.uuid(),
    nombre: z
        .string()
        .min(3, 'El nombre debe tener al menos 3 caracteres')
        .max(200, 'El nombre es demasiado largo')
        .trim(),
    parteDelCuerpo: ParteSeleccionadaSchema,
    imagenBase64: z
        .string()
        .min(100, 'La imagen es requerida - tome una foto del hallazgo'),
    nombreArchivo: z
        .string()
        .min(1, 'El nombre del archivo es requerido')
        .trim(),
})

export type SignoAlertaFormValues = z.infer<typeof SignoAlertaSchema>
export type ParteSeleccionada = z.infer<typeof ParteSeleccionadaSchema>
export const SignosAlertaListSchema = z.array(SignoAlertaSchema)

export function validateSignosAlerta(data: unknown) {
    return SignosAlertaListSchema.safeParse(data)
}
