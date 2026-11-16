/**
 * @fileoverview Seccion Signos de Alerta
 */

import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import styles from './AlertSignsSection.module.css'
import { SectionHeader } from '../../ui/SectionHeader/SectionHeader'
import { MediaCard, type MediaCardChip, type MediaCardStatus } from '../../ui/MediaCard/MediaCard'
import { fichaItemAnchorId } from '../../ui/MediaCard/anchor'
import { ImageLightbox } from '../../ui/ImageLightbox/ImageLightbox'
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog'
import { Button } from '../../ui/Button/Button'
import { ImageUploader, PreviewExpandButton } from '../../ui/ImageUploader/ImageUploader'
import { TextArea } from '../../ui/Input/TextArea'
import { ToggleChip } from '../../ui/ToggleChip/ToggleChip'
import { InlineNotice } from '../../ui/InlineNotice/InlineNotice'
import { AVISO_IMAGEN_MENOR } from '../avisos'
import { uploadImageFile } from '../../../services/upload.service'

export interface BodyPartSelection {
    regionValue: string
    parteValue: string
    lateralidad?: 'izquierda' | 'derecha' | 'bilateral'
}

export interface AlertSignItem {
    locked?: boolean
    id: string
    title: string
    /** Data URL Base64 - solo para previsualización en UI, no se envía al backend */
    imageSrc?: string
    /** objectKey devuelto por POST /v1/uploads/presigned-url */
    imageResourceId?: string
    chips?: MediaCardChip[]
    parteDelCuerpo?: BodyPartSelection
    nombreArchivo?: string
    /** Id del signo de la ficha vigente al que este sustituye. Solo se llena en una adenda. */
    replacesId?: string
    /** Vigencia que persiste el servidor. El reemplazo en curso se deriva de `replacesId`. */
    status?: MediaCardStatus
}

export interface BodyPartDef {
    value: string
    label: string
    hasLaterality: boolean
}

export interface RegionDef {
    value: string
    label: string
    parts: BodyPartDef[]
}

interface AlertSignsSectionProps {
    uploadPacienteId?: string
    /** Habilita el paso que marca a que signo existente sustituye el nuevo. Solo en adendas. */
    allowReplacement?: boolean
    title?: string
    items: AlertSignItem[]
    onRemove?: (id: string) => void
    onAdd?: (item: AlertSignItem) => void
    /** Regiones y partes cargadas del backend. Cuando no se pasan, usa el catálogo local. */
    regionDefs?: RegionDef[]
    /** Bloquea la sección hasta que el consentimiento esté firmado. */
    disabled?: boolean
    /**
     * Solo lectura: se pueden abrir los detalles y ampliar las imágenes, pero no
     * agregar ni eliminar signos.
     *
     * Es distinto de `disabled`: aquel oculta el contenido porque todavía no se
     * puede capturar; este lo muestra entero, solo que sin manijas.
     */
    readOnly?: boolean
    /** Signo al que acaba de saltar otra pantalla. Se realza para no perderlo. */
    highlightedItemId?: string
    isOpen?: boolean
    onToggle?: () => void
    className?: string
    /** Ancla en el DOM, para que el pie pueda traer esta seccion a la vista. */
    id?: string
}

