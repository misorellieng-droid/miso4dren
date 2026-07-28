import { useEffect, useState } from 'react'
import { Archive, ArchiveRestore, Printer } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { listEquacoesIdf, type EquacaoIdfRecord } from '../lib/idfStorage'
import {
  arquivarResultadoSarjeta,
  listResultadosSarjetaArquivados,
  type ResultadoSarjetaArquivadoRecord,
} from '../lib/resultadosStorage'
import {
  arquivarResultadoSarjetao,
  listResultadosSarjetaoArquivados,
  type ResultadoSarjetaoArquivadoRecord,
} from '../lib/resultadosSarjetaoStorage'
import { exportSarjetaCriticaPdf } from '../lib/exportSarjetaCriticaPdf'
import { exportSarjetaoPdf } from '../lib/exportSarjetaoPdf'
import { construirMemorialSarjetaCritica } from './SarjetaCriticaPage'
import { parametrosExibicaoDoRegistroSarjetao, recalcularSarjetaoDoRegistro } from './SarjetaoDenteServaPage'
import { supabase } from '../lib/supabase'

const TAB_BTN = 'rounded-lg border px-3 py-1.5 text-xs font-medium transition'
const TAB_BTN_ACTIVE = `${TAB_BTN} border-brand bg-brand/10 text-brand`
const TAB_BTN_INACTIVE = `${TAB_BTN} border-border text-text-secondary hover:border-brand/50 hover:text-text-primary`

type Aba = 'sarjeta_critica' | 'sarjetao'

export function ArquivoPage() {
  const [aba, setAba] = useState<Aba>('sarjeta_critica')
  const [criticos, setCriticos] = useState<ResultadoSarjetaArquivadoRecord[]>([])
  const [sarjetoes, setSarjetoes] = useState<ResultadoSarjetaoArquivadoRecord[]>([])
  const [equacoes, setEquacoes] = useState<EquacaoIdfRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const recarregar = async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, s, e] = await Promise.all([listResultadosSarjetaArquivados(), listResultadosSarjetaoArquivados(), listEquacoesIdf()])
      setCriticos(c)
      setSarjetoes(s)
      setEquacoes(e)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar arquivo.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    recarregar()
  }, [])

  const handleRestaurarCritico = async (id: string) => {
    try {
      await arquivarResultadoSarjeta(id, false)
      await recarregar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao restaurar resultado.')
    }
  }

  const handleImprimirCritico = (h: ResultadoSarjetaArquivadoRecord) => {
    const { memorial, parametros } = construirMemorialSarjetaCritica(h)
    exportSarjetaCriticaPdf({
      nomeVia: h.nome_via,
      projetoNome: h.projeto_nome ?? 'Sem projeto',
      revisaoNome: h.revisao_nome,
      equacaoNome: null,
      tempoRetornoAnos: 10,
      intensidadeMmH: h.intensidade_mm_h,
      parametros,
      memorial,
    })
  }

  const handleRestaurarSarjetao = async (id: string) => {
    try {
      await arquivarResultadoSarjetao(id, false)
      await recarregar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao restaurar resultado.')
    }
  }

  const handleImprimirSarjetao = (h: ResultadoSarjetaoArquivadoRecord) => {
    const equacao = equacoes.find((e) => e.id === h.equacao_idf_id)
    if (!equacao) {
      setError(`Não foi possível regenerar o PDF de "${h.nome_trecho}" — a equação IDF da revisão não foi encontrada.`)
      return
    }
    try {
      const memorial = recalcularSarjetaoDoRegistro(h, equacao)
      exportSarjetaoPdf({
        nomeTrecho: h.nome_trecho,
        projetoNome: h.projeto_nome ?? 'Sem projeto',
        revisaoNome: h.revisao_nome,
        equacaoNome: equacao.nome,
        tempoRetornoAnos: h.tempo_retorno_anos,
        parametros: parametrosExibicaoDoRegistroSarjetao(h),
        memorial,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao regenerar o PDF do registro.')
    }
  }

  if (!supabase) {
    return (
      <div className="mx-auto max-w-4xl">
        <Breadcrumb items={['Arquivo']} />
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">Supabase não configurado.</div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb items={['Arquivo']} />

      <div className="mb-6">
        <h1 className="font-sans text-xl font-bold text-text-primary">Arquivo</h1>
        <p className="text-sm text-text-secondary">
          Relatórios de memória de cálculo arquivados, de todos os projetos e revisões — saíram da listagem ativa do
          projeto, mas continuam disponíveis aqui pra consulta, reimpressão ou restauração.
        </p>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}

      <div className="mb-4 flex gap-2">
        <button className={aba === 'sarjeta_critica' ? TAB_BTN_ACTIVE : TAB_BTN_INACTIVE} onClick={() => setAba('sarjeta_critica')}>
          Sarjeta Crítica ({criticos.length})
        </button>
        <button className={aba === 'sarjetao' ? TAB_BTN_ACTIVE : TAB_BTN_INACTIVE} onClick={() => setAba('sarjetao')}>
          Sarjetão Dente de Serra ({sarjetoes.length})
        </button>
      </div>

      {loading ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">Carregando...</div>
      ) : aba === 'sarjeta_critica' ? (
        criticos.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">Nenhum registro arquivado.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated/50 text-left text-xs text-text-secondary">
                  <th className="px-4 py-2 font-medium">Via</th>
                  <th className="px-4 py-2 font-medium">Projeto / Revisão</th>
                  <th className="px-4 py-2 font-medium">Comprimento crítico (m)</th>
                  <th className="px-4 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {criticos.map((h) => (
                  <tr key={h.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 text-text-primary">{h.nome_via}</td>
                    <td className="px-4 py-2 text-text-secondary">
                      {h.projeto_nome ?? 'Sem projeto'} — {h.revisao_nome}
                    </td>
                    <td className="px-4 py-2 font-medium text-brand">{h.comprimento_critico_m?.toFixed(2) ?? '—'}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <button title="Imprimir (gerar PDF)" onClick={() => handleImprimirCritico(h)} className="text-text-secondary hover:text-brand">
                          <Printer size={15} />
                        </button>
                        <button title="Restaurar" onClick={() => handleRestaurarCritico(h.id)} className="text-text-secondary hover:text-brand">
                          <ArchiveRestore size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : sarjetoes.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">Nenhum registro arquivado.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50 text-left text-xs text-text-secondary">
                <th className="px-4 py-2 font-medium">Trecho</th>
                <th className="px-4 py-2 font-medium">Projeto / Revisão</th>
                <th className="px-4 py-2 font-medium">L — distância entre caixas (m)</th>
                <th className="px-4 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sarjetoes.map((h) => (
                <tr key={h.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 text-text-primary">{h.nome_trecho}</td>
                  <td className="px-4 py-2 text-text-secondary">
                    {h.projeto_nome ?? 'Sem projeto'} — {h.revisao_nome}
                  </td>
                  <td className="px-4 py-2 font-medium text-brand">{h.comprimento_m.toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <button title="Imprimir (gerar PDF)" onClick={() => handleImprimirSarjetao(h)} className="text-text-secondary hover:text-brand">
                        <Printer size={15} />
                      </button>
                      <button title="Restaurar" onClick={() => handleRestaurarSarjetao(h.id)} className="text-text-secondary hover:text-brand">
                        <ArchiveRestore size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center gap-1.5 text-xs text-text-secondary">
        <Archive size={13} />
        Registros arquivados nas páginas de Sarjeta Crítica e Sarjetão Dente de Serra aparecem aqui.
      </div>
    </div>
  )
}
