import { describe, expect, it } from 'vitest'
import { interpretarTexto, type Nodo } from './textoSeguro'

/** El árbol escrito como HTML, para comparar a simple vista. */
function html(nodos: Nodo[]): string {
    return nodos.map((nodo) => {
        if (typeof nodo === 'string') return nodo
        if (nodo.etiqueta === 'br') return '<br>'
        return `<${nodo.etiqueta}>${html(nodo.hijos)}</${nodo.etiqueta}>`
    }).join('')
}

const leer = (entrada: string) => html(interpretarTexto(entrada).nodos)

describe('texto sin etiquetas', () => {
    it('queda tal cual, con sus saltos de línea', () => {
        expect(interpretarTexto('Hay 190,234 registros.\nEl 55% son mujeres.')).toEqual({
            formato: false,
            nodos: ['Hay 190,234 registros.\nEl 55% son mujeres.'],
        })
    })

    it('un "<" que no es etiqueta no activa el formato', () => {
        expect(interpretarTexto('Pacientes con edad < 5 y > 2').formato).toBe(false)
        expect(interpretarTexto('si a<b y c>d').formato).toBe(false)
    })
})

describe('etiquetas permitidas', () => {
    it.each([
        ['negrita', 'Hay <b>190,234</b> registros', 'Hay <strong>190,234</strong> registros'],
        ['strong', '<strong>Total</strong>', '<strong>Total</strong>'],
        ['cursiva', 'en <i>2025</i> y <em>2026</em>', 'en <em>2025</em> y <em>2026</em>'],
        ['salto de línea', 'uno<br>dos<br/>tres<br />cuatro', 'uno<br>dos<br>tres<br>cuatro'],
        ['código', 'El código <code>N39.0</code>', 'El código <code>N39.0</code>'],
        ['párrafos', '<p>Uno.</p>\n\n<p>Dos.</p>', '<p>Uno.</p><p>Dos.</p>'],
        ['lista', '<ul>\n  <li>Uno</li>\n  <li>Dos</li>\n</ul>', '<ul><li>Uno</li><li>Dos</li></ul>'],
        ['lista numerada', '<ol><li>Primero</li><li>Segundo</li></ol>', '<ol><li>Primero</li><li>Segundo</li></ol>'],
        ['anidadas', '<b>muy <i>importante</i></b>', '<strong>muy <em>importante</em></strong>'],
        ['mayúsculas', '<B>alto</B>', '<strong>alto</strong>'],
        ['espacios dentro de la negrita se respetan', 'Hay<b> 3</b> casos', 'Hay<strong> 3</strong> casos'],
        ['texto y lista mezclados', 'Hallazgos:<ul><li>A</li></ul>Fin', 'Hallazgos:<ul><li>A</li></ul>Fin'],
    ])('%s', (_caso, entrada, esperado) => {
        expect(leer(entrada)).toBe(esperado)
    })
})

