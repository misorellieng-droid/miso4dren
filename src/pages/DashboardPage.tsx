import { useEffect, useState } from 'react'
import { ClipboardCheck, Droplets, FolderKanban, FolderOpen } from 'lucide-react'
import { StatCard } from '../components/ui/StatCard'
import { useRevisaoContext } from '../lib/RevisaoContext'
import { listBacias } from '../lib/baciasStorage'
import { listTrechos } from '../lib/redeStorage'
import { listResultadosRedeByRevisao } from '../lib/resultadosStorage'
import { supabase } from '../lib/supabase'

export function DashboardPage() {
  const { revisoes, revisaoAtiva } = useRevisaoContext()
  const [baciasCount, setBaciasCount] = useState(0)
  const [trechosCount, setTrechosCount] = useState(0)
  const [naoConformesCount, setNaoConformesCount] = useState(0)

  useEffect(() => {
    if (!revisaoAtiva) return
    listBacias(revisaoAtiva.id).then((b) => setBaciasCount(b.length)).catch(() => {})
    listTrechos(revisaoAtiva.id).then((t) => setTrechosCount(t.length)).catch(() => {})
    listResultadosRedeByRevisao(revisaoAtiva.id)
      .then((r) => setNaoConformesCount(r.filter((x) => x.conforme === false).length))
      .catch(() => {})
  }, [revisaoAtiva])

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="font-sans text-xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-secondary">
          {revisaoAtiva ? `Revisão ativa: ${revisaoAtiva.projeto_nome} — ${revisaoAtiva.nome}` : 'Nenhuma revisão selecionada ainda.'}
        </p>
      </div>

      {!supabase && (
        <div className="mb-4 rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3 text-sm text-accent-amber">
          Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para usar cadastros e cálculos.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revisões" value={revisoes.length} icon={FolderKanban} tone="brand" />
        <StatCard label="Bacias" value={baciasCount} icon={FolderOpen} tone="brand" />
        <StatCard label="Trechos de rede" value={trechosCount} icon={Droplets} tone="brand" />
        <StatCard
          label="Trechos não conformes"
          value={naoConformesCount}
          icon={ClipboardCheck}
          tone={naoConformesCount > 0 ? 'red' : 'green'}
        />
      </div>
    </div>
  )
}
