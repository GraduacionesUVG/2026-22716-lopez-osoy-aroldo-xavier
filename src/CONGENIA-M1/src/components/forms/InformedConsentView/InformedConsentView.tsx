/**
 * @fileoverview Vista de Consentimiento Informado
 *
 * La seccion solo muestra un boton "Firmar documento" o, ya firmado, una card de
 * confirmacion. El documento se recorre en un modal de tres pasos, con el mismo
 * diseño que el alta de signos de alerta:
 *  1. Leer el documento (el "Siguiente" se habilita al llegar al final)
 *  2. Marcar las declaraciones de consentimiento
 *  3. Datos del firmante y firma
 *
 * Antes todo iba de corrido en la seccion y agobiaba a los medicos. Los datos que
 * ya vienen llenos -paciente, expediente, medico, sello de tiempo- no se muestran:
 * no hay nada que hacer con ellos y el PDF del servidor ya los lleva.
 *
 * Contenido del consentimiento informado:
 *  - viene de InformedConsentContent.ts - no tocar este archivo para cambiar textos
 *
 */

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { SectionHeader } from '../../ui/SectionHeader/SectionHeader'
import type { SectionHeaderStatus } from '../../ui/SectionHeader/SectionHeader'
import { Button } from '../../ui/Button/Button'
import { Input } from '../../ui/Input/Input'
import { InlineNotice } from '../../ui/InlineNotice/InlineNotice'
import { ConsentCard } from '../../ui/ConsentCard/ConsentCard'
import { ToggleChip } from '../../ui/ToggleChip/ToggleChip'
import { SignaturePad } from '../../ui/SignaturePad/SignaturePad'
import { consentContent } from './InformedConsentContent'
import type { InformedConsentDocumentContent, ContentItem } from './InformedConsentContent'
import styles from './InformedConsentView.module.css'

const consentIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 2H6C4.895 2 4 2.895 4 4V20C4 21.105 4.895 22 6 22H18C19.105 22 20 21.105 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 13H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 17H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 9H10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
)

const TOTAL_PASOS = 3
// Margen para dar por leido el documento sin exigir el ultimo pixel: en movil el
// scroll suele quedarse a uno o dos del final.
const MARGEN_FINAL_PX = 16

const modalTitle = 'Consentimiento Informado'
const signerSectionTitle = 'Datos del Firmante (Padre, Madre o Representante)'
const signerNameLabel = 'Nombre completo'
const signerRelationLabel = 'Relación con el niño(a)'
const signerRelationOptions = ['Padre', 'Madre', 'Tutor legal']
const signatureLabel = 'Firma del Representante Legal'

const noteTitle = 'Nota:'
const noteText =
    'Este documento electronico tiene validez oficial y quedara guardado de forma inalterable en el expediente digital del paciente.'

export interface InformedConsentViewProps {
    /** Ya no se muestra en la seccion; lo imprime el PDF del servidor. */
    nombrePaciente: string
    /** Ya no se muestra en la seccion; lo imprime el PDF del servidor. */
    numeroExpediente: string

    /** Medico responsable. Ya no se muestra; lo imprime el PDF del servidor. */
    doctorName?: string

    /** Sello de aceptacion del servidor. Ya no se muestra; lo imprime el PDF. */
    doctorTimestamp?: string

    // Solo disponibles cuando la ficha ya fue guardada
    codigoDocumento?: string
    fechaHora?: string

    readOnly?: boolean
    signatureData?: string | null

    consentValues?: Record<string, boolean>
    onConsentChange?: (id: string, checked: boolean) => void
    onSignatureChange?: (dataUrl: string | null) => void

    signerName?: string
    onSignerNameChange?: (name: string) => void
    signerRelation?: string
    onSignerRelationChange?: (relation: string) => void

    content?: InformedConsentDocumentContent

    showValidation?: boolean

    isOpen?: boolean
    onToggle?: () => void
    className?: string
    /** Ancla en el DOM, para que el pie pueda traer esta seccion a la vista. */
    id?: string
}

/**
 * Lo que se va llenando dentro del modal.
 *
 * No toca el formulario hasta "Confirmar firma": asi la seccion solo tiene dos
 * estados, firmada o no, y cerrar el modal a medias no deja declaraciones
 * sueltas sin firma.
 */
interface Borrador {
    step: 1 | 2 | 3
    leyoDocumento: boolean
    declaraciones: Record<string, boolean>
    nombre: string
    relacion: string
    firma: string | null
    stepError: string | null
}

