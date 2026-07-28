import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Droplets, Eye, Loader2, Network, XCircle } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Field, fieldInputClass } from '../components/ui/Field'
import { RedeDiagrama } from '../components/RedeDiagrama'
import { MemoriaCalculoModal } from '../components/MemoriaCalculoModal'
import { useRevisaoContext } from '../lib/RevisaoContext'
import { calcularIntensidadeIdf } from '../engine/idf'
import { acumularVazao, calcularQProjeto, calcularTcSistema } from '../engine/rede'
import { resolverLamina } from '../engine/bissecao'
import { listEquacoesIdf, type EquacaoIdfRecord } from '../lib/idfStorage'
import { listCaixas, listTrechos, type CaixaRecord, type TrechoRecord } from '../lib/redeStorage'
import { listBacias, type BaciaRecord } from '../lib/baciasStorage'
import { listCaptacoesPorRevisao, type CaptacaoRecord } from '../lib/captacaoStorage'
import {
  deleteResultadosRedeByTrechoIds,
  listResultadosRedeByRevisao,
  saveResultadoRede,
  type ResultadoRedeRecord,
} from '../lib/resultadosStorage'
import type { RevisaoComProjeto } from '../lib/revisoesStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'

const DEFAULT_LIMITES = {
  limiteYD: 0.85,
  velMinMs: 0.75,
  velMaxMs: 5,
  declMinMM: 0.004,
  declMaxMM: 0.15,
}

interface LinhaResultado extends ResultadoRedeRecord {
  trecho_nome: string
}

interface DadosCalculo {
  revisaoAtiva: RevisaoComProjeto
  equacao: EquacaoIdfRecord
  caixas: CaixaRecord[]
  trechos: TrechoRecord[]
  bacias: BaciaRecord[]
  captacoes: CaptacaoRecord[]
  limites: typeof DEFAULT_LIMITES
}

/**
 * Roda o dimensionamento hidráulico da rede e persiste os resultados.
 * Método: ΣC×A acumulado pela rede (não depende de Q/Tc) × intensidade no
 * Tc do sistema (caminho crítico) em cada trecho — método padrão de
 * dimensionamento de rede pluvial, em vez de somar vazões de pico já
 * prontas de cada bacia com Tc's diferentes entre si.
 *
 * Como o Tc do sistema depende da velocidade (que depende do Q, que depende
 * do Tc...), roda em duas passadas: a 1ª estima o Tc assumindo 1 m/s em
 * todo mundo, a 2ª usa esse Tc pra calcular o Q real e resolve a hidráulica
 * final — evita a dependência circular sem precisar de um solver iterativo.
 * Função pura (sem depender de estado do React) pra poder ser chamada tanto
 * pelo botão "Rodar cálculo" quanto depois de uma edição no modal de
 * memória de cálculo, sempre com dado fresco vindo do banco.
 */
