import {
  BarChart2,
  Beaker,
  BookOpen,
  Building2,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Droplets,
  FileBarChart,
  FolderKanban,
  FolderOpen,
  LogOut,
  Settings,
  Waves,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { DrenLogo } from '../icons/DrenLogo'

interface NavItem {
  to: string
  label: string
  icon: typeof BarChart2
  end?: boolean
}

interface NavGroup {
  title?: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  { items: [{ to: '/', label: 'Dashboard', icon: BarChart2, end: true }] },
  {
    title: 'Cadastros',
    items: [
      { to: '/clientes', label: 'Clientes', icon: Building2 },
      { to: '/projetos', label: 'Projetos', icon: FolderKanban },
      { to: '/bacias', label: 'Bacias', icon: FolderOpen },
    ],
  },
  {
    title: 'Cálculos',
    items: [
      { to: '/sarjeta-critica', label: 'Sarjeta Crítica', icon: Waves },
      { to: '/rede-pluvial', label: 'Rede Pluvial', icon: Droplets },
    ],
  },
  {
    title: 'Controle',
    items: [
      { to: '/conformidade', label: 'Conformidade', icon: ClipboardCheck },
      { to: '/relatorios', label: 'Relatórios', icon: FileBarChart },
    ],
  },
  {
    title: 'Administração',
    items: [
      { to: '/equacoes-idf', label: 'Equações IDF', icon: Calculator },
      { to: '/materiais', label: 'Materiais e rugosidade', icon: Beaker },
    ],
  },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-y-auto bg-brand transition-all ${collapsed ? 'w-16' : 'w-60'}`}
    >
      <div className={`flex items-center gap-2 px-4 py-5 ${collapsed ? 'justify-center px-2' : ''}`}>
        <DrenLogo size={26} light />
        {!collapsed && (
          <div className="leading-tight">
            <div className="font-sans text-base font-bold text-white">miso4dren</div>
            <div className="text-[10px] font-medium tracking-wide text-white/70">MISORELLI ENGENHARIA</div>
          </div>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-3 px-2">
        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {group.title && !collapsed && (
              <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-white/60">
                {group.title}
              </div>
            )}
            <div className="flex flex-col gap-1">
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? 'bg-white text-brand' : 'text-white/85 hover:bg-white/10 hover:text-white'
                    }`
                  }
                  title={collapsed ? label : undefined}
                >
                  <Icon size={18} className="shrink-0" />
                  {!collapsed && <span>{label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-1 border-t border-white/15 p-2">
        <button
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
          title={collapsed ? 'Configurações' : undefined}
        >
          <Settings size={18} className="shrink-0" />
          {!collapsed && <span>Configurações</span>}
        </button>
        <button
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-white"
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut size={18} className="shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="mt-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!collapsed && <span>Recolher</span>}
        </button>
        {!collapsed && (
          <NavLink
            to="/manual"
            className="mt-1 flex items-center gap-3 rounded-lg px-3 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white"
          >
            <BookOpen size={14} className="shrink-0" />
            <span>Manual / Ajuda</span>
          </NavLink>
        )}
        {!collapsed && <div className="px-3 pt-1 text-[10px] text-white/50">miso4dren · v0.1.0</div>}
      </div>
    </aside>
  )
}
