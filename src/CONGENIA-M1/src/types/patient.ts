/**
 * @fileoverview Tipos del paciente.
 */

/**
 * Datos del paciente del contrato SADC.
 */
export interface Paciente {
    id: number
    idTenant: number
    nombreCompleto: string
    historiaClinica: string
}