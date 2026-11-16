/**
 * @fileoverview Reparte el catalogo de familiares en nucleo, materna y paterna.
 *
 * El backend devuelve una lista plana -"Madre", "Abuela materna", "Primo
 * paterno"...- y el lado de la familia solo vive en el nombre, asi que hay que
 * leerlo de ahi.
 *
 * La version anterior cruzaba `includes('prim')` con `includes('m')` para marcar
 * a los primos maternos, y esa segunda condicion se cumple siempre: la "m" que
 * encontraba era la de "priMo". Todos los primos caian en materna, y los paternos
 * ademas se colaban en paterna por su propia regla, apareciendo repetidos en dos
 * grupos. De ahi que buscar una letra suelta se haga ahora por palabra completa y
 * no por subcadena.
 */

import type { CatFamiliar } from '../services/catalog.service'
import type { FamiliarAfectadoGroup } from '../components/forms/DemographicDataView/DemographicDataView'
import type { DropdownOption } from '../components/ui/Dropdown/Dropdown'

type Lado = 'materno' | 'paterno' | null

/**
 * Lado de la familia segun el nombre del catalogo.
 *
 * Primero la palabra completa, que es lo que usa el catalogo real. La inicial
 * suelta queda como red por si alguna entrada llega abreviada ("Abuela M."):
 * `\bm\b` exige que la letra sea una palabra en si misma, de modo que la "m" de
 * "primo" o la "p" de "papa" ya no cuentan.
 */
export function ladoDelFamiliar(nombre: string): Lado {
    const n = nombre.toLowerCase()

    if (n.includes('matern')) return 'materno'
    if (n.includes('patern')) return 'paterno'
    if (/\bm\b/.test(n)) return 'materno'
    if (/\bp\b/.test(n)) return 'paterno'

    return null
}

/**
 * Agrupa el catalogo para el selector de familiares afectados.
 *
 * Cada familiar cae en un unico grupo: se clasifica una vez y se reparte, en vez
 * de filtrar tres veces la misma lista con reglas que podian solaparse.
 */
export function groupFamiliares(familiares: CatFamiliar[]): FamiliarAfectadoGroup[] {
    const nucleo:   CatFamiliar[] = []
    const maternos: CatFamiliar[] = []
    const paternos: CatFamiliar[] = []

    for (const familiar of familiares) {
        const lado = ladoDelFamiliar(familiar.nombre)
        if (lado === 'materno') maternos.push(familiar)
        else if (lado === 'paterno') paternos.push(familiar)
        else nucleo.push(familiar)
    }

    const toOpts = (arr: CatFamiliar[]): DropdownOption[] =>
        arr.map((f) => ({ value: f.familiar_catalogo_id.toString(), label: f.nombre }))

    // Quien no declara lado cae en el nucleo, asi que ningun familiar se pierde y
    // no hace falta un grupo de reserva: mientras el catalogo traiga algo, hay al
    // menos un grupo. El anterior tenia uno ("Familiares") al que no se podia
    // llegar, salvo para crearlo vacio cuando el catalogo tambien lo estaba.
    const groups: FamiliarAfectadoGroup[] = []
    if (nucleo.length > 0)   groups.push({ groupLabel: 'Núcleo familiar', options: toOpts(nucleo) })
    if (maternos.length > 0) groups.push({ groupLabel: 'Familia materna', options: toOpts(maternos) })
    if (paternos.length > 0) groups.push({ groupLabel: 'Familia paterna', options: toOpts(paternos) })

    return groups
}
