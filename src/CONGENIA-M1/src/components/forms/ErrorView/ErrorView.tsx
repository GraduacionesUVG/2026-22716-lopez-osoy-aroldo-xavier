/**
 * @fileoverview Pantalla de error a pantalla completa.
 *
 */

import styles from './ErrorView.module.css'
import { BrandCard } from '../../ui/BrandCard/BrandCard'
import { Button } from '../../ui/Button/Button'

export interface ErrorViewProps {
    onRetry: () => void
    title?: string
    message?: string
    detail?: string
    retryLabel?: string
}

export function ErrorView({
    onRetry,
    title      = '¡Parece que hubo un error!',
    message    = 'Intente más tarde.',
    detail,
    retryLabel = 'Reintentar',
}: ErrorViewProps) {
    return (
        <BrandCard>
            <div className={styles.heading}>
                <h1 className={styles.title}>{title}</h1>
                <p className={styles.message}>{message}</p>
                {detail && <p className={styles.detail}>{detail}</p>}
            </div>

            <Button variant="primary" fullWidth onClick={onRetry}>
                {retryLabel}
            </Button>
        </BrandCard>
    )
}
