import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import type { NavGroup } from './navConfig'

const STORAGE_KEY = 'capitalia_nav_groups'

function loadClosed(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

// Lista de navegación con grupos que se abren y cierran suavemente (recuerda cuáles cerraste).
// En modo compacto muestra solo iconos.
export function NavList({ groups, collapsed, onNavigate }: { groups: NavGroup[]; collapsed?: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const [closed, setClosed] = useState<string[]>(loadClosed)

  // El grupo que contiene la página actual siempre queda abierto.
  useEffect(() => {
    const current = groups.find((g) => g.items.some((n) => (n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`))))
    if (current && closed.includes(current.id)) setClosed((c) => c.filter((id) => id !== current.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(closed)) } catch { /* sin almacenamiento: no pasa nada */ }
  }, [closed])

  function toggle(id: string) {
    setClosed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }

  return (
    <ul className="space-y-1">
      {groups.map((group) => {
        const isOpen = collapsed || !group.label || !closed.includes(group.id)
        const panelId = `nav-group-${group.id}`
        return (
          <li key={group.id} className={group.label && collapsed ? 'border-t border-white/10 pt-1' : undefined}>
            {group.label && !collapsed && (
              <button
                type="button"
                className="nav-group-title"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(group.id)}
              >
                {group.label}
                <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} aria-hidden="true" />
              </button>
            )}
            <div id={panelId} className="collapse-grid" data-open={isOpen}>
              <div aria-hidden={!isOpen}>
                <ul className="space-y-0.5 py-0.5">
                  {group.items.map(({ to, label, end, icon: Icon }) => (
                    <li key={to}>
                      <NavLink
                        to={to}
                        end={end}
                        onClick={onNavigate}
                        title={collapsed ? label : undefined}
                        aria-label={collapsed ? label : undefined}
                        tabIndex={isOpen ? 0 : -1}
                        className={`nav-link ${collapsed ? 'justify-center !px-0' : ''}`}
                      >
                        <Icon size={18} className="shrink-0" aria-hidden="true" />
                        {!collapsed && <span className="truncate">{label}</span>}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
