import { useState, type ChangeEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { money0 } from './lib'
import { GreetingHeader } from './GreetingHeader'

// Contratos: crear (legal o informal, con el texto generado en pantalla antes de
// guardar), lista con su estado, subida del firmado (PDF o foto) y vista del
// firmado con URL firmada. Sin RequirePaid: es funcion basica del negocio y no
// existe una llave de plan para ella (una llave desconocida la bloquearia).
type ContractRow = {
  id: string; client_id: string; loan_id: string | null; contract_type: string
  body: string; signed_file_path: string | null; created_at: string
}
type ClientRow = { id: string; full_name: string; document_id: string | null; phone: string | null; address: string | null }
type LoanRow = { id: string; loan_number: number; client_id: string; principal: number; interest_rate: number; term_installments: number | null; frequency: string }
type BusinessInfo = { name: string; owner_name: string | null; rnc: string | null; address: string | null; phone: string | null }
type Terms = { monto: number; tasa: number; plazo: number; frecuencia: string }

const FREQ_LABEL: Record<string, string> = { weekly: 'semanal', biweekly: 'quincenal', monthly: 'mensual' }
const TYPE_LABEL: Record<string, string> = { legal: 'Legal', informal: 'Informal' }

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fechaHoy() {
  return new Date().toLocaleDateString('es-DO')
}

// Texto legal estandar para revision de JC antes de usarlo: no es asesoria legal.
function buildLegalBody(b: BusinessInfo, c: ClientRow, t: Terms, fecha: string) {
  const prestamista = b.rnc ? `${b.name}, RNC ${b.rnc}` : b.name
  const domicilioPrestamista = b.address ? `, con domicilio en ${b.address}` : ''
  const cedula = c.document_id ? `, cédula ${c.document_id}` : ''
  const domicilioCliente = c.address ? `, con domicilio en ${c.address}` : ''
  const telefonoCliente = c.phone ? `, teléfono ${c.phone}` : ''
  const cuota = t.plazo > 0 ? Math.round((t.monto * (1 + t.tasa / 100) / t.plazo) * 100) / 100 : 0
  return `CONTRATO DE PRÉSTAMO DE DINERO

En la República Dominicana, a ${fecha}, comparecen: EL PRESTAMISTA, ${prestamista}${domicilioPrestamista}; y EL PRESTATARIO, ${c.full_name}${cedula}${domicilioCliente}${telefonoCliente}. Ambas partes, con capacidad legal para contratar, acuerdan lo siguiente:

PRIMERA: OBJETO Y ENTREGA. EL PRESTAMISTA entrega en este acto a EL PRESTATARIO, quien declara recibir conforme, la suma de RD$ ${money0(t.monto)}, en calidad de préstamo de dinero.

SEGUNDA: INTERÉS. Sobre el capital prestado se aplica una tasa de ${t.tasa}% por todo el plazo del préstamo, para un total a pagar de RD$ ${money0(t.monto * (1 + t.tasa / 100))}.

TERCERA: PLAZO Y FORMA DE PAGO. EL PRESTATARIO pagará en ${t.plazo} cuotas ${FREQ_LABEL[t.frecuencia] ?? t.frecuencia}es de RD$ ${money0(cuota)} cada una, en las fechas que se establezcan en el plan de pagos que forma parte de este contrato.

CUARTA: MORA. La falta de pago de una cuota en su fecha de vencimiento genera un cargo por mora sobre el monto atrasado, conforme a la tasa de mora vigente del PRESTAMISTA, sin perjuicio de los demás derechos que le asisten.

QUINTA: GASTOS. Los gastos, honorarios y costos que genere el cobro judicial o extrajudicial de este préstamo, si los hubiere, serán por cuenta de EL PRESTATARIO.

SEXTA: PAGO ANTICIPADO. EL PRESTATARIO podrá pagar por adelantado, total o parcialmente, el saldo pendiente, aplicándose el pago primero a la mora, luego al interés y luego al capital.

SÉPTIMA: JURISDICCIÓN. Para todo lo relativo a este contrato, las partes se someten a la jurisdicción de los tribunales competentes de la República Dominicana.

OCTAVA: FIRMAS. Leído y aprobado por ambas partes, firman en dos ejemplares de un mismo tenor y efecto.


EL PRESTAMISTA: ___________________________


EL PRESTATARIO: ___________________________`}

function buildInformalBody(b: BusinessInfo, c: ClientRow, t: Terms, fecha: string) {
  const cedula = c.document_id ? `, cédula ${c.document_id}` : ''
  const cuota = t.plazo > 0 ? Math.round((t.monto * (1 + t.tasa / 100) / t.plazo) * 100) / 100 : 0
  return `ACUERDO DE PRÉSTAMO ENTRE PARTICULARES

En la República Dominicana, a ${fecha}, ${b.name} (EL PRESTAMISTA) entrega a ${c.full_name}${cedula} (EL PRESTATARIO) la suma de RD$ ${money0(t.monto)} en calidad de préstamo.

EL PRESTATARIO se compromete a devolver RD$ ${money0(t.monto * (1 + t.tasa / 100))} en ${t.plazo} cuotas ${FREQ_LABEL[t.frecuencia] ?? t.frecuencia}es de RD$ ${money0(cuota)} cada una.

En caso de atraso, se aplicará el cargo por mora acostumbrado por EL PRESTAMISTA. EL PRESTATARIO puede adelantar pagos en cualquier momento.

En señal de conformidad, firman:


EL PRESTAMISTA: ___________________________


EL PRESTATARIO: ___________________________`}

export function Contracts() {
  const { business } = useAuth()
  const qc = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [clientId, setClientId] = useState('')
  const [loanId, setLoanId] = useState('')
  const [ctype, setCtype] = useState<'legal' | 'informal'>('legal')
  const [monto, setMonto] = useState('')
  const [tasa, setTasa] = useState('')
  const [plazo, setPlazo] = useState('')
  const [frecuencia, setFrecuencia] = useState('monthly')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const contractsQuery = useQuery({
    queryKey: ['nuevo_contracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('id, client_id, loan_id, contract_type, body, signed_file_path, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ContractRow[]
    }
  })
  const clientsQuery = useQuery({
    queryKey: ['nuevo_contract_clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, document_id, phone, address')
        .is('deleted_at', null)
        .order('full_name')
      if (error) throw error
      return data as ClientRow[]
    }
  })
  const loansQuery = useQuery({
    queryKey: ['nuevo_contract_loans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loans')
        .select('id, loan_number, client_id, principal, interest_rate, term_installments, frequency')
        .is('deleted_at', null)
        .order('loan_number', { ascending: false })
      if (error) throw error
      return data as LoanRow[]
    }
  })

  const contracts = contractsQuery.data ?? []
  const clients = clientsQuery.data ?? []
  const loans = loansQuery.data ?? []
  const clientById = new Map(clients.map((c) => [c.id, c]))
  const loanById = new Map(loans.map((l) => [l.id, l]))
  const selectedClient = clients.find((c) => c.id === clientId) ?? null
  const selectedLoan = loans.find((l) => l.id === loanId) ?? null
  const clientLoans = loans.filter((l) => l.client_id === clientId)

  const terms: Terms = selectedLoan
    ? { monto: Number(selectedLoan.principal), tasa: Number(selectedLoan.interest_rate), plazo: selectedLoan.term_installments ?? Number(plazo || 0), frecuencia: selectedLoan.frequency }
    : { monto: Number(monto || 0), tasa: Number(tasa || 0), plazo: Number(plazo || 0), frecuencia }
  const termsValid = terms.monto > 0 && terms.tasa >= 0 && terms.plazo >= 1
  const previewBody = selectedClient && business && termsValid
    ? (ctype === 'legal' ? buildLegalBody(business, selectedClient, terms, fechaHoy()) : buildInformalBody(business, selectedClient, terms, fechaHoy()))
    : null

  function pickClient(id: string) {
    setClientId(id)
    setLoanId('')
  }

  async function createContract() {
    if (!business?.id) { setFormError('No se pudo identificar el negocio.'); return }
    if (!selectedClient) { setFormError('Elige un cliente.'); return }
    if (!termsValid) { setFormError('Revisa monto, tasa y plazo.'); return }
    if (!previewBody) { setFormError('No se pudo generar el texto.'); return }
    setSaving(true)
    setFormError(null)
    const { data, error } = await supabase.from('contracts').insert({
      business_id: business.id,
      client_id: selectedClient.id,
      loan_id: selectedLoan ? selectedLoan.id : null,
      contract_type: ctype,
      body: previewBody
    }).select('id').single()
    setSaving(false)
    if (error) { setFormError('No se pudo crear el contrato: ' + error.message); return }
    qc.invalidateQueries({ queryKey: ['nuevo_contracts'] })
    setExpandedId(data.id)
    setFormOpen(false)
    setClientId('')
    setLoanId('')
    setMonto('')
    setTasa('')
    setPlazo('')
  }

  async function uploadSigned(c: ContractRow, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !business?.id) return
    if (file.size > 10 * 1024 * 1024) { setActionError('El archivo no puede pesar más de 10 MB.'); return }
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const validExt = ['pdf', 'png', 'jpg', 'jpeg', 'webp'].includes(ext)
    const validMime = !file.type || ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type)
    if (!validExt || !validMime) {
      setActionError('Solo se permiten archivos PDF o imágenes (PNG, JPG, WEBP).')
      return
    }
    setUploadingId(c.id)
    setActionError(null)
    const path = `${business.id}/${c.id}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('contratos').upload(path, file)
    if (upErr) { setUploadingId(null); setActionError('No se pudo subir el firmado: ' + upErr.message); return }
    const oldPath = c.signed_file_path
    const { error: dbErr } = await supabase.from('contracts').update({ signed_file_path: path }).eq('id', c.id)
    setUploadingId(null)
    if (dbErr) { setActionError('Se subió el archivo pero no quedó ligado: ' + dbErr.message); return }
    if (oldPath) { await supabase.storage.from('contratos').remove([oldPath]) }
    qc.invalidateQueries({ queryKey: ['nuevo_contracts'] })
  }

  async function viewSigned(c: ContractRow) {
    if (!c.signed_file_path) return
    const { data, error } = await supabase.storage.from('contratos').createSignedUrl(c.signed_file_path, 3600)
    if (error || !data) { setActionError('No se pudo abrir el firmado: ' + (error?.message ?? '')); return }
    window.open(data.signedUrl, '_blank')
  }

  async function deleteContract(c: ContractRow) {
    const { error } = await supabase.from('contracts').update({ deleted_at: new Date().toISOString() }).eq('id', c.id)
    if (error) { setActionError('No se pudo eliminar: ' + error.message); return }
    setDeleteId(null)
    qc.invalidateQueries({ queryKey: ['nuevo_contracts'] })
  }

  // Imprimir ya NO usa el iframe de impresion: en el celular no hacia nada visible.
  // Ahora abre el contrato en una pestana nueva como documento imprimible, con su
  // propio boton Imprimir (el dialogo lo abre el navegador de esa pestana).
  function printContract(c: ContractRow, clientName: string) {
    const doc = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Contrato - ${escapeHtml(clientName)}</title><style>body{font-family:Georgia,serif;color:#000;background:#fff;margin:24px}pre{white-space:pre-wrap;font-family:Georgia,serif;font-size:14px;line-height:1.5}@media print{.print-btn{display:none}}</style></head><body><button class="print-btn" onclick="window.print()">Imprimir / PDF</button><pre>${escapeHtml(c.body)}</pre><script>window.print()</script></body></html>`
    const blob = new Blob([doc], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  const field = 'w-full rounded-xl bg-[var(--nc-soft)] px-4 py-3 text-sm text-[var(--nc-text)] outline-none placeholder:text-[var(--nc-faint)] focus:ring-2 focus:ring-[#2563EB]'

  return (
    <div className="space-y-4">
      <GreetingHeader />
      <div>
        <h1 className="text-[28px] font-bold leading-tight text-[var(--nc-text)]">Contratos</h1>
        <p className="text-sm text-[var(--nc-muted)]">Genera el contrato, imprímelo para firmar y guarda el firmado aquí.</p>
      </div>

      {actionError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">{actionError}</p>}

      <button onClick={() => setFormOpen(!formOpen)} className="block w-full rounded-xl bg-[#2563EB] py-3 text-sm font-semibold text-white">
        {formOpen ? 'Cerrar formulario' : '+ Crear contrato'}
      </button>

      {formOpen && (
        <div className="space-y-3 rounded-2xl bg-[var(--nc-card)] p-4">
          {formError && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">{formError}</p>}
          <select value={clientId} onChange={(e) => pickClient(e.target.value)} className={field}>
            <option value="">Elige un cliente…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
          <select value={loanId} onChange={(e) => setLoanId(e.target.value)} disabled={!clientId} className={field}>
            <option value="">Sin préstamo ligado (términos manuales)</option>
            {clientLoans.map((l) => <option key={l.id} value={l.id}>PR-{String(l.loan_number).padStart(4, '0')} · RD$ {money0(l.principal)}</option>)}
          </select>
          <div className="flex gap-2">
            {(['legal', 'informal'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setCtype(t)}
                className={`flex-1 rounded-full py-2.5 text-sm font-medium ${ctype === t ? 'bg-[#2563EB] text-white' : 'bg-[var(--nc-soft)] text-[var(--nc-muted)]'}`}>
                {t === 'legal' ? 'Legal' : 'Informal'}
              </button>
            ))}
          </div>
          {selectedLoan ? (
            <div className="rounded-xl bg-[var(--nc-soft)] px-3 py-2 text-xs text-[var(--nc-muted)]">
              <p>Términos del préstamo: RD$ {money0(terms.monto)} · {terms.tasa}% · {terms.plazo} cuotas {FREQ_LABEL[terms.frecuencia] ?? terms.frecuencia}es</p>
              {selectedLoan.term_installments === null && (
                <input type="number" min={1} value={plazo} onChange={(e) => setPlazo(e.target.value)} placeholder="Plazo en cuotas" className={`${field} mt-2`} />
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Monto RD$" className={field} />
              <input type="number" min={0} step="0.01" value={tasa} onChange={(e) => setTasa(e.target.value)} placeholder="Tasa % total" className={field} />
              <input type="number" min={1} value={plazo} onChange={(e) => setPlazo(e.target.value)} placeholder="Plazo en cuotas" className={field} />
              <select value={frecuencia} onChange={(e) => setFrecuencia(e.target.value)} className={field}>
                <option value="monthly">Mensual</option>
                <option value="biweekly">Quincenal</option>
                <option value="weekly">Semanal</option>
              </select>
            </div>
          )}
          {previewBody ? (
            <div>
              <p className="mb-1 text-xs text-[var(--nc-muted)]">Así quedará el contrato:</p>
              <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl bg-[var(--nc-soft)] px-3 py-2 text-xs text-[var(--nc-text)]">{previewBody}</p>
            </div>
          ) : (
            <p className="text-xs text-[var(--nc-muted)]">Elige un cliente y completa los términos para ver el texto.</p>
          )}
          <button onClick={createContract} disabled={saving || !previewBody} className="block w-full rounded-xl bg-[#2563EB] py-3 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? 'Guardando…' : 'Generar contrato'}
          </button>
        </div>
      )}

      {contractsQuery.isLoading && <p className="text-sm text-[var(--nc-muted)]">Cargando…</p>}
      {contractsQuery.error && <p className="text-sm text-red-400">No se pudieron cargar los contratos.</p>}
      {!contractsQuery.isLoading && contracts.length === 0 && (
        <div className="rounded-2xl bg-[var(--nc-card)] px-4 py-6 text-center text-sm text-[var(--nc-muted)]">Sin contratos todavía.</div>
      )}

      <div className="space-y-3">
        {contracts.map((c) => {
          const client = clientById.get(c.client_id)
          const loan = c.loan_id ? loanById.get(c.loan_id) : undefined
          const signed = !!c.signed_file_path
          const expanded = expandedId === c.id
          return (
            <div key={c.id} className="rounded-2xl bg-[var(--nc-card)] p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--nc-text)]">{client?.full_name ?? '—'}</p>
                  <p className="text-xs text-[var(--nc-muted)]">
                    {TYPE_LABEL[c.contract_type] ?? c.contract_type}
                    {loan ? ` · PR-${String(loan.loan_number).padStart(4, '0')}` : ' · Sin préstamo ligado'}
                    {` · ${new Date(c.created_at).toLocaleDateString('es-DO')}`}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${signed ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'}`}>
                  {signed ? 'Firmado' : 'Por firmar'}
                </span>
              </div>

              {expanded && (
                <div className="mt-3 space-y-2">
                  <div id={`contract-body-${c.id}`} className="whitespace-pre-wrap rounded-xl bg-[var(--nc-soft)] px-3 py-2 text-xs text-[var(--nc-text)]">
                    {c.body}
                  </div>
                  <button onClick={() => printContract(c, client?.full_name ?? 'Cliente')} className="block w-full rounded-xl bg-[var(--nc-soft)] py-2.5 text-sm font-medium text-[var(--nc-text)]">Imprimir / PDF</button>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => setExpandedId(expanded ? null : c.id)} className="rounded-xl bg-[var(--nc-soft)] px-3 py-2 text-xs font-medium text-[var(--nc-text)]">
                  {expanded ? 'Ocultar' : 'Ver contrato'}
                </button>
                {signed && (
                  <button onClick={() => viewSigned(c)} className="rounded-xl bg-[var(--nc-soft)] px-3 py-2 text-xs font-medium text-[var(--nc-text)]">Ver firmado</button>
                )}
                <label className="cursor-pointer rounded-xl bg-[var(--nc-soft)] px-3 py-2 text-xs font-medium text-[var(--nc-text)]">
                  {uploadingId === c.id ? 'Subiendo…' : signed ? 'Cambiar firmado' : 'Subir firmado'}
                  <input type="file" accept=".pdf,image/png,image/jpeg,image/webp" className="hidden" disabled={uploadingId === c.id} onChange={(e) => uploadSigned(c, e)} />
                </label>
                {deleteId === c.id ? (
                  <span className="flex items-center gap-2">
                    <button onClick={() => deleteContract(c)} className="rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white">Sí, eliminar</button>
                    <button onClick={() => setDeleteId(null)} className="rounded-xl bg-[var(--nc-soft)] px-3 py-2 text-xs font-medium text-[var(--nc-text)]">No</button>
                  </span>
                ) : (
                  <button onClick={() => setDeleteId(c.id)} className="rounded-xl px-3 py-2 text-xs font-medium text-red-400">Eliminar</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
