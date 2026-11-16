/**
 * @fileoverview Vista orquestadora del registro
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowLeft } from 'lucide-react'
import styles from './RegistrationOrchestratorView.module.css'
import logoC from '../../../assets/C.png'
import logoOngenia from '../../../assets/Ongenia.png'
import { Button } from '../../ui/Button/Button'
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog'
import { AppointmentDataView } from '../AppointmentDataView/ApointmentDataView'
import { DemographicDataView } from '../DemographicDataView/DemographicDataView'
import { demographicProgress } from '../DemographicDataView/demographicProgress'
import { AlertSignsSection, type AlertSignItem } from '../AlertSignsSection/AlertSignsSection'
import { ExamsSection, type ExamItem } from '../ExamsSection/ExamsSection'
import { ObservationsSection, type ObservacionItem } from '../ObservationsSection/ObservationsSection'
import { InformedConsentView } from '../InformedConsentView/InformedConsentView'
import { consentContent } from '../InformedConsentView/InformedConsentContent'
import type { DropdownOption } from '../../ui/Dropdown/Dropdown'
import type { FamiliarAfectadoGroup } from '../DemographicDataView/DemographicDataView'
import type { RegionDef } from '../AlertSignsSection/AlertSignsSection'
import type { RespuestaTernaria, FichaClinica } from '../../../types/ficha'
import { buildFichaClinica, type SadcContext, type FichaFormState } from '../../../features/ficha-clinica/fichaClinica.mapper'

import { SECTION_LABELS, fichaSectionAnchorId, type SectionKey } from '../anchors'
import { InlineNotice } from '../../ui/InlineNotice/InlineNotice'

/**
 * Punto de partida del acordeon: al abrir una seccion se parte de aqui y solo esa
 * queda abierta.
 *
 * Escrito campo por campo y no derivado de las llaves: si SectionKey crece, esto deja
 * de compilar y obliga a decidir si la seccion nueva entra en el acordeon.
 */
const SECCIONES_CERRADAS: Record<SectionKey, boolean> = {
    appointment: false,
    demographic: false,
    alerts: false,
    exams: false,
    observations: false,
    consent: false,
}

export type FaseAdenda = 'lectura' | 'captura'

/** Sustituye a los avisos de la ficha mientras se captura: ya no se lee, se agrega. */
const AVISO_CAPTURA_ADENDA =
    'Nueva adenda: agregue signos de alerta, estudios u observaciones. Lo ya registrado no se modifica.'

export interface HeaderNotice {
    text: string
    /**
     * Ambos tonos ámbar piden atención, pero por motivos distintos:
     * 'pending' hay algo esperando resolución, 'action' hay algo que el médico puede
     * hacer aquí mismo. 'info' es el aviso neutro.
     */
    tone?: 'info' | 'pending' | 'action'
}

export interface RegistrationOrchestratorViewProps {
    patientName: string
    numeroExpediente: string
    fechaConsulta: string
    medicoConsulta: string
    /** El consentimiento copiado conserva al médico que recibió la firma original. */
    consentDoctorName?: string
    /** Sello de aceptacion del servidor. Vacio mientras la ficha no se guarda. */
    selloDeTiempo?: string
    especialidad: string
    diagnosticos: string
    referidoDeOptions?: DropdownOption[]
    lugarDePartoOptions?: DropdownOption[]
    sexoOptions?: DropdownOption[]
    familiarAfectadoGroups?: FamiliarAfectadoGroup[]
    regionDefs?: RegionDef[]
    initialAlertSigns?: AlertSignItem[]
    initialExams?: ExamItem[]
    initialObservaciones?: ObservacionItem[]
    initialReferidoDe?: string
    initialLugarDeParto?: string
    initialSexo?: string
    initialFamiliaresAfectados?: RespuestaTernaria | null
    initialMenoresEnHogar?: number
    initialAdultosEnHogar?: number
    initialQuienAfectado?: string[]
    initialAfectadosComunidad?: RespuestaTernaria | null
    initialConsentValues?: Record<string, boolean>
    initialSignatureData?: string | null
    initialSignerName?: string
    initialSignerRelation?: string
    initialOpenSection?: SectionKey
    /** Avisos fijos bajo el nombre del paciente. Solo aplican a una ficha ya registrada. */
    headerNotices?: HeaderNotice[]
    showValidation?: boolean
    /**
     * Modo consulta: la ficha se muestra entera pero no se puede tocar.
     *
     * Además de bloquear los controles, quita todo lo que solo tiene sentido
     * capturando -barra de progreso, botón de finalizar, aviso de salida- y
     * omite el consentimiento: quien consulta una ficha desde el dashboard no
     * necesita la firma, y lo que no se muestra no hace falta pedirlo.
     */
    readOnly?: boolean
    /**
     * Elemento de la ficha al que otra pantalla acaba de saltar.
     *
     * Lo usa la revision de adendas: su panel de cambios trae la card a la vista
     * y esto la realza para que el revisor la localice sin buscarla.
     */
    highlightedItemId?: string
    mode?: 'create' | 'view' | 'append'
    /**
     * Solo con `mode="append"`. La adenda va en dos pasos: primero la ficha en
     * lectura con "Solicitar adenda", y al pulsarlo la captura, con solo las
     * secciones que admiten altas. Juntos en una pantalla, los medicos no veian
     * como se iniciaba una adenda. Por defecto arranca en la lectura.
     */
    initialFaseAdenda?: FaseAdenda
    uploadPacienteId?: string
    onRequestChanges?: (motivo: string, formState: FichaFormState) => Promise<void>
    onBack?: () => void
    sadcContext?: SadcContext
    onSaveDraft?: (ficha: FichaClinica) => void
    onFinalize?: (ficha: FichaClinica, formState: FichaFormState) => void
    /** true mientras el POST /v1/patient está en vuelo */
    isSubmitting?: boolean
    /** Resultado del envío - null mientras no se ha intentado */
    submitResult?: { ok: true; fichaId: string; savedAt: string } | { ok: false; errorMessage: string } | null
}

