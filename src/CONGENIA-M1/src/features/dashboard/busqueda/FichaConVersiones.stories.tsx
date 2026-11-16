/**
 * @fileoverview El selector de versiones dentro del visor de la ficha.
 *
 * `FichaDetailPage` no se puede montar aquí tal cual: pide la ficha y el
 * historial al servidor, y el título lo pinta el topbar del dashboard a través
 * de un contexto que solo existe dentro de `DashboardLayout`. Así que la story
 * reproduce esa composición -topbar, selector, ficha en solo lectura- reusando
 * las clases reales de ambos módulos CSS en vez de copiarlas.
 *
 * El selector funciona: cambiar de versión intercambia los signos y los exámenes,
 * que es justo lo que se quiere ver.
 */

import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Undo2 } from 'lucide-react'
import { RegistrationOrchestratorView } from '../../../components/forms/RegistrationOrchestratorView/RegistrationOrchestratorView'
import type { AlertSignItem } from '../../../components/forms/AlertSignsSection/AlertSignsSection'
import type { ExamItem } from '../../../components/forms/ExamsSection/ExamsSection'
import type { FichaSummary } from '../../../services/ficha.service'
import { VersionSelector } from './VersionSelector'
import hero from '../../../assets/hero.png'
import layout from '../layout/DashboardLayout.module.css'
import styles from './FichaDetailPage.module.css'

const PACIENTE = 'Rachel Castro Morales'

/** Nada de esto es real. */
function version(overrides: Partial<FichaSummary> & Pick<FichaSummary, 'fichaId'>): FichaSummary {
    return {
        fichaRaizId: 'raiz-demo',
        revision: 1,
        estado: 'COMPLETA',
        estadoFicha: 'COMPLETA',
        fechaConsulta: '2026-03-12',
        esVigente: false,
        medico: 'Dra. Ana Lucía Morales',
        ...overrides,
    }
}

const TRES_VERSIONES: FichaSummary[] = [
    version({ fichaId: 'v-1', revision: 1, fechaCreacion: '2026-03-12T15:04:00Z' }),
    version({ fichaId: 'v-2', revision: 2, fechaCreacion: '2026-06-03T09:20:00Z' }),
    version({ fichaId: 'v-3', revision: 3, esVigente: true, fechaCreacion: '2026-08-20T11:45:00Z' }),
]

/**
 * Lo que cada versión añadió.
 *
 * Una adenda solo da de alta signos y exámenes -los anteriores los arrastra el
 * servidor-, así que cada versión ve todo lo suyo y lo de las previas.
 */
const SIGNOS: Record<string, AlertSignItem> = {
    'v-1': { id: 'signo-1', title: 'Paladar hendido', imageSrc: hero, chips: ['Labio'], locked: true },
    'v-2': { id: 'signo-2', title: 'Dedo meñique torcido', imageSrc: hero, chips: ['Mano (Izq.)'], locked: true },
    'v-3': { id: 'signo-3', title: 'Pie equino varo', imageSrc: hero, chips: ['Pie (Der.)'], locked: true },
}

const EXAMENES: Record<string, ExamItem> = {
    'v-1': { id: 'examen-1', title: 'Cariotipo (análisis cromosómico)', locked: true },
    'v-2': { id: 'examen-2', title: 'Ecocardiograma', locked: true },
    'v-3': { id: 'examen-3', title: 'Ultrasonido renal', locked: true },
}

/** Lo acumulado hasta esa revisión, inclusive. */
function contenidoDe(versiones: FichaSummary[], fichaId: string) {
    const hasta = versiones.findIndex((item) => item.fichaId === fichaId)
    const previas = versiones.slice(0, hasta + 1).map((item) => item.fichaId)

    return {
        signos: previas.map((id) => SIGNOS[id]).filter(Boolean),
        examenes: previas.map((id) => EXAMENES[id]).filter(Boolean),
    }
}

const FICHA = {
    patientName: PACIENTE,
    numeroExpediente: '00445566777',
    medicoConsulta: 'Dra. Ana Lucía Morales',
    especialidad: 'Genética Clínica',
    diagnosticos: 'Síndrome de Down, malformación de ojos',
    referidoDeOptions: [{ value: 'comadrona', label: 'Comadrona' }],
    lugarDePartoOptions: [{ value: 'hospital_local', label: 'Hospital local' }],
    initialReferidoDe: 'comadrona',
    initialLugarDeParto: 'hospital_local',
    initialFamiliaresAfectados: 1 as const,
    initialMenoresEnHogar: 2,
    initialAdultosEnHogar: 3,
    initialAfectadosComunidad: 1 as const,
}

