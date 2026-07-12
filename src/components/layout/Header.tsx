import { Bell, ChevronDown, Search, Settings, UserCircle } from 'lucide-react'
import { useObraContext } from '../../lib/ObraContext'

export function Header() {
  const { obras, obraAtivaId, setObraAtivaId } = useObraContext()

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
      <div className="flex max-w-xl flex-1 items-center gap-2 rounded-lg bg-elevated px-3 py-2">
        <Search size={16} className="text-text-secondary" />
        <input
          type="text"
          placeholder="Buscar obras, trechos, bacias..."
          className="w-full bg-transparent text-sm text-text-primary placeholder:text-text-secondary focus:outline-none"
        />
        <span className="rounded border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
          Ctrl K
        </span>
      </div>

      {obras.length > 0 && (
        <div className="relative">
          <select
            value={obraAtivaId ?? ''}
            onChange={(e) => setObraAtivaId(e.target.value || null)}
            className="appearance-none rounded-lg border border-border bg-elevated py-2 pl-3 pr-8 text-sm font-medium text-text-primary focus:border-brand focus:outline-none"
          >
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
        </div>
      )}

      <div className="ml-auto flex items-center gap-4 text-text-secondary">
        <button aria-label="Notificações" className="hover:text-brand">
          <Bell size={20} />
        </button>
        <button aria-label="Usuário" className="hover:text-brand">
          <UserCircle size={22} />
        </button>
        <button aria-label="Configurações" className="hover:text-brand">
          <Settings size={20} />
        </button>
      </div>
    </header>
  )
}
