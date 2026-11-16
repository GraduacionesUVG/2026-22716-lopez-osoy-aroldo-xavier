/**
 * @fileoverview Schema de validación para Estudios de Gabinete Indicados.
 * @compliance HIPAA 164.312 - integridad de datos clínicos
 */

import { z } from 'zod'

export const EstudioIndicadoSchema = z.object({
    id: z.uuid(),
    nombre: z
        .string()
        .min(3, 'El nombre del estudio debe tener al menos 3 caracteres')
        .max(300, 'El nombre es demasiado largo')
        .trim(),

    nombreArchivo: z
        .string()
        .trim()
        .optional(),

    imagenBase64: z
        .string()
        .optional(),

}).refine(
    (data) => {
        if (data.imagenBase64) {
        return !!data.nombreArchivo && data.nombreArchivo.length > 0
        }
        return true
    },
    {
        message: 'Debe agregar un nombre al archivo de imagen',
        path: ['nombreArchivo'],
    }
)

export type EstudioIndicadoFormValues = z.infer<typeof EstudioIndicadoSchema>
export const EstudiosIndicadosListSchema = z.array(EstudioIndicadoSchema)

export function validateEstudiosIndicados(data: unknown) {
  return EstudiosIndicadosListSchema.safeParse(data)
}