interface VisorProps {
    versiones: FichaSummary[]
    /** La versión con la que abre la story. */
    inicial: string
    /** Congela la story en la recarga que sigue a elegir otra versión. */
    cargando?: boolean
}

/**
 * La misma composición que arma `FichaDetailPage` dentro del dashboard: el
 * título en el topbar, el selector debajo y la ficha en solo lectura.
 */
function VisorDeFicha({ versiones, inicial, cargando = false }: VisorProps) {
    const [fichaActivaId, setFichaActivaId] = useState(inicial)
    const { signos, examenes } = contenidoDe(versiones, fichaActivaId)
    const activa = versiones.find((item) => item.fichaId === fichaActivaId)

    return (
        // `shell` aporta el fondo y el alto de la pantalla; `main` es la columna
        // que en el dashboard queda a la derecha de la barra lateral.
        <div className={layout.shell}>
            <div className={layout.main}>
                <header className={layout.topbar}>
                    <h1 className={layout.title}>
                        Registro para el Paciente:{' '}
                        <span className={layout.titleHighlight}>{PACIENTE}</span>
                    </h1>
                    <div className={layout.action}>
                        <button
                            type="button"
                            className={styles.backButton}
                            aria-label="Regresar a la búsqueda"
                            title="Regresar a la búsqueda"
                        >
                            <Undo2 size={20} aria-hidden="true" />
                        </button>
                    </div>
                </header>

                <main className={layout.content}>
                    <div className={layout.contentInner}>
                        <VersionSelector
                            versiones={versiones}
                            fichaActivaId={fichaActivaId}
                            onSeleccionar={setFichaActivaId}
                            disabled={cargando}
                        />

                        {cargando ? (
                            <div
                                className={styles.sections}
                                aria-busy="true"
                                aria-label="Cargando la ficha"
                            >
                                {Array.from({ length: 4 }, (_, index) => (
                                    <div key={index} className={styles.skeleton} />
                                ))}
                            </div>
                        ) : (
                            <RegistrationOrchestratorView
                                // Igual que en la página: sin esto el orquestador
                                // se quedaría con los signos de la versión anterior.
                                key={fichaActivaId}
                                readOnly
                                {...FICHA}
                                fechaConsulta={activa?.fechaConsulta ?? ''}
                                initialAlertSigns={signos}
                                initialExams={examenes}
                            />
                        )}
                    </div>
                </main>
            </div>
        </div>
    )
}

const meta: Meta<typeof VisorDeFicha> = {
    title: 'Dashboard/Ficha con versiones',
    component: VisorDeFicha,
    parameters: { layout: 'fullscreen' },
    args: { versiones: TRES_VERSIONES, inicial: 'v-3' },
}

export default meta
type Story = StoryObj<typeof VisorDeFicha>

/**
 * Como se abre una ficha con dos adendas aprobadas: en la vigente.
 *
 * El desplegable lista las tres y se puede cambiar entre ellas; cada versión
 * muestra los signos y exámenes que tenía hasta ese momento.
 */
export const ConTresVersiones: Story = {}

/** Una versión anterior: la vigente sigue marcada como "(actual)". */
export const EnUnaVersionAnterior: Story = {
    args: { inicial: 'v-1' },
}

/** La adenda todavía espera en la bandeja del genetista, así que se avisa. */
export const ConRevisionPendiente: Story = {
    args: {
        versiones: [
            ...TRES_VERSIONES,
            version({ fichaId: 'v-4', revision: 4, estadoFicha: 'PENDIENTE' }),
        ],
    },
}

/**
 * Lo que se ve hoy contra el backend real: sin `fechaCreacion` las versiones se
 * numeran a secas. Ver `PENDIENTES-BACKEND.md`, sección 14.
 */
export const SinFechasDelServidor: Story = {
    args: {
        versiones: TRES_VERSIONES.map((item) => ({ ...item, fechaCreacion: undefined })),
    },
}

/**
 * Lo más común: una ficha sin adendas.
 *
 * No hay desplegable -no hay nada que elegir- y la pantalla queda igual que
 * antes de todo esto.
 */
export const FichaSinAdendas: Story = {
    args: { versiones: [TRES_VERSIONES[0]], inicial: 'v-1' },
}

/**
 * El instante después de elegir otra versión.
 *
 * El selector se queda a la vista y deshabilitado, así que se sigue viendo cuál
 * se pidió mientras llega.
 */
export const CambiandoDeVersion: Story = {
    args: { inicial: 'v-2', cargando: true },
}