const defaultReferidoOptions: DropdownOption[] = [
    { value: 'primer_nivel_salud', label: 'Primer nivel de salud' },
    { value: 'comadrona', label: 'Comadrona' },
    { value: 'medico_privado', label: 'Médico privado' },
]

const defaultLugarPartoOptions: DropdownOption[] = [
    { value: 'comadrona', label: 'Comadrona' },
    { value: 'primer_nivel', label: 'Primer nivel' },
    { value: 'segundo_nivel', label: 'Segundo nivel' },
    { value: 'hospital_local', label: 'Hospital local' },
]

const defaultSexoOptions: DropdownOption[] = [
    { value: '1', label: 'Masculino' },
    { value: '2', label: 'Femenino' },
    { value: '3', label: 'Indeterminado' },
]

const defaultFamiliarGroups: FamiliarAfectadoGroup[] = [
    {
        groupLabel: 'Nucleo familiar',
        options: [
            { value: 'madre', label: 'Madre' },
            { value: 'padre', label: 'Padre' },
            { value: 'hermano', label: 'Hermano(a)' },
            { value: 'hermana', label: 'Hermana' },
        ],
    },
    {
        groupLabel: 'Familia materna',
        options: [
            { value: 'abuela_materna', label: 'Abuela materna' },
            { value: 'abuelo_materno', label: 'Abuelo materno' },
            { value: 'tia_materna', label: 'Tia materna' },
            { value: 'tio_materno', label: 'Tio materno' },
            { value: 'prima_materna', label: 'Prima materna' },
            { value: 'primo_materno', label: 'Primo materno' },
            { value: 'otro_familiar', label: 'Otro familiar' },
        ],
    },
    {
        groupLabel: 'Familia paterna',
        options: [
            { value: 'abuela_paterna', label: 'Abuela paterna' },
            { value: 'abuelo_paterno', label: 'Abuelo paterno' },
            { value: 'tia_paterna', label: 'Tia paterna' },
            { value: 'tio_paterno', label: 'Tio paterno' },
            { value: 'prima_paterna', label: 'Prima paterna' },
            { value: 'primo_paterno', label: 'Primo paterno' },
            { value: 'otro_familiar', label: 'Otro familiar' },
        ],
    }
]

const defaultAlertSigns: AlertSignItem[] = [
    {
        id: 'alert-1',
        title: 'Dedo menique torcido',
        chips: ['Mano izq.'],
    },
    {
        id: 'alert-2',
        title: 'Paladar Hendido',
        chips: ['Cara'],
    },
]

const defaultExams: ExamItem[] = [
    {
        id: 'exam-1',
        title: 'Cariotipo (analisis cromosomico)',
    },
]

