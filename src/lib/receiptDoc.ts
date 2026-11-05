// Recibo imprimible y en PDF: un solo origen para "Imprimir / PDF" y "Compartir".
//
// El PDF se ve como la previa de la app: factura PEQUEÑA (no hoja carta), con el
// encabezado azul noche, el logo en círculo y los mismos colores del recibo
// (tokens de src/styles/tokens.css, tema claro para papel). El tamaño de la página
// se mide del contenido: no queda hoja grande con espacio vacío abajo.
//
// Por qué así: imprimir usaba un iframe oculto (printElement) y en el celular no abría
// el diálogo; compartir solo mandaba texto, nunca un PDF. Ahora:
//  - Imprimir abre el recibo en una pestaña nueva, con su propio botón
//    "Imprimir / PDF" y window.print() al cargar (mismo patrón que Contratos);
//  - Compartir genera un PDF real (jsPDF) y lo manda como archivo: en el celular la
//    hoja de compartir muestra WhatsApp y el PDF llega como documento.
// Si el celular no acepta compartir archivos, el respaldo es el texto de siempre.
import { jsPDF } from 'jspdf'
import type { ReceiptData } from '@/components/Receipt'
import { money, shortDate, dateTime, PAYMENT_METHOD_LABEL } from '@/lib/format'

const TYPE_LABEL: Record<string, string> = {
  regular: 'Cuota regular', principal: 'Abono a capital', interest: 'Interés', late_fee: 'Mora', custom: 'Personalizado'
}

// Colores del recibo de la app (tokens, tema claro para papel).
const NAVY: [number, number, number] = [10, 26, 58]
const ON_NAVY: [number, number, number] = [234, 241, 255]
const ON_NAVY_DIM: [number, number, number] = [199, 211, 232]
const PRIMARY: [number, number, number] = [37, 99, 235]
const PRIMARY_DARK: [number, number, number] = [30, 64, 175]
const TEXT: [number, number, number] = [11, 27, 51]
const MUTED: [number, number, number] = [91, 107, 133]
const LINE: [number, number, number] = [210, 221, 238]
const SUCCESS_TEXT: [number, number, number] = [11, 122, 84]
const DANGER: [number, number, number] = [201, 53, 53]
const DANGER_BG: [number, number, number] = [254, 226, 226]

// Factura pequeña: 300 pt de ancho (~106 mm). El alto se mide del contenido.
const PAGE_W = 300
const MX = 18
const CW = PAGE_W - MX * 2

