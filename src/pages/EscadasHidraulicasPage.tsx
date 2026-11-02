import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Layers, Loader2, XCircle } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { fieldInputClass } from '../components/ui/Field'
import { useRevisaoContext } from '../lib/RevisaoContext'
import {
  ALTURA_FLUXO_MAXIMA_M,
  ALTURA_FLUXO_MINIMA_M,
  dimensionarDegraus,
  larguraMinimaEscadaM,
  verificarEscadaHidraulica,
} from '../engine/escadaHidraulica'
import { listCaixas, listTrechos, updateTrecho, type CaixaRecord, type TrechoRecord } from '../lib/redeStorage'
import { listResultadosRedeByRevisao, type ResultadoRedeRecord } from '../lib/resultadosStorage'
import { listBibliotecaPecas, type ItemBiblioteca } from '../lib/bibliotecaStorage'
import { supabase } from '../lib/supabase'

const TOLERANCIA_DIAMETRO_BIBLIOTECA_M = 0.001
/** Altura de fluxo padrão sugerida ao marcar um trecho como escada, sem nenhum valor ainda salvo — meio da faixa admitida (ver ALTURA_FLUXO_MINIMA_M/MAXIMA_M). */
const ALTURA_FLUXO_PADRAO_M = (ALTURA_FLUXO_MINIMA_M + ALTURA_FLUXO_MAXIMA_M) / 2
/** Espelho e degrau de partida quando o plugin ainda não enviou os escolhidos (os mesmos padrões da aba Escadas do plugin). */
const ESPELHO_PADRAO_M = 0.2
const DEGRAU_PADRAO_M = 0.4

function acharEspessuraParedeM(biblioteca: ItemBiblioteca[], material: string | null, diametroM: number): number | null {
  if (!material) return null
  const item = biblioteca.find(
    (i) => i.material.toUpperCase() === material.toUpperCase() && Math.abs(i.diametro_m - diametroM) <= TOLERANCIA_DIAMETRO_BIBLIOTECA_M
  )
  return item?.espessura_parede_m ?? null
}

