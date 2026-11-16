/**
 * @fileoverview Marcador de contenido pendiente.
 *
 * Deja el armazon del dashboard navegable antes de que exista una sola pantalla
 * real. El recuadro es de trazo discontinuo a proposito: nadie debe confundirlo
 * con una seccion terminada y vacia.
 *
 * Normalmente no lleva titulo: el nombre de la seccion ya lo pinta la cabecera
 * del layout a partir de NAV_ITEMS, y repetirlo dos veces en la misma pantalla
 * sobra. `title` esta para usarlo fuera del dashboard.
 */

import styles from './PagePlaceholder.module.css'

export interface PagePlaceholderProps {
    /** Solo fuera del dashboard: dentro, el titulo lo pone la cabecera. */
    title?: string
    description?: string
    /** Texto del recuadro, si el genérico no dice lo suficiente. */
    note?: string
}

export function PagePlaceholder({ title, description, note }: PagePlaceholderProps) {
    return (
        <section className={styles.wrapper}>
            {(title ?? description) && (
                <header className={styles.heading}>
                    {title && <h2 className={styles.title}>{title}</h2>}
                    {description && <p className={styles.description}>{description}</p>}
                </header>
            )}

            <div className={styles.box}>
                <p className={styles.note}>{note ?? 'Aquí iría esto'}</p>
            </div>
        </section>
    )
}
