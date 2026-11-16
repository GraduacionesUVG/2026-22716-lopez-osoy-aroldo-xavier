/**
 * @fileoverview Formato básico en las respuestas del agente, sin abrirle la
 * puerta a HTML.
 *
 * El agente puede marcar su respuesta con unas pocas etiquetas (negrita,
 * cursiva, párrafos, listas, códigos). Este módulo las lee y devuelve un
 * árbol de nodos que `TextoAgente` pinta con elementos de React. El navegador
 * nunca interpreta HTML que venga del modelo: no hay `innerHTML` ni
 * `dangerouslySetInnerHTML`, así que no hay nada que se pueda ejecutar.
 *
 * Reglas:
 *  - Solo las etiquetas de `ALIAS`, y sin atributos. `<b onclick="…">`,
 *    `<b style="…">` o `<b class="…">` no son negrita: la etiqueta se quita.
 *  - Una etiqueta fuera de la lista se quita y su texto se queda
 *    (`<a href="…">aquí</a>` → "aquí"). Las de `SIN_CONTENIDO` (`<script>`,
 *    `<style>`…) se van con todo lo que traen dentro.
 *  - Las mal cerradas se cierran solas y las de cierre sueltas se ignoran.
 *  - Las estructuras imposibles se corrigen: un `<li>` sin lista no es
 *    viñeta, un párrafo no queda dentro de una negrita.
 *  - Entidades: solo se decodifican a texto (`&lt;b&gt;` se lee "<b>").
 *
 * Sin ninguna etiqueta, la respuesta se pinta como siempre: texto plano con
 * sus saltos de línea.
 */

export type EtiquetaPermitida = 'p' | 'br' | 'strong' | 'em' | 'ul' | 'ol' | 'li' | 'code'

export interface NodoElemento {
    etiqueta: EtiquetaPermitida
    hijos: Nodo[]
}

export type Nodo = string | NodoElemento

export interface TextoInterpretado {
    /** `false`: no traía etiquetas, va como texto plano con sus saltos de línea. */
    formato: boolean
    nodos: Nodo[]
}

/** Lo que el agente puede mandar y en qué se convierte. */
const ALIAS: Record<string, EtiquetaPermitida> = {
    p: 'p',
    br: 'br',
    strong: 'strong',
    b: 'strong',
    em: 'em',
    i: 'em',
    ul: 'ul',
    ol: 'ol',
    li: 'li',
    code: 'code',
}

/** Etiquetas cuyo contenido tampoco es texto para el médico: se descartan enteras. */
const SIN_CONTENIDO = new Set([
    'script', 'style', 'iframe', 'object', 'embed', 'template', 'svg', 'math',
    'noscript', 'textarea', 'title', 'head', 'select', 'xmp', 'noembed', 'noframes',
])

const EN_LINEA = new Set<EtiquetaPermitida>(['strong', 'em', 'code'])

/** Más anidado que esto no es formato, es un intento de colgar el navegador. */
const PROFUNDIDAD_MAXIMA = 8

/**
 * `<b>`, `</b>`, `<br/>`, `<a href="x">`. El nombre empieza con letra, así
 * que "edad < 5" no es una etiqueta.
 */
const ETIQUETA = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^<>]*)>/g

/**
 * Lo que puede ir después del nombre para que sea una etiqueta de verdad:
 * nada, una barra, o atributos `nombre=valor`. "a<b y c>d" no lo es: se
 * queda como texto en vez de comerse " y c".
 */
const RESTO_DE_ETIQUETA = /^(\s+[a-zA-Z_:][-\w:.]*\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))*\s*\/?$/

const COMENTARIO = /<!--[\s\S]*?(-->|$)/g

const ENTIDADES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
}

interface Contenedor {
    etiqueta: EtiquetaPermitida | 'raiz'
    hijos: Nodo[]
}

