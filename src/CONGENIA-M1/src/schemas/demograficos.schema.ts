/**
 * @fileoverview Schema de validación para Otros Demográficos.
 * @compliance HIPAA 164.312 - integridad de datos clínicos
 */

import { z } from 'zod'

const RespuestaTernariaSchema = z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
], {
    error: () => ({ message: 'Seleccione una opción' }),
})

// Schema de FamiliarAfectado

const FamiliarAfectadoSchema = z.enum([
    'madre', 'padre', 'hermano', 'hermana',
    'abuela_materna', 'abuelo_materno', 'tia_materna', 'tio_materno',
    'prima_materna', 'primo_materno',
    'abuela_paterna', 'abuelo_paterno', 'tia_paterna', 'tio_paterno',
    'prima_paterna', 'primo_paterno',
    'otro_familiar', 'desconoce',
])

// Schema principal

export const DemograficosSchema = z.object({
    familiaresAfectados: RespuestaTernariaSchema,
    menoresEnHogar: z
        .number()
        .int('Debe ser un número entero')
        .min(0, 'No puede ser negativo'),

    adultosEnHogar: z
        .number()
        .int('Debe ser un número entero')
        .min(0, 'No puede ser negativo'),

    quienAfectado: z.array(FamiliarAfectadoSchema),

    afectadosComunidad: RespuestaTernariaSchema,

}).refine(
    (data) => {
        if (data.familiaresAfectados === 1) {
        return data.quienAfectado.length > 0
        }
        return true
    },
    {
        message: 'Seleccione al menos un familiar afectado',
        path: ['quienAfectado'],
    }
)

// Tipo inferido

export type DemograficosFormValues = z.infer<typeof DemograficosSchema>

export function validateDemograficos(data: unknown) {
  return DemograficosSchema.safeParse(data)
}