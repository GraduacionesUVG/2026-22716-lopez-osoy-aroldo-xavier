/**
 * @fileoverview Schema de validación para el Consentimiento Informado.
 * @compliance HIPAA 164.508 - consentimiento informado del paciente
 * @compliance ISO 27001 A.18.1 - cumplimiento de requisitos legales
 */

import { z } from 'zod'

// Schema de RelacionFirmante 

const RelacionFirmanteSchema = z.enum([
    'padre',
    'madre',
    'tutor_legal',
], {
    error: () => ({ message: 'Seleccione la relación con el paciente' }),
})

// Schema de DeclaracionConsentimiento 

const DeclaracionSchema = z.object({
    id: z.string(),
    obligatoria: z.boolean(),
    aceptada: z.boolean(),
}).refine(
    (declaracion) => {
        // Si es obligatoria, debe estar aceptada
        if (declaracion.obligatoria) {
        return declaracion.aceptada === true
        }
        // Si es opcional, cualquier valor es válido
        return true
    },
    {
        message: 'Debe aceptar esta declaración para continuar',
        path: ['aceptada'],
    }
)

// Schema de DatosFirmante 

const DatosFirmanteSchema = z.object({
    nombreCompleto: z
        .string()
        .min(3, 'El nombre debe tener al menos 3 caracteres')
        .max(200, 'El nombre es demasiado largo')
        .trim(),

    relacion: RelacionFirmanteSchema,
})

// Schema principal 

export const ConsentimientoSchema = z.object({
  declaraciones: z
    .array(DeclaracionSchema)
    .min(2, 'Debe haber al menos dos declaraciones'),

  firmante: DatosFirmanteSchema,
  firmaBase64: z
    .string()
    .min(100, 'La firma no puede estar vacía - dibuje su firma'),
})

// Tipo inferido 

export type ConsentimientoFormValues = z.infer<typeof ConsentimientoSchema>

export function validateConsentimiento(data: unknown) {
  return ConsentimientoSchema.safeParse(data)
}