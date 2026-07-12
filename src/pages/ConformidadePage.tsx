import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardCheck } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { useRevisaoContext } from '../lib/RevisaoContext'
import { listResultadosRedeByRevisao, type ResultadoRedeRecord } from '../lib/resultadosStorage'
import { supabase } from '../lib/supabase'

interface LinhaResultado extends ResultadoRedeRecord {
  trecho_nome: string
}

export function ConformidadePage() {
  const { revisaoAtiva } = useRevisaoContext()
  const [resultados, setResultados] = useState<LinhaResultado[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!revisaoAtiva) {
      setLoading(false)
      return
    }
    setLoading(true)
    listResultadosRedeByRevisao(revisaoAtiva.id)
      .then(setResultados)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [revisaoAtiva])

  if (!supabase || !revisaoAtiva) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumb items={['Controle', 'Conformidade']} />
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          {!supabase ? 'Supabase não configurado.' : 'Selecione uma revisão em Cadastros → Projetos.'}
        </div>
      </div>
    )
  }

  const naoConformes = resultados.filter((r) => r.conforme === false)

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={['Controle', 'Conformidade']} />

      <div className="mb-6">
        <h1 className="font-sans text-xl font-bold text-text-primary">
          Conformidade — {revisaoAtiva.projeto_nome} — {revisaoAtiva.nome}
        </h1>
        <p className="text-sm text-text-secondary">Trechos de rede que não atendem aos critérios de lâmina, velocidade ou declividade.</p>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}

      {loading ? (
        <div className="text-sm text-text-secondary">Carregando...</div>
      ) : resultados.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          Nenhum resultado ainda — rode o cálculo em Cálculos → Rede Pluvial.
        </div>
      ) : naoConformes.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-accent-green/40 bg-accent-green/10 p-4 text-sm text-accent-green">
          <CheckCircle2 size={18} />
          Todos os {resultados.length} trecho(s) calculados estão conformes.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-accent-red/40 bg-surface">
          <div className="flex items-center gap-2 border-b border-accent-red/30 bg-accent-red/5 px-4 py-2.5 text-sm font-semibold text-accent-red">
            <ClipboardCheck size={16} />
            {naoConformes.length} de {resultados.length} trecho(s) não conforme(s)
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50 text-left text-xs text-text-secondary">
                <th className="px-4 py-2 font-medium">Trecho</th>
                <th className="px-4 py-2 font-medium">y/D</th>
                <th className="px-4 py-2 font-medium">Velocidade (m/s)</th>
                <th className="px-4 py-2 font-medium">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {naoConformes.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 font-medium text-text-primary">{r.trecho_nome}</td>
                  <td className="px-4 py-2 text-text-secondary">{r.y_sobre_d_pct?.toFixed(0)}%</td>
                  <td className="px-4 py-2 text-text-secondary">{r.velocidade_ms?.toFixed(2)}</td>
                  <td className="px-4 py-2 text-accent-red">
                    <span className="flex items-start gap-1.5">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      {r.motivo_nao_conformidade}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
