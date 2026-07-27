import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, FileDown, Loader2, Mountain, Save } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Field, fieldInputClass } from '../components/ui/Field'
import { useRevisaoContext } from '../lib/RevisaoContext'
import {
  calcularEspraiamentoComposto,
  calcularLaminaParaEspraiamentoComposto,
  calcularSarjetaoDenteServa,
  pontosPerfilCompostoSarjetao,
  type CenarioEspraiamento,
  type FaixaEspraiamentoSarjetao,
  type MemorialSarjetaoDenteServa,
  type ResultadoMetodoSarjetao,
  type TipoSecaoSarjetao,
} from '../engine/sarjetao'
import { listEquacoesIdf, type EquacaoIdfRecord } from '../lib/idfStorage'
import { listResultadosSarjetao, saveResultadoSarjetao, type ResultadoSarjetaoRecord } from '../lib/resultadosSarjetaoStorage'
import { exportSarjetaoPdf, type ParametrosExibicao } from '../lib/exportSarjetaoPdf'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'
const SECONDARY_BTN =
  'flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm transition hover:border-brand/50 hover:text-brand disabled:opacity-60'
const TAB_BTN = 'rounded-lg border px-3 py-1.5 text-xs font-medium transition'
const TAB_BTN_ACTIVE = `${TAB_BTN} border-brand bg-brand/10 text-brand`
const TAB_BTN_INACTIVE = `${TAB_BTN} border-border text-text-secondary hover:border-brand/50 hover:text-text-primary`

const METODO_LABEL = 'HEC-22/FHWA (seção triangular integrada)'

const TIPO_SECAO_LABELS: Record<TipoSecaoSarjetao, string> = {
  simetrico: 'Sarjetão em V simétrico',
  um_lado: 'Sarjeta de um lado só',
}

const CENARIO_LABELS: Record<CenarioEspraiamento, string> = {
  minimo: 'Mínimo (Sx do ponto baixo)',
  medio: 'Médio (padrão)',
  maximo: 'Máximo (Sx do ponto alto)',
}

