import { useEffect, useState } from 'react'
import { Building2, ClipboardCheck, Droplets, FolderOpen } from 'lucide-react'
import { StatCard } from '../components/ui/StatCard'
import { useObraContext } from '../lib/ObraContext'
import { listBacias } from '../lib/baciasStorage'
import { listTrechos } from '../lib/redeStorage'
import { listResultadosRedeByObra } from '../lib/resultadosStorage'
import { supabase } from '../lib/supabase'

export function DashboardPage() {
  const { obras, obraAtiva } = useObraContext()
  const [baciasCount, setBaciasCount] = useState(0)
  const [trechosCount, setTrechosCount] = useState(0)
  const [naoConformesCount, setNaoConformesCount] = useState(0)

  useEffect(() => {
    if (!obraAtiva) return
    listBacias(obraAtiva.id).then((b) => setBaciasCount(b.length)).catch(() => {})
    listTrechos(obraAtiva.id).then((t) => setTrechosCount(t.length)).catch(() => {})
    listResultadosRedeByObra(obraAtiva.id)
      .then((r) => setNaoConformesCount(r.filter((x) => x.conforme === false).length))
      .catch(() => {})
  }, [obraAtiva])

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="font-sans text-xl font-bold text-text-primary">Dashboard</h1>
        <p className="text-sm text-text-secondary">
          {obraAtiva ? `Obra ativa: ${obraAtiva.nome}` : 'Nenhuma obra selecionada ainda.'}
        </p>
      </div>

      {!supabase && (
        <div className="mb-4 rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3 text-sm text-accent-amber">
          Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para usar cadastros e cálculos.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Obras" value={obras.length} icon={Building2} tone="brand" />
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
