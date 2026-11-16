import { useState, useEffect } from 'react'
import {
    getReferidoDe,
    getAsistenciaParto,
    getFamiliares,
    getPartesCuerpoAgrupadas,
    getSexos,
    type CatParteCuerpoAgrupada,
    type CatSexo,
} from '../services/catalog.service'
import { groupFamiliares } from './familiarGroups'
import type { DropdownOption } from '../components/ui/Dropdown/Dropdown'
import type { FamiliarAfectadoGroup } from '../components/forms/DemographicDataView/DemographicDataView'
import type { RegionDef } from '../components/forms/AlertSignsSection/AlertSignsSection'

export interface CatalogsState {
    loading:                 boolean
    error:                   string | null
    referidoDeOptions:       DropdownOption[]
    asistenciaPartoOptions:  DropdownOption[]
    sexoOptions:             DropdownOption[]
    familiarGroups:          FamiliarAfectadoGroup[]
    regionDefs:              RegionDef[]
}

function toOption<T extends { nombre: string }>(
    item: T,
    getId: (item: T) => number
): DropdownOption {
    return { value: getId(item).toString(), label: item.nombre }
}

function buildRegionDefs(agrupadas: CatParteCuerpoAgrupada[]): RegionDef[] {
    return agrupadas.map((g) => ({
        value: g.regionId.toString(),
        label: g.region,
        parts: g.partes.map((p) => ({
            value:        p.parteId.toString(),
            label:        p.nombre,
            hasLaterality: p.requiereLateralidad,
        })),
    }))
}

/**
 * El catalogo de sexo es nuevo y el backend aun puede no publicarlo (ver
 * PENDIENTES-BACKEND.md). Si falla se deja vacio en vez de tumbar el Promise.all:
 * sin esto, un endpoint faltante dejaba sin opciones a toda la ficha.
 */
async function getSexosTolerante(): Promise<CatSexo[]> {
    try {
        return await getSexos()
    } catch (err) {
        console.warn('[useCatalogs] Catálogo de sexo no disponible:', err)
        return []
    }
}

const INITIAL: CatalogsState = {
    loading:                true,
    error:                  null,
    referidoDeOptions:      [],
    asistenciaPartoOptions: [],
    sexoOptions:            [],
    familiarGroups:         [],
    regionDefs:             [],
}

export function useCatalogs(): CatalogsState {
    const [state, setState] = useState<CatalogsState>(INITIAL)

    useEffect(() => {
        let cancelled = false

        async function load() {
            try {
                const [referidoDe, asistenciaParto, familiares, agrupadas, sexos] = await Promise.all([
                    getReferidoDe(),
                    getAsistenciaParto(),
                    getFamiliares(),
                    getPartesCuerpoAgrupadas(),
                    getSexosTolerante(),
                ])

                if (cancelled) return

                setState({
                    loading: false,
                    error:   null,
                    referidoDeOptions:      referidoDe.map((r)  => toOption(r,  (x) => x.referido_de_id)),
                    asistenciaPartoOptions: asistenciaParto.map((a) => toOption(a, (x) => x.asistencia_parto_id)),
                    sexoOptions:            sexos.map((s) => toOption(s, (x) => x.sexo_id)),
                    familiarGroups:         groupFamiliares(familiares),
                    regionDefs:             buildRegionDefs(agrupadas),
                })
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                console.error('[useCatalogs] Error cargando catálogos:', err)
                if (!cancelled) {
                    setState((prev) => ({ ...prev, loading: false, error: msg }))
                }
            }
        }

        load()
        return () => { cancelled = true }
    }, [])

    return state
}
