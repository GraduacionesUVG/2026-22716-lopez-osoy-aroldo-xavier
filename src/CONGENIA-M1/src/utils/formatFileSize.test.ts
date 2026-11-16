import { describe, expect, it } from 'vitest'
import { formatFileSize } from './formatFileSize'

describe('formatFileSize', () => {
    it('usa bytes por debajo de 1 KB', () => {
        expect(formatFileSize(512)).toBe('512 B')
    })

    it('usa KB sin decimales, que es ruido a esa escala', () => {
        expect(formatFileSize(820 * 1024)).toBe('820 KB')
    })

    it('usa MB con un decimal para poder compararlo con el limite', () => {
        expect(formatFileSize(11 * 1024 * 1024)).toBe('11.0 MB')
        expect(formatFileSize(1.45 * 1024 * 1024)).toBe('1.4 MB')
    })

    it('no rompe con un archivo vacio ni con valores invalidos', () => {
        expect(formatFileSize(0)).toBe('0 B')
        expect(formatFileSize(Number.NaN)).toBe('0 B')
    })
})
