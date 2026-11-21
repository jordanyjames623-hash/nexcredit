import { describe, expect, it } from 'vitest'
import { getFileExtension, isAllowedUpload } from '../fileValidation'

function fakeFile(name: string, type: string): File {
  return new File([], name, { type })
}

describe('getFileExtension', () => {
  it('devuelve la extensión en minúsculas', () => {
    expect(getFileExtension('contrato.PDF')).toBe('pdf')
    expect(getFileExtension('foto.jpg')).toBe('jpg')
  })
  it('devuelve vacío sin extensión', () => {
    expect(getFileExtension('sin-extension')).toBe('')
  })
})

describe('isAllowedUpload', () => {
  it('acepta pdf e imágenes permitidas', () => {
    expect(isAllowedUpload(fakeFile('a.pdf', 'application/pdf'), ['pdf', 'png'], ['application/pdf', 'image/png'])).toBe(true)
    expect(isAllowedUpload(fakeFile('a.png', 'image/png'), ['png'], ['image/png'])).toBe(true)
  })
  it('rechaza html y svg aunque el nombre parezca imagen', () => {
    expect(isAllowedUpload(fakeFile('x.html', 'text/html'), ['pdf', 'png', 'jpg'], ['application/pdf', 'image/png', 'image/jpeg'])).toBe(false)
    expect(isAllowedUpload(fakeFile('x.svg', 'image/svg+xml'), ['png', 'jpg'], ['image/png', 'image/jpeg'])).toBe(false)
  })
  it('rechaza cuando el MIME no coincide con la extensión', () => {
    expect(isAllowedUpload(fakeFile('foto.png', 'text/html'), ['png'], ['image/png'])).toBe(false)
  })
})
