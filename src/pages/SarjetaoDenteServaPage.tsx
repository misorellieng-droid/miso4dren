import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, Loader2, Mountain, Save } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Field, fieldInputClass } from '../components/ui/Field'
import { useRevisaoContext } from '../lib/RevisaoContext'
import { calcularSarjetaoDenteServa, type MemorialSarjetaoDenteServa, type ResultadoMetodoSarjetao } from '../engine/sarjetao'
import { listEquacoesIdf, type EquacaoIdfRecord } from '../lib/idfStorage'
import { listResultadosSarjetao, saveResultadoSarjetao, type ResultadoSarjetaoRecord } from '../lib/resultadosSarjetaoStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'

const METODO_LABELS: Record<'manning_generico' | 'hec22', string> = {
  manning_generico: 'Método 1 — Manning genérico (retangular equivalente)',
  hec22: 'Método 2 — HEC-22/FHWA (triangular integrado)',
}

const DEFAULT_FORM = {
  nomeTrecho: '',
  larguraViaM: '20',
  coefC: '0.9',
  larguraTelhadoM: '10',
  coefCTelhado: '0.95',
  larguraSarjetaoM: '0.9',
  sxSarjetaoAltoPct: '2',
  sxSarjetaoBaixoPct: '10',
  yMaxM: '0.05',
  sxPistaPct: '2',
  espraiamentoM: '2.5',
  manningN: '0.016',
  tcInicialMin: '10',
}

type FormState = typeof DEFAULT_FORM
type FormField = keyof FormState

