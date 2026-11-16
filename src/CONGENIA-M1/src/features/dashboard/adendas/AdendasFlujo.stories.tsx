/**
 * @fileoverview El flujo de corrección de adendas, navegable de verdad.
 *
 * A diferencia de `AdendasView.stories`, que monta la vista tonta con datos
 * fijos, aquí se montan las páginas completas dentro de un `MemoryRouter` con la
 * barra lateral del dashboard. Se puede recorrer el camino entero: cambiar de
 * tab, buscar, entrar a una adenda, decidir cambio por cambio y guardar.
 *
 * Los datos salen de `adendas.mock.ts`. Storybook no sirve `public/`, así que
 * `/config.js` no se carga, `APP_ENV` queda en `development` y el mock se
 * enciende solo - no hay nada que configurar.
 *
 * Dos cosas que conviene saber al recorrerlo:
 *
 *  - **El mock guarda estado en memoria.** Al resolver una adenda cambia de tab
 *    de verdad y ya no se puede volver a resolver. Para empezar de cero, recarga
 *    la página de Storybook.
 *  - **Los catálogos no cargan**, porque no hay backend detrás. La ficha lo
 *    avisa en ámbar y sigue: "Referido de" y "Lugar de parto" se ven en blanco y
 *    el resto está completo. Es la degradación que la pantalla hace a propósito,
 *    no un fallo de la story.
 */

import type { Meta, StoryObj } from '@storybook/react-vite'
import type { User } from 'oidc-client-ts'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext, type AuthContextValue } from '../../auth/AuthContext'
import type { Access } from '../../auth/permissions'
import { DashboardLayout } from '../layout/DashboardLayout'
import { AdendasPage } from './AdendasPage'
import { AdendaReviewPage } from './AdendaReviewPage'

const revisora = {
    profile: {
        name: 'Dra. Ana Gómez',
        especialidad: 'Genetista',
    },
} as unknown as User

/**
 * La bandeja exige `adendas.revisar`: sin ese permiso solo se vería el aviso
 * de sección sin permiso.
 */
const access: Access = { permissions: new Set(['dashboard', 'fichas.crear', 'adendas.revisar', 'reporteria']), roleLabel: 'Genetista', tenants: [] }

const auth: AuthContextValue = {
    state: { status: 'authenticated', user: revisora, access },
    signIn: () => undefined,
    logout: () => undefined,
    returnPath: null,
    consumeReturnPath: () => undefined,
}

function FlujoAdendas({ path }: { path: string }) {
    return (
        <AuthContext.Provider value={auth}>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route path="/dashboard" element={<DashboardLayout />}>
                        <Route path="adendas" element={<AdendasPage />} />
                        <Route path="adendas/:fichaId" element={<AdendaReviewPage />} />
                    </Route>
                </Routes>
            </MemoryRouter>
        </AuthContext.Provider>
    )
}

const meta: Meta<typeof FlujoAdendas> = {
    title: 'Flujos/Corrección de adendas',
    component: FlujoAdendas,
    parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj<typeof FlujoAdendas>

/**
 * El punto de entrada: la bandeja con lo que falta por revisar.
 *
 * Desde aquí sale todo el recorrido. Pulsa "Ver registro" en Rachel Castro
 * Morales para entrar a una adenda de cuatro cambios.
 *
 * Cosas que probar:
 *  - Cambiar entre los tres tabs. El badge de cada card cambia de color y el
 *    tab queda en la URL, así que el atrás del navegador lo recupera.
 *  - Buscar `castro` (nombre), `00445566778` (historia clínica) o `lucia`
 *    (pediatra): el mismo campo busca en los tres.
 *  - Buscar `Cast` no devuelve nada, y es correcto: el nombre del paciente va
 *    cifrado y se resuelve contra un índice de palabras completas.
 *  - El badge de estado es lo unico que distingue una rechazada de una aprobada:
 *    el rechazo no lleva explicacion escrita.
 */
export const Bandeja: Story = {
    args: { path: '/dashboard/adendas' },
}

/**
 * Revisión de una adenda con **cuatro cambios**: dos signos sustituidos, un
 * examen nuevo y una observación nueva.
 *
 * Es la pantalla que más hay que mirar:
 *  - Pulsa cualquiera de las dos vistas previas del panel izquierdo y la ficha
 *    de la derecha salta a esa tarjeta y la resalta un instante.
 *  - Aceptar o rechazar pasa solo al siguiente cambio, y los puntos de abajo se
 *    van pintando de verde o rojo según lo decidido. Las flechas sirven para
 *    volver sobre uno ya decidido y cambiarlo.
 *  - "Guardar cambios", arriba, sigue bloqueado hasta que los cuatro estén
 *    decididos.
 *  - En la ficha, lo que se sustituye lleva el badge rojo CAMBIADA y el resto
 *    ACTIVA.
 *  - Al guardar con unos aceptados y otros rechazados, vuelve a la bandeja en el
 *    tab que corresponde con el resumen de lo aplicado.
 */
export const RevisionConVariosCambios: Story = {
    args: { path: '/dashboard/adendas/ad-001' },
}

/** Con un solo cambio no hay nada entre lo que navegar: las flechas y los puntos desaparecen. */
export const RevisionDeUnSoloCambio: Story = {
    args: { path: '/dashboard/adendas/ad-002' },
}

/**
 * Un alta que no sustituye nada -información nueva, no una corrección- se pinta
 * sin el bloque "Anterior" y lo dice con todas las letras.
 */
export const AltaSinSustitucion: Story = {
    args: { path: '/dashboard/adendas/ad-003' },
}

/**
 * Una adenda ya resuelta se abre solo para consulta: el panel queda
 * deshabilitado y se explica por qué.
 */
export const AdendaYaAprobada: Story = {
    args: { path: '/dashboard/adendas/ad-004' },
}

/** Una rechazada se abre igual que una aprobada: solo para consulta. */
export const AdendaRechazada: Story = {
    args: { path: '/dashboard/adendas/ad-006' },
}
