/**
 * @fileoverview Vista de Otros Demográficos
 *
 * Todos los campos los llena el médico.
 *
 *  Componentes de este formulario:
 *  1. familiaresAfectados - respuesta binaria Sí/No
 *  2. personasEnHogar     - número de menores y adultos 
 *  3. quienAfectado       - núcleo familiar afectado 
 *  4. afectadosComunidad  - respuesta ternaria Sí/No/Desconoce
 */

import { SectionHeader } from '../../ui/SectionHeader/SectionHeader'
import type { SectionHeaderStatus } from '../../ui/SectionHeader/SectionHeader'
import { InlineNotice } from '../../ui/InlineNotice/InlineNotice'
import { AVISO_SECCION_IRREVERSIBLE } from '../avisos'
import { ToggleChip } from '../../ui/ToggleChip/ToggleChip'
import { NumberStepper } from '../../ui/NumberStepper/NumberStepper'
import type { DropdownOption } from '../../ui/Dropdown/Dropdown'
import type { RespuestaTernaria } from '../../../types/ficha'
import { demographicProgress, familiaresAfectadosVisible, hayConvivientes } from './demographicProgress'
import styles from './DemographicData.module.css'

const demographicIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="2" />
        <path d="M3 21C3 17.686 5.686 15 9 15C12.314 15 15 17.686 15 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="17" cy="8" r="2.5" stroke="currentColor" strokeWidth="2" />
        <path d="M21 21C21 18.515 19.209 16.5 17 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
)

export interface FamiliarAfectadoGroup {
    groupLabel: string
    options: DropdownOption[]
}

export interface DemographicDataViewProps {

    familiarAfectadoGroups: FamiliarAfectadoGroup[]
    familiaresAfectados?: RespuestaTernaria | null
    menoresEnHogar?: number
    adultosEnHogar?: number
    quienAfectado?: string[]
    afectadosComunidad?: RespuestaTernaria | null

    onFamiliaresAfectadosChange?: (value: RespuestaTernaria) => void
    onMenoresEnHogarChange?: (value: number) => void
    onAdultosEnHogarChange?: (value: number) => void
    onQuienAfectadoChange?: (values: string[]) => void
    onAfectadosComunidadChange?: (value: RespuestaTernaria) => void

    // Activa la visualización de errores en campos sin responder 
    showValidation?: boolean

    /** Solo lectura: los controles muestran su valor pero no se pueden cambiar. */
    readOnly?: boolean

    isOpen?: boolean
    onToggle?: () => void
    className?: string
    /** Ancla en el DOM, para que el pie pueda traer esta seccion a la vista. */
    id?: string
}

