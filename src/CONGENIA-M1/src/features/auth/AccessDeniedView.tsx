/**
 * @fileoverview Sesion valida, pero sin el rol que abre el dashboard.
 *
 * Es un 403 explicito y no un redirect a la ficha
 */

import styles from './AccessDeniedView.module.css'
import { BrandCard } from '../../components/ui/BrandCard/BrandCard'
import { Button } from '../../components/ui/Button/Button'
import { ROUTES } from '../../app/routes'

export interface AccessDeniedViewProps {
    displayName?: string
    onLogout: () => void
}

export function AccessDeniedView({ displayName, onLogout }: AccessDeniedViewProps) {
    return (
        <BrandCard>
            <div className={styles.heading}>
                <h1 className={styles.title}>No tiene acceso al dashboard</h1>
                <p className={styles.message}>
                    Su cuenta inició sesión correctamente, pero no tiene un rol con permiso
                    para entrar aquí. Pida al administrador que lo asigne en Keycloak.
                </p>
                {displayName && <p className={styles.identity}>Sesión: {displayName}</p>}
            </div>

            <div className={styles.actions}>
                <Button variant="primary" fullWidth onClick={() => { window.location.href = ROUTES.ficha }}>
                    Ir a la ficha clínica
                </Button>
                <Button variant="ghost" fullWidth onClick={onLogout}>
                    Cerrar sesión
                </Button>
            </div>
        </BrandCard>
    )
}