const REGIONES_ANATOMICAS: RegionDef[] = [
    {
        value: 'cabeza_cuello',
        label: 'Cabeza y cuello',
        parts: [
            { value: 'craneo',    label: 'Cráneo',    hasLaterality: false },
            { value: 'ojos',      label: 'Ojos',      hasLaterality: true  },
            { value: 'oidos',     label: 'Oídos',     hasLaterality: true  },
            { value: 'nariz',     label: 'Nariz',     hasLaterality: false },
            { value: 'labio',     label: 'Labio',     hasLaterality: false },
            { value: 'mandibula', label: 'Mandíbula', hasLaterality: false },
            { value: 'cuello',    label: 'Cuello',    hasLaterality: false },
        ],
    },
    {
        value: 'tronco',
        label: 'Tronco',
        parts: [
            { value: 'torax',   label: 'Tórax',   hasLaterality: false },
            { value: 'mama',    label: 'Mama',    hasLaterality: true  },
            { value: 'abdomen', label: 'Abdomen', hasLaterality: false },
            { value: 'espalda', label: 'Espalda', hasLaterality: false },
            { value: 'columna', label: 'Columna', hasLaterality: false },
        ],
    },
    {
        value: 'extremidades_superiores',
        label: 'Extremidades superiores',
        parts: [
            { value: 'hombro',     label: 'Hombro',    hasLaterality: true },
            { value: 'brazo',      label: 'Brazo',     hasLaterality: true },
            { value: 'codo',       label: 'Codo',      hasLaterality: true },
            { value: 'antebrazo',  label: 'Antebrazo', hasLaterality: true },
            { value: 'mano',       label: 'Mano',      hasLaterality: true },
            { value: 'dedos_mano', label: 'Dedos',     hasLaterality: true },
        ],
    },
    {
        value: 'extremidades_inferiores',
        label: 'Extremidades inferiores',
        parts: [
            { value: 'cadera',     label: 'Cadera',       hasLaterality: true },
            { value: 'muslo',      label: 'Muslo',        hasLaterality: true },
            { value: 'rodilla',    label: 'Rodilla',      hasLaterality: true },
            { value: 'pierna',     label: 'Pierna',       hasLaterality: true },
            { value: 'tobillo',    label: 'Tobillo',      hasLaterality: true },
            { value: 'pie',        label: 'Pie',          hasLaterality: true },
            { value: 'dedos_pie',  label: 'Dedos del pie',hasLaterality: true },
        ],
    },
    {
        value: 'genitales_perine',
        label: 'Genitales / Periné',
        parts: [
            { value: 'genitales', label: 'Genitales externos', hasLaterality: false },
            { value: 'perine',    label: 'Periné',             hasLaterality: false },
        ],
    },
    {
        value: 'general_otro',
        label: 'General / Otro',
        parts: [
            { value: 'piel', label: 'Piel', hasLaterality: false },
            { value: 'otro', label: 'Otro', hasLaterality: false },
        ],
    },
]

/** El servidor guarda la descripcion recortada a 300 caracteres. */
const MAX_NOMBRE = 300

const LAT_LABELS: Record<string, string> = {
    izquierda: 'Izq.',
    derecha:   'Der.',
    bilateral: 'Bilateral',
}

function buildChipFromPart(sel: BodyPartSelection, regionList: RegionDef[]): string {
    const region = regionList.find((r) => r.value === sel.regionValue)
    const part   = region?.parts.find((p) => p.value === sel.parteValue)
    const label  = part?.label ?? sel.parteValue
    if (!sel.lateralidad) return label
    return `${label} (${LAT_LABELS[sel.lateralidad]})`
}

interface AlertFormState {
    step: 1 | 2 | 3 | 4
    cambiaExistente: boolean | null
    replacesId: string | null
    selectedRegion: string | null
    parteSeleccionada: BodyPartSelection | null
    imagePreview: string | null  // Base64 solo para previsualización
    imageFile: File | null       // Archivo original para subir al bucket
    imagenBase64: string | null  // Alias de imagePreview - mantenido para compatibilidad
    nombreArchivo: string
    nombre: string
    isUploading: boolean
    uploadError: string | null
    stepError: string | null
}

const INITIAL_FORM: AlertFormState = {
    step: 1,
    cambiaExistente: null,
    replacesId: null,
    selectedRegion: null,
    parteSeleccionada: null,
    imagePreview: null,
    imageFile: null,
    imagenBase64: null,
    nombreArchivo: '',
    nombre: '',
    isUploading: false,
    uploadError: null,
    stepError: null,
}

const alertIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 3L2.5 20H21.5L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 9V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
)

