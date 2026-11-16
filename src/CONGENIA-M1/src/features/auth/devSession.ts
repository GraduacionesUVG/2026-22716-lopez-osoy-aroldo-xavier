/**
 * @fileoverview Sesion de desarrollo: trabajar sin Keycloak ni SADC levantados.
 *
 * Un solo interruptor para toda la app. Antes habia dos con reglas distintas:
 * la ficha se abria falsa con cualquier `APP_ENV=development` y el dashboard
 * solo con el flag. Ahora las dos mitades piden lo mismo: el flag explicito o el
 * entorno de pruebas.
 */

import type { User } from 'oidc-client-ts'
import type { SessionActivateResponse } from '../../services/session.service'
import type { Access } from './permissions'
import { ALLOW_DEV_SESSION as ALLOW_DEV_SESSION_FLAG, APP_ENV } from '../../config/runtime'

export const ALLOW_DEV_SESSION = ['1', 'true', 'yes', 'on']
    .includes(ALLOW_DEV_SESSION_FLAG.trim().toLowerCase())
    || APP_ENV.trim().toLowerCase() === 'test'

/** Medico de mentira para el dashboard. */
export const DEV_USER = {
    profile: {
        name: 'Dr. Marco Paez',
        especialidad: 'Genetista',
    },
} as unknown as User

/**
 * Permisos de `DEV_USER`. Sin Keycloak no hay `/me` que los calcule; con todos,
 * cada pantalla se puede abrir en desarrollo. Esto no afloja nada en
 * produccion: alli `ALLOW_DEV_SESSION` esta apagado, los permisos salen de
 * `/me` y de todos modos quien decide el acceso es el servidor.
 *
 * @compliance ISO 27001 A.9.4.1 - el cliente solo refleja la decision del servidor
 */
export const DEV_ACCESS: Access = {
    permissions: new Set(['dashboard', 'fichas.crear', 'adendas.revisar', 'cie10.corregir', 'reporteria']),
    roleLabel: 'Superadministrador',
    tenants: [],
}

/** Ficha de mentira para la captura en `/`, como si llegara de SADC. */
export const DEV_FICHA_SESSION: SessionActivateResponse = {
    fichaId:        '00000000-0000-4000-8000-000000000001',
    sessionId:      '00000000-0000-4000-8000-000000000002',
    origenCreacion: 'INTEGRACION',
    alreadyActive:  false,
    paciente: {
        patientId:       'dev-patient-001',
        externalId:      'EXP-DEV-001',
        nombre:          'Juan Alberto Perez Garcia',
    },
    consulta: {
        fechaConsulta:    '2023-06-21',
        diagnosticoTexto: 'Paladar hendido',
    },
    medico: {
        medicoId:    '00000000-0000-4000-8000-000000000003',
        medicoExtId: 'dev-medico-001',
        nombre:      'Dr. Nicolas Castro',
        especialidad: 'Genética Clínica',
    },
}
