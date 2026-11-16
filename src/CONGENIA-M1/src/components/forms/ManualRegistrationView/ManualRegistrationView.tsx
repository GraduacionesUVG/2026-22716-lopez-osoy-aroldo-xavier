/**
 * @fileoverview Registro manual de un paciente que SADC no encontró.
 *
 * Solo se llega aquí después de una búsqueda sin resultado: la HC y la
 * institución vienen de esa búsqueda y no se editan. Se piden únicamente los
 * datos que normalmente trae SADC (nombre y fecha de consulta); el diagnóstico
 * va vacío y la especialidad sale del perfil del médico. El resto se captura en
 * la ficha normal.
 *
 * Va en dos pasos porque la ficha queda con HC provisional hasta consolidarse:
 * el médico revisa el resumen y confirma que buscó en SADC antes de abrirla.
 */

import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft } from 'lucide-react'
import styles from './ManualRegistrationView.module.css'
import { BrandCard } from '../../ui/BrandCard/BrandCard'
import { AppTopBar } from '../../ui/AppTopBar/AppTopBar'
import { Input } from '../../ui/Input/Input'
import { Button } from '../../ui/Button/Button'
import { InlineNotice } from '../../ui/InlineNotice/InlineNotice'
import {
    localIsoDate,
    provisionalHistoryFor,
    validateManualRegistration,
    type ManualRegistrationErrors,
    type ManualRegistrationValues,
} from '../../../features/ficha-provisional/provisional'

export interface ManualRegistrationViewProps {
    historiaClinica: string
    tenantId: string
    tenantLabel: string
    onSubmit: (values: ManualRegistrationValues) => void
    onBack: () => void
    /** true mientras el servidor verifica en SADC y abre la ficha */
    isSubmitting?: boolean
    /** Rechazo del servidor, ya traducido */
    errorMessage?: string
    authenticatedUser?: string
    onLogout?: () => void
    /** Solo para quien tiene rol de dashboard. */
    onGoToDashboard?: () => void
}

type Paso = 'datos' | 'confirmacion'

function formatFecha(iso: string): string {
    const [anio, mes, dia] = iso.split('-')
    return `${dia}/${mes}/${anio}`
}