export function RegistrationOrchestratorView({
    patientName,
    numeroExpediente,
    fechaConsulta,
    medicoConsulta,
    consentDoctorName,
    selloDeTiempo = '',
    especialidad,
    diagnosticos,
    referidoDeOptions = defaultReferidoOptions,
    lugarDePartoOptions = defaultLugarPartoOptions,
    sexoOptions = defaultSexoOptions,
    familiarAfectadoGroups = defaultFamiliarGroups,
    regionDefs,
    initialAlertSigns = defaultAlertSigns,
    initialExams = defaultExams,
    initialObservaciones = [],
    initialReferidoDe = '',
    initialLugarDeParto = '',
    initialSexo = '',
    initialFamiliaresAfectados = null,
    initialMenoresEnHogar = 0,
    initialAdultosEnHogar = 0,
    initialQuienAfectado = [],
    initialAfectadosComunidad = null,
    initialConsentValues = {},
    initialSignatureData = null,
    initialSignerName = '',
    initialSignerRelation = 'Madre',
    initialOpenSection = 'appointment',
    headerNotices = [],
    showValidation = false,
    readOnly = false,
    highlightedItemId,
    mode = 'create',
    initialFaseAdenda = 'lectura',
    uploadPacienteId,
    onRequestChanges,
    onBack,
    sadcContext,
    onFinalize,
    isSubmitting = false,
    submitResult = null,
}: RegistrationOrchestratorViewProps) {
    const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(() =>
        // La captura de una adenda muestra abiertas las tres secciones que admiten altas.
        mode === 'append' && initialFaseAdenda === 'captura'
            ? { ...SECCIONES_CERRADAS, alerts: true, exams: true, observations: true }
            : {
                appointment: readOnly || initialOpenSection === 'appointment',
                demographic: readOnly || initialOpenSection === 'demographic',
                alerts: readOnly || initialOpenSection === 'alerts',
                exams: readOnly || initialOpenSection === 'exams',
                observations: readOnly || initialOpenSection === 'observations',
                consent: !readOnly && initialOpenSection === 'consent',
            })

    const [referidoDe, setReferidoDe] = useState<string>(initialReferidoDe)
    const [lugarDeParto, setLugarDeParto] = useState<string>(initialLugarDeParto)
    const [sexo, setSexo] = useState<string>(initialSexo)

    const [familiaresAfectados, setFamiliaresAfectados] = useState<RespuestaTernaria | null>(initialFamiliaresAfectados)
    const [menoresEnHogar, setMenoresEnHogar] = useState<number>(initialMenoresEnHogar)
    const [adultosEnHogar, setAdultosEnHogar] = useState<number>(initialAdultosEnHogar)
    const [quienAfectado, setQuienAfectado] = useState<string[]>(initialQuienAfectado)
    const [afectadosComunidad, setAfectadosComunidad] = useState<RespuestaTernaria | null>(initialAfectadosComunidad)

    const [alertSigns, setAlertSigns] = useState<AlertSignItem[]>(() => initialAlertSigns.map((item) => ({ ...item, locked: mode !== 'create' || item.locked })))
    const [exams, setExams] = useState<ExamItem[]>(() => initialExams.map((item) => ({ ...item, locked: mode !== 'create' || item.locked })))
    const [observaciones, setObservaciones] = useState<ObservacionItem[]>(() => initialObservaciones.map((item) => ({ ...item, locked: mode !== 'create' || item.locked })))

    const [consentValues, setConsentValues] = useState<Record<string, boolean>>(initialConsentValues)
    const [signatureData, setSignatureData] = useState<string | null>(initialSignatureData)
    const [signerName, setSignerName] = useState(initialSignerName)
    const [signerRelation, setSignerRelation] = useState(initialSignerRelation)

    // El medico pulso "Finalizar" con algo incompleto. Enciende los errores por
    // campo que las secciones ya sabian pintar pero que nadie activaba nunca.
    const [intentoFinalizar, setIntentoFinalizar] = useState(false)
    const [seccionResaltada, setSeccionResaltada] = useState<SectionKey | null>(null)

    // El alto real de la cabecera pegajosa, para que las cabeceras de seccion se peguen
    // justo debajo y el scrollIntoView no las deje tapadas. Se mide en vez de fijarse
    // porque cambia con el modo -la barra de % solo sale en alta- y con el aviso, que
    // ocupa una o dos lineas segun el ancho.
    const stickyHeaderRef = useRef<HTMLDivElement>(null)
    const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0)

    const [showExitConfirm, setShowExitConfirm] = useState(false)
    const [showReason, setShowReason] = useState(false)
    const [motivo, setMotivo] = useState('')
    const [revisionError, setRevisionError] = useState('')
    const [revisionSubmitting, setRevisionSubmitting] = useState(false)
    const [revisionSent, setRevisionSent] = useState(false)
    const [faseAdenda, setFaseAdenda] = useState<FaseAdenda>(initialFaseAdenda)
    const [showDescartarAdenda, setShowDescartarAdenda] = useState(false)
    const enLecturaAdenda = mode === 'append' && faseAdenda === 'lectura'
    const enCapturaAdenda = mode === 'append' && faseAdenda === 'captura'
    // La lectura de una adenda se comporta como la consulta: nada se agrega todavia.
    const viewing = readOnly || mode === 'view' || enLecturaAdenda
    const fixedSections = viewing || mode === 'append' || submitResult?.ok === true
    const hasNewItems = alertSigns.some((item) => !item.locked)
        || exams.some((item) => !item.locked)
        || observaciones.some((item) => !item.locked)

    const hasUnsavedWork = !viewing && !revisionSent && (
        referidoDe          !== initialReferidoDe ||
        lugarDeParto        !== initialLugarDeParto ||
        sexo                !== initialSexo ||
        familiaresAfectados !== initialFamiliaresAfectados ||
        menoresEnHogar      !== initialMenoresEnHogar ||
        adultosEnHogar      !== initialAdultosEnHogar ||
        afectadosComunidad  !== initialAfectadosComunidad ||
        signatureData       !== initialSignatureData ||
        quienAfectado.length !== initialQuienAfectado.length ||
        alertSigns.length    !== initialAlertSigns.length ||
        exams.length         !== initialExams.length ||
        observaciones.length !== initialObservaciones.length ||
        signerName !== initialSignerName ||
        signerRelation !== initialSignerRelation ||
        JSON.stringify(consentValues) !== JSON.stringify(initialConsentValues))

    useEffect(() => {
        if (readOnly || !hasUnsavedWork || submitResult?.ok === true) return

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault()
        }

        window.addEventListener('beforeunload', handleBeforeUnload)
        return () => window.removeEventListener('beforeunload', handleBeforeUnload)
    }, [readOnly, hasUnsavedWork, submitResult?.ok])

    useEffect(() => {
        const header = stickyHeaderRef.current
        if (!header) return

        const medir = () => setStickyHeaderHeight(header.getBoundingClientRect().height)
        medir()
        const observer = new ResizeObserver(medir)
        observer.observe(header)
        return () => observer.disconnect()
        // En solo lectura la cabecera no se monta: el efecto vuelve a correr cuando
        // aparece o desaparece para no quedarse midiendo un nodo que ya no esta.
    }, [readOnly])

    const claseSeccion = (key: SectionKey) =>
        seccionResaltada === key ? styles.sectionHighlighted : undefined

    /** Trae la seccion a la vista tras el repintado: acaba de abrirse y su alto cambio. */
    const traerALaVista = useCallback((key: SectionKey) => {
        requestAnimationFrame(() => {
            document.getElementById(fichaSectionAnchorId(key))
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
    }, [])

    /**
     * En captura solo una seccion queda abierta: abrir una cierra la anterior.
     *
     * Asi la cabecera pegajosa siempre habla de lo que el medico esta llenando, y no
     * hay dos contadores a la vista compitiendo por decir cuanto falta. Cerrar la que
     * ya estaba abierta sigue siendo cerrar y nada mas.
     *
     * En solo lectura no aplica: ahi la ficha se lee entera y cerrar una seccion al
     * abrir otra obligaria a ir y volver para comparar dos.
     */
    const toggleSection = (key: SectionKey) => {
        const abriendo = !openSections[key]

        setOpenSections((prev) => (readOnly || !abriendo)
            ? { ...prev, [key]: abriendo }
            : { ...SECCIONES_CERRADAS, [key]: true })

        // Al cerrarse la seccion de arriba el contenido encoge y la recien abierta se
        // subiria sola, dejando al medico mirando otra parte de la pantalla.
        if (abriendo && !readOnly) traerALaVista(key)
    }

    const appointmentComplete = Boolean(referidoDe && lugarDeParto && sexo)

    // El mismo calculo que pinta la cabecera de la seccion, para que el porcentaje
    // de aqui arriba y el "x/y" de alla abajo no puedan discrepar.
    const progresoDemografico = useMemo(() => demographicProgress({
        familiaresAfectados,
        menoresEnHogar,
        adultosEnHogar,
        quienAfectado,
        afectadosComunidad,
    }), [
        familiaresAfectados,
        menoresEnHogar,
        adultosEnHogar,
        quienAfectado,
        afectadosComunidad,
    ])

    const demographicComplete = progresoDemografico.filledCount === progresoDemografico.progressTotal

    const requiredConsentIds = useMemo(
        () => consentContent.consentCards.filter((card) => card.required).map((card) => card.id),
        []
    )
    const requiredConsentsChecked = requiredConsentIds.every((id) => consentValues[id])
    const consentComplete = requiredConsentsChecked && signerName.trim().length > 0 && Boolean(signatureData)

    const completionCount = [appointmentComplete, demographicComplete, consentComplete].filter(Boolean).length
    const completionPercent = Math.round((completionCount / 3) * 100)
    const isAllComplete = completionCount === 3

    // En el orden en que aparecen en pantalla: al saltar, se va a la primera que
    // falta, que es la que el medico encuentra antes si baja a mano.
    const seccionesFaltantes = ([
        ['appointment', appointmentComplete],
        ['demographic', demographicComplete],
        ['consent',     consentComplete],
    ] as const)
        .filter(([, completa]) => !completa)
        .map(([key]) => key)

    const mostrarValidacion = showValidation || intentoFinalizar

    /** Abre la seccion, la realza y la trae a la vista. Cierra las demas, como el acordeon. */
    const saltarASeccion = (key: SectionKey) => {
        setOpenSections((prev) => readOnly
            ? { ...prev, [key]: true }
            : { ...SECCIONES_CERRADAS, [key]: true })
        setSeccionResaltada(key)
    }

    // El scroll espera al repintado porque la seccion acaba de abrirse y su alto
    // cambio. El realce se apaga solo: es una senal de "es aqui", no un estado que
    // el medico tenga que quitar. Mismo criterio que AdendaReviewPage.
    useEffect(() => {
        if (!seccionResaltada) return
        const frame = requestAnimationFrame(() => {
            document.getElementById(fichaSectionAnchorId(seccionResaltada))
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
        const timeout = window.setTimeout(() => setSeccionResaltada(null), 2600)
        return () => {
            cancelAnimationFrame(frame)
            window.clearTimeout(timeout)
        }
    }, [seccionResaltada])

    const buildSadcContext = (): SadcContext =>
        sadcContext ?? {
            idConsulta:    0,
            idTenant:      0,
            fechaConsulta,
            especialidad,
            diagnosticos:  diagnosticos ? [{ id: 0, nombre: diagnosticos }] : [],
        }

    const collectFormState = () => ({
        referidoDe,
        lugarDeParto,
        sexo,
        familiaresAfectados,
        menoresEnHogar,
        adultosEnHogar,
        quienAfectado,
        afectadosComunidad,
        alertSigns,
        exams,
        observaciones,
        consentValues,
        signatureData,
        signerName,
        signerRelation,
    })

    // const handleSaveDraft = () => {
    //     const ficha = buildFichaClinica(buildSadcContext(), collectFormState(), 'borrador')
    //     onSaveDraft?.(ficha)
    // }

    const handleFinalize = () => {
        if (viewing) return
        if (mode === 'append') {
            // Sin altas no hay nada que solicitar. Antes el boton solo se apagaba,
            // sin decir que faltaba agregar algo.
            if (!hasNewItems) {
                setIntentoFinalizar(true)
                saltarASeccion('alerts')
                return
            }
            setRevisionError('')
            setShowReason(true)
            return
        }
        // Un boton apagado no explica que le falta. Se deja pulsable y es el intento
        // el que enciende los errores y lleva a la primera seccion incompleta.
        if (seccionesFaltantes.length > 0) {
            setIntentoFinalizar(true)
            saltarASeccion(seccionesFaltantes[0])
            return
        }
        const formState = collectFormState()
        const ficha = buildFichaClinica(buildSadcContext(), formState, 'finalizado')
        onFinalize?.(ficha, formState)
    }

    const sendRevision = async () => {
        if (revisionSubmitting || !motivo.trim() || !hasNewItems || !onRequestChanges) return
        setRevisionSubmitting(true)
        setRevisionError('')
        try {
            await onRequestChanges(motivo.trim(), collectFormState())
            setShowReason(false)
            setMotivo('')
            setRevisionSent(true)
        } catch (error) {
            setRevisionError(error instanceof Error ? error.message : 'No se pudo solicitar el cambio.')
        } finally {
            setRevisionSubmitting(false)
        }
    }

    /** De la ficha en lectura a la captura: solo quedan las secciones que admiten altas. */
    const iniciarAdenda = () => {
        setFaseAdenda('captura')
        setIntentoFinalizar(false)
        setOpenSections({ ...SECCIONES_CERRADAS, alerts: true, exams: true, observations: true })
        window.scrollTo({ top: 0 })
    }

    /** Vuelve a la ficha en lectura, sin lo que se haya agregado. */
    const descartarAdenda = () => {
        const bloquear = <T extends { locked?: boolean }>(items: T[]) => items.map((item) => ({ ...item, locked: true }))
        setAlertSigns(bloquear(initialAlertSigns))
        setExams(bloquear(initialExams))
        setObservaciones(bloquear(initialObservaciones))
        setIntentoFinalizar(false)
        setShowDescartarAdenda(false)
        setFaseAdenda('lectura')
        setOpenSections({ ...SECCIONES_CERRADAS, appointment: true })
        window.scrollTo({ top: 0 })
    }

    /** Salir de la captura regresa a la ficha, no a la busqueda: la adenda es un paso dentro de ella. */
    const salirDeCaptura = () => {
        if (revisionSubmitting) return
        if (hasNewItems) {
            setShowDescartarAdenda(true)
            return
        }
        descartarAdenda()
    }

    const handleBack = () => {
        if (revisionSubmitting || isSubmitting) return
        if (enCapturaAdenda) {
            salirDeCaptura()
            return
        }
        if (hasUnsavedWork) {
            setShowExitConfirm(true)
            return
        }
        onBack?.()
    }
    
    const handleFinalizeReturn = () => {
        onBack?.()
    }

    const avisosCabecera: HeaderNotice[] = enCapturaAdenda
        ? [{ text: AVISO_CAPTURA_ADENDA, tone: 'action' }]
        : headerNotices

    return (
        <div
            className={readOnly ? styles.containerEmbedded : styles.container}
            // Mientras no se haya medido no se publica: la hoja ya trae de respaldo el
            // 96px que medía la cabecera, y es mejor eso que un 0 que pegaria las
            // cabeceras de seccion al borde de la pantalla en el primer pintado.
            style={stickyHeaderHeight > 0
                ? ({ '--sticky-header-h': `${stickyHeaderHeight}px` } as CSSProperties)
                : undefined}
        >
            {!readOnly && (
            <div className={styles.stickyHeader} ref={stickyHeaderRef}>
                {/* Barra de navegacion, no un rotulo: la marca comparte fila con la
                    salida en vez de ocupar una entera para si. El boton sube aqui
                    desde el bloque del paciente, donde pegado al nombre se leia como
                    una accion sobre el paciente y no como volver a la busqueda. */}
                <div className={styles.topBar}>
                    {/* El alt va en el wordmark: juntos son un solo logo, y la "C"
                        sola repetiria el nombre para quien usa lector de pantalla. */}
                    <span className={styles.brand}>
                        <img src={logoC} alt="" className={styles.brandLogo} />
                        <img src={logoOngenia} alt="Congenia" className={styles.brandWordmark} />
                    </span>

                    <button
                        type="button"
                        className={styles.backButton}
                        onClick={handleBack}
                        aria-label={enCapturaAdenda ? 'Regresar a la ficha' : 'Regresar a la búsqueda de paciente'}
                    >
                        <ArrowLeft size={16} aria-hidden="true" />
                        <span>Regresar</span>
                    </button>
                </div>

                {mode === 'create' && !viewing && <div className={styles.progressBlock}>
                    <div className={styles.progressTrack}>
                        <div className={styles.progressFill} style={{ width: `${completionPercent}%` }} />
                    </div>
                    <span className={styles.progressText}>{completionPercent}% completado</span>
                </div>}

                {/* Sin el boton al lado queda solo el contexto, y cabe en una linea:
                    "Registro para el Paciente:" solo hacia falta cuando competia con
                    una accion y habia que aclarar de que era el nombre. */}
                <div className={styles.patientInfo}>
                    <span className={styles.patientLabel}>Paciente:</span>
                    <span className={styles.patientName} title={patientName}>{patientName}</span>
                </div>

                {avisosCabecera.length > 0 && (
                    <div className={styles.noticeBlock}>
                        {avisosCabecera.map((notice) => (
                            <p
                                key={notice.text}
                                className={
                                    notice.tone === 'pending' ? styles.noticePending
                                    : notice.tone === 'action' ? styles.noticeAction
                                    : styles.noticeBadge
                                }
                                role="status"
                            >
                                {notice.text}
                            </p>
                        ))}
                    </div>
                )}
            </div>
            )}

            <div className={readOnly ? styles.sectionsEmbedded : styles.sections}>
                {/* En la captura de una adenda solo quedan las secciones que admiten
                    altas: lo demas ya se leyo en el paso anterior y aqui solo distrae. */}
                {!enCapturaAdenda && <>
                <AppointmentDataView
                    readOnly={fixedSections}
                    fechaConsulta={fechaConsulta}
                    medicoConsulta={medicoConsulta}
                    especialidad={especialidad}
                    diagnosticos={diagnosticos}
                    referidoDeOptions={referidoDeOptions}
                    lugarDePartoOptions={lugarDePartoOptions}
                    sexoOptions={sexoOptions}
                    referidoDe={referidoDe}
                    lugarDeParto={lugarDeParto}
                    sexo={sexo}
                    onReferidoDeChange={setReferidoDe}
                    onLugarDePartoChange={setLugarDeParto}
                    onSexoChange={setSexo}
                    id={fichaSectionAnchorId('appointment')}
                    className={claseSeccion('appointment')}
                    showValidation={mostrarValidacion}
                    isOpen={openSections.appointment}
                    onToggle={() => toggleSection('appointment')}
                />

                <DemographicDataView
                    readOnly={fixedSections}
                    familiarAfectadoGroups={familiarAfectadoGroups}
                    familiaresAfectados={familiaresAfectados}
                    menoresEnHogar={menoresEnHogar}
                    adultosEnHogar={adultosEnHogar}
                    quienAfectado={quienAfectado}
                    afectadosComunidad={afectadosComunidad}
                    onFamiliaresAfectadosChange={setFamiliaresAfectados}
                    onMenoresEnHogarChange={setMenoresEnHogar}
                    onAdultosEnHogarChange={setAdultosEnHogar}
                    onQuienAfectadoChange={setQuienAfectado}
                    onAfectadosComunidadChange={setAfectadosComunidad}
                    id={fichaSectionAnchorId('demographic')}
                    className={claseSeccion('demographic')}
                    showValidation={mostrarValidacion}
                    isOpen={openSections.demographic}
                    onToggle={() => toggleSection('demographic')}
                />
                </>}

                {/* `readOnly` tambien lo oculta, no solo el modo. Un visor pasa
                    `readOnly` sin `mode`, y `mode` vale 'create' por defecto: con
                    la condicion puesta solo en el modo, el desplegable se colaba
                    en las pantallas de consulta y pintaba el formulario del
                    hospital con las tres casillas obligatorias sin marcar, sin
                    firma y con el pie que dice que el documento "tiene validez
                    oficial". Sobre una ficha ya firmada eso no es un hueco
                    visual: se lee como que el paciente nunca consintio.

                    @compliance HIPAA 164.502(b) - minimo dato necesario */}
                {mode === 'create' && !readOnly && <InformedConsentView
                    nombrePaciente={patientName}
                    numeroExpediente={numeroExpediente}
                    doctorName={consentDoctorName ?? medicoConsulta}
                    doctorTimestamp={selloDeTiempo}
                    consentValues={consentValues}
                    onConsentChange={(id, checked) =>
                        setConsentValues((prev) => ({ ...prev, [id]: checked }))
                    }
                    onSignatureChange={setSignatureData}
                    signerName={signerName}
                    onSignerNameChange={setSignerName}
                    signerRelation={signerRelation}
                    onSignerRelationChange={setSignerRelation}
                    id={fichaSectionAnchorId('consent')}
                    className={claseSeccion('consent')}
                    showValidation={mostrarValidacion}
                    isOpen={openSections.consent}
                    onToggle={() => toggleSection('consent')}
                    readOnly={fixedSections}
                    signatureData={signatureData}
                />}

                <AlertSignsSection
                    readOnly={viewing || revisionSent || isSubmitting || submitResult?.ok === true}
                    highlightedItemId={highlightedItemId}
                    uploadPacienteId={mode === 'append' ? uploadPacienteId : undefined}
                    allowReplacement={mode === 'append'}
                    items={alertSigns}
                    onRemove={(id) => setAlertSigns((prev) => prev.filter((item) => item.locked || item.id !== id))}
                    onAdd={(item) => setAlertSigns((prev) => [...prev, item])}
                    regionDefs={regionDefs}
                    disabled={mode === 'create' && !viewing && !signatureData}
                    id={fichaSectionAnchorId('alerts')}
                    className={claseSeccion('alerts')}
                    isOpen={openSections.alerts}
                    onToggle={() => toggleSection('alerts')}
                />

                <ExamsSection
                    readOnly={viewing || revisionSent || isSubmitting || submitResult?.ok === true}
                    highlightedItemId={highlightedItemId}
                    uploadPacienteId={mode === 'append' ? uploadPacienteId : undefined}
                    allowReplacement={mode === 'append'}
                    items={exams}
                    onRemove={(id) => setExams((prev) => prev.filter((item) => item.locked || item.id !== id))}
                    onAdd={(item) => setExams((prev) => [...prev, item])}
                    id={fichaSectionAnchorId('exams')}
                    className={claseSeccion('exams')}
                    isOpen={openSections.exams}
                    onToggle={() => toggleSection('exams')}
                />

                {/* Opcional: no cuenta para el avance ni para "Falta completar". Se
                    bloquea hasta la firma, igual que signos y examenes. */}
                <ObservationsSection
                    readOnly={viewing || revisionSent || isSubmitting || submitResult?.ok === true}
                    highlightedItemId={highlightedItemId}
                    items={observaciones}
                    onRemove={(id) => setObservaciones((prev) => prev.filter((item) => item.locked || item.id !== id))}
                    onAdd={(item) => setObservaciones((prev) => [...prev, item])}
                    disabled={mode === 'create' && !viewing && !signatureData}
                    id={fichaSectionAnchorId('observations')}
                    className={claseSeccion('observations')}
                    isOpen={openSections.observations}
                    onToggle={() => toggleSection('observations')}
                />
            </div>

            {/* La ficha abierta para adenda se lee primero: el pie solo ofrece
                empezarla. Asi el inicio de la adenda es un boton que se ve, y no
                unas secciones que de pronto admiten altas. */}
            {enLecturaAdenda && !revisionSent && <div className={styles.footer}>
                <div className={styles.actions} style={{ gridTemplateColumns: '1fr' }}>
                    <Button
                        variant="primary"
                        fullWidth
                        className={styles.finalizeButton}
                        disabled={!onRequestChanges}
                        onClick={iniciarAdenda}
                    >
                        Solicitar adenda
                    </Button>
                </div>
            </div>}

            {!viewing && <div className={styles.footer}>
                {/* Lo que falta se ve ANTES de pulsar, y cada nombre es un atajo a
                    su seccion. El boton sigue pulsable: apagarlo era justamente lo
                    que dejaba al medico sin saber que le faltaba. */}
                {mode === 'create' && !isAllComplete && (
                    <InlineNotice>
                        Falta completar:{' '}
                        {seccionesFaltantes.map((key, i) => (
                            <span key={key}>
                                {i > 0 && (i === seccionesFaltantes.length - 1 ? ' y ' : ', ')}
                                <button
                                    type="button"
                                    className={styles.missingLink}
                                    onClick={() => saltarASeccion(key)}
                                    // El nombre a secas chocaria con el boton de la
                                    // cabecera de la seccion, que se llama igual.
                                    aria-label={`Ir a ${SECTION_LABELS[key]}`}
                                >
                                    {SECTION_LABELS[key]}
                                </button>
                            </span>
                        ))}
                    </InlineNotice>
                )}

                {mode === 'append' && !hasNewItems && (
                    <InlineNotice>
                        Agregue al menos un signo de alerta, un estudio de gabinete o una observación para enviar la adenda.
                    </InlineNotice>
                )}

                {mode === 'create' && isAllComplete && (
                    <div className={styles.completeBanner}>
                        <span className={styles.completeIcon} aria-hidden="true">
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4 8.25L6.5 10.75L12 5.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </span>
                        ¡Todo completo! Listo para finalizar el registro
                    </div>
                )}
                <div className={styles.actions} style={{ gridTemplateColumns: enCapturaAdenda ? '1fr 1fr' : '1fr' }}>
                    {enCapturaAdenda && (
                        <Button
                            variant="ghost"
                            fullWidth
                            disabled={revisionSubmitting || revisionSent}
                            onClick={salirDeCaptura}
                        >
                            Cancelar adenda
                        </Button>
                    )}
                    {/* Borrador deshabilitado en esta iteración
                    <Button
                        variant="ghost"
                        fullWidth
                        className={styles.draftButton}
                        onClick={handleSaveDraft}
                    >
                        Borrador
                    </Button>
                    */}
                    <Button
                        variant="primary"
                        fullWidth
                        className={styles.finalizeButton}
                        // Incompleto ya no lo apaga: al pulsar, el formulario
                        // explica que falta y lleva hasta ahi.
                        disabled={(mode === 'append' && !onRequestChanges) || isSubmitting || revisionSubmitting || revisionSent || submitResult?.ok === true}
                        onClick={handleFinalize}
                    >
                        {/* La etiqueta anuncia lo que hara el clic: incompleta lleva a
                            lo que falta, completa envia. Antes siempre decia
                            "Finalizar registro" y prometia un envio que no ocurria. */}
                        {mode === 'append'
                            ? 'Enviar adenda'
                            : isAllComplete ? 'Finalizar registro' : 'Revisar ficha'}
                    </Button>
                </div>
            </div>}

            {showReason && (
                <div className={styles.modalOverlay}>
                    <div className={styles.feedbackCard} role="dialog" aria-modal="true" aria-labelledby="reason-title">
                        <h2 id="reason-title" className={styles.feedbackTitle}>Enviar adenda</h2>
                        <label htmlFor="revision-reason">Describa el motivo de la adenda</label>
                        <textarea id="revision-reason" autoFocus maxLength={500} rows={5} value={motivo}
                            className={styles.reasonInput}
                            disabled={revisionSubmitting} onChange={(event) => setMotivo(event.target.value)} />
                        <span>{motivo.length} / 500</span>
                        {revisionError && <p role="alert">{revisionError}</p>}
                        <div className={styles.confirmActions}>
                            <Button variant="ghost" disabled={revisionSubmitting} onClick={() => { setShowReason(false); setMotivo(''); setRevisionError('') }}>Cancelar</Button>
                            <Button variant="primary" isLoading={revisionSubmitting} disabled={!motivo.trim() || revisionSubmitting} onClick={() => void sendRevision()}>Enviar</Button>
                        </div>
                    </div>
                </div>
            )}
            {revisionSent && (
                <div className={styles.modalOverlay}>
                    <div className={styles.feedbackCard} role="dialog" aria-modal="true" aria-labelledby="revision-sent-title">
                        <h2 id="revision-sent-title" className={styles.feedbackTitle}>¡Solicitud enviada!</h2>
                        <p className={styles.confirmMessage}>
                            Sus cambios han sido enviados a revisión, por favor contacte al médico asignado de la revisión.
                        </p>
                        <Button variant="primary" onClick={onBack}>Volver a la búsqueda</Button>
                    </div>
                </div>
            )}

            {/* Modal: confirmar salida con la ficha a medio llenar. Solo aparece si
                `handleBack` vio trabajo sin guardar; con la ficha vacia se sale directo. */}
            <ConfirmDialog
                isOpen={showExitConfirm}
                title="¿Está seguro de salir?"
                message="Se perderá lo que lleva capturado en esta ficha, incluida la firma."
                confirmLabel="Sí, salir"
                onCancel={() => setShowExitConfirm(false)}
                onConfirm={() => {
                    setShowExitConfirm(false)
                    onBack?.()
                }}
            />

            {/* Salir de la captura con altas sin enviar las descarta: se confirma antes. */}
            <ConfirmDialog
                isOpen={showDescartarAdenda}
                title="¿Descartar la adenda?"
                message="Se perderán los signos, estudios u observaciones que agregó."
                confirmLabel="Sí, descartar"
                tone="destructive"
                onCancel={() => setShowDescartarAdenda(false)}
                onConfirm={descartarAdenda}
            />

            {/* Modal: enviando */}
            {isSubmitting && (
                <div className={styles.modalOverlay}>
                    <div className={styles.feedbackCard}>
                        <div className={styles.spinner} aria-hidden="true" />
                        <span className={styles.feedbackTitle}>Guardando ficha...</span>
                    </div>
                </div>
            )}

            {/* Modal: guardado exitoso */}
            {submitResult?.ok === true && (
                <div className={styles.modalOverlay}>
                    <div className={styles.feedbackCard}>
                        <div className={styles.successCircle} aria-hidden="true">
                            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M8 20L16 28L32 12" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <span className={styles.successTitle}>¡Ficha genética guardada!</span>
                        <div className={styles.successInfo}>
                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>Ficha de:</span>
                                <span className={styles.infoValue}>{patientName}</span>
                            </div>
                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>Realizada por:</span>
                                <span className={styles.infoValue}>{medicoConsulta}</span>
                            </div>
                            <div className={styles.infoRow}>
                                <span className={styles.infoLabel}>Completada a las:</span>
                                <span className={styles.infoValue}>{submitResult.savedAt}</span>
                            </div>
                        </div>
                        <Button variant="primary" fullWidth onClick={handleFinalizeReturn}>
                            Finalizar
                        </Button>
                    </div>
                </div>
            )}

            {/* Modal: error al guardar */}
            {submitResult?.ok === false && (
                <div className={styles.modalOverlay}>
                    <div className={styles.feedbackCard}>
                        <span className={styles.feedbackTitle}>No se pudo guardar la ficha</span>
                        <span className={styles.feedbackTitle} style={{ fontWeight: 400, fontSize: '0.875rem' }}>
                            {submitResult.errorMessage}
                        </span>
                        <Button variant="primary" fullWidth onClick={handleFinalizeReturn}>
                            Cerrar
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}

