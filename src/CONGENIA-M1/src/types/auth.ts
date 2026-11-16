/**
 * @fileoverview Médico autenticado. 
 */

/**
 * Datos del médico que llegan desde el SADC.
 */
export interface MedicoActivo {
    id: number
    nombre: string
    idEspecialidad: number
    especialidad: string
}