export function ManualRegistrationView({
    historiaClinica,
    tenantId,
    tenantLabel,
    onSubmit,
    onBack,
    isSubmitting = false,
    errorMessage,
    authenticatedUser,
    onLogout,
    onGoToDashboard,
}: ManualRegistrationViewProps) {
    const hoy = localIsoDate()
    const [paso, setPaso] = useState<Paso>('datos')
    const [values, setValues] = useState<ManualRegistrationValues>({ nombre: '', fechaConsulta: hoy })
    const [errors, setErrors] = useState<ManualRegistrationErrors>({})
    const [confirmado, setConfirmado] = useState(false)
    const historiaProvisional = provisionalHistoryFor(tenantId, historiaClinica)

    const continuar = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        const nextErrors = validateManualRegistration(values, hoy)
        setErrors(nextErrors)
        if (Object.keys(nextErrors).length > 0) return
        setConfirmado(false)
        setPaso('confirmacion')
    }

    const abrirFicha = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!confirmado || isSubmitting) return
        onSubmit({ nombre: values.nombre.trim(), fechaConsulta: values.fechaConsulta })
    }

    const hero = paso === 'datos' ? (
        <div className={styles.hero}>
            <h1 className={styles.title}>Registro manual</h1>
            <p className={styles.subtitle}>
                El paciente no está en SADC. Complete el nombre y la fecha de consulta; el resto se captura en la ficha normal.
            </p>
            <button type="button" className={styles.backLink} onClick={onBack}>
                <ArrowLeft size={18} aria-hidden="true" />
                Volver a la búsqueda
            </button>
        </div>
    ) : (
        <div className={styles.hero}>
            <h1 className={styles.title}>Confirme los datos</h1>
            <p className={styles.subtitle}>
                Revise antes de abrir la ficha. Estos datos no vienen de SADC y quedarán marcados como registro manual.
            </p>
        </div>
    )

    return (
        <BrandCard
            layout="split"
            topBar={<AppTopBar userName={authenticatedUser} onLogout={onLogout} onGoToDashboard={onGoToDashboard} />}
            hero={hero}
        >
            {paso === 'datos' ? (
                <form className={styles.form} onSubmit={continuar} noValidate>
                    {/* Misma lectura etiqueta | valor que el resumen de la confirmacion. */}
                    <div className={styles.origen}>
                        <dl className={styles.resumen}>
                            <dt>Institución</dt>
                            <dd>{tenantLabel}</dd>
                            <dt>Historia clínica</dt>
                            <dd>{historiaClinica}</dd>
                            <dt>Motivo</dt>
                            <dd><span className={styles.motivo}>No encontrado en SADC</span></dd>
                        </dl>
                        <p className={styles.origenNota}>
                            Se guardará como <strong>{historiaProvisional}</strong> hasta consolidarse con SADC.
                        </p>
                    </div>

                    <Input
                        label="Nombre completo *"
                        id="manual-nombre"
                        value={values.nombre}
                        onChange={(e) => {
                            setValues((prev) => ({ ...prev, nombre: e.target.value }))
                            setErrors((prev) => ({ ...prev, nombre: undefined }))
                        }}
                        error={errors.nombre}
                        placeholder="Nombres y apellidos"
                        autoComplete="off"
                        maxLength={200}
                        required
                    />

                    <Input
                        label="Fecha de consulta *"
                        id="manual-fecha"
                        type="date"
                        value={values.fechaConsulta}
                        max={hoy}
                        onChange={(e) => {
                            setValues((prev) => ({ ...prev, fechaConsulta: e.target.value }))
                            setErrors((prev) => ({ ...prev, fechaConsulta: undefined }))
                        }}
                        error={errors.fechaConsulta}
                        hint="Hoy por defecto. No se permiten fechas futuras."
                        required
                    />

                    <Button type="submit" variant="primary" fullWidth>
                        Continuar
                    </Button>
                </form>
            ) : (
                <form className={styles.form} onSubmit={abrirFicha} noValidate>
                    <h2 className={styles.resumenTitulo}>Resumen del paciente</h2>
                    <dl className={styles.resumen}>
                        <dt>Institución</dt>
                        <dd>{tenantLabel}</dd>
                        <dt>Historia clínica</dt>
                        <dd>{historiaClinica}</dd>
                        <dt>Se guarda como</dt>
                        <dd>{historiaProvisional}</dd>
                        <dt>Nombre</dt>
                        <dd>{values.nombre.trim()}</dd>
                        <dt>Fecha de consulta</dt>
                        <dd>{formatFecha(values.fechaConsulta)}</dd>
                    </dl>

                    <label className={styles.confirmacion}>
                        <input
                            type="checkbox"
                            checked={confirmado}
                            onChange={(e) => setConfirmado(e.target.checked)}
                            disabled={isSubmitting}
                        />
                        Busqué al paciente en SADC y confirmo que no está registrado.
                    </label>

                    {errorMessage && (
                        <div role="alert">
                            <InlineNotice tone="danger">{errorMessage}</InlineNotice>
                        </div>
                    )}

                    <div className={styles.acciones}>
                        <Button
                            type="button"
                            variant="destructive"
                            fullWidth
                            onClick={() => setPaso('datos')}
                            disabled={isSubmitting}
                        >
                            Corregir datos
                        </Button>
                        <Button
                            type="submit"
                            variant="primary"
                            fullWidth
                            isLoading={isSubmitting}
                            disabled={!confirmado}
                        >
                            Abrir ficha
                        </Button>
                    </div>
                </form>
            )}
        </BrandCard>
    )
}