async function executarCalculoRede(dados: DadosCalculo): Promise<{ avisos: string[] }> {
  const { revisaoAtiva, equacao, caixas, trechos, bacias, captacoes, limites } = dados
  const tempoRetorno = revisaoAtiva.tempo_retorno_anos ?? 10

  const caixaIds = caixas.map((c) => c.id)
  const trechosGrafo = trechos.map((t) => ({ id: t.id, montanteId: t.caixa_montante_id, jusanteId: t.caixa_jusante_id }))
  const trechosComComprimento = trechos.map((t) => ({
    id: t.id,
    montanteId: t.caixa_montante_id,
    jusanteId: t.caixa_jusante_id,
    comprimentoM: t.comprimento_m,
  }))

  const baciaIdsCaptadas = new Set(captacoes.map((c) => c.bacia_id))
  const baciasCaptadas = bacias.filter((b) => baciaIdsCaptadas.has(b.id))

  const avisos: string[] = []
  const baciasSemTc = baciasCaptadas.filter((b) => b.tc_min == null)
  if (baciasSemTc.length > 0) {
    avisos.push(`${baciasSemTc.length} bacia(s) sem Tc próprio — usando 10 min como padrão.`)
  }

  // ΣC×A acumulado por trecho — geometria pura, não depende de Q nem de Tc.
  const caPorBaciaId = new Map(baciasCaptadas.map((b) => [b.id, b.coef_c * b.area_m2]))
  const caEntradaPorCaixa = new Map<string, number>()
  for (const cap of captacoes) {
    const ca = caPorBaciaId.get(cap.bacia_id)
    if (ca == null) continue
    const parcela = ca * (cap.percentual / 100)
    caEntradaPorCaixa.set(cap.dispositivo_id, (caEntradaPorCaixa.get(cap.dispositivo_id) ?? 0) + parcela)
  }
  const caAcumuladoPorTrecho = acumularVazao(caixaIds, trechosGrafo, caEntradaPorCaixa)

  const tcInicialPorCaixa = new Map<string, number>()
  for (const cap of captacoes) {
    const bacia = bacias.find((b) => b.id === cap.bacia_id)
    if (!bacia) continue
    const atual = tcInicialPorCaixa.get(cap.dispositivo_id) ?? 0
    tcInicialPorCaixa.set(cap.dispositivo_id, Math.max(atual, bacia.tc_min ?? 10))
  }

  let velocidadePorTrecho = new Map<string, number>(trechos.map((t) => [t.id, 1]))
  let linhas: Omit<ResultadoRedeRecord, 'id'>[] = []

  const NUM_PASSADAS = 2
  for (let passada = 0; passada < NUM_PASSADAS; passada++) {
    const ultimaPassada = passada === NUM_PASSADAS - 1
    const tcPorCaixa = calcularTcSistema(caixaIds, trechosComComprimento, velocidadePorTrecho, tcInicialPorCaixa)
    const novaVelocidadePorTrecho = new Map<string, number>()
    linhas = []

    for (const t of trechos) {
      const ca = caAcumuladoPorTrecho.get(t.id) ?? 0
      const tcSistema = tcPorCaixa.get(t.caixa_jusante_id) ?? tempoRetorno
      const intensidade = calcularIntensidadeIdf(equacao, tempoRetorno, tcSistema)
      const qProjeto = calcularQProjeto(ca, intensidade)

      if (t.manning_n == null) {
        if (ultimaPassada) avisos.push(`Trecho ${t.nome}: sem manning_n definido — não calculado. Revise em Cadastros → Bacias.`)
        continue
      }

      const solver = resolverLamina({
        qProjetoM3s: qProjeto,
        diametroM: t.diametro_m,
        declividadeMM: t.declividade_m_m,
        manningN: t.manning_n,
      })
      novaVelocidadePorTrecho.set(t.id, solver.velocidade)

      if (!ultimaPassada) continue

      const yD = solver.lamina / t.diametro_m
      const motivos: string[] = []
      if (!solver.convergiu) motivos.push('vazão de projeto excede a capacidade do tubo até 0,93×D')
      if (yD > limites.limiteYD) motivos.push(`y/D (${(yD * 100).toFixed(0)}%) acima do limite (${(limites.limiteYD * 100).toFixed(0)}%)`)
      if (solver.velocidade < limites.velMinMs) motivos.push(`velocidade (${solver.velocidade.toFixed(2)} m/s) abaixo da mínima de autolimpeza`)
      if (solver.velocidade > limites.velMaxMs) motivos.push(`velocidade (${solver.velocidade.toFixed(2)} m/s) acima da máxima`)
      if (t.declividade_m_m < limites.declMinMM) motivos.push('declividade abaixo da faixa mínima')
      if (t.declividade_m_m > limites.declMaxMM) motivos.push('declividade acima da faixa máxima')

      linhas.push({
        trecho_id: t.id,
        q_entrada_m3s: null,
        ca_acumulado: ca,
        q_projeto_m3s: qProjeto,
        tc_sistema_min: tcSistema,
        intensidade_mm_h: intensidade,
        lamina_m: solver.lamina,
        y_sobre_d_pct: yD * 100,
        raio_hidraulico_m: solver.raioHidraulico,
        velocidade_ms: solver.velocidade,
        vazao_calculada_m3s: solver.vazaoCalculada,
        conforme: motivos.length === 0,
        motivo_nao_conformidade: motivos.length > 0 ? motivos.join('; ') : null,
      })
    }

    velocidadePorTrecho = novaVelocidadePorTrecho
  }

  await deleteResultadosRedeByTrechoIds(trechos.map((t) => t.id))
  for (const linha of linhas) {
    await saveResultadoRede(linha)
  }

  return { avisos }
}