export function DemographicDataView({
    familiarAfectadoGroups,
    familiaresAfectados,
    menoresEnHogar,
    adultosEnHogar,
    quienAfectado = [],
    afectadosComunidad,
    onFamiliaresAfectadosChange,
    onMenoresEnHogarChange,
    onAdultosEnHogarChange,
    onQuienAfectadoChange,
    onAfectadosComunidadChange,
    showValidation = false,
    readOnly = false,
    isOpen = true,
    onToggle,
    className,
    id,
}: DemographicDataViewProps) {

    // En solo lectura no hay nada que el médico pueda corregir, así que marcar
    // los huecos en rojo solo sería ruido.
    const mostrarErrores = showValidation && !readOnly

    const showDependentSections = familiaresAfectadosVisible(familiaresAfectados)
    const personasEnHogarFilled = hayConvivientes(menoresEnHogar, adultosEnHogar)

    const { filledCount, progressTotal } = demographicProgress({
        familiaresAfectados,
        menoresEnHogar,
        adultosEnHogar,
        quienAfectado,
        afectadosComunidad,
    })

    const headerStatus: SectionHeaderStatus = (() => {
        // Ficha bloqueada: ya no se captura nada, asi que el indicador sobra.
        // Dejarlo vacio hacia parecer que la seccion seguia pendiente.
        if (readOnly) return 'none'
        if (filledCount === progressTotal) return 'completed'
        if (filledCount > 0) return 'in-progress'
        if (showValidation) return 'incomplete'
        return 'default'
    })()

    const handleChipToggle = (value: string) => {
        const next = quienAfectado.includes(value)
            ? quienAfectado.filter((v) => v !== value)
            : [...quienAfectado, value]
        onQuienAfectadoChange?.(next)
    }

    /**
     * Bajar el conteo a cero retira a los ya señalados.
     *
     * Si no, quedaban familiares marcados bajo una lista que ya esta cerrada: no
     * se ven, no se pueden quitar y aun asi viajan en la ficha. Ocurre a la vista
     * -los chips se vacian- y se deshace subiendo el contador otra vez.
     */
    const handleConvivientesChange = (
        notificar: ((value: number) => void) | undefined,
        value: number,
        otroConteo: number,
    ) => {
        notificar?.(value)
        if (value + otroConteo === 0 && quienAfectado.length > 0) {
            onQuienAfectadoChange?.([])
        }
    }

    const cardClasses = [
        styles.card,
        mostrarErrores && filledCount < progressTotal ? styles.cardIncomplete : '',
        className ?? '',
    ].filter(Boolean).join(' ')

    return (
        <div id={id} className={cardClasses}>
            <SectionHeader
                title="Otros Demográficos"
                icon={demographicIcon}
                progressCurrent={filledCount}
                progressTotal={progressTotal}
                status={headerStatus}
                isOpen={isOpen}
                onToggle={onToggle}
                embedded
            />

            {isOpen && (
                <div className={styles.body}>

                    {/* Solo mientras se captura: cuando ya esta bloqueada, los
                        controles deshabilitados lo dicen solos y el aviso sobra. */}
                    {!readOnly && <InlineNotice>{AVISO_SECCION_IRREVERSIBLE}</InlineNotice>}

                    {/* Familiares afectados */}
                    <div className={styles.question}>
                        <span className={styles.questionLabel}>
                            ¿El paciente tiene familiares con la misma condición o bajo sospecha diagnóstica?
                        </span>
                        <div className={styles.binaryGroup}>
                            <ToggleChip
                                disabled={readOnly}
                                selected={familiaresAfectados === 1}
                                onClick={() => onFamiliaresAfectadosChange?.(1)}
                            >
                                Sí
                            </ToggleChip>
                            <ToggleChip
                                disabled={readOnly}
                                selected={familiaresAfectados === 0}
                                onClick={() => onFamiliaresAfectadosChange?.(0)}
                            >
                                No
                            </ToggleChip>
                        </div>
                        {mostrarErrores && familiaresAfectados == null && (
                            <span className={styles.errorText} role="alert">
                                Este campo es requerido
                            </span>
                        )}
                    </div>

                    {/* Personas en el hogar - solo visible cuando "Sí" en familiares afectados */}
                    {showDependentSections && (
                        <div className={styles.question}>
                            <span className={styles.questionLabel}>¿Cuántos familiares con la condición conviven con el paciente?</span>
                            <div className={styles.stepperGroup}>
                                <NumberStepper
                                    disabled={readOnly}
                                    label="Menores"
                                    value={menoresEnHogar}
                                    defaultValue={0}
                                    min={0}
                                    onChange={(value) => handleConvivientesChange(
                                        onMenoresEnHogarChange, value, adultosEnHogar ?? 0,
                                    )}
                                />
                                <NumberStepper
                                    disabled={readOnly}
                                    label="Adultos"
                                    value={adultosEnHogar}
                                    defaultValue={0}
                                    min={0}
                                    onChange={(value) => handleConvivientesChange(
                                        onAdultosEnHogarChange, value, menoresEnHogar ?? 0,
                                    )}
                                />
                            </div>
                            {mostrarErrores && !personasEnHogarFilled && (
                                <span className={styles.errorText} role="alert">
                                    Indique cuántos familiares conviven con el paciente
                                </span>
                            )}
                        </div>
                    )}

                    {/* Quién más está afectado - solo visible cuando "Sí" en familiares afectados */}
                    {showDependentSections && (
                        <div className={styles.question}>
                            <span className={styles.questionLabel}>¿Qué miembros de la familia están afectados o bajo sospecha?</span>

                            {/* La lista no se abre hasta saber cuantos son: marcar
                                parientes con el conteo en cero decia dos cosas que
                                no encajan -que no convive nadie y que estos si-.
                                Se oculta en vez de deshabilitarse: en las pruebas de
                                usabilidad los chips grises se leian como pulsables.
                                En solo lectura se muestra igual, porque ahi no hay
                                aviso y la pregunta quedaria vacia. */}
                            {!personasEnHogarFilled && !readOnly && (
                                <InlineNotice tone="danger" className={styles.lockedNotice}>
                                    Indique arriba cuántos familiares conviven con el paciente
                                    para habilitar esta lista.
                                </InlineNotice>
                            )}

                            {(personasEnHogarFilled || readOnly) && (
                                <div className={styles.chipSection}>
                                    {familiarAfectadoGroups.map((group, index) => (
                                        <div key={group.groupLabel}>
                                            {index > 0 && <hr className={styles.groupDivider} />}
                                            <span className={styles.groupLabel}>{group.groupLabel}</span>
                                            <div className={styles.chipGroup}>
                                                {group.options.map((opt) => (
                                                    <ToggleChip
                                                        key={opt.value}
                                                        selected={quienAfectado.includes(opt.value)}
                                                        onClick={() => handleChipToggle(opt.value)}
                                                        disabled={readOnly || opt.disabled}
                                                    >
                                                        {opt.label}
                                                    </ToggleChip>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {mostrarErrores && personasEnHogarFilled && quienAfectado.length === 0 && (
                                <span className={styles.errorText} role="alert">
                                    Seleccione al menos un familiar afectado
                                </span>
                            )}
                        </div>
                    )}

                    {/* Afectados en la comunidad */}
                    <div className={styles.question}>
                        <span className={styles.questionLabel}>
                            ¿Se conocen otros casos con esta condición en la comunidad del paciente?
                        </span>
                        <div className={styles.ternaryGroup}>
                            <ToggleChip
                                disabled={readOnly}
                                selected={afectadosComunidad === 1}
                                onClick={() => onAfectadosComunidadChange?.(1)}
                            >
                                Sí
                            </ToggleChip>
                            <ToggleChip
                                disabled={readOnly}
                                selected={afectadosComunidad === 0}
                                onClick={() => onAfectadosComunidadChange?.(0)}
                            >
                                No
                            </ToggleChip>
                            <ToggleChip
                                disabled={readOnly}
                                selected={afectadosComunidad === 2}
                                onClick={() => onAfectadosComunidadChange?.(2)}
                            >
                                Desconoce
                            </ToggleChip>
                        </div>
                        {mostrarErrores && afectadosComunidad == null && (
                            <span className={styles.errorText} role="alert">
                                Este campo es requerido
                            </span>
                        )}
                    </div>

                </div>
            )}
        </div>
    )
}