describe('lo que se filtra', () => {
    it.each([
        ['script con su contenido', 'Hola<script>alert(1)</script> mundo', 'Hola mundo'],
        ['script sin cerrar', 'Hola <b>x</b><script>alert(1)', 'Hola <strong>x</strong>'],
        ['style con su contenido', '<style>body{display:none}</style>Texto', 'Texto'],
        ['iframe', 'a<iframe src="https://x"></iframe>b', 'ab'],
        ['svg con onload', '<svg onload="alert(1)"><circle/></svg>Ok', 'Ok'],
        ['imagen con onerror', 'Ver <img src=x onerror="alert(1)"> esto', 'Ver esto'],
        ['enlace: queda el texto', 'Clic <a href="javascript:alert(1)">aquí</a>', 'Clic aquí'],
        ['negrita con evento: no es negrita', '<b onclick="alert(1)">texto</b>', 'texto'],
        ['negrita con estilo: no es negrita', '<b style="color:red">rojo</b>', 'rojo'],
        ['div y span: queda el texto', '<div><span>hola</span></div>', 'hola'],
        ['comentario', 'a<!-- <script>alert(1)</script> -->b', 'ab'],
        ['encabezado: queda el texto', '<h1>Título</h1>', 'Título'],
    ])('%s', (_caso, entrada, esperado) => {
        expect(leer(entrada)).toBe(esperado)
    })

    it('ningún nodo trae una etiqueta fuera de la lista', () => {
        const permitidas = new Set(['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'code'])
        const revisar = (nodos: Nodo[]): boolean => nodos.every((nodo) =>
            typeof nodo === 'string' || (permitidas.has(nodo.etiqueta) && revisar(nodo.hijos)))
        const ataque = '<script>x</script><img src=x onerror=y><a href="javascript:z">a</a>'
            + '<svg><script>w</script></svg><b onmouseover="v">b</b><iframe>c</iframe><object>d</object>'
        expect(revisar(interpretarTexto(ataque).nodos)).toBe(true)
    })
})

describe('entidades', () => {
    it('se leen como texto, nunca como etiquetas', () => {
        expect(leer('<b>a</b> &lt;script&gt;alert(1)&lt;/script&gt;')).toBe('<strong>a</strong> <script>alert(1)</script>')
        // El "<script>" de arriba es un texto: no hay nodo script.
        const { nodos } = interpretarTexto('<b>a</b> &lt;script&gt;')
        expect(nodos).toEqual([{ etiqueta: 'strong', hijos: ['a'] }, ' <script>'])
    })

    it('decodifica las comunes y los números imprimibles', () => {
        expect(leer('<b>A &amp; B</b> &quot;x&quot; &#39;y&#39; &#241; &#xF1;')).toBe('<strong>A & B</strong> "x" \'y\' ñ ñ')
    })

    it('deja como estaban las de control y las desconocidas', () => {
        expect(leer('<b>a</b>&#0;&#x7f;&inventada;')).toBe('<strong>a</strong>&#0;&#x7f;&inventada;')
    })
})

describe('estructuras rotas', () => {
    it.each([
        ['sin cerrar', '<b>negrita sin cerrar', '<strong>negrita sin cerrar</strong>'],
        ['cierre suelto', 'texto</b> suelto', 'texto suelto'],
        ['cruzadas', '<b>a<i>b</b>c</i>', '<strong>a<em>b</em></strong>c'],
        ['viñeta sin lista: no es viñeta', '<li>suelta</li>', 'suelta'],
        ['texto suelto en una lista va en su viñeta', '<ul>suelto<li>a</li></ul>', '<ul><li>suelto</li><li>a</li></ul>'],
        ['párrafo dentro de negrita sale de ella', '<b>a<p>b</p></b>', '<strong>a</strong><p>b</p>'],
        ['lista dentro de párrafo sale de él', '<p>a<ul><li>b</li></ul></p>', '<p>a</p><ul><li>b</li></ul>'],
        ['lista dentro de viñeta se permite', '<ul><li>a<ul><li>b</li></ul></li></ul>', '<ul><li>a<ul><li>b</li></ul></li></ul>'],
        ['nada de formato dentro de un código', '<code><b>N39.0</b></code>', '<code>N39.0</code>'],
    ])('%s', (_caso, entrada, esperado) => {
        expect(leer(entrada)).toBe(esperado)
    })

    it('un anidado absurdo no pasa de la profundidad máxima', () => {
        const entrada = '<b>'.repeat(500) + 'hondo' + '</b>'.repeat(500)
        let profundidad = 0
        let nodos = interpretarTexto(entrada).nodos
        while (nodos.length && typeof nodos[0] !== 'string') {
            profundidad += 1
            nodos = nodos[0].hijos
        }
        expect(profundidad).toBeLessThanOrEqual(8)
        expect(nodos).toEqual(['hondo'])
    })
})