export function EscadasHidraulicasPage() {
  const { revisaoAtiva } = useRevisaoContext()
  const [caixas, setCaixas] = useState<CaixaRecord[]>([])
  const [trechos, setTrechos] = useState<TrechoRecord[]>([])
  const [resultados, setResultados] = useState<ResultadoRedeRecord[]>([])
  const [biblioteca, setBiblioteca] = useState<ItemBiblioteca[]>([])
  const [error, setError] = useState<string | null>(null)
  const [salvandoId, setSalvandoId] = useState<string | null>(null)

  const load = async () => {
    if (!revisaoAtiva) return
    const [c, t, r] = await Promise.all([
      listCaixas(revisaoAtiva.id),
      listTrechos(revisaoAtiva.id),
      listResultadosRedeByRevisao(revisaoAtiva.id),
    ])
    setCaixas(c)
    setTrechos(t)
    setResultados(r)
    try {
      setBiblioteca(await listBibliotecaPecas())
    } catch {
      setBiblioteca([])
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Erro ao carregar.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisaoAtiva])

  const nomeCaixaPorId = useMemo(() => new Map(caixas.map((c) => [c.id, c.nome])), [caixas])
  const qProjetoPorTrecho = useMemo(() => new Map(resultados.map((r) => [r.trecho_id, r.q_projeto_m3s])), [resultados])
  const escadas = useMemo(() => trechos.filter((t) => t.eh_escada_hidraulica).sort((a, b) => a.nome.localeCompare(b.nome)), [trechos])

  const handleEditar = async (
    id: string,
    patch: { escada_largura_m?: number | null; escada_altura_fluxo_m?: number | null; escada_espelho_m?: number | null; escada_degrau_m?: number | null }
  ) => {
    setSalvandoId(id)
    setError(null)
    try {
      await updateTrecho(id, patch)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSalvandoId(null)
    }
  }

  if (!supabase) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumb items={['Cálculos', 'Escadas Hidráulicas']} />
        <div className="rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3 text-sm text-accent-amber">
          Supabase não configurado.
        </div>
      </div>
    )
  }

  if (!revisaoAtiva) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumb items={['Cálculos', 'Escadas Hidráulicas']} />
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          Selecione uma revisão em Cadastros → Projetos.
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb items={['Cálculos', 'Escadas Hidráulicas']} />

      <div className="mb-4">
        <h1 className="font-sans text-xl font-bold text-text-primary">
          Escadas Hidráulicas — {revisaoAtiva.projeto_nome} — {revisaoAtiva.nome}
        </h1>
        <p className="text-sm text-text-secondary">
          Dimensionamento próprio (Q = 2,07 × B^0,90 × H^1,60) pros trechos marcados como escada hidráulica em Rede Importada — não é a
          hidráulica de Manning de tubo circular, por isso fica fora do memorial justificativo.
        </p>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}

      {escadas.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          Nenhum trecho marcado como escada hidráulica nesta revisão. Marque em Rede Importada → aba Tubos, coluna "Escada hidráulica".
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {escadas.map((t) => {
            const qProjetoM3s = qProjetoPorTrecho.get(t.id) ?? null
            const espessuraM = acharEspessuraParedeM(biblioteca, t.material, t.diametro_m)
            const diametroExternoM = espessuraM != null ? t.diametro_m + 2 * espessuraM : t.diametro_m
            const larguraMinimaM = larguraMinimaEscadaM(diametroExternoM)
            const larguraM = t.escada_largura_m ?? larguraMinimaM
            const alturaFluxoM = t.escada_altura_fluxo_m ?? ALTURA_FLUXO_PADRAO_M
            const verificacao =
              qProjetoM3s != null ? verificarEscadaHidraulica(larguraM, alturaFluxoM, qProjetoM3s, diametroExternoM) : null

            // degraus e patamares: perfil do talude vindo do plugin; sem ele, uma face só com o comprimento e a queda do tubo de ligação (estimativa)
            const espelhoM = t.escada_espelho_m ?? ESPELHO_PADRAO_M
            const degrauM = t.escada_degrau_m ?? DEGRAU_PADRAO_M
            const perfilDoPlugin = t.escada_perfil != null && t.escada_perfil.faces.length > 0
            const quedaTuboM =
              t.cota_fundo_montante != null && t.cota_fundo_jusante != null ? Math.abs(t.cota_fundo_montante - t.cota_fundo_jusante) : 0
            const degraus = dimensionarDegraus({
              espelhoM,
              degrauM,
              faces: perfilDoPlugin ? t.escada_perfil!.faces : [{ comprimentoM: t.comprimento_m, desnivelM: quedaTuboM }],
              bermasM: perfilDoPlugin ? t.escada_perfil!.bermasM : [],
            })

            return (
              <div key={t.id} className="rounded-lg border border-border bg-surface p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-text-secondary" />
                    <span className="font-sans text-sm font-semibold text-text-primary">{t.nome}</span>
                    <span className="text-xs text-text-secondary">
                      {nomeCaixaPorId.get(t.caixa_montante_id) ?? '—'} → {nomeCaixaPorId.get(t.caixa_jusante_id) ?? '—'}
                    </span>
                  </div>
                  {verificacao && (
                    <span
                      className={`flex items-center gap-1.5 text-sm font-medium ${verificacao.conforme ? 'text-accent-green' : 'text-accent-red'}`}
                    >
                      {verificacao.conforme ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                      {verificacao.conforme ? 'Conforme' : 'Não conforme'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-text-secondary">Q projeto (L/s)</div>
                    <div className="mt-1 py-1 text-sm text-text-primary">
                      {qProjetoM3s != null ? (qProjetoM3s * 1000).toFixed(2) : '— (rode o cálculo da rede)'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-text-secondary" title="Diâmetro do tubo de chegada + 2× espessura de parede (biblioteca de peças), quando cadastrada -- senão usa o diâmetro do próprio trecho.">
                      Diâm. externo tubo chegada (m)
                    </div>
                    <div className="mt-1 py-1 text-sm text-text-primary">{diametroExternoM.toFixed(3)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-text-secondary">B — largura útil (m)</div>
                    <input
                      type="number"
                      step="any"
                      defaultValue={larguraM}
                      disabled={salvandoId === t.id}
                      onBlur={(e) => {
                        const n = Number(e.target.value)
                        if (Number.isFinite(n) && n > 0 && n !== t.escada_largura_m) handleEditar(t.id, { escada_largura_m: n })
                      }}
                      className={`${fieldInputClass} mt-1 py-1 ${verificacao?.larguraAbaixoDoMinimo ? 'border-accent-red/60' : ''}`}
                    />
                    <div className="mt-0.5 text-[10px] text-text-secondary">mínimo {larguraMinimaM.toFixed(3)} m</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-text-secondary">H — altura do fluxo (m)</div>
                    <input
                      type="number"
                      step="any"
                      defaultValue={alturaFluxoM}
                      disabled={salvandoId === t.id}
                      onBlur={(e) => {
                        const n = Number(e.target.value)
                        if (Number.isFinite(n) && n > 0 && n !== t.escada_altura_fluxo_m) handleEditar(t.id, { escada_altura_fluxo_m: n })
                      }}
                      className={`${fieldInputClass} mt-1 py-1 ${verificacao?.alturaForaDaFaixa ? 'border-accent-red/60' : ''}`}
                    />
                    <div className="mt-0.5 text-[10px] text-text-secondary">
                      faixa {ALTURA_FLUXO_MINIMA_M.toFixed(2)}–{ALTURA_FLUXO_MAXIMA_M.toFixed(2)} m
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-text-secondary">Q capacidade (L/s)</div>
                    <div className={`mt-1 py-1 text-sm font-medium ${verificacao?.vazaoInsuficiente ? 'text-accent-red' : 'text-text-primary'}`}>
                      {verificacao ? (verificacao.vazaoCapacidadeM3s * 1000).toFixed(2) : '—'}
                    </div>
                  </div>
                </div>
                <div className="mt-4 border-t border-border pt-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-sans text-sm font-semibold text-text-primary">Degraus e patamares</span>
                    <span className="text-[11px] text-text-secondary">
                      {perfilDoPlugin ? 'Perfil do talude vindo do plugin (faces e bermas).' : 'Estimativa pelo comprimento e queda do tubo de ligação: o plugin ainda não enviou o perfil do talude.'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-text-secondary">Espelho (m)</div>
                      <input
                        type="number"
                        step="any"
                        defaultValue={espelhoM}
                        disabled={salvandoId === t.id}
                        onBlur={(e) => {
                          const n = Number(e.target.value)
                          if (Number.isFinite(n) && n > 0 && n !== t.escada_espelho_m) handleEditar(t.id, { escada_espelho_m: n })
                        }}
                        className={`${fieldInputClass} mt-1 py-1`}
                      />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-text-secondary">Degrau — piso (m)</div>
                      <input
                        type="number"
                        step="any"
                        defaultValue={degrauM}
                        disabled={salvandoId === t.id}
                        onBlur={(e) => {
                          const n = Number(e.target.value)
                          if (Number.isFinite(n) && n > 0 && n !== t.escada_degrau_m) handleEditar(t.id, { escada_degrau_m: n })
                        }}
                        className={`${fieldInputClass} mt-1 py-1`}
                      />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-text-secondary">Degraus</div>
                      <div className="mt-1 py-1 text-sm font-medium text-text-primary">{degraus.degrausTotal || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-text-secondary">Espelho real médio (m)</div>
                      <div className="mt-1 py-1 text-sm text-text-primary">{degraus.degrausTotal ? degraus.espelhoRealMedioM.toFixed(3) : '—'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-text-secondary">Patamar total (m)</div>
                      <div className={`mt-1 py-1 text-sm font-medium ${degraus.cabe ? 'text-text-primary' : 'text-accent-red'}`}>
                        {degraus.degrausTotal ? degraus.patamarTotalM.toFixed(2) : '—'}
                      </div>
                    </div>
                  </div>
                  {degraus.faces.length > 0 && (
                    <table className="mt-3 w-full text-left text-xs">
                      <thead className="text-[10px] uppercase tracking-wide text-text-secondary">
                        <tr>
                          <th className="py-1 pr-3">Face</th>
                          <th className="py-1 pr-3">Desnível (m)</th>
                          <th className="py-1 pr-3">Comp. disponível (m)</th>
                          <th className="py-1 pr-3">Degraus</th>
                          <th className="py-1 pr-3">Espelho real (m)</th>
                          <th className="py-1 pr-3">Piso necessário (m)</th>
                          <th className="py-1 pr-3">Sobra / falta (m)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {degraus.faces.map((f, i) => (
                          <tr key={i} className={f.cabe ? '' : 'text-accent-red'}>
                            <td className="py-1 pr-3">{i + 1}</td>
                            <td className="py-1 pr-3">{f.desnivelM.toFixed(2)}</td>
                            <td className="py-1 pr-3">{f.comprimentoDisponivelM.toFixed(2)}</td>
                            <td className="py-1 pr-3">{f.degraus}</td>
                            <td className="py-1 pr-3">{f.espelhoRealM.toFixed(3)}</td>
                            <td className="py-1 pr-3">{f.comprimentoNecessarioM.toFixed(2)}</td>
                            <td className="py-1 pr-3">{f.folgaM.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {degraus.bermasM.length > 0 && (
                    <div className="mt-2 text-xs text-text-secondary">Bermas (patamar reto): {degraus.bermasM.map((b) => b.toFixed(2) + ' m').join(', ')}</div>
                  )}
                  {degraus.avisos.map((a, i) => (
                    <div key={i} className="mt-1 text-xs text-accent-red">
                      {a}
                    </div>
                  ))}
                </div>
                {salvandoId === t.id && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-text-secondary">
                    <Loader2 size={12} className="animate-spin" /> Salvando...
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