function renderContentItem(item: ContentItem, index: number) {
    if (item.kind === 'paragraph') {
        return (
            <p key={index} className={styles.sectionParagraph}>
                {item.text}
            </p>
        )
    }

    if (item.kind === 'paragraph-lead') {
        return (
            <p key={index} className={styles.sectionParagraph}>
                <span className={styles.paragraphLead}>{item.lead} </span>
                {item.text}
            </p>
        )
    }

    if (item.kind === 'bullet-list') {
        return (
            <ul key={index} className={styles.bulletList}>
                {item.items.map((bullet, i) => (
                    <li key={i} className={styles.bulletItem}>
                        <span className={styles.bulletDot} aria-hidden="true" />
                        <span className={styles.bulletText}>
                            {bullet.lead && (
                                <span className={styles.paragraphLead}>{bullet.lead} </span>
                            )}
                            {bullet.text}
                        </span>
                    </li>
                ))}
            </ul>
        )
    }

    return null
}

export function InformedConsentView({
    codigoDocumento,
    fechaHora,
    readOnly = false,
    signatureData = null,
    consentValues = {},
    onConsentChange,
    onSignatureChange,
    signerName = '',
    onSignerNameChange,
    signerRelation = 'Madre',
    onSignerRelationChange,
    content = consentContent,
    showValidation = false,
    isOpen = true,
    onToggle,
    className,
    id,
}: InformedConsentViewProps) {
    const [modalAbierto, setModalAbierto] = useState(false)
    // Sobrevive a cerrar el modal: al reabrir, el medico retoma donde iba.
    const [borrador, setBorrador] = useState<Borrador | null>(null)
    const documentoRef = useRef<HTMLDivElement>(null)

    const requiredCards = content.consentCards.filter((c) => c.required)
    const faltanObligatorias = (valores: Record<string, boolean>) =>
        requiredCards.some((c) => !valores[c.id])

    const firmado =
        !faltanObligatorias(consentValues) &&
        signerName.trim().length > 0 &&
        Boolean(signatureData)

    const headerStatus: SectionHeaderStatus = (() => {
        if (firmado) return 'completed'
        if (showValidation) return 'incomplete'
        return 'default'
    })()

    const cardClasses = [
        styles.card,
        showValidation && !firmado ? styles.cardIncomplete : '',
        className ?? '',
    ].filter(Boolean).join(' ')

    const abrirModal = () => {
        setBorrador((prev) => prev ?? {
            step: 1,
            leyoDocumento: false,
            declaraciones: { ...consentValues },
            nombre: signerName,
            relacion: signerRelation,
            firma: null,
            stepError: null,
        })
        setModalAbierto(true)
    }

    const actualizar = (patch: Partial<Borrador>) =>
        setBorrador((prev) => (prev ? { ...prev, ...patch } : prev))

    /**
     * Salir del paso 3 desmonta el lienzo, asi que la firma se descarta: si no,
     * quedaria guardada una firma que ya no se ve, y podria acabar valiendo por
     * declaraciones que se cambiaron despues de firmar.
     */
    const irAPaso = (step: Borrador['step']) =>
        actualizar({ step, stepError: null, firma: null })

    const cerrarModal = () => {
        actualizar({ firma: null, stepError: null })
        setModalAbierto(false)
    }

    // Estable a proposito: SignaturePad reinicia el lienzo cuando cambia su onChange.
    const handleFirmaChange = useCallback((dataUrl: string | null) => {
        setBorrador((prev) => (prev ? { ...prev, firma: dataUrl, stepError: null } : prev))
    }, [])

    const pasoActual = modalAbierto ? borrador?.step : undefined

    // Si el documento cabe sin scroll no hay "final" al que llegar: se da por leido.
    useLayoutEffect(() => {
        if (pasoActual !== 1) return
        const el = documentoRef.current
        if (!el) return

        const revisar = () => {
            if (el.scrollHeight - el.clientHeight <= MARGEN_FINAL_PX) {
                setBorrador((prev) => (prev && !prev.leyoDocumento ? { ...prev, leyoDocumento: true } : prev))
            }
        }
        revisar()
        const observer = new ResizeObserver(revisar)
        observer.observe(el)
        return () => observer.disconnect()
    }, [pasoActual])

    const handleScrollDocumento = (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - MARGEN_FINAL_PX) {
            setBorrador((prev) => (prev && !prev.leyoDocumento ? { ...prev, leyoDocumento: true } : prev))
        }
    }

    const siguienteDesdeDeclaraciones = () => {
        if (!borrador) return
        if (faltanObligatorias(borrador.declaraciones)) {
            actualizar({ stepError: 'Acepte las autorizaciones obligatorias para continuar' })
            return
        }
        irAPaso(3)
    }

    const confirmarFirma = () => {
        if (!borrador) return
        if (!borrador.nombre.trim()) {
            actualizar({ stepError: 'Escriba el nombre completo del firmante' })
            return
        }
        if (!borrador.firma) {
            actualizar({ stepError: 'Falta la firma del representante' })
            return
        }

        content.consentCards.forEach((card) =>
            onConsentChange?.(card.id, Boolean(borrador.declaraciones[card.id])))
        onSignerNameChange?.(borrador.nombre.trim())
        onSignerRelationChange?.(borrador.relacion)
        onSignatureChange?.(borrador.firma)

        setModalAbierto(false)
    }

    return (
        <div id={id} className={cardClasses}>
            <SectionHeader
                title="Consentimiento"
                icon={consentIcon}
                status={headerStatus}
                isOpen={isOpen}
                onToggle={onToggle}
                embedded
            />

            {isOpen && (
                <div className={styles.body}>
                    {firmado ? (
                        <div className={styles.signedCard} role="status">
                            <span className={styles.signedIcon} aria-hidden="true">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M4 8.25L6.5 10.75L12 5.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </span>
                            Se ha firmado el consentimiento
                        </div>
                    ) : (
                        <>
                            <p className={styles.sectionIntro}>
                                Lea el documento junto al padre, madre o representante legal,
                                marque las declaraciones y recoja su firma.
                            </p>
                            <Button variant="primary" fullWidth disabled={readOnly} onClick={abrirModal}>
                                Firmar documento
                            </Button>
                            {showValidation && (
                                <span className={styles.errorText} role="alert">
                                    Falta firmar el consentimiento
                                </span>
                            )}
                        </>
                    )}
                </div>
            )}

            {modalAbierto && borrador && (
                <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="consent-modal-title">
                    <div className={styles.modal}>

                        <div className={styles.modalHeader}>
                            <span id="consent-modal-title" className={styles.modalTitle}>{modalTitle}</span>
                            <button
                                type="button"
                                className={styles.modalClose}
                                onClick={cerrarModal}
                                aria-label="Cerrar"
                            >
                                <span aria-hidden="true">×</span>
                            </button>
                        </div>

                        <div className={styles.stepIndicator}>
                            {Array.from({ length: TOTAL_PASOS }, (_, index) => index + 1).map((step) => (
                                <span
                                    key={step}
                                    className={[
                                        styles.stepDot,
                                        borrador.step === step ? styles.stepDotCurrent : '',
                                        borrador.step > step ? styles.stepDotDone : '',
                                    ].filter(Boolean).join(' ')}
                                />
                            ))}
                            <span className={styles.stepLabel}>Paso {borrador.step} de {TOTAL_PASOS}</span>
                        </div>

                        {/* Documento. `key` por paso: cada uno empieza arriba y no
                            hereda el scroll del anterior. */}
                        {borrador.step === 1 && (
                            <div
                                key="documento"
                                ref={documentoRef}
                                className={styles.modalBody}
                                onScroll={handleScrollDocumento}
                            >
                                <div className={styles.docHeader}>
                                    <div className={styles.docHeaderTitles}>
                                        <span className={styles.docHospitalName}>{content.hospitalName}</span>
                                        <span className={styles.docFormTitle}>{content.formTitle}</span>
                                    </div>
                                    <div className={styles.docMetaGrid}>
                                        <div className={styles.docMetaItem}>
                                            <span className={styles.docMetaLabel}>Institución</span>
                                            <span className={styles.docMetaValue}>{content.institucion}</span>
                                        </div>
                                        <div className={styles.docMetaItem}>
                                            <span className={styles.docMetaLabel}>Proyecto</span>
                                            <span className={styles.docMetaValue}>{content.proyecto}</span>
                                        </div>
                                        {codigoDocumento && (
                                            <div className={styles.docMetaItem}>
                                                <span className={styles.docMetaLabel}>Código de Documento</span>
                                                <span className={styles.docMetaValue}>{codigoDocumento}</span>
                                            </div>
                                        )}
                                        {fechaHora && (
                                            <div className={styles.docMetaItem}>
                                                <span className={styles.docMetaLabel}>Fecha y Hora</span>
                                                <span className={styles.docMetaValue}>{fechaHora}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className={styles.intro}>
                                    <span className={styles.introGreeting}>{content.introGreeting}</span>
                                    <p className={styles.introBody}>{content.introBody}</p>
                                </div>

                                {content.sections.map((section) => (
                                    <div key={section.number} className={styles.section}>
                                        <span className={styles.sectionTitle}>
                                            {section.number}. {section.title}
                                        </span>
                                        {section.items.map((item, i) => renderContentItem(item, i))}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Declaraciones */}
                        {borrador.step === 2 && (
                            <div key="declaraciones" className={styles.modalBody}>
                                <span className={styles.blockTitle}>{content.declarationTitle}</span>
                                <p className={styles.blockInstruction}>{content.declarationInstruction}</p>
                                <div className={styles.consentCards}>
                                    {content.consentCards.map((card) => (
                                        <ConsentCard
                                            key={card.id}
                                            id={card.id}
                                            title={card.title}
                                            description={card.description}
                                            chipText={card.chipText}
                                            chipColor={card.chipColor}
                                            required={card.required}
                                            checked={borrador.declaraciones[card.id] ?? false}
                                            status={!borrador.declaraciones[card.id] && !borrador.stepError ? 'default' : undefined}
                                            disabled={readOnly}
                                            onCheckedChange={readOnly ? undefined : (checked) => actualizar({
                                                declaraciones: { ...borrador.declaraciones, [card.id]: checked },
                                                stepError: null,
                                            })}
                                        />
                                    ))}
                                </div>
                                {borrador.stepError && (
                                    <span className={styles.stepError} role="alert">{borrador.stepError}</span>
                                )}
                            </div>
                        )}

                        {/* Firmante */}
                        {borrador.step === 3 && (
                            <div key="firmante" className={styles.modalBody}>
                                <span className={styles.subSectionTitle}>{signerSectionTitle}</span>
                                <Input
                                    label={signerNameLabel}
                                    placeholder="Escriba el nombre completo..."
                                    value={borrador.nombre}
                                    onChange={(e) => actualizar({ nombre: e.target.value, stepError: null })}
                                    readOnly={readOnly}
                                />
                                <span className={styles.subLabel}>{signerRelationLabel}</span>
                                <div className={styles.relationChips}>
                                    {signerRelationOptions.map((option) => (
                                        <ToggleChip
                                            key={option}
                                            selected={borrador.relacion === option}
                                            disabled={readOnly}
                                            onClick={() => actualizar({ relacion: option })}
                                        >
                                            {option}
                                        </ToggleChip>
                                    ))}
                                </div>
                                {/* Rojo y encima del panel, no un texto gris debajo del
                                    titulo: en las pruebas el recuadro vacio se leia como
                                    listo para firmar. Mismo aviso que la lista de
                                    familiares en Otros Demograficos. */}
                                {!borrador.nombre.trim() && !readOnly && (
                                    <InlineNotice tone="danger" className={styles.lockedNotice}>
                                        Escriba el nombre completo del firmante para habilitar la firma.
                                    </InlineNotice>
                                )}
                                <SignaturePad
                                    label={signatureLabel}
                                    // El aviso de arriba o la mano animada ya dicen que hacer.
                                    helperText=""
                                    height={160}
                                    showHint
                                    disabled={readOnly || !borrador.nombre.trim()}
                                    onChange={handleFirmaChange}
                                />
                                {borrador.stepError && (
                                    <span className={styles.stepError} role="alert">{borrador.stepError}</span>
                                )}
                                <div className={styles.noteBox}>
                                    <div className={styles.noteIcon} aria-hidden="true">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path
                                                d="M12 3L4 6V11C4 15.418 7.134 19.192 11.5 20.5C15.866 19.192 19 15.418 19 11V6L12 3Z"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                        </svg>
                                    </div>
                                    <span className={styles.noteText}>
                                        <strong>{noteTitle}</strong> {noteText}
                                    </span>
                                </div>
                            </div>
                        )}

                        {borrador.step === 1 && !borrador.leyoDocumento && (
                            <p className={styles.scrollHint}>
                                Desplácese hasta el final del documento para continuar
                            </p>
                        )}

                        <div className={styles.modalFooter}>
                            {borrador.step === 1 && (
                                <>
                                    <Button variant="ghost" fullWidth onClick={cerrarModal}>
                                        Cancelar
                                    </Button>
                                    <Button
                                        variant="primary"
                                        fullWidth
                                        disabled={!borrador.leyoDocumento}
                                        onClick={() => irAPaso(2)}
                                    >
                                        Siguiente
                                    </Button>
                                </>
                            )}
                            {borrador.step === 2 && (
                                <>
                                    <Button variant="ghost" fullWidth onClick={() => irAPaso(1)}>
                                        Atrás
                                    </Button>
                                    <Button variant="primary" fullWidth onClick={siguienteDesdeDeclaraciones}>
                                        Siguiente
                                    </Button>
                                </>
                            )}
                            {borrador.step === 3 && (
                                <>
                                    <Button variant="ghost" fullWidth onClick={() => irAPaso(2)}>
                                        Atrás
                                    </Button>
                                    <Button variant="primary" fullWidth disabled={readOnly} onClick={confirmarFirma}>
                                        Confirmar firma
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
