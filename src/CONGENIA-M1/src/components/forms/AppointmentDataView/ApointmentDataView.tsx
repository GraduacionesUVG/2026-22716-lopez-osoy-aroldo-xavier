/**
 * @fileoverview Vista de Datos de la Consulta
 *
 * Campos que vienen del SADC:
 *  - fechaConsulta, medicoConsulta, especialidad, diagnosticos
 *
 * Campos que llena el médico:
 *  - referidoDe, lugarDeParto, sexo
 * 
 */

import type { SelectHTMLAttributes } from 'react'
import { SectionHeader } from '../../ui/SectionHeader/SectionHeader'
import type { SectionHeaderStatus } from '../../ui/SectionHeader/SectionHeader'
import { InlineNotice } from '../../ui/InlineNotice/InlineNotice'
import { AVISO_SECCION_IRREVERSIBLE } from '../avisos'
import { Input } from '../../ui/Input/Input'
import { Dropdown } from '../../ui/Dropdown/Dropdown'
import type { DropdownOption } from '../../ui/Dropdown/Dropdown'
import styles from './AppointmentData.module.css'

const appointmentIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M3 10H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 14H8.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 14H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M16 14H16.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M8 18H8.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 18H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
)

export interface AppointmentDataViewProps {
    fechaConsulta: string
    medicoConsulta: string
    especialidad: string
    diagnosticos: string

    referidoDeOptions: DropdownOption[]
    lugarDePartoOptions: DropdownOption[]
    sexoOptions: DropdownOption[]

    referidoDe?: string
    lugarDeParto?: string
    sexo?: string

    onReferidoDeChange?: (value: string) => void
    onLugarDePartoChange?: (value: string) => void
    onSexoChange?: (value: string) => void

    // Activa la visualización de errores en campos vacíos.
    showValidation?: boolean

    /** Solo lectura: los desplegables muestran su valor pero no se pueden abrir. */
    readOnly?: boolean

    isOpen?: boolean
    onToggle?: () => void
    className?: string
    /** Ancla en el DOM, para que el pie pueda traer esta seccion a la vista. */
    id?: string
}

export function AppointmentDataView({
    fechaConsulta,
    medicoConsulta,
    especialidad,
    diagnosticos,
    referidoDeOptions,
    lugarDePartoOptions,
    sexoOptions,
    referidoDe,
    lugarDeParto,
    sexo,
    onReferidoDeChange,
    onLugarDePartoChange,
    onSexoChange,
    showValidation = false,
    readOnly = false,
    isOpen = true,
    onToggle,
    className,
    id,
}: AppointmentDataViewProps) {
    const campos = [referidoDe, lugarDeParto, sexo]
    const totalCampos = campos.length
    const filledCount = campos.filter(Boolean).length

    // En solo lectura no hay nada que corregir: marcar huecos en rojo sería ruido.
    const mostrarErrores = showValidation && !readOnly

    const headerStatus: SectionHeaderStatus = (() => {
        // Ficha bloqueada: ya no se captura nada, asi que el indicador sobra.
        // Dejarlo vacio hacia parecer que la seccion seguia pendiente.
        if (readOnly) return 'none'
        if (filledCount === totalCampos) return 'completed'
        if (filledCount > 0) return 'in-progress'
        if (showValidation) return 'incomplete'
        return 'default'
    })()

    const handleChange =
        (handler?: (v: string) => void): SelectHTMLAttributes<HTMLSelectElement>['onChange'] =>
        (e) => handler?.(e.target.value)

    const missingReferidoDe   = mostrarErrores && !referidoDe
    const missingLugarDeParto = mostrarErrores && !lugarDeParto
    const missingSexo         = mostrarErrores && !sexo

    const cardClasses = [
        styles.card,
        mostrarErrores && filledCount < totalCampos ? styles.cardIncomplete : '',
        className ?? '',
    ].filter(Boolean).join(' ')

    return (
        <div id={id} className={cardClasses}>
            <SectionHeader
                title="Datos de la Consulta"
                icon={appointmentIcon}
                progressCurrent={filledCount}
                progressTotal={totalCampos}
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

                    <Input
                        label="Fecha Inicial de Consulta"
                        value={fechaConsulta}
                        readOnly
                    />
                    <Input
                        label="Médico de la consulta"
                        value={medicoConsulta}
                        readOnly
                    />
                    <Input
                        label="Especialidad del Médico Evaluador"
                        value={especialidad}
                        readOnly
                    />
                    <Input
                        label="Diagnóstico(s)"
                        value={diagnosticos}
                        readOnly
                    />
                    <Dropdown
                        disabled={readOnly}
                        label="Referido de"
                        placeholder="Seleccione quién lo refirió..."
                        options={referidoDeOptions}
                        value={referidoDe ?? ''}
                        onChange={handleChange(onReferidoDeChange)}
                        error={missingReferidoDe ? 'Este campo es requerido' : undefined}
                    />
                    <Dropdown
                        disabled={readOnly}
                        label="Lugar de parto"
                        placeholder="Seleccione el lugar de parto..."
                        options={lugarDePartoOptions}
                        value={lugarDeParto ?? ''}
                        onChange={handleChange(onLugarDePartoChange)}
                        error={missingLugarDeParto ? 'Este campo es requerido' : undefined}
                    />
                    <Dropdown
                        disabled={readOnly}
                        label="Sexo del paciente"
                        placeholder="Seleccione el sexo..."
                        options={sexoOptions}
                        value={sexo ?? ''}
                        onChange={handleChange(onSexoChange)}
                        error={missingSexo ? 'Este campo es requerido' : undefined}
                    />
                </div>
            )}
        </div>
    )
}