export function AlertSignsSection({
    title = 'Signos de Alerta',
    items,
    onRemove,
    onAdd,
    regionDefs,
    disabled = false,
    readOnly = false,
    uploadPacienteId,
    allowReplacement = false,
    highlightedItemId,
    isOpen,
    onToggle,
    className,
    id,
}: AlertSignsSectionProps) {
    const regiones = regionDefs ?? REGIONES_ANATOMICAS
    const [isOpenState, setIsOpenState]   = useState(true)
    const [isModalOpen, setIsModalOpen]   = useState(false)
    const [selectedItem, setSelectedItem] = useState<AlertSignItem | null>(null)
    const [isDetailOpen, setIsDetailOpen] = useState(false)
    const [isPreviewOpen, setIsPreviewOpen] = useState(false)
    // Foto recien tomada en el alta, vista en grande antes de guardarla.
    const [isFormPreviewOpen, setIsFormPreviewOpen] = useState(false)
    const [form, setForm] = useState<AlertFormState>(INITIAL_FORM)
    // Se guarda el signo entero, no solo su id: el dialogo lo nombra, y asi sigue
    // teniendo que nombrar mientras se cierra.
    const [itemAEliminar, setItemAEliminar] = useState<AlertSignItem | null>(null)

    const isExpanded  = isOpen ?? isOpenState
    const handleToggle = onToggle ?? (() => setIsOpenState((prev) => !prev))

    // Un signo queda sustituido si el servidor ya lo marco o si un alta de esta adenda lo apunta.
    const replacedIds = new Set(items.map((item) => item.replacesId).filter(Boolean))
    const statusOf = (item: AlertSignItem): MediaCardStatus =>
        item.status === 'replaced' || replacedIds.has(item.id) ? 'replaced' : 'active'
    // Las sustituidas al final. `sort` es estable, asi que cada grupo conserva su orden de alta.
    const ordered = [...items].sort((a, b) =>
        Number(statusOf(a) === 'replaced') - Number(statusOf(b) === 'replaced'))
    // Solo se puede sustituir lo que ya esta en la ficha y sigue vigente.
    const replaceables = items.filter((item) => item.locked && statusOf(item) === 'active')
    const asksReplacement = allowReplacement && replaceables.length > 0
    const totalSteps = asksReplacement ? 4 : 3

    const selectRegion = (regionValue: string) => {
        setForm((prev) => ({
            ...prev,
            selectedRegion: prev.selectedRegion === regionValue ? null : regionValue,
            parteSeleccionada: null,
            stepError: null,
        }))
    }

    const selectParte = (regionValue: string, parteValue: string) => {
        setForm((prev) => {
            const isSame =
                prev.parteSeleccionada?.regionValue === regionValue &&
                prev.parteSeleccionada?.parteValue === parteValue
            return {
                ...prev,
                parteSeleccionada: isSame ? null : { regionValue, parteValue },
                stepError: null,
            }
        })
    }

    const setLateralidad = (lat: 'izquierda' | 'derecha' | 'bilateral') => {
        setForm((prev) => {
            if (!prev.parteSeleccionada) return prev
            return {
                ...prev,
                parteSeleccionada: {
                    ...prev.parteSeleccionada,
                    lateralidad: prev.parteSeleccionada.lateralidad === lat ? undefined : lat,
                },
            }
        })
    }

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) {
            setForm((prev) => ({ ...prev, stepError: 'Solo se aceptan archivos de imagen' }))
            return
        }
        // Guardamos el File original para subirlo al bucket en handleSave
        setForm((prev) => ({ ...prev, imageFile: file, nombreArchivo: file.name, stepError: null, uploadError: null }))
        const reader = new FileReader()
        reader.onload = (ev) => {
            const base64 = ev.target?.result as string
            setForm((prev) => ({ ...prev, imagePreview: base64, imagenBase64: base64 }))
        }
        reader.readAsDataURL(file)
    }

    const goToStep2 = () => {
        if (!form.parteSeleccionada) {
            setForm((prev) => ({ ...prev, stepError: 'Seleccione una parte del cuerpo' }))
            return
        }
        const region = regiones.find((r) => r.value === form.parteSeleccionada?.regionValue)
        const partDef = region?.parts.find((p) => p.value === form.parteSeleccionada?.parteValue)
        if (partDef?.hasLaterality && !form.parteSeleccionada.lateralidad) {
            setForm((prev) => ({ ...prev, stepError: 'Seleccione la lateralidad de la parte afectada' }))
            return
        }
        setForm((prev) => ({ ...prev, step: 2, stepError: null }))
    }

    const goToStep3 = () => {
        if (!form.imagenBase64) {
            setForm((prev) => ({ ...prev, stepError: 'Tome o seleccione una foto del hallazgo' }))
            return
        }
        setForm((prev) => ({ ...prev, step: 3, stepError: null }))
    }

    const nombreValido = () => {
        if (form.nombre.trim().length >= 3) return true
        setForm((prev) => ({ ...prev, stepError: 'El nombre debe tener al menos 3 caracteres' }))
        return false
    }

    const goToStep4 = () => {
        if (!nombreValido()) return
        setForm((prev) => ({ ...prev, step: 4, stepError: null }))
    }

    const goBack = (toStep: 1 | 2 | 3) => {
        setForm((prev) => ({ ...prev, step: toStep, stepError: null }))
    }

    const setCambiaExistente = (value: boolean) => {
        setForm((prev) => ({
            ...prev,
            cambiaExistente: prev.cambiaExistente === value ? null : value,
            replacesId: value ? prev.replacesId : null,
            stepError: null,
        }))
    }

    const handleSave = () => {
        if (!nombreValido()) return
        if (asksReplacement) {
            if (form.cambiaExistente == null) {
                setForm((prev) => ({ ...prev, stepError: 'Indique si este signo cambia alguno existente' }))
                return
            }
            if (form.cambiaExistente && !form.replacesId) {
                setForm((prev) => ({ ...prev, stepError: 'Seleccione cuál signo cambia' }))
                return
            }
        }

        const doSave = async () => {
            let imageResourceId: string | undefined
            if (form.imageFile) {
                setForm((prev: AlertFormState) => ({ ...prev, isUploading: true, uploadError: null }))
                try {
                    imageResourceId = await uploadImageFile(form.imageFile as File, 'profile', uploadPacienteId)
                } catch {
                    setForm((prev: AlertFormState) => ({
                        ...prev,
                        isUploading: false,
                        uploadError: 'No se pudo subir la imagen. Intente de nuevo.',
                    }))
                    return
                }
            }

            const newItem: AlertSignItem = {
                id: uuidv4(),
                title: form.nombre.trim(),
                imageSrc: form.imagePreview ?? undefined,
                imageResourceId,
                chips: form.parteSeleccionada ? [buildChipFromPart(form.parteSeleccionada, regiones)] : [],
                parteDelCuerpo: form.parteSeleccionada ?? undefined,
                nombreArchivo: form.nombreArchivo || undefined,
                replacesId: form.replacesId ?? undefined,
            }
            onAdd?.(newItem)
            setIsModalOpen(false)
            setForm(INITIAL_FORM)
        }
        void doSave()
    }

    const openAddModal = () => {
        setForm(INITIAL_FORM)
        setIsModalOpen(true)
    }

    const openDetail = (item: AlertSignItem) => {
        setSelectedItem(item)
        setIsDetailOpen(true)
    }

    const closeDetail = () => {
        setIsDetailOpen(false)
        setIsPreviewOpen(false)
    }

    const bodyParts = (item: AlertSignItem | null) => item?.chips ?? []

    return (
        <div id={id} className={[styles.card, className ?? ''].filter(Boolean).join(' ')}>
            <SectionHeader
                title={title}
                icon={alertIcon}
                isOpen={isExpanded}
                onToggle={handleToggle}
                embedded
            />

            {isExpanded && disabled && (
                <div className={styles.body}>
                    <p className={styles.disabledNotice}>
                        Firme el consentimiento informado para habilitar esta sección.
                    </p>
                </div>
            )}

            {isExpanded && !disabled && (
                <div className={styles.body}>
                    <div className={styles.list}>
                        {ordered.map((item) => (
                            <MediaCard
                                key={item.id}
                                id={fichaItemAnchorId(item.id)}
                                highlighted={item.id === highlightedItemId}
                                title={item.title}
                                imageSrc={item.imageSrc}
                                chips={item.chips}
                                status={statusOf(item)}
                                onRemove={!readOnly && !item.locked && onRemove ? () => setItemAEliminar(item) : undefined}
                                onCardClick={() => openDetail(item)}
                            />
                        ))}

                        {readOnly && items.length === 0 && (
                            <span className={styles.emptyText}>
                                No se registraron signos de alerta.
                            </span>
                        )}
                    </div>

                    {!readOnly && (
                        <Button variant="primary" fullWidth onClick={openAddModal}>
                            + Agregar signo de alerta
                        </Button>
                    )}
                </div>
            )}

            {isModalOpen && !readOnly && (
                <div className={styles.modalOverlay} role="dialog" aria-modal="true">
                    <div className={styles.modal}>

                        {/* Header */}
                        <div className={styles.modalHeader}>
                            <span className={styles.modalTitle}>Agregar Signo de Alerta</span>
                            <button
                                type="button"
                                className={styles.modalClose}
                                onClick={() => setIsModalOpen(false)}
                                aria-label="Cerrar"
                            >
                                <span aria-hidden="true">×</span>
                            </button>
                        </div>

                        {/* Step indicator */}
                        <div className={styles.stepIndicator}>
                            {Array.from({ length: totalSteps }, (_, index) => index + 1).map((step) => (
                                <span
                                    key={step}
                                    className={[
                                        styles.stepDot,
                                        form.step === step ? styles.stepDotCurrent : '',
                                        form.step > step  ? styles.stepDotDone    : '',
                                    ].filter(Boolean).join(' ')}
                                />
                            ))}
                            <span className={styles.stepLabel}>Paso {form.step} de {totalSteps}</span>
                        </div>

                        {/* Región y parte */}
                        {form.step === 1 && (
                            <div className={styles.modalBody}>
                                <span className={styles.stepBodyLabel}>
                                    Seleccione la región y la parte del cuerpo afectada
                                </span>

                                <div className={styles.bodyPartBlock}>
                                    <span className={styles.bodyPartLabel}>Región anatómica</span>
                                    <div className={styles.regionChips}>
                                        {regiones.map((region) => (
                                            <ToggleChip
                                                key={region.value}
                                                selected={form.selectedRegion === region.value}
                                                onClick={() => selectRegion(region.value)}
                                            >
                                                {region.label}
                                            </ToggleChip>
                                        ))}
                                    </div>
                                </div>

                                {form.selectedRegion && (() => {
                                    const region = regiones.find((r) => r.value === form.selectedRegion)!
                                    const sel = form.parteSeleccionada
                                    const selDef = sel ? region.parts.find((p) => p.value === sel.parteValue) : null
                                    return (
                                        <div className={styles.partsSection}>
                                            <span className={styles.partsSectionLabel}>{region.label}</span>
                                            <div className={styles.partsChips}>
                                                {region.parts.map((part) => (
                                                    <ToggleChip
                                                        key={part.value}
                                                        selected={sel?.parteValue === part.value}
                                                        onClick={() => selectParte(form.selectedRegion!, part.value)}
                                                    >
                                                        {part.label}
                                                    </ToggleChip>
                                                ))}
                                            </div>

                                            {sel && selDef?.hasLaterality && (
                                                <div className={styles.lateralidadRow}>
                                                    <span className={styles.lateralidadPartName}>
                                                        {selDef.label}:
                                                    </span>
                                                    <div className={styles.lateralidadChips}>
                                                        {(['izquierda', 'derecha', 'bilateral'] as const).map((lat) => (
                                                            <ToggleChip
                                                                key={lat}
                                                                selected={sel.lateralidad === lat}
                                                                onClick={() => setLateralidad(lat)}
                                                            >
                                                                {LAT_LABELS[lat]}
                                                            </ToggleChip>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })()}

                                {form.stepError && (
                                    <span className={styles.stepError} role="alert">
                                        {form.stepError}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Foto */}
                        {form.step === 2 && (
                            <div className={styles.modalBody}>
                                <span className={styles.stepBodyLabel}>
                                    Tome una foto del hallazgo clínico
                                </span>

                                {/* Antes de disparar, no despues: el paso 2 es el
                                    unico momento en que el encuadre todavia se
                                    puede decidir. */}
                                <InlineNotice tone="warning">{AVISO_IMAGEN_MENOR}</InlineNotice>

                                {form.imagePreview && (
                                    <div className={styles.imagePreviewWrapper}>
                                        <img
                                            src={form.imagePreview}
                                            alt="Vista previa"
                                            className={styles.imagePreviewImg}
                                        />
                                        {/* El recuadro recorta la foto para encuadrarla:
                                            sin esto parecia que habia salido cortada. */}
                                        <PreviewExpandButton onClick={() => setIsFormPreviewOpen(true)} />
                                    </div>
                                )}

                                <ImageUploader
                                    label={form.imagePreview ? 'Cambiar foto' : 'Foto *'}
                                    text="Elegir imagen"
                                    accept="image/jpeg,image/png,image/webp"
                                    onChange={handleImageChange}
                                />

                                {form.stepError && (
                                    <span className={styles.stepError} role="alert">
                                        {form.stepError}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Nombre */}
                        {form.step === 3 && (
                            <div className={styles.modalBody}>
                                <span className={styles.stepBodyLabel}>
                                    Asigne un nombre descriptivo al signo de alerta
                                </span>

                                <TextArea
                                    label="Nombre del signo *"
                                    placeholder="Ej: Dedo meñique torcido"
                                    value={form.nombre}
                                    maxLength={MAX_NOMBRE}
                                    allowLineBreaks={false}
                                    onChange={(e) =>
                                        setForm((prev) => ({ ...prev, nombre: e.target.value, stepError: null }))
                                    }
                                    error={form.stepError ?? undefined}
                                />
                                {form.uploadError && (
                                    <span className={styles.stepError} role="alert">
                                        {form.uploadError}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Sustitucion: un hallazgo nuevo puede reemplazar a uno ya registrado */}
                        {form.step === 4 && (
                            <div className={styles.modalBody}>
                                <span className={styles.stepBodyLabel}>
                                    ¿Este signo cambia alguno existente?
                                </span>

                                <div className={styles.binaryGroup}>
                                    <ToggleChip
                                        selected={form.cambiaExistente === true}
                                        onClick={() => setCambiaExistente(true)}
                                    >
                                        Sí
                                    </ToggleChip>
                                    <ToggleChip
                                        selected={form.cambiaExistente === false}
                                        onClick={() => setCambiaExistente(false)}
                                    >
                                        No
                                    </ToggleChip>
                                </div>

                                {form.cambiaExistente && (
                                    <div className={styles.partsSection}>
                                        <span className={styles.partsSectionLabel}>¿Cuál reemplaza?</span>
                                        <div className={styles.partsChips}>
                                            {replaceables.map((item) => (
                                                <ToggleChip
                                                    key={item.id}
                                                    selected={form.replacesId === item.id}
                                                    onClick={() => setForm((prev) => ({
                                                        ...prev,
                                                        replacesId: prev.replacesId === item.id ? null : item.id,
                                                        stepError: null,
                                                    }))}
                                                >
                                                    {item.title}
                                                </ToggleChip>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {form.stepError && (
                                    <span className={styles.stepError} role="alert">
                                        {form.stepError}
                                    </span>
                                )}
                                {form.uploadError && (
                                    <span className={styles.stepError} role="alert">
                                        {form.uploadError}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Footer navigation */}
                        <div className={styles.modalFooter}>
                            {form.step === 1 && (
                                <>
                                    <Button variant="ghost" fullWidth onClick={() => setIsModalOpen(false)}>
                                        Cancelar
                                    </Button>
                                    <Button variant="primary" fullWidth onClick={goToStep2}>
                                        Siguiente
                                    </Button>
                                </>
                            )}
                            {form.step === 2 && (
                                <>
                                    <Button variant="ghost" fullWidth onClick={() => goBack(1)}>
                                        Atrás
                                    </Button>
                                    <Button variant="primary" fullWidth onClick={goToStep3}>
                                        Siguiente
                                    </Button>
                                </>
                            )}
                            {form.step === 3 && (
                                <>
                                    <Button variant="ghost" fullWidth onClick={() => goBack(2)}>
                                        Atrás
                                    </Button>
                                    {asksReplacement ? (
                                        <Button variant="primary" fullWidth onClick={goToStep4}>
                                            Siguiente
                                        </Button>
                                    ) : (
                                        <Button
                                            variant="primary"
                                            fullWidth
                                            isLoading={form.isUploading}
                                            onClick={() => { handleSave() }}
                                        >
                                            Guardar
                                        </Button>
                                    )}
                                </>
                            )}
                            {form.step === 4 && (
                                <>
                                    <Button variant="ghost" fullWidth onClick={() => goBack(3)}>
                                        Atrás
                                    </Button>
                                    <Button
                                        variant="primary"
                                        fullWidth
                                        isLoading={form.isUploading}
                                        onClick={() => { handleSave() }}
                                    >
                                        Guardar
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isDetailOpen && selectedItem && (
                <div className={styles.modalOverlay} role="dialog" aria-modal="true">
                    <div className={styles.detailModal}>
                        <div className={styles.modalHeader}>
                            <span className={styles.modalTitle}>Detalle del Signo de Alerta</span>
                            <button
                                type="button"
                                className={styles.modalClose}
                                onClick={closeDetail}
                                aria-label="Cerrar"
                            >
                                <span aria-hidden="true">×</span>
                            </button>
                        </div>

                        <div className={styles.modalBody}>
                            <div className={styles.detailImageWrapper}>
                                {selectedItem.imageSrc ? (
                                    <img
                                        src={selectedItem.imageSrc}
                                        alt={selectedItem.title}
                                        className={styles.detailImage}
                                    />
                                ) : (
                                    <div className={styles.detailImagePlaceholder} />
                                )}
                                {selectedItem.imageSrc && (
                                    <button
                                        type="button"
                                        className={styles.previewButton}
                                        onClick={() => setIsPreviewOpen(true)}
                                        aria-label="Ver imagen completa"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M4 7C4 5.89543 4.89543 5 6 5H18C19.1046 5 20 5.89543 20 7V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V7Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d="M12 9V15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                            <path d="M9 12H15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            <div className={styles.detailBlock}>
                                <span className={styles.detailLabel}>Descripcion del signo</span>
                                <span className={styles.detailText}>{selectedItem.title}</span>
                            </div>

                            <div className={styles.detailBlock}>
                                <span className={styles.detailLabel}>Parte del cuerpo afectada</span>
                                <div className={styles.detailChips}>
                                    {bodyParts(selectedItem).length > 0 ? (
                                        bodyParts(selectedItem).map((part) => (
                                            <span key={part} className={styles.detailChip}>{part}</span>
                                        ))
                                    ) : (
                                        <span className={styles.detailEmpty}>Sin partes registradas</span>
                                    )}
                                </div>
                            </div>

                        </div>

                        <div className={styles.detailFooter}>
                            <Button variant="primary" fullWidth onClick={closeDetail}>
                                Cerrar
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <ImageLightbox
                isOpen={isFormPreviewOpen && isModalOpen && Boolean(form.imagePreview)}
                onClose={() => setIsFormPreviewOpen(false)}
                src={form.imagePreview ?? ''}
                alt="Vista previa de la foto del hallazgo"
            />

            <ImageLightbox
                isOpen={isPreviewOpen && Boolean(selectedItem?.imageSrc)}
                onClose={() => setIsPreviewOpen(false)}
                src={selectedItem?.imageSrc ?? ''}
                alt={selectedItem?.title ?? ''}
            />

            {/* Borrar un signo tira tambien su foto y los cuatro pasos del alta
                -region, lateralidad, imagen, nombre-, y no hay forma de deshacerlo. */}
            <ConfirmDialog
                isOpen={itemAEliminar !== null}
                title="¿Eliminar este signo de alerta?"
                message={
                    <>
                        «{itemAEliminar?.title}» se eliminará junto con su fotografía.
                        Esta acción no se puede deshacer.
                    </>
                }
                confirmLabel="Sí, eliminar"
                tone="destructive"
                onCancel={() => setItemAEliminar(null)}
                onConfirm={() => {
                    if (itemAEliminar) onRemove?.(itemAEliminar.id)
                    setItemAEliminar(null)
                }}
            />
        </div>
    )
}
