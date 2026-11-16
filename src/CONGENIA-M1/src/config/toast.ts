/**
 * @fileoverview Configuracion del Toaster de la app.
 *
 * Vive aparte de App.tsx para que Storybook monte un Toaster identico al de
 * produccion: una historia que ensena una confirmacion tiene que ensenarla con
 * los colores reales, no con los de la libreria.
 */

import type { ToasterProps } from 'react-hot-toast'

export const TOASTER_PROPS: ToasterProps = {
    position: 'bottom-center',
    toastOptions: {
        duration: 4000,
        // El borde lo pone cada variante. Cuando vivia aqui estaba fijo en el rojo
        // de error, asi que una confirmacion de exito tambien salia enmarcada en rojo.
        style: {
            fontFamily:   'var(--font-family)',
            fontSize:     'var(--font-size-sm)',
            borderRadius: 'var(--radius)',
            background:   'var(--color-surface)',
            color:        'var(--color-black)',
            boxShadow:    '0 10px 30px rgba(0, 0, 0, 0.15)',
            maxWidth:     '90vw',
        },
        error: {
            style: { border: '1.5px solid var(--color-destructive)' },
            iconTheme: {
                primary:   'var(--color-destructive)',
                secondary: 'var(--color-white)',
            },
        },
        success: {
            style: { border: '1.5px solid var(--color-success)' },
            iconTheme: {
                primary:   'var(--color-success)',
                secondary: 'var(--color-white)',
            },
        },
    },
}
