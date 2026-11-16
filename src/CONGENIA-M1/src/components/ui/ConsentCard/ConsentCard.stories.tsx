import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ConsentCard } from './ConsentCard'

const meta: Meta<typeof ConsentCard> = {
    title: 'UI/ConsentCard',
    component: ConsentCard,
    tags: ['autodocs'],
    parameters: {
        viewport: { defaultViewport: 'mobile1' },
    },
}

export default meta
type Story = StoryObj<typeof ConsentCard>

export const Default: Story = {
    render: () => {
        const [checked, setChecked] = useState(false)

        return (
            <ConsentCard
                title="Contacto futuro"
                description="Acepto que los medicos del hospital, o bien laboratorios e instituciones medicas autorizadas que colaboran con ellos, se comuniquen conmigo en el futuro si existen nuevos estudios, pruebas o informacion importante que pueda ayudar con el diagnostico de mi hijo(a)."
                chipText="Opcional"
                chipColor="blue"
                checked={checked}
                onCheckedChange={setChecked}
            />
        )
    },
}

export const ConError: Story = {
    args: {
        title: 'Autorizacion principal',
        description:
            'Otorgo mi permiso para que el hospital guarde los datos medicos y las fotografias del rostro de mi hijo(a) en el sistema seguro del hospital. Acepto que sean analizados por programas de computadora (inteligencia artificial) para buscar un posible diagnostico, y que la informacion sea utilizada para hacer analisis estadisticos que ayuden a mejorar la deteccion de estas enfermedades.',
        chipText: 'Obligatoria',
        chipColor: 'red',
        required: true,
        checked: false,
    },
}

export const Completed: Story = {
    args: {
        title: 'Contacto futuro',
        description:
            'Acepto que los medicos del hospital, o bien laboratorios e instituciones medicas autorizadas que colaboran con ellos, se comuniquen conmigo en el futuro si existen nuevos estudios, pruebas o informacion importante que pueda ayudar con el diagnostico de mi hijo(a).',
        chipText: 'Opcional',
        chipColor: 'blue',
        checked: true,
    },
}

export const DefaultObligatoria: Story = {
    args: {
        title: 'Autorizacion principal',
        description:
            'Otorgo mi permiso para que el hospital guarde los datos medicos y las fotografias del rostro de mi hijo(a) en el sistema seguro del hospital.',
        chipText: 'Obligatoria',
        chipColor: 'red',
        status: 'default',
        checked: false,
    },
}