export function interpretarTexto(entrada: string): TextoInterpretado {
    const texto = entrada.replace(COMENTARIO, '')
    if (!tieneEtiquetas(texto)) return { formato: false, nodos: [texto] }

    const raiz: Contenedor = { etiqueta: 'raiz', hijos: [] }
    const pila: Contenedor[] = [raiz]
    const actual = () => pila[pila.length - 1]

    const abrir = (etiqueta: EtiquetaPermitida) => {
        const nodo: NodoElemento = { etiqueta, hijos: [] }
        actual().hijos.push(nodo)
        pila.push(nodo)
    }
    /** Cierra hasta dejar arriba la más cercana que cumpla; si no hay ninguna, no cierra nada. */
    const cerrarHasta = (cumple: (contenedor: Contenedor) => boolean) => {
        const indice = pila.findLastIndex(cumple)
        if (indice < 0) return false
        pila.length = indice + 1
        return true
    }
    /** `</b>`: cierra la `<b>` abierta más cercana y lo que haya quedado abierto dentro. */
    const cerrar = (etiqueta: EtiquetaPermitida) => {
        const indice = pila.findLastIndex((contenedor) => contenedor.etiqueta === etiqueta)
        if (indice > 0) pila.length = indice
    }
    /** Dentro de una lista solo van viñetas: lo demás abre una. */
    const asegurarFueraDeLista = () => {
        const { etiqueta } = actual()
        if (etiqueta === 'ul' || etiqueta === 'ol') abrir('li')
    }

    const agregarTexto = (crudo: string) => {
        // Como en HTML: los saltos y espacios seguidos son un espacio.
        const limpio = decodificar(crudo).replace(/\s+/g, ' ')
        if (!limpio) return
        const { etiqueta } = actual()
        if ((etiqueta === 'ul' || etiqueta === 'ol') && !limpio.trim()) return
        asegurarFueraDeLista()
        const hijos = actual().hijos
        const ultimo = hijos[hijos.length - 1]
        // Al quitar una etiqueta quedan juntos los espacios de cada lado: "Ver <img> esto".
        if (typeof ultimo === 'string') hijos[hijos.length - 1] = (ultimo + limpio).replace(/\s{2,}/g, ' ')
        else hijos.push(limpio)
    }

    let cursor = 0
    ETIQUETA.lastIndex = 0
    for (let match = ETIQUETA.exec(texto); match; match = ETIQUETA.exec(texto)) {
        const [completa, barra, nombreCrudo, resto] = match
        if (!RESTO_DE_ETIQUETA.test(resto)) continue // No es una etiqueta: queda como texto.

        agregarTexto(texto.slice(cursor, match.index))
        cursor = match.index + completa.length

        const nombre = nombreCrudo.toLowerCase()
        const cierre = barra === '/'

        if (!cierre && SIN_CONTENIDO.has(nombre)) {
            // Fuera, con todo lo de adentro.
            const fin = texto.toLowerCase().indexOf(`</${nombre}`, cursor)
            const finEtiqueta = fin < 0 ? -1 : texto.indexOf('>', fin)
            cursor = finEtiqueta < 0 ? texto.length : finEtiqueta + 1
            ETIQUETA.lastIndex = cursor
            continue
        }

        const etiqueta = ALIAS[nombre]
        // Fuera de la lista, o con atributos: se quita la etiqueta, el texto se queda.
        if (!etiqueta || resto.replace('/', '').trim()) continue
        // Un código es texto tal cual: nada de formato adentro.
        if (actual().etiqueta === 'code' && !(cierre && etiqueta === 'code')) continue

        if (cierre) {
            cerrar(etiqueta)
            continue
        }
        if (pila.length > PROFUNDIDAD_MAXIMA) continue

        if (etiqueta === 'br') {
            if (actual().etiqueta === 'ul' || actual().etiqueta === 'ol') continue
            actual().hijos.push({ etiqueta: 'br', hijos: [] })
        } else if (etiqueta === 'li') {
            // Una viñeta solo existe dentro de una lista.
            if (cerrarHasta((contenedor) => contenedor.etiqueta === 'ul' || contenedor.etiqueta === 'ol')) abrir('li')
        } else if (etiqueta === 'p' || etiqueta === 'ul' || etiqueta === 'ol') {
            // Un bloque no va dentro de una negrita ni de otro párrafo.
            cerrarHasta((contenedor) => contenedor.etiqueta === 'raiz' || contenedor.etiqueta === 'li')
            abrir(etiqueta)
        } else if (EN_LINEA.has(etiqueta)) {
            asegurarFueraDeLista()
            abrir(etiqueta)
        }
    }
    agregarTexto(texto.slice(cursor))

    return { formato: true, nodos: recortar(raiz.hijos) }
}

function tieneEtiquetas(texto: string): boolean {
    ETIQUETA.lastIndex = 0
    for (let match = ETIQUETA.exec(texto); match; match = ETIQUETA.exec(texto)) {
        if (RESTO_DE_ETIQUETA.test(match[3])) return true
    }
    return false
}

/**
 * Sin espacios sueltos al principio y al final de cada bloque, ni entre
 * bloques: "<ul>\n  <li>" no deja una línea en blanco.
 */
function recortar(nodos: Nodo[], bloque = true): Nodo[] {
    const procesados = nodos.map((nodo) => typeof nodo === 'string' || nodo.etiqueta === 'code'
        ? nodo
        : { ...nodo, hijos: recortar(nodo.hijos, !EN_LINEA.has(nodo.etiqueta)) })
    // Dentro de una negrita o cursiva los espacios son del texto: "Hay<b> 3</b>".
    if (!bloque) return procesados
    // Un espacio solo, pegado a un bloque (o al borde), no separa nada.
    const limpios = procesados.filter((nodo, i) => typeof nodo !== 'string' || nodo.trim() !== ''
        || !(esBloqueOBorde(procesados[i - 1]) || esBloqueOBorde(procesados[i + 1])))
    const primero = limpios[0]
    if (typeof primero === 'string') limpios[0] = primero.trimStart()
    const ultimo = limpios[limpios.length - 1]
    if (typeof ultimo === 'string') limpios[limpios.length - 1] = ultimo.trimEnd()
    return limpios.filter((nodo) => nodo !== '')
}

function esBloqueOBorde(nodo: Nodo | undefined): boolean {
    return nodo === undefined || (typeof nodo !== 'string' && !EN_LINEA.has(nodo.etiqueta) && nodo.etiqueta !== 'br')
}

/** Las entidades vuelven a ser el carácter, como texto: React lo escapa al pintar. */
function decodificar(texto: string): string {
    return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entidad, cuerpo: string) => {
        if (cuerpo[0] !== '#') return ENTIDADES[cuerpo.toLowerCase()] ?? entidad
        const codigo = cuerpo[1].toLowerCase() === 'x' ? parseInt(cuerpo.slice(2), 16) : parseInt(cuerpo.slice(1), 10)
        // Solo caracteres imprimibles; un control o un número fuera de rango queda como estaba.
        const imprimible = codigo >= 0x20 && codigo <= 0x10ffff && !(codigo >= 0x7f && codigo < 0xa0)
            && !(codigo >= 0xd800 && codigo <= 0xdfff)
        return imprimible ? String.fromCodePoint(codigo) : entidad
    })
}