export type ReceiptDocInput = {
  payment: ReceiptData
  businessName: string
  ownerName?: string | null
  phone?: string | null
  whatsapp?: string | null
  address?: string | null
  rnc?: string | null
  footer?: string | null
  logoUrl?: string | null
  clientName: string
  loanNumber: number
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function cuotaLabel(p: ReceiptData): string | null {
  if (p.installment_number == null || p.installment_total == null) return null
  return `Cuota ${p.installment_number} de ${p.installment_total}`
}

function fileBase(p: ReceiptData) {
  return `Recibo-${p.receipt_number}`
}

function typeLabel(p: ReceiptData) {
  return TYPE_LABEL[p.payment_type] ?? p.payment_type
}

export function receiptShareText(input: ReceiptDocInput): string {
  const { payment: p } = input
  const { date, time } = dateTime(p.paid_at)
  const voided = p.status === 'voided'
  const cuota = cuotaLabel(p)
  return `Recibo #${p.receipt_number} — ${input.businessName}${voided ? ' — ANULADO' : ''}\n` +
    `Cliente: ${input.clientName}\nPréstamo PR-${String(input.loanNumber).padStart(4, '0')}\n` +
    `Tipo: ${typeLabel(p)}${cuota ? ` · ${cuota}` : ''}\n` +
    `Capital: RD$ ${money(p.principal_amount)} · Interés: RD$ ${money(p.interest_amount)} · Mora: RD$ ${money(p.late_fee_amount)}\n` +
    `Total pagado: RD$ ${money(p.total_amount)}\nFecha: ${date}${time ? ` ${time}` : ''}`
}

// Logo en círculo (como la previa de la app). Si no carga (sin conexión, sin CORS),
// se usa el círculo con la inicial, igual que la app sin logo.
async function circularLogoDataUrl(url: string, size = 96): Promise<string | null> {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('logo'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(img, 0, 0, size, size)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

export function buildReceiptHtml(input: ReceiptDocInput): string {
  const { payment: p } = input
  const { date, time } = dateTime(p.paid_at)
  const voided = p.status === 'voided'
  const cuota = cuotaLabel(p)
  const contact = [input.phone ? `Tel: ${esc(input.phone)}` : '', input.whatsapp ? `WhatsApp: ${esc(input.whatsapp)}` : ''].filter(Boolean).join(' · ')
  const initial = (input.businessName || 'C').charAt(0).toUpperCase()
  return '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    `<title>Recibo #${p.receipt_number} — ${esc(input.clientName)}</title>` +
    '<style>body{margin:0;background:#eef2f8;color:#0b1b33;font-family:system-ui,-apple-system,sans-serif}' +
    '.card{max-width:340px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 28px -14px rgb(20 60 130 / .25)}' +
    '.head{background:#0a1a3a;color:#eaf1ff;text-align:center;padding:20px 16px 16px}' +
    '.head .logo{width:48px;height:48px;border-radius:50%;object-fit:cover;margin:0 auto 12px;display:block;box-shadow:0 0 0 2px rgb(255 255 255 / .25)}' +
    '.head .init{width:48px;height:48px;border-radius:50%;background:#2563eb;color:#fff;font-size:18px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;box-shadow:0 0 0 2px rgb(255 255 255 / .25)}' +
    '.head h1{font-size:17px;margin:0}.head p{font-size:11px;color:#c7d3e8;margin:2px 0}' +
    '.body{padding:16px 20px 20px}' +
    '.title{text-align:center;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#1e40af;font-weight:700;margin:2px 0 4px}' +
    '.voided{margin:10px 0;padding:10px;background:#fee2e2;color:#b91c1c;text-align:center;font-weight:700;font-size:13px;border-radius:8px}' +
    '.meta{display:flex;justify-content:space-between;font-size:11px;color:#5b6b85;border-bottom:1px solid #d2ddee;padding:8px 0}' +
    '.rows{padding:10px 0}.rows p{font-size:13px;margin:6px 0}.rows span{color:#5b6b85}' +
    '.split{border-top:1px solid #d2ddee;padding:10px 0}.split div{display:flex;justify-content:space-between;font-size:13px;padding:3px 0}' +
    '.total{display:flex;justify-content:space-between;align-items:center;padding:10px 0;font-size:18px;font-weight:700;color:#0b7a54}' +
    '.foot{border-top:1px solid #d2ddee;padding-top:10px;font-size:11px;color:#5b6b85}.foot p{margin:3px 0}' +
    '.actions{margin:18px 0 4px;text-align:center}.actions button{background:#2563eb;color:#fff;border:0;border-radius:10px;padding:12px 24px;font-size:15px;font-weight:600}' +
    '@media print{body{background:#fff}.card{margin:0;box-shadow:none}.actions{display:none}}</style></head><body><div class="card">' +
    '<div class="head">' +
    (input.logoUrl ? `<img class="logo" src="${esc(input.logoUrl)}" alt="">` : `<div class="init">${esc(initial)}</div>`) +
    `<h1>${esc(input.businessName)}</h1>` +
    (input.ownerName ? `<p>${esc(input.ownerName)}</p>` : '') +
    (contact ? `<p>${contact}</p>` : '') +
    (input.address ? `<p>${esc(input.address)}</p>` : '') +
    (input.rnc ? `<p>RNC: ${esc(input.rnc)}</p>` : '') + '</div>' +
    '<div class="body">' +
    '<p class="title">Comprobante de pago</p>' +
    (voided ? '<div class="voided">ANULADO — Este pago no es válido</div>' : '') +
    `<div class="meta"><span>Recibo #${p.receipt_number}</span><span>${esc(date)}${time ? ` · ${esc(time)}` : ''}</span></div>` +
    '<div class="rows">' +
    `<p><span>Cliente:</span> ${esc(input.clientName)}</p>` +
    `<p><span>Préstamo:</span> PR-${String(input.loanNumber).padStart(4, '0')}</p>` +
    `<p><span>Tipo:</span> ${esc(typeLabel(p))}</p>` +
    (cuota ? `<p><span>Cuota:</span> ${esc(cuota)}</p>` : '') +
    (p.payment_method ? `<p><span>Método:</span> ${esc(PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method)}</p>` : '') +
    '</div>' +
    '<div class="split">' +
    `<div><span>Capital</span><span>RD$ ${esc(money(p.principal_amount))}</span></div>` +
    `<div><span>Interés</span><span>RD$ ${esc(money(p.interest_amount))}</span></div>` +
    `<div><span>Mora</span><span>RD$ ${esc(money(p.late_fee_amount))}</span></div>` +
    '</div>' +
    `<div class="total"><span>${voided ? 'Total (anulado)' : 'Total'}</span><span>RD$ ${esc(money(p.total_amount))}</span></div>` +
    '<div class="foot">' +
    (p.pending_principal_after !== null && p.pending_principal_after !== undefined ? `<p>Capital pendiente: RD$ ${esc(money(p.pending_principal_after))}</p>` : '') +
    (p.next_due_date ? `<p>Próxima cuota: ${esc(shortDate(p.next_due_date))} · RD$ ${esc(money(p.next_installment_amount))}</p>` : '') +
    (input.footer ? `<p style="text-align:center;margin-top:10px">${esc(input.footer)}</p>` : '') +
    '</div>' +
    '<div class="actions"><button onclick="window.print()">Imprimir / PDF</button></div>' +
    '</div></div><script>window.addEventListener("load",function(){window.print()})</script></body></html>'
}

export function openReceiptPrintTab(input: ReceiptDocInput): boolean {
  const blob = new Blob([buildReceiptHtml(input)], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) { URL.revokeObjectURL(url); return false }
  return true
}

// Dibuja el recibo en el documento y devuelve la Y final (para medir el alto).
function drawReceipt(doc: jsPDF, input: ReceiptDocInput, logo: string | null): number {
  const { payment: p } = input
  const { date, time } = dateTime(p.paid_at)
  const voided = p.status === 'voided'
  const cuota = cuotaLabel(p)
  const R = PAGE_W - MX
  const headLines: string[] = []
  if (input.ownerName) headLines.push(input.ownerName)
  if (input.phone || input.whatsapp) headLines.push([input.phone ? `Tel: ${input.phone}` : '', input.whatsapp ? `WhatsApp: ${input.whatsapp}` : ''].filter(Boolean).join('  ·  '))
  if (input.address) headLines.push(input.address)
  if (input.rnc) headLines.push(`RNC: ${input.rnc}`)
  const logoD = 40
  const headerH = 14 + logoD + 16 + 16 + headLines.length * 11 + 14
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, PAGE_W, headerH, 'F')
  const logoCx = PAGE_W / 2
  const logoCy = 14 + logoD / 2
  if (logo) {
    doc.addImage(logo, 'PNG', logoCx - logoD / 2, 14, logoD, logoD)
  } else {
    doc.setFillColor(...PRIMARY)
    doc.circle(logoCx, logoCy, logoD / 2, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text((input.businessName || 'C').charAt(0).toUpperCase(), logoCx, logoCy + 5.5, { align: 'center' })
  }
  let y = 14 + logoD + 16
  doc.setTextColor(...ON_NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(input.businessName, logoCx, y, { align: 'center' })
  y += 15
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...ON_NAVY_DIM)
  for (const line of headLines) { doc.text(line, logoCx, y, { align: 'center' }); y += 11 }
  y = headerH + 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...PRIMARY_DARK)
  doc.text('COMPROBANTE DE PAGO', logoCx, y, { align: 'center' })
  y += 13
  if (voided) {
    doc.setFillColor(...DANGER_BG)
    doc.roundedRect(MX, y, CW, 20, 4, 4, 'F')
    doc.setTextColor(...DANGER)
    doc.setFontSize(10)
    doc.text('ANULADO — Este pago no es válido', logoCx, y + 13, { align: 'center' })
    y += 20 + 10
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text(`Recibo #${p.receipt_number}`, MX, y)
  doc.text(`${date}${time ? `  ·  ${time}` : ''}`, R, y, { align: 'right' })
  y += 6
  doc.setDrawColor(...LINE)
  doc.line(MX, y, R, y)
  y += 14
  doc.setFontSize(10)
  const kv: [string, string][] = [
    ['Cliente:', input.clientName],
    ['Préstamo:', `PR-${String(input.loanNumber).padStart(4, '0')}`],
    ['Tipo:', typeLabel(p)]
  ]
  if (cuota) kv.push(['Cuota:', cuota])
  if (p.payment_method) kv.push(['Método:', PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method])
  for (const [k, v] of kv) {
    doc.setTextColor(...MUTED)
    doc.text(k, MX, y)
    doc.setTextColor(...TEXT)
    const lines = doc.splitTextToSize(v, CW - 66)
    doc.text(lines, MX + 66, y)
    y += 14 * lines.length
  }
  y += 4
  doc.line(MX, y, R, y)
  y += 14
  const rows: [string, number][] = [['Capital', p.principal_amount], ['Interés', p.interest_amount], ['Mora', p.late_fee_amount]]
  for (const [label, value] of rows) {
    doc.setTextColor(...TEXT)
    doc.text(label, MX, y)
    doc.text(`RD$ ${money(value)}`, R, y, { align: 'right' })
    y += 14
  }
  y += 2
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...SUCCESS_TEXT)
  doc.text(voided ? 'Total (anulado)' : 'Total', MX, y)
  doc.text(`RD$ ${money(p.total_amount)}`, R, y, { align: 'right' })
  y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.line(MX, y, R, y)
  y += 12
  if (p.pending_principal_after !== null && p.pending_principal_after !== undefined) {
    doc.text(`Capital pendiente: RD$ ${money(p.pending_principal_after)}`, MX, y)
    y += 12
  }
  if (p.next_due_date) {
    doc.text(`Próxima cuota: ${shortDate(p.next_due_date)}  ·  RD$ ${money(p.next_installment_amount)}`, MX, y)
    y += 12
  }
  if (input.footer) {
    y += 6
    doc.text(input.footer, logoCx, y, { align: 'center' })
    y += 12
  }
  return y + 10
}

// PDF en formato pequeño: primero se mide el alto del contenido y luego se crea la
// página con ese alto exacto.
export async function buildReceiptPdf(input: ReceiptDocInput): Promise<Blob> {
  let logo: string | null = null
  if (input.logoUrl) logo = await circularLogoDataUrl(input.logoUrl)
  const probe = new jsPDF({ unit: 'pt', format: [PAGE_W, 1200] })
  const endY = drawReceipt(probe, input, logo)
  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, endY + 12] })
  drawReceipt(doc, input, logo)
  return doc.output('blob')
}

// Comparte el recibo como archivo PDF. Si el navegador no acepta archivos, cae al
// texto de siempre y avisa que el PDF está en Imprimir / PDF.
export async function shareReceipt(input: ReceiptDocInput): Promise<'shared' | 'copied'> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (typeof nav.share === 'function') {
    try {
      const file = new File([await buildReceiptPdf(input)], `${fileBase(input.payment)}.pdf`, { type: 'application/pdf' })
      if (!nav.canShare || nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: 'Comprobante de pago' })
        return 'shared'
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'shared'
    }
  }
  try { await navigator.clipboard.writeText(receiptShareText(input)) } catch { /* sin portapapeles */ }
  window.alert('No se pudo compartir el PDF en este navegador. El comprobante se copió como texto; usa Imprimir / PDF para guardarlo en PDF.')
  return 'copied'
}
