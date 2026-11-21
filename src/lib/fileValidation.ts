// Validación de archivos antes de subir a Storage: la extensión del nombre y
// el MIME que reporta el navegador deben estar en la lista blanca. Un archivo
// .html o .svg con scripts no debe llegar al bucket.
export function getFileExtension(name: string): string {
  const parts = name.split('.')
  return parts.length > 1 ? (parts.pop() ?? '').toLowerCase() : ''
}

export function isAllowedUpload(file: File, allowedExtensions: string[], allowedTypes: string[]): boolean {
  return allowedExtensions.includes(getFileExtension(file.name)) && allowedTypes.includes(file.type)
}