const CENARIO_HINTS: Record<CenarioEspraiamento, string> = {
  minimo: 'Mais íngreme, junto à caixa — mais conservador, T e L menores',
  medio: 'Média entre os dois pontos do sarjetão',
  maximo: 'Mais suave, no divisor de águas — T e L maiores',
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
  const [tipoSecao, setTipoSecao] = useState<TipoSecaoSarjetao>('simetrico')
  const [cenarioAdotado, setCenarioAdotado] = useState<CenarioEspraiamento>('medio')
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

  // y_max e T (espraiamento) são reciprocamente derivados pela composição de dois planos
  // (calha do sarjetão + pista fora dela — ver calcularEspraiamentoComposto): usa a
  // declividade do CENÁRIO ADOTADO (mínimo/médio/máximo) como a declividade única da
  // calha nessa composição. O campo controlador é a entrada manual, o outro é sempre
  // recalculado a partir dele.
  useEffect(() => {
    const sxPista = Number(form.sxPistaPct) / 100
    const sxAlto = Number(form.sxSarjetaoAltoPct) / 100
    const sxBaixo = Number(form.sxSarjetaoBaixoPct) / 100
    const larguraSarjetao = Number(form.larguraSarjetaoM)
    if (!Number.isFinite(sxPista) || sxPista <= 0) return
    if (!Number.isFinite(sxAlto) || sxAlto <= 0 || !Number.isFinite(sxBaixo) || sxBaixo <= 0) return
    if (!Number.isFinite(larguraSarjetao) || larguraSarjetao <= 0) return

    const sxPorCenario: Record<CenarioEspraiamento, number> = { minimo: sxBaixo, medio: (sxAlto + sxBaixo) / 2, maximo: sxAlto }
    const sxAdotado = sxPorCenario[cenarioAdotado]
    const larguraEfetiva = tipoSecao === 'simetrico' ? larguraSarjetao / 2 : larguraSarjetao

    if (campoControlador === 'yMax') {
      const yMax = Number(form.yMaxM)
      if (Number.isFinite(yMax) && yMax > 0) {
        const T = calcularEspraiamentoComposto({ yMaxM: yMax, larguraSarjetaoEfetivaM: larguraEfetiva, sxSarjetao: sxAdotado, sxPista })
        setForm((f) => ({ ...f, espraiamentoM: T.toFixed(4) }))
      }
    } else {
      const T = Number(form.espraiamentoM)
      if (Number.isFinite(T) && T > 0) {
        const yMax = calcularLaminaParaEspraiamentoComposto({ larguraEspraiamentoM: T, larguraSarjetaoEfetivaM: larguraEfetiva, sxSarjetao: sxAdotado, sxPista })
        setForm((f) => ({ ...f, yMaxM: yMax.toFixed(4) }))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.yMaxM,
    form.espraiamentoM,
    form.sxPistaPct,
    form.sxSarjetaoAltoPct,
    form.sxSarjetaoBaixoPct,
    form.larguraSarjetaoM,
    tipoSecao,
    cenarioAdotado,
    campoControlador,
  ])

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
        tipoSecao,
        cenarioAdotado,
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
        tipo_secao: tipoSecao,
        cenario_espraiamento: cenarioAdotado,
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
        comprimento_m: resultado.resultado.comprimentoEquilibrioM,
        iteracoes: resultado.resultado.iteracoes,
        convergiu: resultado.resultado.convergiu,
        iteracoes_tc: resultado.resultado.iteracoesTc,
        convergiu_tc: resultado.resultado.convergiuTc,
        lamina_critica_m: resultado.resultado.laminaCriticaM,
        velocidade_ms: resultado.resultado.velocidadeMs,
        vazao_m3s: resultado.resultado.vazaoM3s,
        declividade_longitudinal_m_m: resultado.resultado.declividadeLongitudinalMM,
        tc_convergido_min: resultado.resultado.tcConvergidoMin,
        intensidade_mm_h: resultado.resultado.intensidadeConvergidaMmH,
      })
      setHistorico(await listResultadosSarjetao(revisaoAtiva.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar resultado.')
    } finally {
      setSaving(false)
    }
  }

  const handleExportarPdf = () => {
    if (!revisaoAtiva || !resultado || !form.nomeTrecho.trim()) {
      setError('Informe o nome do trecho antes de exportar.')
      return
    }
    exportSarjetaoPdf({
      nomeTrecho: form.nomeTrecho.trim(),
      projetoNome: revisaoAtiva.projeto_nome ?? 'Sem projeto',
      revisaoNome: revisaoAtiva.nome,
      equacaoNome: equacao?.nome ?? null,
      tempoRetornoAnos: revisaoAtiva.tempo_retorno_anos ?? 10,
      parametros: parametrosExibicao,
      memorial: resultado,
    })
  }

  // espelha os campos numéricos do form no momento do último cálculo — usado pra reconstituir
  // as fórmulas plugadas no memorial e na exportação em PDF, sem duplicar estado
  const parametrosExibicao: ParametrosExibicao = {
    tipoSecao,
    larguraViaM: Number(form.larguraViaM),
    coefC: Number(form.coefC),
    telhadoAtivo,
    larguraTelhadoM: telhadoAtivo ? Number(form.larguraTelhadoM) : undefined,
    coefCTelhado: telhadoAtivo ? Number(form.coefCTelhado) : undefined,
    larguraSarjetaoM: Number(form.larguraSarjetaoM),
    sxSarjetaoAlto: Number(form.sxSarjetaoAltoPct) / 100,
    sxSarjetaoBaixo: Number(form.sxSarjetaoBaixoPct) / 100,
    yMaxM: Number(form.yMaxM),
    sxPista: Number(form.sxPistaPct) / 100,
    larguraEspraiamentoM: Number(form.espraiamentoM),
    manningN: Number(form.manningN),
    tcInicialMin: Number(form.tcInicialMin),
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
          da declividade transversal do sarjetão. Resolve o espaçamento de equilíbrio pelo método HEC-22/FHWA
          (geometria composta real da seção).
        </p>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}

      <div className="rounded-lg border border-border bg-surface p-5">
        <Field label="Nome do trecho" required>
          <input className={fieldInputClass} value={form.nomeTrecho} onChange={(e) => setCampo('nomeTrecho', e.target.value)} />
        </Field>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Tipo de seção</div>
        <p className="mt-1 text-xs text-text-secondary">
          Nos dois casos a via não tem declividade longitudinal — o desnível entre caixas vem só da variação da
          declividade transversal do sarjetão. Só muda quantas faces contribuem pro Δh.
        </p>
        <div className="mt-2 flex gap-2">
          <button className={tipoSecao === 'simetrico' ? TAB_BTN_ACTIVE : TAB_BTN_INACTIVE} onClick={() => setTipoSecao('simetrico')}>
            {TIPO_SECAO_LABELS.simetrico}
          </button>
          <button className={tipoSecao === 'um_lado' ? TAB_BTN_ACTIVE : TAB_BTN_INACTIVE} onClick={() => setTipoSecao('um_lado')}>
            {TIPO_SECAO_LABELS.um_lado}
          </button>
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Via e bacia contribuinte</div>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <Field
            label="Largura total da via contribuinte (m)"
            required
            hint={
              tipoSecao === 'simetrico'
                ? 'Soma dos dois lados até os divisores de água — pode somar valores diferentes se o sarjetão não estiver no eixo da via'
                : 'Largura de pista contribuinte até o divisor de águas, deste lado'
            }
          >
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
          <Field
            label={tipoSecao === 'simetrico' ? 'Largura do sarjetão (m)' : 'Largura da sarjeta (m)'}
            required
            hint={
              tipoSecao === 'simetrico'
                ? 'Largura total do trough — a metade de cada lado do eixo entra no Δh'
                : 'Sarjeta de um lado só — a largura inteira entra no Δh (não há face espelhada)'
            }
          >
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

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Cenário de espraiamento adotado</div>
        <p className="mt-1 text-xs text-text-secondary">
          O Sx do sarjetão varia entre os dois pontos acima — escolha qual declividade vira o T (e o resultado
          principal): a mais conservadora (mínimo), a média (padrão), ou a mais suave (máximo). Os três cenários ficam
          sempre visíveis na tabela de avaliação, independente da escolha aqui.
        </p>
        <div className="mt-2 flex gap-2">
          {(['minimo', 'medio', 'maximo'] as const).map((cenario) => (
            <button
              key={cenario}
              className={cenarioAdotado === cenario ? TAB_BTN_ACTIVE : TAB_BTN_INACTIVE}
              onClick={() => setCenarioAdotado(cenario)}
              title={CENARIO_HINTS[cenario]}
            >
              {CENARIO_LABELS[cenario]}
            </button>
          ))}
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Hidráulica de projeto</div>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <Field
            label="Lâmina d'água admissível — y_max (m)"
            required
            hint={campoControlador === 'espraiamento' ? 'Calculado automaticamente a partir de T (composição calha + pista)' : undefined}
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
          <Field label="Sx da pista fora do sarjetão (%)" required hint="Só usado na fórmula HEC-22 e no T automático — NÃO é o Sx do sarjetão acima">
            <input type="number" step="any" className={fieldInputClass} value={form.sxPistaPct} onChange={(e) => setCampo('sxPistaPct', e.target.value)} />
          </Field>
          <Field
            label="Espraiamento T (m)"
            required
            hint={
              campoControlador === 'yMax'
                ? 'Calculado automaticamente: composição da calha do sarjetão (Sx do cenário adotado) + Sx da pista — ver faixa mín/máx no resultado'
                : undefined
            }
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
          {resultado && (
            <button onClick={handleExportarPdf} className={SECONDARY_BTN}>
              <FileDown size={16} />
              Exportar memória de cálculo (PDF)
            </button>
          )}
        </div>

        {resultado && (
          <>
            <div className="mt-5 rounded-lg border border-brand/30 bg-brand/5 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Δh calculado</div>
              <div className="font-sans text-xl font-bold text-text-primary">{(resultado.deltaHM * 100).toFixed(2)} cm</div>
            </div>

            <div className="mt-4">
              <ResultadoCard resultado={resultado.resultado} />
            </div>

            <div className="mt-4 rounded-lg border border-border bg-elevated/40 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Vazão total na caixa</div>
              <div className="font-sans text-xl font-bold text-text-primary">{resultado.vazaoTotalCaixaM3s.toFixed(5)} m³/s</div>
              <p className="mt-1 text-[11px] leading-relaxed text-text-secondary">
                Soma dos dois braços que chegam na caixa (uma crista de cada lado) — 2 × vazão do braço acima ({resultado.resultado.vazaoM3s.toFixed(5)} m³/s). Use este valor pra dimensionar a caixa e a tubulação enterrada a jusante — não é a mesma grandeza que a capacidade do canal (sarjetão), que já é verificada por braço.
              </p>
            </div>

            <FaixaEspraiamentoCard faixa={resultado.faixaEspraiamento} cenarioAdotado={resultado.cenarioAdotado} />

            <div className="mt-4">
              <SecaoTransversalSarjetao
                tipoSecao={tipoSecao}
                yMaxM={parametrosExibicao.yMaxM}
                larguraSarjetaoEfetivaM={resultado.larguraSarjetaoEfetivaM}
                sxSarjetaoAdotadoMM={resultado.sxSarjetaoAdotadoMM}
                larguraEspraiamentoM={parametrosExibicao.larguraEspraiamentoM}
                sxPista={parametrosExibicao.sxPista}
              />
            </div>

            <div className="mt-4">
              <PerfilSarjetao comprimentoM={resultado.resultado.comprimentoEquilibrioM} deltaHM={resultado.deltaHM} yMaxM={parametrosExibicao.yMaxM} />
            </div>

            <button
              onClick={() => setMostrarMemorial((v) => !v)}
              className="mt-4 flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-brand"
            >
              {mostrarMemorial ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {mostrarMemorial ? 'Ocultar' : 'Ver'} memorial de cálculo
            </button>

            {mostrarMemorial && (
              <div className="mt-3">
                <MemorialMetodo
                  resultado={resultado.resultado}
                  parametros={parametrosExibicao}
                  deltaHM={resultado.deltaHM}
                  sxSarjetaoAdotadoMM={resultado.sxSarjetaoAdotadoMM}
                  cenarioAdotado={resultado.cenarioAdotado}
                />
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
                <th className="px-4 py-2 font-medium">L — distância entre caixas (m)</th>
                <th className="px-4 py-2 font-medium">Convergiu</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h) => (
                <tr key={h.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 text-text-primary">{h.nome_trecho}</td>
                  <td className="px-4 py-2 text-text-secondary">{(h.delta_h_m * 100).toFixed(2)}</td>
                  <td className="px-4 py-2 font-medium text-brand">{h.comprimento_m.toFixed(2)} m</td>
                  <td className="px-4 py-2 text-text-secondary">{h.convergiu && h.convergiu_tc ? 'Sim' : 'Não'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ResultadoCard({ resultado }: { resultado: ResultadoMetodoSarjetao }) {
  return (
    <div className="rounded-lg border border-brand/40 bg-brand/5 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{METODO_LABEL}</div>
      <div className="mt-1 font-sans text-2xl font-bold text-text-primary">{resultado.comprimentoEquilibrioM.toFixed(2)} m</div>
      <div className="text-[11px] text-text-secondary">
        Distância entre caixas (o ponto alto fica no meio, a {(resultado.comprimentoEquilibrioM / 2).toFixed(2)} m de cada uma)
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-text-secondary">
        <div>Velocidade no braço: {resultado.velocidadeMs.toFixed(3)} m/s</div>
        <div>Vazão no braço: {resultado.vazaoM3s.toFixed(5)} m³/s</div>
        <div>Tc convergido: {resultado.tcConvergidoMin.toFixed(2)} min</div>
        <div>Intensidade: {resultado.intensidadeConvergidaMmH.toFixed(1)} mm/h</div>
        <div>Lâmina crítica: {resultado.laminaCriticaM.toFixed(3)} m</div>
        <div>SL efetiva (no braço): {(resultado.declividadeLongitudinalMM * 100).toFixed(3)}%</div>
      </div>
      {!(resultado.convergiu && resultado.convergiuTc) && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-accent-amber">
          <AlertTriangle size={12} /> Não convergiu totalmente — confira os parâmetros.
        </div>
      )}
    </div>
  )
}

function FaixaEspraiamentoCard({ faixa, cenarioAdotado }: { faixa: FaixaEspraiamentoSarjetao; cenarioAdotado: CenarioEspraiamento }) {
  return (
    <div className="mt-4 rounded-lg border border-accent-amber/30 bg-accent-amber/5 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Faixa de avaliação do espraiamento</div>
      <p className="mt-1 text-xs leading-relaxed text-text-secondary">
        A declividade do sarjetão varia de fato ao longo do braço, mais suave na crista e mais íngreme na caixa — a
        tabela mostra os três cenários possíveis. O resultado principal acima usa o cenário selecionado em "Cenário de
        espraiamento adotado" (destacado abaixo).
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="py-1 pr-3 font-medium">Cenário</th>
              <th className="py-1 pr-3 font-medium">Sx do sarjetão</th>
              <th className="py-1 pr-3 font-medium">T</th>
              <th className="py-1 font-medium">L</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {(['minimo', 'medio', 'maximo'] as const).map((cenario, i) => {
              const d = faixa[cenario]
              const adotado = cenario === cenarioAdotado
              return (
                <tr key={cenario} className={i < 2 ? `border-b border-border/50 ${adotado ? 'text-brand' : ''}` : adotado ? 'text-brand' : ''}>
                  <td className={`py-1 pr-3 font-sans ${adotado ? 'font-semibold' : 'text-text-secondary'}`}>
                    {CENARIO_LABELS[cenario]}
                    {adotado ? ' — ADOTADO' : ''}
                  </td>
                  <td className="py-1 pr-3">{(d.sxSarjetaoMM * 100).toFixed(2)}%</td>
                  <td className="py-1 pr-3">{d.resultado.larguraEspraiamentoM.toFixed(2)} m</td>
                  <td className="py-1">{d.resultado.comprimentoEquilibrioM.toFixed(2)} m</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const FORMULA_LINE = 'block font-mono text-[11px] leading-relaxed text-text-primary'

function MemorialMetodo({
  resultado,
  parametros: p,
  deltaHM,
  sxSarjetaoAdotadoMM,
  cenarioAdotado,
}: {
  resultado: ResultadoMetodoSarjetao
  parametros: ParametrosExibicao
  deltaHM: number
  sxSarjetaoAdotadoMM: number
  cenarioAdotado: CenarioEspraiamento
}) {
  const bracoM = resultado.comprimentoEquilibrioM / 2
  const larguraEfetivaM = p.tipoSecao === 'simetrico' ? p.larguraSarjetaoM / 2 : p.larguraSarjetaoM
  const T = calcularEspraiamentoComposto({ yMaxM: p.yMaxM, larguraSarjetaoEfetivaM: larguraEfetivaM, sxSarjetao: sxSarjetaoAdotadoMM, sxPista: p.sxPista })
  const perimetroMolhadoM = resultado.areaMolhadaM2 / resultado.raioHidraulicoM

  return (
    <div className="rounded-lg border border-border bg-elevated/40 p-4 text-sm">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">{METODO_LABEL}</div>

      <div className="mb-1 text-[11px] font-semibold text-text-secondary">1. Geometria da seção composta (calha do sarjetão + via)</div>
      <p className="mb-1 text-[11px] text-text-secondary">
        Dois planos de declividade transversal — a calha do sarjetão (cenário {CENARIO_LABELS[cenarioAdotado]}, Sx ={' '}
        {(sxSarjetaoAdotadoMM * 100).toFixed(2)}%) e a via fora dela (Sx da pista = {(p.sxPista * 100).toFixed(2)}%) — mesma
        composição de dois planos da Sarjeta Crítica, não um único plano homogêneo. Perímetro real (comprimento de
        arco dos dois planos).{' '}
        {p.tipoSecao === 'simetrico' ? (
          <>A e P abaixo já somam as DUAS faces espelhadas do V — são superfícies reais, e o canal completo escoa o dobro de uma face só.</>
        ) : (
          <>Sarjeta de um lado só — A e P abaixo são de uma face única.</>
        )}
      </p>
      <span className={FORMULA_LINE}>T = {T.toFixed(4)} m</span>
      <span className={FORMULA_LINE}>
        A = {resultado.areaMolhadaM2.toFixed(5)} m² · P = {perimetroMolhadoM.toFixed(4)} m · Rh = A/P = {resultado.raioHidraulicoM.toFixed(5)} m
      </span>

      <div className="mb-1 mt-3 text-[11px] font-semibold text-text-secondary">2. Capacidade hidráulica (no braço)</div>
      <span className={FORMULA_LINE}>Qcap = (1/n) · A · Rh^(2/3) · SL^(1/2)</span>
      <span className={FORMULA_LINE}>
        Qcap = (1/{p.manningN.toFixed(4)}) × {resultado.areaMolhadaM2.toFixed(5)} × {resultado.raioHidraulicoM.toFixed(5)}^(2/3) × SL^(1/2)
      </span>

      <div className="mb-1 mt-3 text-[11px] font-semibold text-text-secondary">3. Δh e SL no braço</div>
      {p.tipoSecao === 'simetrico' ? (
        <span className={FORMULA_LINE}>
          Δh = (largura_sarjetão / 2) × (Sx_baixo − Sx_alto) = ({p.larguraSarjetaoM.toFixed(4)} / 2) × ({p.sxSarjetaoBaixo.toFixed(4)} − {p.sxSarjetaoAlto.toFixed(4)}) = {deltaHM.toFixed(4)} m
        </span>
      ) : (
        <span className={FORMULA_LINE}>
          Δh = largura_sarjeta × (Sx_baixo − Sx_alto) = {p.larguraSarjetaoM.toFixed(4)} × ({p.sxSarjetaoBaixo.toFixed(4)} − {p.sxSarjetaoAlto.toFixed(4)}) = {deltaHM.toFixed(4)} m
        </span>
      )}
      <span className={FORMULA_LINE}>
        braço = L / 2 = {resultado.comprimentoEquilibrioM.toFixed(2)} / 2 = {bracoM.toFixed(2)} m
      </span>
      <span className={FORMULA_LINE}>
        SL = Δh / braço = {deltaHM.toFixed(4)} / {bracoM.toFixed(2)} = {(resultado.declividadeLongitudinalMM * 100).toFixed(4)}%
      </span>

      <div className="mb-1 mt-3 text-[11px] font-semibold text-text-secondary">4. Vazão afluente (método racional, no braço)</div>
      <span className={FORMULA_LINE}>Q = K · i · (C_pista · largura_via {p.telhadoAtivo ? '+ C_telhado · largura_telhado' : ''}) · braço</span>
      <span className={FORMULA_LINE}>
        Q = 2,78e-7 × i × ({p.coefC.toFixed(2)} × {p.larguraViaM.toFixed(2)}
        {p.telhadoAtivo ? ` + ${(p.coefCTelhado ?? 0).toFixed(2)} × ${(p.larguraTelhadoM ?? 0).toFixed(2)}` : ''}) × braço
      </span>

      <div className="mb-1 mt-3 text-[11px] font-semibold text-text-secondary">
        5. Iteração de Tc até convergência ({resultado.historicoIteracoesTc.length} passada{resultado.historicoIteracoesTc.length > 1 ? 's' : ''}, tolerância 1% em L)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="py-1 pr-2 font-medium">#</th>
              <th className="py-1 pr-2 font-medium">Tc (min)</th>
              <th className="py-1 pr-2 font-medium">i (mm/h)</th>
              <th className="py-1 pr-2 font-medium">L (m)</th>
              <th className="py-1 pr-2 font-medium">SL braço (%)</th>
              <th className="py-1 pr-2 font-medium">Q (m³/s)</th>
              <th className="py-1 font-medium">Qcap (m³/s)</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {resultado.historicoIteracoesTc.map((h) => (
              <tr key={h.numero} className="border-b border-border/50 last:border-0">
                <td className="py-1 pr-2 text-text-secondary">{h.numero}</td>
                <td className="py-1 pr-2">{h.tcMin.toFixed(2)}</td>
                <td className="py-1 pr-2">{h.intensidadeMmH.toFixed(1)}</td>
                <td className="py-1 pr-2">{h.comprimentoM.toFixed(2)}</td>
                <td className="py-1 pr-2">{(h.declividadeLongitudinalMM * 100).toFixed(4)}</td>
                <td className="py-1 pr-2">{h.vazaoM3s.toFixed(5)}</td>
                <td className="py-1">{h.vazaoCapacidadeM3s.toFixed(5)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mb-1 mt-3 text-[11px] font-semibold text-text-secondary">6. Resultado no ponto de equilíbrio</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-surface p-3">
        <MemorialItem label="L — distância entre caixas" value={`${resultado.comprimentoEquilibrioM.toFixed(2)} m`} />
        <MemorialItem label="Braço (crista → caixa)" value={`${bracoM.toFixed(2)} m`} />
        <MemorialItem label="Iterações (bisseção)" value={String(resultado.iteracoes)} />
        <MemorialItem label="Convergiu (bisseção / Tc)" value={`${resultado.convergiu ? 'Sim' : 'Não'} / ${resultado.convergiuTc ? 'Sim' : 'Não'}`} />
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

/**
 * Perfil do fundo do sarjetão entre duas caixas CONSECUTIVAS, com o ponto
 * alto (crista, divisor de águas) exatamente no meio — escala vertical
 * exagerada pra ficar visível, Δh real anotado no rótulo.
 *
 * Topologia: caixa (ponto baixo, extremidade) → sobe até a crista (ponto
 * alto, no meio de L) → desce até a próxima caixa. `comprimentoM` é sempre
 * L — a distância CHEIA entre as duas caixas —, nunca a distância entre
 * cristas: as duas pontas do desenho são as caixas, não o ponto alto.
 */
function PerfilSarjetao({ comprimentoM, deltaHM, yMaxM }: { comprimentoM: number; deltaHM: number; yMaxM: number }) {
  const largura = 360
  const topo = 15 // crista (ponto alto) — desenhada mais alta na tela
  const baseFundo = 85 // caixas (ponto baixo) — desenhadas mais baixas na tela
  const meio = largura / 2
  const bracoM = comprimentoM / 2

  return (
    <div className="rounded-lg border border-border bg-elevated/40 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Perfil longitudinal — {METODO_LABEL}</div>
      <svg viewBox={`0 0 ${largura} 112`} className="w-full" role="img" aria-label="Perfil do fundo do sarjetão entre duas caixas consecutivas">
        <polyline points={`0,${baseFundo} ${meio},${topo} ${largura},${baseFundo}`} fill="none" stroke="currentColor" strokeWidth={2} className="text-brand" />
        <circle cx={0} cy={baseFundo} r={3} className="fill-brand" />
        <circle cx={meio} cy={topo} r={3} className="fill-accent-red" />
        <circle cx={largura} cy={baseFundo} r={3} className="fill-brand" />
        <text x={0} y={baseFundo + 14} fontSize={9} className="fill-text-secondary">caixa</text>
        <text x={meio} y={topo - 6} fontSize={9} textAnchor="middle" className="fill-text-secondary">ponto alto (divisor de águas)</text>
        <text x={largura} y={baseFundo + 14} fontSize={9} textAnchor="end" className="fill-text-secondary">próxima caixa</text>
        <text x={meio} y={topo - 18} fontSize={9} textAnchor="middle" className="fill-text-secondary">
          lâmina = y_max = {yMaxM.toFixed(3)}m
        </text>
        <text x={meio / 2} y={(topo + baseFundo) / 2 + 4} fontSize={9} textAnchor="middle" className="fill-text-secondary">
          braço={bracoM.toFixed(2)}m
        </text>
        <text x={meio + meio / 2} y={(topo + baseFundo) / 2 + 4} fontSize={9} textAnchor="middle" className="fill-text-secondary">
          braço={bracoM.toFixed(2)}m
        </text>
      </svg>
      <div className="mt-1 text-center text-xs text-text-secondary">
        Distância entre caixas = {comprimentoM.toFixed(2)} m · Δh = {(deltaHM * 100).toFixed(2)} cm (escala vertical exagerada)
      </div>
    </div>
  )
}

/**
 * Seção transversal: perfil REAL de dois planos — a calha do sarjetão (0→W)
 * e a via fora dela (W→T), com declividades diferentes. A "quebra" na linha
 * do perfil, em x=±W, é o limite real entre os dois triângulos — não um
 * único plano de declividade média. No tipo 'simetrico' espelha o mesmo
 * perfil dos dois lados do eixo; no 'um_lado' desenha só um lado (0 a T), a
 * partir do meio-fio — não há face espelhada.
 */
function SecaoTransversalSarjetao({
  tipoSecao,
  yMaxM,
  larguraSarjetaoEfetivaM,
  sxSarjetaoAdotadoMM,
  larguraEspraiamentoM: T,
  sxPista,
}: {
  tipoSecao: TipoSecaoSarjetao
  yMaxM: number
  larguraSarjetaoEfetivaM: number
  sxSarjetaoAdotadoMM: number
  larguraEspraiamentoM: number
  sxPista: number
}) {
  const simetrico = tipoSecao === 'simetrico'
  const largura = 420
  const altura = 160
  const padX = 24
  const padTopo = 20
  const padBase = 40
  const xMin = simetrico ? -T : 0
  const xMax = T
  const escalaX = (largura - 2 * padX) / (xMax - xMin)
  const escalaY = (altura - padTopo - padBase) / yMaxM
  const origemX = simetrico ? largura / 2 : padX

  const sxCoord = (x: number) => origemX + x * escalaX
  const sy = (profundidade: number) => padTopo + profundidade * escalaY

  const W = larguraSarjetaoEfetivaM
  const pontosReais = pontosPerfilCompostoSarjetao({ yMaxM, larguraSarjetaoEfetivaM: W, sxSarjetao: sxSarjetaoAdotadoMM, sxPista })
  const temKink = pontosReais.length === 3
  const pontoKink = pontosReais[1] // só existe (e só é usado) quando temKink

  const paraPoints = (pontos: Array<{ x: number; y: number }>) => pontos.map((pt) => `${sxCoord(pt.x)},${sy(pt.y)}`).join(' ')
  const perfilDireito = pontosReais.map((pt) => ({ x: pt.x, y: pt.y }))
  const perfilEsquerdo = pontosReais.map((pt) => ({ x: -pt.x, y: pt.y }))
  const poligonoDireito = paraPoints([...perfilDireito, { x: T, y: 0 }, { x: 0, y: 0 }])
  const poligonoEsquerdo = paraPoints([...perfilEsquerdo, { x: -T, y: 0 }, { x: 0, y: 0 }])

  return (
    <div className="rounded-lg border border-border bg-elevated/40 p-4">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">Seção transversal — área alagada</div>
      <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full" role="img" aria-label="Seção transversal do sarjetão com os dois triângulos reais — calha e via">
        <polygon points={poligonoDireito} className="fill-brand/25" stroke="none" />
        <polyline points={paraPoints(perfilDireito)} fill="none" className="stroke-brand" strokeWidth={2} />
        {simetrico && (
          <>
            <polygon points={poligonoEsquerdo} className="fill-brand/25" stroke="none" />
            <polyline points={paraPoints(perfilEsquerdo)} fill="none" className="stroke-brand" strokeWidth={2} />
          </>
        )}
        <line x1={sxCoord(xMin)} y1={sy(0)} x2={sxCoord(xMax)} y2={sy(0)} strokeDasharray="3 2" className="stroke-text-secondary" strokeWidth={1} />

        {temKink && (
          <>
            <line x1={sxCoord(W)} y1={sy(0)} x2={sxCoord(W)} y2={sy(pontoKink.y)} strokeDasharray="2 2" className="stroke-text-secondary" strokeWidth={1} />
            {simetrico && (
              <line x1={sxCoord(-W)} y1={sy(0)} x2={sxCoord(-W)} y2={sy(pontoKink.y)} strokeDasharray="2 2" className="stroke-text-secondary" strokeWidth={1} />
            )}
          </>
        )}

        {simetrico ? (
          <line x1={origemX} y1={sy(0)} x2={origemX} y2={sy(yMaxM)} strokeDasharray="2 2" className="stroke-accent-red" strokeWidth={1} />
        ) : (
          <rect x={sxCoord(0) - 3} y={sy(0) - 3} width={3} height={sy(yMaxM) - sy(0) + 3} className="fill-text-secondary" />
        )}

        <text x={simetrico ? origemX : sxCoord(0)} y={sy(yMaxM) - 6} fontSize={9} textAnchor={simetrico ? 'middle' : 'start'} className="fill-text-secondary">
          y_max={yMaxM.toFixed(3)}m
        </text>
        {simetrico ? (
          <>
            <text x={sxCoord(-T / 2)} y={sy(0) + 16} fontSize={9} textAnchor="middle" className="fill-text-secondary">
              T={T.toFixed(2)}m
            </text>
            <text x={sxCoord(T / 2)} y={sy(0) + 16} fontSize={9} textAnchor="middle" className="fill-text-secondary">
              T={T.toFixed(2)}m
            </text>
            {temKink && (
              <text x={sxCoord(W)} y={altura - 22} fontSize={8} textAnchor="middle" className="fill-text-secondary">
                calha | via (W={W.toFixed(2)}m)
              </text>
            )}
            <text x={origemX} y={altura - 6} fontSize={9} textAnchor="middle" className="fill-text-secondary">
              eixo do sarjetão (Sx da pista = {(sxPista * 100).toFixed(2)}%)
            </text>
          </>
        ) : (
          <>
            <text x={sxCoord(T / 2)} y={sy(0) + 16} fontSize={9} textAnchor="middle" className="fill-text-secondary">
              T={T.toFixed(2)}m
            </text>
            {temKink && (
              <text x={sxCoord(W)} y={altura - 22} fontSize={8} textAnchor="middle" className="fill-text-secondary">
                calha | via (W={W.toFixed(2)}m)
              </text>
            )}
            <text x={sxCoord(0)} y={altura - 6} fontSize={9} className="fill-text-secondary">
              meio-fio (Sx da pista = {(sxPista * 100).toFixed(2)}%)
            </text>
          </>
        )}
      </svg>
      <div className="mt-1 text-center text-xs text-text-secondary">Sombreado = área alagada real (calha + via, dois planos)</div>
    </div>
  )
}
