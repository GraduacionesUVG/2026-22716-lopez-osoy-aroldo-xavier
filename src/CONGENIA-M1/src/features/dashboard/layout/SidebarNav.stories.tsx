import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { MemoryRouter } from 'react-router-dom'
import { SidebarNav } from './SidebarNav'
import { NAV_ITEMS } from './NAV_ITEMS'

function SidebarNavDemo({ initialCollapsed }: { initialCollapsed: boolean }) {
    const [collapsed, setCollapsed] = useState(initialCollapsed)

    return (
        <MemoryRouter initialEntries={['/dashboard']}>
            <SidebarNav
                items={NAV_ITEMS}
                showRegistrarFicha
                collapsed={collapsed}
                mobileOpen={false}
                onToggle={() => setCollapsed((value) => !value)}
                onNavigate={() => undefined}
                doctorName="Dr. Marco Paez"
                doctorRole="Genetista"
                onLogout={() => undefined}
            />
        </MemoryRouter>
    )
}

const meta: Meta<typeof SidebarNav> = {
    title: 'Dashboard/SidebarNav',
    component: SidebarNav,
    parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj<typeof SidebarNav>

export const Expandida: Story = {
    render: () => <SidebarNavDemo initialCollapsed={false} />,
}

export const Colapsada: Story = {
    render: () => <SidebarNavDemo initialCollapsed />,
}
