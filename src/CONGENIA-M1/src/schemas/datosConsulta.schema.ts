/**
 * @fileoverview Schema de validación para la sección Datos de la Consulta.
 * Solo valida los campos que llena el médico 
 *
 * @compliance HIPAA 164.312 - integridad de datos clínicos
 */

import { z } from 'zod'

// z.enum() toma exactamente el mismo catálogo que el tipo en ficha.ts
// Si el valor no está en la lista, Zod rechaza con mensaje de error

const ReferidoDeSchema = z.enum([
    'medico_general',
    'pediatra',
    'neonatologo',
    'genetista',
    'otro',
    'ninguno',
], {
    error: () => ({ message: 'Seleccione quién refirió al paciente' }),
})

const LugarDePartoSchema = z.enum([
    'medico',
    'comadrona',
    'familiar',
    'solo',
    'otro',
], {
    error: () => ({ message: 'Seleccione el tipo de asistencia al parto' }),
})

// Schema principal 

export const DatosConsultaSchema = z.object({
    especialidad: z
        .string()
        .min(5, 'La especialidad es requerida'),
    referidoDe: ReferidoDeSchema,
    lugarDeParto: LugarDePartoSchema,
    // Id del catálogo /v1/Sexos: las opciones vienen del backend, no hay enum fijo
    sexo: z.string().min(1, 'Seleccione el sexo del paciente'),
})

// Tipo inferido 

export type DatosConsultaFormValues = z.infer<typeof DatosConsultaSchema>

/**
 * Función helper para validar los datos de la consulta.
 */
export function validateDatosConsulta(data: unknown) {
    return DatosConsultaSchema.safeParse(data)
}