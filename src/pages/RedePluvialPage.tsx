import { useEffect, useState } from 'react'
import { CheckCircle2, Droplets, Loader2, XCircle } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Field, fieldInputClass } from '../components/ui/Field'
import { useObraContext } from '../lib/ObraContext'
import { calcularIntensidadeIdf } from '../engine/idf'
import { acumularVazao, calcularQEntradaBacia, calcularTcSistema } from '../engine/rede'
import { resolverLamina } from '../engine/bissecao'
import { listEquacoesIdf, type EquacaoIdfRecord } from '../lib/idfStorage'
import { listCaixas, listTrechos, type CaixaRecord, type TrechoRecord } from '../lib/redeStorage'
import { listBacias, type BaciaRecord } from '../lib/baciasStorage'
import { listResultadosRedeByObra, saveResultadoRede, type ResultadoRedeRecord } from '../lib/resultadosStorage'
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

export function RedePluvialPage() {
  const { obraAtiva } = useObraContext()
  const [caixas, setCaixas] = useState<CaixaRecord[]>([])
  const [trechos, setTrechos] = useState<TrechoRecord[]>([])
  const [bacias, setBacias] = useState<BaciaRecord[]>([])
  const [equacao, setEquacao] = useState<EquacaoIdfRecord | null>(null)
  const [limites, setLimites] = useState(DEFAULT_LIMITES)
  const [resultados, setResultados] = useState<LinhaResultado[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])

  const load = async () => {
    if (!obraAtiva) return
    const [c, t, b] = await Promise.all([listCaixas(obraAtiva.id), listTrechos(obraAtiva.id), listBacias(obraAtiva.id)])
    setCaixas(c)
    setTrechos(t)
    setBacias(b)
    if (obraAtiva.equacao_idf_id) {
      const eqs = await listEquacoesIdf()
      setEquacao(eqs.find((e) => e.id === obraAtiva.equacao_idf_id) ?? null)
    } else {
      setEquacao(null)
    }
    const existentes = await listResultadosRedeByObra(obraAtiva.id)
    setResultados(existentes)
  }

  useEffect(() => {
    load().catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraAtiva])

  const handleRodar = async () => {
    if (!obraAtiva) return
    setError(null)
    setAvisos([])

    if (!equacao) {
      setError('A obra não tem equação IDF vinculada — configure em Cadastros → Obras.')
      return
    }
    const baciasVinculadas = bacias.filter((b) => b.caixa_destino_id)
    const baciasSemTc = baciasVinculadas.filter((b) => b.tc_min == null)
    if (baciasSemTc.length > 0) {
      setAvisos((prev) => [...prev, `${baciasSemTc.length} bacia(s) sem Tc próprio — usando 10 min como padrão.`])
    }

    setRunning(true)
    try {
      const caixaIds = caixas.map((c) => c.id)
      const trechosGrafo = trechos.map((t) => ({ id: t.id, montanteId: t.caixa_montante_id, jusanteId: t.caixa_jusante_id }))

      // Passo 1 — Q de entrada por bacia (método racional) e acúmulo no grafo
      const qEntradaPorCaixa = new Map<string, number>()
      const qEntradaPorBaciaId = new Map<string, number>()
      for (const b of baciasVinculadas) {
        const tcMin = b.tc_min ?? 10
        const intensidade = calcularIntensidadeIdf(equacao, obraAtiva.tempo_retorno_anos ?? 10, tcMin)
        const q = calcularQEntradaBacia(b.coef_c, intensidade, b.area_m2)
        qEntradaPorBaciaId.set(b.id, q)
        qEntradaPorCaixa.set(b.caixa_destino_id!, (qEntradaPorCaixa.get(b.caixa_destino_id!) ?? 0) + q)
      }

      const qProjetoPorTrecho = acumularVazao(caixaIds, trechosGrafo, qEntradaPorCaixa)

      // Passo 3 — resolve a lâmina de cada trecho com manning_n conhecido
      const velocidadePorTrecho = new Map<string, number>()
      const novosAvisos: string[] = []
      const linhas: Omit<ResultadoRedeRecord, 'id'>[] = []

      for (const t of trechos) {
        const qProjeto = qProjetoPorTrecho.get(t.id) ?? 0

        if (t.manning_n == null) {
          novosAvisos.push(`Trecho ${t.nome}: sem manning_n definido — não calculado. Revise em Cadastros → Bacias.`)
          continue
        }

        const solver = resolverLamina({
          qProjetoM3s: qProjeto,
          diametroM: t.diametro_m,
          declividadeMM: t.declividade_m_m,
          manningN: t.manning_n,
        })
        velocidadePorTrecho.set(t.id, solver.velocidade)

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
          q_projeto_m3s: qProjeto,
          tc_sistema_min: null,
          intensidade_mm_h: null,
          lamina_m: solver.lamina,
          y_sobre_d_pct: yD * 100,
          raio_hidraulico_m: solver.raioHidraulico,
          velocidade_ms: solver.velocidade,
          vazao_calculada_m3s: solver.vazaoCalculada,
          conforme: motivos.length === 0,
          motivo_nao_conformidade: motivos.length > 0 ? motivos.join('; ') : null,
        })
      }

      // Passo 2 — Tc do sistema (usa as velocidades resolvidas acima)
      const trechosComComprimento = trechos.map((t) => ({
        id: t.id,
        montanteId: t.caixa_montante_id,
        jusanteId: t.caixa_jusante_id,
        comprimentoM: t.comprimento_m,
      }))
      const tcInicialPorCaixa = new Map<string, number>()
      for (const b of baciasVinculadas) {
        const atual = tcInicialPorCaixa.get(b.caixa_destino_id!) ?? 0
        tcInicialPorCaixa.set(b.caixa_destino_id!, Math.max(atual, b.tc_min ?? 10))
      }
      const tcPorCaixa = calcularTcSistema(caixaIds, trechosComComprimento, velocidadePorTrecho, tcInicialPorCaixa)

      for (const linha of linhas) {
        const trecho = trechos.find((t) => t.id === linha.trecho_id)!
        const tcSistema = tcPorCaixa.get(trecho.caixa_jusante_id) ?? null
        linha.tc_sistema_min = tcSistema
        linha.intensidade_mm_h = tcSistema != null ? calcularIntensidadeIdf(equacao, obraAtiva.tempo_retorno_anos ?? 10, tcSistema) : null
      }

      for (const linha of linhas) {
        await saveResultadoRede(linha)
      }

      setAvisos((prev) => [...prev, ...novosAvisos])
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao calcular a rede.')
    } finally {
      setRunning(false)
    }
  }

  if (!supabase || !obraAtiva) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumb items={['Cálculos', 'Rede Pluvial']} />
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          {!supabase ? 'Supabase não configurado.' : 'Selecione uma obra em Cadastros → Obras.'}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb items={['Cálculos', 'Rede Pluvial']} />

      <div className="mb-6">
        <h1 className="font-sans text-xl font-bold text-text-primary">Rede Pluvial — {obraAtiva.nome}</h1>
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
        <button onClick={handleRodar} disabled={running || trechos.length === 0} className={`${PRIMARY_BTN} mt-4`}>
          {running ? <Loader2 size={16} className="animate-spin" /> : <Droplets size={16} />}
          Rodar cálculo da rede
        </button>
      </div>

      {resultados.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50 text-left text-xs text-text-secondary">
                <th className="px-4 py-2 font-medium">Trecho</th>
                <th className="px-4 py-2 font-medium">Q projeto (m³/s)</th>
                <th className="px-4 py-2 font-medium">Lâmina (m)</th>
                <th className="px-4 py-2 font-medium">y/D</th>
                <th className="px-4 py-2 font-medium">Velocidade (m/s)</th>
                <th className="px-4 py-2 font-medium">Tc sistema (min)</th>
                <th className="px-4 py-2 font-medium">Conformidade</th>
              </tr>
            </thead>
            <tbody>
              {resultados.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 text-text-primary">{r.trecho_nome}</td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