export function RedePluvialPage() {
  const { revisaoAtiva } = useRevisaoContext()
  const [caixas, setCaixas] = useState<CaixaRecord[]>([])
  const [trechos, setTrechos] = useState<TrechoRecord[]>([])
  const [bacias, setBacias] = useState<BaciaRecord[]>([])
  const [captacoes, setCaptacoes] = useState<CaptacaoRecord[]>([])
  const [equacao, setEquacao] = useState<EquacaoIdfRecord | null>(null)
  const [limites, setLimites] = useState(DEFAULT_LIMITES)
  const [resultados, setResultados] = useState<LinhaResultado[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [mostrarDiagrama, setMostrarDiagrama] = useState(false)
  const [trechoModalId, setTrechoModalId] = useState<string | null>(null)

  const load = async () => {
    if (!revisaoAtiva) return
    const [c, t, b] = await Promise.all([listCaixas(revisaoAtiva.id), listTrechos(revisaoAtiva.id), listBacias(revisaoAtiva.id)])
    setCaixas(c)
    setTrechos(t)
    setBacias(b)
    // isolado de propósito: bacia_dispositivo é nova (migração 009) e pode
    // ainda não existir no banco — o resto da página continua funcionando
    try {
      setCaptacoes(await listCaptacoesPorRevisao(revisaoAtiva.id))
    } catch {
      setCaptacoes([])
    }
    if (revisaoAtiva.equacao_idf_id) {
      const eqs = await listEquacoesIdf()
      setEquacao(eqs.find((e) => e.id === revisaoAtiva.equacao_idf_id) ?? null)
    } else {
      setEquacao(null)
    }
    const existentes = await listResultadosRedeByRevisao(revisaoAtiva.id)
    setResultados(existentes)
  }

  useEffect(() => {
    load().catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisaoAtiva])

  const handleRodar = async () => {
    if (!revisaoAtiva) return
    setError(null)
    setAvisos([])
    if (!equacao) {
      setError('A revisão não tem equação IDF vinculada — configure em Cadastros → Projetos.')
      return
    }
    setRunning(true)
    try {
      const { avisos: novosAvisos } = await executarCalculoRede({ revisaoAtiva, equacao, caixas, trechos, bacias, captacoes, limites })
      setAvisos(novosAvisos)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao calcular a rede.')
    } finally {
      setRunning(false)
    }
  }

  // Chamado pelo modal de memória de cálculo depois de editar diâmetro/declividade
  // (já persistido, com cascata aplicada) — busca dado fresco do banco (não confia
  // no estado do componente, que ainda não foi re-renderizado) e roda o cálculo de novo.
  const handleRecalcularAposEdicao = async () => {
    if (!revisaoAtiva || !equacao) return
    const [caixasFrescas, trechosFrescos] = await Promise.all([listCaixas(revisaoAtiva.id), listTrechos(revisaoAtiva.id)])
    setCaixas(caixasFrescas)
    setTrechos(trechosFrescos)
    const { avisos: novosAvisos } = await executarCalculoRede({
      revisaoAtiva,
      equacao,
      caixas: caixasFrescas,
      trechos: trechosFrescos,
      bacias,
      captacoes,
      limites,
    })
    setAvisos(novosAvisos)
    const existentes = await listResultadosRedeByRevisao(revisaoAtiva.id)
    setResultados(existentes)
  }

  // Ordem de fluxo real (monta pra jusante): caminha a rede em DFS a partir das
  // cabeceiras — cada trecho aparece logo depois de tudo que está a montante dele,
  // e seguido imediatamente pela sua própria continuação a jusante, antes de pular
  // pro próximo ramo. Um simples "nível topológico" (ordenarTopologicamente por
  // caixa) intercala ramos irmãos de forma confusa porque o Kahn processa a fila
  // na ordem em que os nós foram descobertos, não na ordem física do cano.
  const ordemTrechos = useMemo(() => {
    if (caixas.length === 0 || trechos.length === 0) return new Map<string, number>()
    const porCaixaMontante = new Map<string, TrechoRecord[]>()
    for (const t of trechos) {
      if (!porCaixaMontante.has(t.caixa_montante_id)) porCaixaMontante.set(t.caixa_montante_id, [])
      porCaixaMontante.get(t.caixa_montante_id)!.push(t)
    }
    for (const lista of porCaixaMontante.values()) lista.sort((a, b) => a.nome.localeCompare(b.nome))

    const idsComEntrada = new Set(trechos.map((t) => t.caixa_jusante_id))
    const cabeceiras = caixas.filter((c) => !idsComEntrada.has(c.id)).map((c) => c.id)

    const visitado = new Set<string>()
    const ordem: string[] = []
    const visitarCaixa = (caixaId: string) => {
      for (const t of porCaixaMontante.get(caixaId) ?? []) {
        if (visitado.has(t.id)) continue
        visitado.add(t.id)
        ordem.push(t.id)
        visitarCaixa(t.caixa_jusante_id)
      }
    }
    for (const caixaId of cabeceiras) visitarCaixa(caixaId)
    // sobra (grafo com ciclo ou desconexo de qualquer cabeceira) vai no fim, sem travar a tela
    for (const t of trechos) if (!visitado.has(t.id)) ordem.push(t.id)

    return new Map(ordem.map((id, i) => [id, i]))
  }, [caixas, trechos])

  const resultadosOrdenados = useMemo(() => {
    const posicao = (r: LinhaResultado) => ordemTrechos.get(r.trecho_id) ?? Number.MAX_SAFE_INTEGER
    return [...resultados].sort((a, b) => posicao(a) - posicao(b))
  }, [resultados, ordemTrechos])

  const conformidadePorTrecho = useMemo(() => new Map(resultados.map((r) => [r.trecho_id, r.conforme])), [resultados])

  const trechoPorId = useMemo(() => new Map(trechos.map((t) => [t.id, t])), [trechos])
  const nomeCaixaPorId = useMemo(() => new Map(caixas.map((c) => [c.id, c.nome])), [caixas])

  const resultadoModal = trechoModalId ? (resultados.find((r) => r.trecho_id === trechoModalId) ?? null) : null
  const trechoModal = trechoModalId ? (trechos.find((t) => t.id === trechoModalId) ?? null) : null

  if (!supabase || !revisaoAtiva) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumb items={['Cálculos', 'Rede Pluvial']} />
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          {!supabase ? 'Supabase não configurado.' : 'Selecione uma revisão em Cadastros → Projetos.'}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <Breadcrumb items={['Cálculos', 'Rede Pluvial']} />

      <div className="mb-6">
        <h1 className="font-sans text-xl font-bold text-text-primary">
          Rede Pluvial — {revisaoAtiva.projeto_nome} — {revisaoAtiva.nome}
        </h1>
        <p className="text-sm text-text-secondary">
          Dimensionamento hidráulico trecho a trecho: {caixas.length} caixa(s), {trechos.length} trecho(s), {bacias.length} bacia(s).
        </p>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}
      {avisos.map((a, i) => (
        <div key={i} className="mb-2 rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3 text-sm text-accent-amber">
          {a}
        </div>
      ))}

      <div className="mb-6 rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 font-sans text-sm font-semibold text-text-primary">Critérios de conformidade</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="y/D máx (%)">
            <input type="number" step="any" className={`${fieldInputClass} py-1.5`} value={limites.limiteYD * 100} onChange={(e) => setLimites({ ...limites, limiteYD: Number(e.target.value) / 100 })} />
          </Field>
          <Field label="V mín (m/s)">
            <input type="number" step="any" className={`${fieldInputClass} py-1.5`} value={limites.velMinMs} onChange={(e) => setLimites({ ...limites, velMinMs: Number(e.target.value) })} />
          </Field>
          <Field label="V máx (m/s)">
            <input type="number" step="any" className={`${fieldInputClass} py-1.5`} value={limites.velMaxMs} onChange={(e) => setLimites({ ...limites, velMaxMs: Number(e.target.value) })} />
          </Field>
          <Field label="Decl. mín (m/m)">
            <input type="number" step="any" className={`${fieldInputClass} py-1.5`} value={limites.declMinMM} onChange={(e) => setLimites({ ...limites, declMinMM: Number(e.target.value) })} />
          </Field>
          <Field label="Decl. máx (m/m)">
            <input type="number" step="any" className={`${fieldInputClass} py-1.5`} value={limites.declMaxMM} onChange={(e) => setLimites({ ...limites, declMaxMM: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={handleRodar} disabled={running || trechos.length === 0} className={PRIMARY_BTN}>
            {running ? <Loader2 size={16} className="animate-spin" /> : <Droplets size={16} />}
            Rodar cálculo da rede
          </button>
          {caixas.length > 0 && trechos.length > 0 && (
            <button
              onClick={() => setMostrarDiagrama((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary shadow-sm transition hover:text-text-primary"
            >
              <Network size={16} />
              {mostrarDiagrama ? 'Ocultar diagrama' : 'Ver diagrama da rede'}
            </button>
          )}
        </div>
      </div>

      {mostrarDiagrama && caixas.length > 0 && (
        <div className="mb-6">
          <RedeDiagrama caixas={caixas} trechos={trechos} conformidadePorTrecho={conformidadePorTrecho} />
        </div>
      )}

      {resultados.length > 0 && (
        <>
          <div className="mb-2 flex items-center gap-1.5 text-xs text-text-secondary">
            <Eye size={13} />
            Clique numa linha pra ver a memória de cálculo do trecho (e editar diâmetro/declividade).
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated/50 text-left text-xs text-text-secondary">
                  <th className="px-4 py-2 font-medium">Trecho</th>
                  <th className="px-4 py-2 font-medium">Caixa montante</th>
                  <th className="px-4 py-2 font-medium">Caixa jusante</th>
                  <th className="px-4 py-2 font-medium">Diâm. (m)</th>
                  <th className="px-4 py-2 font-medium">Inclinação (m/m)</th>
                  <th className="px-4 py-2 font-medium">Manning n</th>
                  <th className="px-4 py-2 font-medium">ΣC×A (m²)</th>
                  <th className="px-4 py-2 font-medium">Intensidade (mm/h)</th>
                  <th className="px-4 py-2 font-medium">Q projeto (m³/s)</th>
                  <th className="px-4 py-2 font-medium">Lâmina (m)</th>
                  <th className="px-4 py-2 font-medium">y/D</th>
                  <th className="px-4 py-2 font-medium">Velocidade (m/s)</th>
                  <th className="px-4 py-2 font-medium">Tc sistema (min)</th>
                  <th className="px-4 py-2 font-medium">Conformidade</th>
                  <th className="w-8 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {resultadosOrdenados.map((r) => {
                  const trecho = trechoPorId.get(r.trecho_id)
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setTrechoModalId(r.trecho_id)}
                      className="group cursor-pointer border-b border-border/60 last:border-0 hover:bg-elevated/40"
                      title="Ver memória de cálculo"
                    >
                      <td className="px-4 py-2 text-text-primary">{r.trecho_nome}</td>
                      <td className="px-4 py-2 text-text-secondary">{trecho ? (nomeCaixaPorId.get(trecho.caixa_montante_id) ?? '—') : '—'}</td>
                      <td className="px-4 py-2 text-text-secondary">{trecho ? (nomeCaixaPorId.get(trecho.caixa_jusante_id) ?? '—') : '—'}</td>
                      <td className="px-4 py-2 text-text-secondary">{trecho?.diametro_m.toFixed(3) ?? '—'}</td>
                      <td className="px-4 py-2 text-text-secondary">{trecho?.declividade_m_m.toFixed(4) ?? '—'}</td>
                      <td className="px-4 py-2 text-text-secondary">{trecho?.manning_n?.toFixed(4) ?? '—'}</td>
                      <td className="px-4 py-2 text-text-secondary">{r.ca_acumulado?.toFixed(2) ?? '—'}</td>
                      <td className="px-4 py-2 text-text-secondary">{r.intensidade_mm_h?.toFixed(2) ?? '—'}</td>
                      <td className="px-4 py-2 text-text-secondary">{r.q_projeto_m3s?.toFixed(4)}</td>
                      <td className="px-4 py-2 text-text-secondary">{r.lamina_m?.toFixed(3)}</td>
                      <td className="px-4 py-2 text-text-secondary">{r.y_sobre_d_pct?.toFixed(0)}%</td>
                      <td className="px-4 py-2 text-text-secondary">{r.velocidade_ms?.toFixed(2)}</td>
                      <td className="px-4 py-2 text-text-secondary">{r.tc_sistema_min?.toFixed(1) ?? '—'}</td>
                      <td className="px-4 py-2">
                        {r.conforme ? (
                          <span className="flex items-center gap-1 text-accent-green"><CheckCircle2 size={14} /> Conforme</span>
                        ) : (
                          <span className="flex items-center gap-1 text-accent-red" title={r.motivo_nao_conformidade ?? undefined}>
                            <XCircle size={14} /> Não conforme
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-text-secondary/40 group-hover:text-brand">
                        <Eye size={15} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {resultadoModal && trechoModal && (
        <MemoriaCalculoModal
          resultado={resultadoModal}
          trecho={trechoModal}
          trechos={trechos}
          caixas={caixas}
          onClose={() => setTrechoModalId(null)}
          onRecalcular={handleRecalcularAposEdicao}
        />
      )}
    </div>
  )
}