export function SarjetaoDenteServaPage() {
  const { revisaoAtiva } = useRevisaoContext()
  const [equacao, setEquacao] = useState<EquacaoIdfRecord | null>(null)
  const [historico, setHistorico] = useState<ResultadoSarjetaoRecord[]>([])
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [telhadoAtivo, setTelhadoAtivo] = useState(false)
  // qual dos dois campos é a entrada "mestre": o outro vira sempre calculado a partir deste
  const [campoControlador, setCampoControlador] = useState<'yMax' | 'espraiamento'>('yMax')
  const [resultado, setResultado] = useState<MemorialSarjetaoDenteServa | null>(null)
  const [mostrarMemorial, setMostrarMemorial] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!revisaoAtiva) return
    listResultadosSarjetao(revisaoAtiva.id).then(setHistorico).catch(() => {})
    if (revisaoAtiva.equacao_idf_id) {
      listEquacoesIdf().then((eqs) => setEquacao(eqs.find((e) => e.id === revisaoAtiva.equacao_idf_id) ?? null)).catch(() => {})
    } else {
      setEquacao(null)
    }
  }, [revisaoAtiva])

  // y_max e T (espraiamento) são reciprocamente derivados via T = y_max / Sx da pista:
  // o campo controlador é a entrada manual, o outro é sempre recalculado a partir dele.
  useEffect(() => {
    const sx = Number(form.sxPistaPct) / 100
    if (!Number.isFinite(sx) || sx <= 0) return

    if (campoControlador === 'yMax') {
      const yMax = Number(form.yMaxM)
      if (Number.isFinite(yMax) && yMax > 0) {
        setForm((f) => ({ ...f, espraiamentoM: (yMax / sx).toFixed(4) }))
      }
    } else {
      const T = Number(form.espraiamentoM)
      if (Number.isFinite(T) && T > 0) {
        setForm((f) => ({ ...f, yMaxM: (T * sx).toFixed(4) }))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.yMaxM, form.espraiamentoM, form.sxPistaPct, campoControlador])

  const setCampo = (campo: FormField, valor: string) => setForm((f) => ({ ...f, [campo]: valor }))

  const handleCalcular = () => {
    setError(null)
    if (!equacao) {
      setError('A revisão ativa não tem uma equação IDF vinculada — configure em Cadastros → Projetos.')
      return
    }

    const camposObrigatorios: FormField[] = [
      'larguraViaM',
      'coefC',
      'larguraSarjetaoM',
      'sxSarjetaoAltoPct',
      'sxSarjetaoBaixoPct',
      'yMaxM',
      'sxPistaPct',
      'espraiamentoM',
      'manningN',
      'tcInicialMin',
      ...(telhadoAtivo ? (['larguraTelhadoM', 'coefCTelhado'] as FormField[]) : []),
    ]
    const valores = Object.fromEntries(camposObrigatorios.map((k) => [k, Number(form[k])])) as Record<FormField, number>

    if (camposObrigatorios.some((k) => !Number.isFinite(valores[k]) || valores[k] <= 0)) {
      setError('Preencha todos os parâmetros com valores numéricos positivos.')
      return
    }
    if (valores.sxSarjetaoBaixoPct <= valores.sxSarjetaoAltoPct) {
      setError('A declividade transversal do ponto baixo deve ser maior que a do ponto alto.')
      return
    }

    try {
      const r = calcularSarjetaoDenteServa({
        larguraViaM: valores.larguraViaM,
        coefC: valores.coefC,
        telhadoAtivo,
        larguraTelhadoM: telhadoAtivo ? valores.larguraTelhadoM : undefined,
        coefCTelhado: telhadoAtivo ? valores.coefCTelhado : undefined,
        larguraSarjetaoM: valores.larguraSarjetaoM,
        sxSarjetaoAlto: valores.sxSarjetaoAltoPct / 100,
        sxSarjetaoBaixo: valores.sxSarjetaoBaixoPct / 100,
        yMaxM: valores.yMaxM,
        sxPista: valores.sxPistaPct / 100,
        larguraEspraiamentoM: valores.espraiamentoM,
        manningN: valores.manningN,
        equacaoIdf: equacao,
        tempoRetornoAnos: revisaoAtiva!.tempo_retorno_anos ?? 10,
        tcInicialMin: valores.tcInicialMin,
      })
      setResultado(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao calcular o sarjetão em dente de serra.')
      setResultado(null)
    }
  }

  const handleSalvar = async () => {
    if (!revisaoAtiva || !resultado || !form.nomeTrecho.trim()) {
      setError('Informe o nome do trecho antes de salvar.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveResultadoSarjetao({
        revisao_id: revisaoAtiva.id,
        nome_trecho: form.nomeTrecho.trim(),
        largura_via_m: Number(form.larguraViaM),
        coef_c: Number(form.coefC),
        telhado_ativo: telhadoAtivo,
        largura_telhado_m: telhadoAtivo ? Number(form.larguraTelhadoM) : null,
        coef_c_telhado: telhadoAtivo ? Number(form.coefCTelhado) : null,
        largura_sarjetao_m: Number(form.larguraSarjetaoM),
        sx_sarjetao_alto_m_m: Number(form.sxSarjetaoAltoPct) / 100,
        sx_sarjetao_baixo_m_m: Number(form.sxSarjetaoBaixoPct) / 100,
        lamina_max_m: Number(form.yMaxM),
        sx_pista_m_m: Number(form.sxPistaPct) / 100,
        espraiamento_m: Number(form.espraiamentoM),
        espraiamento_editado: campoControlador === 'espraiamento',
        manning_n: Number(form.manningN),
        tempo_retorno_anos: revisaoAtiva.tempo_retorno_anos ?? 10,
        tc_inicial_min: Number(form.tcInicialMin),
        delta_h_m: resultado.deltaHM,
        m1_comprimento_m: resultado.metodo1.comprimentoEquilibrioM,
        m1_iteracoes: resultado.metodo1.iteracoes,
        m1_convergiu: resultado.metodo1.convergiu,
        m1_iteracoes_tc: resultado.metodo1.iteracoesTc,
        m1_convergiu_tc: resultado.metodo1.convergiuTc,
        m1_lamina_critica_m: resultado.metodo1.laminaCriticaM,
        m1_velocidade_ms: resultado.metodo1.velocidadeMs,
        m1_vazao_m3s: resultado.metodo1.vazaoM3s,
        m1_declividade_longitudinal_m_m: resultado.metodo1.declividadeLongitudinalMM,
        m1_tc_convergido_min: resultado.metodo1.tcConvergidoMin,
        m1_intensidade_mm_h: resultado.metodo1.intensidadeConvergidaMmH,
        m2_comprimento_m: resultado.metodo2.comprimentoEquilibrioM,
        m2_iteracoes: resultado.metodo2.iteracoes,
        m2_convergiu: resultado.metodo2.convergiu,
        m2_iteracoes_tc: resultado.metodo2.iteracoesTc,
        m2_convergiu_tc: resultado.metodo2.convergiuTc,
        m2_lamina_critica_m: resultado.metodo2.laminaCriticaM,
        m2_velocidade_ms: resultado.metodo2.velocidadeMs,
        m2_vazao_m3s: resultado.metodo2.vazaoM3s,
        m2_declividade_longitudinal_m_m: resultado.metodo2.declividadeLongitudinalMM,
        m2_tc_convergido_min: resultado.metodo2.tcConvergidoMin,
        m2_intensidade_mm_h: resultado.metodo2.intensidadeConvergidaMmH,
        diferenca_percentual: resultado.diferencaPercentual,
        comprimento_recomendado_m: resultado.comprimentoRecomendadoM,
        metodo_recomendado: resultado.metodoRecomendado,
      })
      setHistorico(await listResultadosSarjetao(revisaoAtiva.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar resultado.')
    } finally {
      setSaving(false)
    }
  }

  if (!supabase || !revisaoAtiva) {
    return (
      <div className="mx-auto max-w-4xl">
        <Breadcrumb items={['Cálculos', 'Sarjetão Dente de Serra']} />
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          {!supabase ? 'Supabase não configurado.' : 'Selecione uma revisão em Cadastros → Projetos.'}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={['Cálculos', 'Sarjetão Dente de Serra']} />

      <div className="mb-6">
        <h1 className="font-sans text-xl font-bold text-text-primary">
          Sarjetão em Dente de Serra — {revisaoAtiva.projeto_nome} — {revisaoAtiva.nome}
        </h1>
        <p className="text-sm text-text-secondary">
          Via sem declividade longitudinal (pátio nivelado entre galpões): o desnível entre caixas vem só da variação
          da declividade transversal do sarjetão. Resolve o espaçamento de equilíbrio por dois métodos de capacidade
          independentes, lado a lado.
        </p>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}

      <div className="rounded-lg border border-border bg-surface p-5">
        <Field label="Nome do trecho" required>
          <input className={fieldInputClass} value={form.nomeTrecho} onChange={(e) => setCampo('nomeTrecho', e.target.value)} />
        </Field>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Via e bacia contribuinte</div>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <Field label="Largura total da via contribuinte (m)" required hint="Soma dos dois lados até os divisores de água">
            <input type="number" step="any" className={fieldInputClass} value={form.larguraViaM} onChange={(e) => setCampo('larguraViaM', e.target.value)} />
          </Field>
          <Field label="Coeficiente de escoamento C (pista)" required>
            <input type="number" step="any" className={fieldInputClass} value={form.coefC} onChange={(e) => setCampo('coefC', e.target.value)} />
          </Field>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-text-primary">
          <input type="checkbox" checked={telhadoAtivo} onChange={(e) => setTelhadoAtivo(e.target.checked)} className="h-4 w-4 rounded border-border" />
          Cobertura dos galpões descarrega direto na sarjeta (sem rede própria de pluvial)
        </label>

        {telhadoAtivo && (
          <div className="mt-3 rounded-lg border border-accent-amber/40 bg-accent-amber/10 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-accent-amber">
              <AlertTriangle size={16} />
              Variável mais sensível do cálculo
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              A contribuição de telhado aumenta bastante a área afluente por metro de trecho — confira a largura de
              cobertura contribuinte com cuidado antes de salvar.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-4">
              <Field label="Largura de cobertura contribuinte (m)" required hint="Análoga à largura de pista — não é a área total do telhado">
                <input type="number" step="any" className={fieldInputClass} value={form.larguraTelhadoM} onChange={(e) => setCampo('larguraTelhadoM', e.target.value)} />
              </Field>
              <Field label="Coeficiente de escoamento C (cobertura)" required>
                <input type="number" step="any" className={fieldInputClass} value={form.coefCTelhado} onChange={(e) => setCampo('coefCTelhado', e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Geometria do sarjetão (dente de serra)</div>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <Field label="Largura do sarjetão (m)" required hint="Meia-largura de cada lado do eixo — usada no Δh">
            <input type="number" step="any" className={fieldInputClass} value={form.larguraSarjetaoM} onChange={(e) => setCampo('larguraSarjetaoM', e.target.value)} />
          </Field>
          <div />
          <Field label="Sx do sarjetão — ponto alto (%)" required hint="Divisor de águas do dente — a mais suave">
            <input type="number" step="any" className={fieldInputClass} value={form.sxSarjetaoAltoPct} onChange={(e) => setCampo('sxSarjetaoAltoPct', e.target.value)} />
          </Field>
          <Field label="Sx do sarjetão — ponto baixo (%)" required hint="Junto à caixa de captação — a máxima">
            <input type="number" step="any" className={fieldInputClass} value={form.sxSarjetaoBaixoPct} onChange={(e) => setCampo('sxSarjetaoBaixoPct', e.target.value)} />
          </Field>
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Hidráulica de projeto</div>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <Field
            label="Lâmina d'água admissível — y_max (m)"
            required
            hint={campoControlador === 'espraiamento' ? 'Calculado automaticamente: T × Sx da pista' : undefined}
          >
            <input
              type="number"
              step="any"
              className={fieldInputClass}
              value={form.yMaxM}
              onChange={(e) => {
                setCampoControlador('yMax')
                setCampo('yMaxM', e.target.value)
              }}
            />
          </Field>
          <Field label="Sx da pista fora do sarjetão (%)" required hint="Só usado no Método 2 (HEC-22) e no T automático — NÃO é o Sx do sarjetão acima">
            <input type="number" step="any" className={fieldInputClass} value={form.sxPistaPct} onChange={(e) => setCampo('sxPistaPct', e.target.value)} />
          </Field>
          <Field
            label="Espraiamento T (m)"
            required
            hint={campoControlador === 'yMax' ? 'Calculado automaticamente: y_max / Sx da pista' : undefined}
          >
            <input
              type="number"
              step="any"
              className={fieldInputClass}
              value={form.espraiamentoM}
              onChange={(e) => {
                setCampoControlador('espraiamento')
                setCampo('espraiamentoM', e.target.value)
              }}
            />
          </Field>
          <Field label="Manning n" required>
            <input type="number" step="any" className={fieldInputClass} value={form.manningN} onChange={(e) => setCampo('manningN', e.target.value)} />
          </Field>
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Tempo de concentração</div>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <Field
            label="Tc inicial (min)"
            required
            hint={
              equacao
                ? `Semente de iteração — equação IDF: ${equacao.nome} · TR: ${revisaoAtiva.tempo_retorno_anos ?? 10} anos`
                : 'Revisão sem equação IDF vinculada'
            }
          >
            <input type="number" step="any" className={fieldInputClass} value={form.tcInicialMin} onChange={(e) => setCampo('tcInicialMin', e.target.value)} />
          </Field>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button onClick={handleCalcular} className={PRIMARY_BTN}>
            <Mountain size={16} />
            Calcular
          </button>
          {resultado && (
            <button onClick={handleSalvar} disabled={saving} className={PRIMARY_BTN}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar resultado
            </button>
          )}
        </div>

        {resultado && (
          <>
            <div className="mt-5 rounded-lg border border-brand/30 bg-brand/5 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Δh calculado</div>
              <div className="font-sans text-xl font-bold text-text-primary">{(resultado.deltaHM * 100).toFixed(2)} cm</div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <MetodoCard nome="manning_generico" resultado={resultado.metodo1} destaque={resultado.metodoRecomendado === 'manning_generico'} />
              <MetodoCard nome="hec22" resultado={resultado.metodo2} destaque={resultado.metodoRecomendado === 'hec22'} />
            </div>

            <div className="mt-4 rounded-lg border border-border bg-elevated/40 p-4">
              <div className="text-sm text-text-primary">
                Diferença entre os métodos: <span className="font-semibold">{resultado.diferencaPercentual.toFixed(1)}%</span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                Recomenda-se adotar o menor comprimento entre os dois —{' '}
                <span className="font-semibold text-brand">{resultado.comprimentoRecomendadoM.toFixed(2)} m</span> (
                {METODO_LABELS[resultado.metodoRecomendado]}), lado da segurança. A diferença vem de premissas
                geométricas distintas: o Método 1 aproxima a seção como um retângulo equivalente (T×y_max), enquanto
                o Método 2 integra a seção triangular real do espraiamento — nenhum dos dois está "errado"; a escolha
                depende de qual geometria descreve melhor o trecho real (sarjetão estreito e profundo vs. espraiamento
                predominante sobre a pista).
              </p>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <PerfilSarjetao titulo="Perfil — Método 1" comprimentoM={resultado.metodo1.comprimentoEquilibrioM} deltaHM={resultado.deltaHM} />
              <PerfilSarjetao titulo="Perfil — Método 2" comprimentoM={resultado.metodo2.comprimentoEquilibrioM} deltaHM={resultado.deltaHM} />
            </div>

            <button
              onClick={() => setMostrarMemorial((v) => !v)}
              className="mt-4 flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-brand"
            >
              {mostrarMemorial ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {mostrarMemorial ? 'Ocultar' : 'Ver'} memorial de cálculo
            </button>

            {mostrarMemorial && (
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <MemorialMetodo titulo="Método 1 — Manning genérico" resultado={resultado.metodo1} />
                <MemorialMetodo titulo="Método 2 — HEC-22/FHWA" resultado={resultado.metodo2} />
              </div>
            )}
          </>
        )}
      </div>

      {historico.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50 text-left text-xs text-text-secondary">
                <th className="px-4 py-2 font-medium">Trecho</th>
                <th className="px-4 py-2 font-medium">Δh (cm)</th>
                <th className="px-4 py-2 font-medium">L Método 1 (m)</th>
                <th className="px-4 py-2 font-medium">L Método 2 (m)</th>
                <th className="px-4 py-2 font-medium">Diferença</th>
                <th className="px-4 py-2 font-medium">Recomendado</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h) => (
                <tr key={h.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 text-text-primary">{h.nome_trecho}</td>
                  <td className="px-4 py-2 text-text-secondary">{(h.delta_h_m * 100).toFixed(2)}</td>
                  <td className="px-4 py-2 text-text-secondary">{h.m1_comprimento_m.toFixed(2)}</td>
                  <td className="px-4 py-2 text-text-secondary">{h.m2_comprimento_m.toFixed(2)}</td>
                  <td className="px-4 py-2 text-text-secondary">{h.diferenca_percentual.toFixed(1)}%</td>
                  <td className="px-4 py-2 font-medium text-brand">{h.comprimento_recomendado_m.toFixed(2)} m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function MetodoCard({
  nome,
  resultado,
  destaque,
}: {
  nome: 'manning_generico' | 'hec22'
  resultado: ResultadoMetodoSarjetao
  destaque: boolean
}) {
  return (
    <div className={`rounded-lg border p-4 ${destaque ? 'border-brand/40 bg-brand/5' : 'border-border bg-elevated/40'}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{METODO_LABELS[nome]}</div>
      <div className="mt-1 font-sans text-2xl font-bold text-text-primary">{resultado.comprimentoEquilibrioM.toFixed(2)} m</div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-text-secondary">
        <div>Velocidade: {resultado.velocidadeMs.toFixed(3)} m/s</div>
        <div>Vazão: {resultado.vazaoM3s.toFixed(5)} m³/s</div>
        <div>Tc convergido: {resultado.tcConvergidoMin.toFixed(2)} min</div>
        <div>Intensidade: {resultado.intensidadeConvergidaMmH.toFixed(1)} mm/h</div>
        <div>Lâmina crítica: {resultado.laminaCriticaM.toFixed(3)} m</div>
        <div>SL efetiva: {(resultado.declividadeLongitudinalMM * 100).toFixed(3)}%</div>
      </div>
      {!(resultado.convergiu && resultado.convergiuTc) && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-accent-amber">
          <AlertTriangle size={12} /> Não convergiu totalmente — confira os parâmetros.
        </div>
      )}
    </div>
  )
}

function MemorialMetodo({ titulo, resultado }: { titulo: string; resultado: ResultadoMetodoSarjetao }) {
  return (
    <div className="rounded-lg border border-border bg-elevated/40 p-4 text-sm">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">{titulo}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        <MemorialItem label="Iterações (bisseção)" value={String(resultado.iteracoes)} />
        <MemorialItem label="Iterações (Tc)" value={String(resultado.iteracoesTc)} />
        <MemorialItem label="Convergiu (bisseção)" value={resultado.convergiu ? 'Sim' : 'Não'} />
        <MemorialItem label="Convergiu (Tc)" value={resultado.convergiuTc ? 'Sim' : 'Não'} />
        <MemorialItem label="Vazão de capacidade" value={`${resultado.vazaoCapacidadeM3s.toFixed(6)} m³/s`} />
        <MemorialItem label="Vazão afluente" value={`${resultado.vazaoM3s.toFixed(6)} m³/s`} />
      </div>
    </div>
  )
}

function MemorialItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-text-secondary">{label}</div>
      <div className="font-mono text-sm text-text-primary">{value}</div>
    </div>
  )
}

/** Perfil do fundo do sarjetão entre dois pontos altos consecutivos (crista → caixa, no meio de L → crista), escala vertical exagerada pra ficar visível — Δh real anotado no rótulo. */
function PerfilSarjetao({ titulo, comprimentoM, deltaHM }: { titulo: string; comprimentoM: number; deltaHM: number }) {
  const largura = 360
  const topo = 15
  const baseFundo = 85
  const meio = largura / 2

  return (
    <div className="rounded-lg border border-border bg-elevated/40 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">{titulo}</div>
      <svg viewBox={`0 0 ${largura} 100`} className="w-full" role="img" aria-label={`Perfil do fundo do sarjetão — ${titulo}`}>
        <polyline points={`0,${topo} ${meio},${baseFundo} ${largura},${topo}`} fill="none" stroke="currentColor" strokeWidth={2} className="text-brand" />
        <circle cx={0} cy={topo} r={3} className="fill-brand" />
        <circle cx={meio} cy={baseFundo} r={3} className="fill-accent-red" />
        <circle cx={largura} cy={topo} r={3} className="fill-brand" />
        <text x={0} y={topo - 6} fontSize={9} className="fill-text-secondary">ponto alto</text>
        <text x={meio} y={baseFundo + 14} fontSize={9} textAnchor="middle" className="fill-text-secondary">caixa (ponto baixo)</text>
        <text x={largura} y={topo - 6} fontSize={9} textAnchor="end" className="fill-text-secondary">próximo ponto alto</text>
      </svg>
      <div className="mt-1 text-center text-xs text-text-secondary">
        L = {comprimentoM.toFixed(2)} m · Δh = {(deltaHM * 100).toFixed(2)} cm (escala vertical exagerada)
      </div>
    </div>
  )
}
