import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, User, HandCoins, type LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useOutsideClose } from '@/components/ui/Dropdown'
import type { NavItem } from './navConfig'

type Hit = { id: string; kind: 'page' | 'client' | 'loan'; title: string; subtitle: string; to: string; icon: LucideIcon }
type ClientRow = { id: string; full_name: string; phone: string | null }
type LoanRow = { id: string; loan_number: number; status: string; clients: { full_name: string } | { full_name: string }[] | null }

const fold = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const clientName = (c: LoanRow['clients']) => (Array.isArray(c) ? c[0]?.full_name ?? '' : c?.full_name ?? '')

// Buscador global de solo lectura: páginas, clientes y préstamos. Usa las mismas tablas
// y los mismos permisos (RLS) que el resto de la app; cada quien solo encuentra lo que puede ver.
export function GlobalSearch({ pages, autoFocus, onDone }: { pages: NavItem[]; autoFocus?: boolean; onDone?: () => void }) {
  const navigate = useNavigate()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  useOutsideClose(rootRef, open, () => setOpen(false))

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term), 250)
    return () => window.clearTimeout(timer)
  }, [term])

  // Atajo: Ctrl/⌘ + K enfoca el buscador desde cualquier pantalla.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const q = debounced.trim()
  const remote = useQuery({
    queryKey: ['global-search', q],
    enabled: q.length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      // Se quitan los caracteres con significado especial del filtro para que el texto se busque tal cual.
      const safe = q.replace(/[%,()*\\]/g, ' ').trim()
      const numeric = /^\d+$/.test(safe) ? Number(safe) : null
      const [clientsRes, loansRes] = await Promise.all([
        supabase.from('clients').select('id, full_name, phone').is('deleted_at', null)
          .or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%`).order('full_name').limit(5),
        supabase.from('loans').select('id, loan_number, status, clients!inner(full_name)').is('deleted_at', null)
          .ilike('clients.full_name', `%${safe}%`).order('loan_number', { ascending: false }).limit(5)
      ])
      if (clientsRes.error) throw clientsRes.error
      if (loansRes.error) throw loansRes.error
      let loans = (loansRes.data ?? []) as unknown as LoanRow[]
      if (numeric !== null) {
        const byNumber = await supabase.from('loans').select('id, loan_number, status, clients(full_name)')
          .is('deleted_at', null).eq('loan_number', numeric).limit(1)
        const extra = (byNumber.data ?? []) as unknown as LoanRow[]
        loans = [...extra, ...loans.filter((l) => !extra.some((x) => x.id === l.id))]
      }
      return { clients: (clientsRes.data ?? []) as unknown as ClientRow[], loans }
    }
  })

  const folded = fold(q)
  const pageHits: Hit[] = pages
    .filter((p) => folded === '' || fold(p.label).includes(folded))
    .slice(0, folded === '' ? 6 : 4)
    .map((p) => ({ id: `p-${p.to}`, kind: 'page', title: p.label, subtitle: 'Ir a la sección', to: p.to, icon: p.icon }))
  const clientHits: Hit[] = (remote.data?.clients ?? [])
    .map((c) => ({ id: `c-${c.id}`, kind: 'client' as const, title: c.full_name, subtitle: c.phone ?? 'Cliente', to: `/clientes/${c.id}`, icon: User }))
  const loanHits: Hit[] = (remote.data?.loans ?? [])
    .map((l) => ({ id: `l-${l.id}`, kind: 'loan' as const, title: `Préstamo #${l.loan_number}`, subtitle: clientName(l.clients) || 'Préstamo', to: `/prestamos/${l.id}`, icon: HandCoins }))

  const sections = [
    { title: 'Clientes', hits: clientHits },
    { title: 'Préstamos', hits: loanHits },
    { title: folded === '' ? 'Ir a' : 'Páginas', hits: pageHits }
  ].filter((s) => s.hits.length > 0)
  const flat = sections.flatMap((s) => s.hits)

  useEffect(() => { setActive(0) }, [debounced, remote.data])

  function go(hit: Hit) {
    navigate(hit.to)
    setOpen(false)
    setTerm('')
    setDebounced('')
    onDone?.()
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, Math.max(flat.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      const hit = flat[active]
      if (hit) { e.preventDefault(); go(hit) }
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
      onDone?.()
    }
  }

  let counter = -1
  const noResults = q.length >= 2 && !remote.isFetching && flat.length === 0

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="focus-glow flex h-10 items-center gap-2 rounded-xl border border-line bg-surface/70 px-3">
        <Search size={16} className="shrink-0 text-content-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && flat[active] ? `${listId}-${active}` : undefined}
          aria-label="Buscar clientes, préstamos y páginas"
          placeholder="Buscar clientes, préstamos, páginas…"
          autoFocus={autoFocus}
          value={term}
          onChange={(e) => { setTerm(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm text-content placeholder:text-content-muted focus:outline-none"
        />
        <span className="kbd hidden lg:inline-flex" aria-hidden="true">{isMac ? '⌘K' : 'Ctrl K'}</span>
      </div>

      {open && (
        <div id={listId} role="listbox" aria-label="Resultados de búsqueda"
          className="glass-panel glass-strong popover-enter absolute left-0 right-0 z-50 mt-2 max-h-[70vh] overflow-y-auto p-1.5">
          {sections.map((section) => (
            <div key={section.title} className="mb-1">
              <p role="presentation" className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-content-muted">{section.title}</p>
              {section.hits.map((hit) => {
                counter += 1
                const index = counter
                const Icon = hit.icon
                return (
                  <button
                    key={hit.id}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(hit)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${index === active ? 'bg-primary/10' : ''}`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon size={16} /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-content">{hit.title}</span>
                      <span className="block truncate text-xs text-content-muted">{hit.subtitle}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
          {q.length >= 2 && remote.isFetching && <p role="presentation" className="px-3 py-3 text-sm text-content-muted">Buscando…</p>}
          {noResults && <p role="presentation" className="px-3 py-3 text-sm text-content-muted">Sin resultados para “{q}”.</p>}
        </div>
      )}
    </div>
  )
}
