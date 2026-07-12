import { useEffect, useState } from 'react'
import { FileBarChart, FileDown } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { useRevisaoContext } from '../lib/RevisaoContext'
import { listEquacoesIdf, type EquacaoIdfRecord } from '../lib/idfStorage'
import { listBacias, type BaciaRecord } from '../lib/baciasStorage'
import { listCaixas } from '../lib/redeStorage'
import { listResultadosRedeByRevisao, listResultadosSarjeta, type ResultadoSarjetaRecord } from '../lib/resultadosStorage'
import { exportRelatorioPdf, type RelatorioData } from '../lib/exportPdf'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'

export function RelatoriosPage() {
  const { revisaoAtiva } = useRevisaoContext()
  const [equacao, setEquacao] = useState<EquacaoIdfRecord | null>(null)
  const [bacias, setBacias] = useState<BaciaRecord[]>([])
  const [sarjetas, setSarjetas] = useState<ResultadoSarjetaRecord[]>([])
  const [rede, setRede] = useState<RelatorioData['rede']>([])
  const [caixasPorId, setCaixasPorId] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!revisaoAtiva) return
    setError(null)
    Promise.all([
      revisaoAtiva.equacao_idf_id ? listEquacoesIdf() : Promise.resolve([]),
      listBacias(revisaoAtiva.id),
      listResultadosSarjeta(revisaoAtiva.id),
      listResultadosRedeByRevisao(revisaoAtiva.id),
      listCaixas(revisaoAtiva.id),
    ])
      .then(([eqs, b, s, r, c]) => {
        setEquacao((eqs as EquacaoIdfRecord[]).find((e) => e.id === revisaoAtiva.equacao_idf_id) ?? null)
        setBacias(b)
        setSarjetas(s)
        setRede(r)
        setCaixasPorId(new Map(c.map((cx) => [cx.id, cx.nome])))
      })
      .catch((e) => setError(e.message))
  }, [revisaoAtiva])

  const handleExport = () => {
    if (!revisaoAtiva) return
    exportRelatorioPdf({
      projetoNome: revisaoAtiva.projeto_nome ?? 'Sem projeto',
      revisao: revisaoAtiva,
      equacao,
      bacias,
      caixasPorId,
      sarjetas,
      rede,
    })
  }

  if (!supabase || !revisaoAtiva) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumb items={['Controle', 'Relatórios']} />
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          {!supabase ? 'Supabase não configurado.' : 'Selecione uma revisão em Cadastros → Projetos.'}
        </div>
      </div>
    )
  }

  const naoConformesCount = rede.filter((r) => r.conforme === false).length

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={['Controle', 'Relatórios']} />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-xl font-bold text-text-primary">
            Relatórios — {revisaoAtiva.projeto_nome} — {revisaoAtiva.nome}
          </h1>
          <p className="text-sm text-text-secondary">Memorial de cálculo consolidado: dados de entrada, bacias, sarjetas e rede.</p>
        </div>
        <button onClick={handleExport} className={PRIMARY_BTN}>
          <FileDown size={16} />
          Exportar PDF
        </button>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}

      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-1 font-sans text-sm font-semibold text-text-primary">Dados de entrada</div>
          <div className="text-sm text-text-secondary">
            Equação IDF: {equacao?.nome ?? '—'} · Tempo de retorno: {revisaoAtiva.tempo_retorno_anos ?? '—'} anos
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface p-4 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Bacias</div>
            <div className="font-sans text-xl font-bold text-text-primary">{bacias.length}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Sarjetas calculadas</div>
            <div className="font-sans text-xl font-bold text-text-primary">{sarjetas.length}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Trechos não conformes</div>
            <div className={`font-sans text-xl font-bold ${naoConformesCount > 0 ? 'text-accent-red' : 'text-accent-green'}`}>
              {naoConformesCount} / {rede.length}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-border bg-elevated/40 p-4 text-sm text-text-secondary">
          <FileBarChart size={16} className="text-brand" />
          O PDF exportado inclui a tabela completa de bacias (com vínculo final, para rastreabilidade), sarjetas, trechos de rede
          e a lista de não conformidades, se houver.
        </div>
      </div>
    </div>
  )
}
