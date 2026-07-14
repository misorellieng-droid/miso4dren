import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Save, Waves } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Field, fieldInputClass } from '../components/ui/Field'
import { useRevisaoContext } from '../lib/RevisaoContext'
import { calcularIntensidadeIdf } from '../engine/idf'
import { calcularSarjeta, type MemorialCalculoSarjeta, type ModoDeclividade, type TipoSecaoSarjeta } from '../engine/sarjeta'
import { listEquacoesIdf, type EquacaoIdfRecord } from '../lib/idfStorage'
import { listResultadosSarjeta, saveResultadoSarjeta, type ResultadoSarjetaRecord } from '../lib/resultadosStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'
const TAB_BTN = 'rounded-lg border px-3 py-1.5 text-xs font-medium transition'
const TAB_BTN_ACTIVE = `${TAB_BTN} border-brand bg-brand/10 text-brand`
const TAB_BTN_INACTIVE = `${TAB_BTN} border-border text-text-secondary hover:border-brand/50 hover:text-text-primary`

const MODO_DECLIVIDADE_LABELS: Record<ModoDeclividade, string> = {
  informada: 'Declividade longitudinal informada',
  velocidade_minima: 'Calculada (velocidade mínima)',
  desnivel_fixo: 'Dente de serra (declividade calculada)',
}

const DEFAULT_FORM = {
  nomeVia: '',
  y0M: '0.13',
  larguraSarjetaM: '0.5',
  declividadeTransversalViaMM: '0.02',
  declividadeTransversalSarjetaMM: '0.06',
  declividadeTransversalMM: '0.02',
  declividadeTransversalMinMM: '0.02',
  declividadeTransversalMaxMM: '0.1',
  larguraImpluvioM: '10',
  larguraImpluvioLadoAM: '10',
  larguraImpluvioLadoBM: '10',
  declividadeLongitudinal: '0.02',
  velocidadeMinimaMs: '0.5',
  manningN: '0.016',
  coefC: '0.9',
  tcMin: '10',
}

type FormState = typeof DEFAULT_FORM
type FormField = keyof FormState

export function SarjetaCriticaPage() {
  const { revisaoAtiva } = useRevisaoContext()
  const [equacao, setEquacao] = useState<EquacaoIdfRecord | null>(null)
  const [historico, setHistorico] = useState<ResultadoSarjetaRecord[]>([])
  const [tipoSecao, setTipoSecao] = useState<TipoSecaoSarjeta>('triangular')
  const [modoDeclividade, setModoDeclividade] = useState<ModoDeclividade>('informada')
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [intensidade, setIntensidade] = useState<number | null>(null)
  const [memorial, setMemorial] = useState<MemorialCalculoSarjeta | null>(null)
  const [mostrarMemorial, setMostrarMemorial] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!revisaoAtiva) return
    listResultadosSarjeta(revisaoAtiva.id).then(setHistorico).catch(() => {})
    if (revisaoAtiva.equacao_idf_id) {
      listEquacoesIdf().then((eqs) => setEquacao(eqs.find((e) => e.id === revisaoAtiva.equacao_idf_id) ?? null)).catch(() => {})
    } else {
      setEquacao(null)
    }
  }, [revisaoAtiva])

  const denteDeSerra = tipoSecao === 'triangular_simetrica' && modoDeclividade === 'desnivel_fixo'

  const camposAtivos: FormField[] = denteDeSerra
    ? ['larguraSarjetaM', 'declividadeTransversalMinMM', 'declividadeTransversalMaxMM', 'larguraImpluvioLadoAM', 'larguraImpluvioLadoBM']
    : tipoSecao === 'triangular'
      ? ['y0M', 'larguraSarjetaM', 'declividadeTransversalViaMM', 'declividadeTransversalSarjetaMM', 'larguraImpluvioM']
      : ['y0M', 'declividadeTransversalMM', 'larguraImpluvioLadoAM', 'larguraImpluvioLadoBM']

  const camposDeclividade: FormField[] = denteDeSerra ? [] : modoDeclividade === 'informada' ? ['declividadeLongitudinal'] : ['velocidadeMinimaMs']

  const setCampo = (campo: FormField, valor: string) => setForm((f) => ({ ...f, [campo]: valor }))

  const selecionarTipoSecao = (tipo: TipoSecaoSarjeta) => {
    setTipoSecao(tipo)
    if (tipo === 'triangular' && modoDeclividade === 'desnivel_fixo') setModoDeclividade('informada')
  }

  const handleCalcular = () => {
    setError(null)
    if (!equacao) {
      setError('A revisão ativa não tem uma equação IDF vinculada — configure em Cadastros → Projetos.')
      return
    }

    const camposObrigatorios: FormField[] = ['manningN', 'coefC', 'tcMin', ...camposAtivos, ...camposDeclividade]
    const valores = Object.fromEntries(camposObrigatorios.map((k) => [k, Number(form[k])])) as Record<FormField, number>

    if (camposObrigatorios.some((k) => !Number.isFinite(valores[k]) || valores[k] <= 0)) {
      setError('Preencha todos os parâmetros com valores numéricos positivos.')
      return
    }
    if (denteDeSerra && valores.declividadeTransversalMaxMM <= valores.declividadeTransversalMinMM) {
      setError('A declividade transversal máxima (ponto baixo) deve ser maior que a mínima (ponto alto).')
      return
    }

    const larguraImpluvioM =
      tipoSecao === 'triangular' ? valores.larguraImpluvioM : valores.larguraImpluvioLadoAM + valores.larguraImpluvioLadoBM

    try {
      const i = calcularIntensidadeIdf(equacao, revisaoAtiva!.tempo_retorno_anos ?? 10, valores.tcMin)

      let geometria: Parameters<typeof calcularSarjeta>[0]['geometria']
      let modoParams: Pick<Parameters<typeof calcularSarjeta>[0], 'declividadeLongitudinalMM' | 'velocidadeMinimaMs' | 'desnivelFixoM'>

      if (denteDeSerra) {
        // y0 no ponto baixo (condição crítica) e no ponto alto vêm da própria
        // largura da sarjeta × declividade transversal em cada extremo
        const y0Max = (valores.larguraSarjetaM / 2) * valores.declividadeTransversalMaxMM
        const y0Min = (valores.larguraSarjetaM / 2) * valores.declividadeTransversalMinMM
        geometria = { tipo: 'triangular_simetrica', y0M: y0Max, declividadeTransversalMM: valores.declividadeTransversalMaxMM }
        modoParams = { desnivelFixoM: y0Max - y0Min } as typeof modoParams
      } else if (tipoSecao === 'triangular') {
        geometria = {
          tipo: 'triangular',
          y0M: valores.y0M,
          larguraSarjetaM: valores.larguraSarjetaM,
          declividadeTransversalViaMM: valores.declividadeTransversalViaMM,
          declividadeTransversalSarjetaMM: valores.declividadeTransversalSarjetaMM,
        }
        modoParams = (modoDeclividade === 'informada'
          ? { declividadeLongitudinalMM: valores.declividadeLongitudinal }
          : { velocidadeMinimaMs: valores.velocidadeMinimaMs }) as typeof modoParams
      } else {
        geometria = { tipo: 'triangular_simetrica', y0M: valores.y0M, declividadeTransversalMM: valores.declividadeTransversalMM }
        modoParams = (modoDeclividade === 'informada'
          ? { declividadeLongitudinalMM: valores.declividadeLongitudinal }
          : { velocidadeMinimaMs: valores.velocidadeMinimaMs }) as typeof modoParams
      }

      const resultado = calcularSarjeta({
        geometria,
        manningN: valores.manningN,
        coefC: valores.coefC,
        intensidadeMmH: i,
        larguraImpluvioM,
        ...modoParams,
      } as Parameters<typeof calcularSarjeta>[0])
      setIntensidade(i)
      setMemorial(resultado)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao calcular a geometria da sarjeta.')
      setMemorial(null)
    }
  }

  const handleSalvar = async () => {
    if (!revisaoAtiva || !memorial || intensidade == null || !form.nomeVia.trim()) {
      setError('Informe o nome da via antes de salvar.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const larguraImpluvioM =
        tipoSecao === 'triangular' ? Number(form.larguraImpluvioM) : Number(form.larguraImpluvioLadoAM) + Number(form.larguraImpluvioLadoBM)

      await saveResultadoSarjeta({
        revisao_id: revisaoAtiva.id,
        nome_via: form.nomeVia.trim(),
        tipo_secao: tipoSecao,
        y0_m: denteDeSerra ? (Number(form.larguraSarjetaM) / 2) * Number(form.declividadeTransversalMaxMM) : Number(form.y0M),
        z: null,
        largura_sarjeta_m: tipoSecao === 'triangular' || denteDeSerra ? Number(form.larguraSarjetaM) : null,
        declividade_transversal_via_m_m: tipoSecao === 'triangular' ? Number(form.declividadeTransversalViaMM) : null,
        declividade_transversal_sarjeta_m_m: denteDeSerra
          ? Number(form.declividadeTransversalMaxMM)
          : tipoSecao === 'triangular'
            ? Number(form.declividadeTransversalSarjetaMM)
            : Number(form.declividadeTransversalMM),
        declividade_transversal_min_m_m: denteDeSerra ? Number(form.declividadeTransversalMinMM) : null,
        declividade_longitudinal: memorial.declividadeLongitudinalMM,
        declividade_calculada_por_velocidade: memorial.modoDeclividade !== 'informada',
        modo_declividade: memorial.modoDeclividade,
        velocidade_minima_ms: modoDeclividade === 'velocidade_minima' ? Number(form.velocidadeMinimaMs) : null,
        desnivel_m: denteDeSerra
          ? (Number(form.larguraSarjetaM) / 2) * (Number(form.declividadeTransversalMaxMM) - Number(form.declividadeTransversalMinMM))
          : null,
        coef_c: Number(form.coefC),
        largura_impluvio_m: larguraImpluvioM,
        manning_n: Number(form.manningN),
        intensidade_mm_h: intensidade,
        area_molhada_m2: memorial.areaMolhadaM2,
        perimetro_molhado_m: memorial.perimetroMolhadoM,
        raio_hidraulico_m: memorial.raioHidraulicoM,
        velocidade_ms: memorial.velocidadeMs,
        vazao_m3s: memorial.vazaoM3s,
        comprimento_critico_m: memorial.comprimentoCriticoM,
      })
      setHistorico(await listResultadosSarjeta(revisaoAtiva.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar resultado.')
    } finally {
      setSaving(false)
    }
  }

  if (!supabase || !revisaoAtiva) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumb items={['Cálculos', 'Sarjeta Crítica']} />
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          {!supabase ? 'Supabase não configurado.' : 'Selecione uma revisão em Cadastros → Projetos.'}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={['Cálculos', 'Sarjeta Crítica']} />

      <div className="mb-6">
        <h1 className="font-sans text-xl font-bold text-text-primary">
          Sarjeta Crítica — {revisaoAtiva.projeto_nome} — {revisaoAtiva.nome}
        </h1>
        <p className="text-sm text-text-secondary">
          Comprimento crítico via equação completa de Manning (geometria → velocidade → vazão), que define o
          espaçamento entre bocas de lobo.
        </p>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}

      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="col-span-2">
          <Field label="Nome da via" required>
            <input className={fieldInputClass} value={form.nomeVia} onChange={(e) => setCampo('nomeVia', e.target.value)} />
          </Field>
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Tipo de seção</div>
        <div className="mt-2 flex gap-2">
          <button className={tipoSecao === 'triangular' ? TAB_BTN_ACTIVE : TAB_BTN_INACTIVE} onClick={() => selecionarTipoSecao('triangular')}>
            Triangular (via + sarjeta)
          </button>
          <button
            className={tipoSecao === 'triangular_simetrica' ? TAB_BTN_ACTIVE : TAB_BTN_INACTIVE}
            onClick={() => selecionarTipoSecao('triangular_simetrica')}
          >
            Sarjetão em V simétrico
          </button>
        </div>

        {denteDeSerra ? (
          <>
            <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Geometria do sarjetão (dente de serra)
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              A borda superior da calha fica sempre no mesmo nível — a queda vem de variar a declividade transversal
              entre o ponto alto (junto ao ponto alto do dente) e o ponto baixo (junto à caixa).
            </p>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <Field label="Largura total da sarjeta (m)" required>
                <input type="number" step="any" className={fieldInputClass} value={form.larguraSarjetaM} onChange={(e) => setCampo('larguraSarjetaM', e.target.value)} />
              </Field>
              <div />
              <Field label="Declividade transversal — ponto alto (m/m)" required hint="A mais suave, geralmente igual à da via">
                <input type="number" step="any" className={fieldInputClass} value={form.declividadeTransversalMinMM} onChange={(e) => setCampo('declividadeTransversalMinMM', e.target.value)} />
              </Field>
              <Field label="Declividade transversal — ponto baixo (m/m)" required hint="A máxima, junto à caixa de captação">
                <input type="number" step="any" className={fieldInputClass} value={form.declividadeTransversalMaxMM} onChange={(e) => setCampo('declividadeTransversalMaxMM', e.target.value)} />
              </Field>
              <Field label="Largura do impluvio — lado A (m)" required>
                <input type="number" step="any" className={fieldInputClass} value={form.larguraImpluvioLadoAM} onChange={(e) => setCampo('larguraImpluvioLadoAM', e.target.value)} />
              </Field>
              <Field label="Largura do impluvio — lado B (m)" required>
                <input type="number" step="any" className={fieldInputClass} value={form.larguraImpluvioLadoBM} onChange={(e) => setCampo('larguraImpluvioLadoBM', e.target.value)} />
              </Field>
            </div>
          </>
        ) : tipoSecao === 'triangular' ? (
          <>
            <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Geometria da sarjeta (triangular)</div>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <Field label="Y0 — altura limite da lâmina d'água (m)" required>
                <input type="number" step="any" className={fieldInputClass} value={form.y0M} onChange={(e) => setCampo('y0M', e.target.value)} />
              </Field>
              <Field label="Largura da sarjeta (m)" required>
                <input type="number" step="any" className={fieldInputClass} value={form.larguraSarjetaM} onChange={(e) => setCampo('larguraSarjetaM', e.target.value)} />
              </Field>
              <Field label="Declividade transversal da via (m/m)" required hint="Sx — fora da calha da sarjeta">
                <input type="number" step="any" className={fieldInputClass} value={form.declividadeTransversalViaMM} onChange={(e) => setCampo('declividadeTransversalViaMM', e.target.value)} />
              </Field>
              <Field label="Declividade transversal da sarjeta (m/m)" required hint="Sw — igual à da via = sarjeta simples; maior = sarjeta com depressão">
                <input type="number" step="any" className={fieldInputClass} value={form.declividadeTransversalSarjetaMM} onChange={(e) => setCampo('declividadeTransversalSarjetaMM', e.target.value)} />
              </Field>
              <Field label="Largura do impluvio (m)" required>
                <input type="number" step="any" className={fieldInputClass} value={form.larguraImpluvioM} onChange={(e) => setCampo('larguraImpluvioM', e.target.value)} />
              </Field>
            </div>
          </>
        ) : (
          <>
            <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Geometria do sarjetão (V simétrico)
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              Calha central alimentada igualmente dos dois lados — ex.: pátio nivelado entre dois galpões, sem
              declividade longitudinal na via.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <Field label="Y0 — profundidade máxima no ponto mais baixo (m)" required>
                <input type="number" step="any" className={fieldInputClass} value={form.y0M} onChange={(e) => setCampo('y0M', e.target.value)} />
              </Field>
              <Field label="Declividade transversal (m/m)" required hint="Igual dos dois lados, por simetria">
                <input type="number" step="any" className={fieldInputClass} value={form.declividadeTransversalMM} onChange={(e) => setCampo('declividadeTransversalMM', e.target.value)} />
              </Field>
              <Field label="Largura do impluvio — lado A (m)" required>
                <input type="number" step="any" className={fieldInputClass} value={form.larguraImpluvioLadoAM} onChange={(e) => setCampo('larguraImpluvioLadoAM', e.target.value)} />
              </Field>
              <Field label="Largura do impluvio — lado B (m)" required>
                <input type="number" step="any" className={fieldInputClass} value={form.larguraImpluvioLadoBM} onChange={(e) => setCampo('larguraImpluvioLadoBM', e.target.value)} />
              </Field>
            </div>
          </>
        )}

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Declividade longitudinal</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className={modoDeclividade === 'informada' ? TAB_BTN_ACTIVE : TAB_BTN_INACTIVE} onClick={() => setModoDeclividade('informada')}>
            Informar diretamente
          </button>
          <button
            className={modoDeclividade === 'velocidade_minima' ? TAB_BTN_ACTIVE : TAB_BTN_INACTIVE}
            onClick={() => setModoDeclividade('velocidade_minima')}
          >
            Calcular a partir da velocidade mínima
          </button>
          {tipoSecao === 'triangular_simetrica' && (
            <button
              className={modoDeclividade === 'desnivel_fixo' ? TAB_BTN_ACTIVE : TAB_BTN_INACTIVE}
              onClick={() => setModoDeclividade('desnivel_fixo')}
            >
              Dente de serra (declividade transversal variável)
            </button>
          )}
        </div>
        {!denteDeSerra && (
          <div className="mt-2 grid grid-cols-2 gap-4">
            {modoDeclividade === 'informada' ? (
              <Field label="Declividade longitudinal (m/m)" required>
                <input type="number" step="any" className={fieldInputClass} value={form.declividadeLongitudinal} onChange={(e) => setCampo('declividadeLongitudinal', e.target.value)} />
              </Field>
            ) : (
              <Field label="Velocidade mínima de autolimpeza (m/s)" required hint="A declividade necessária pra atingir essa velocidade é calculada automaticamente">
                <input type="number" step="any" className={fieldInputClass} value={form.velocidadeMinimaMs} onChange={(e) => setCampo('velocidadeMinimaMs', e.target.value)} />
              </Field>
            )}
          </div>
        )}
        {denteDeSerra && (
          <p className="mt-2 text-xs text-text-secondary">
            A declividade longitudinal efetiva sai da diferença de profundidade entre o ponto alto e o ponto baixo
            (definidos pela geometria acima), dividida pelo próprio comprimento crítico — sem precisar informar nada
            aqui.
          </p>
        )}

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Hidráulica e bacia</div>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <Field label="Manning n da sarjeta" required>
            <input type="number" step="any" className={fieldInputClass} value={form.manningN} onChange={(e) => setCampo('manningN', e.target.value)} />
          </Field>
          <Field label="Coeficiente de escoamento C" required>
            <input type="number" step="any" className={fieldInputClass} value={form.coefC} onChange={(e) => setCampo('coefC', e.target.value)} />
          </Field>
          <Field label="Tc — tempo de concentração (min)" required hint={equacao ? `Equação IDF: ${equacao.nome} · TR: ${revisaoAtiva.tempo_retorno_anos} anos` : 'Revisão sem equação IDF vinculada'}>
            <input type="number" step="any" className={fieldInputClass} value={form.tcMin} onChange={(e) => setCampo('tcMin', e.target.value)} />
          </Field>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button onClick={handleCalcular} className={PRIMARY_BTN}>
            <Waves size={16} />
            Calcular
          </button>
          {memorial && (
            <button onClick={handleSalvar} disabled={saving} className={PRIMARY_BTN}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar resultado
            </button>
          )}
        </div>

        {memorial && intensidade != null && (
          <>
            <div className="mt-5 grid grid-cols-2 gap-4 rounded-lg border border-brand/30 bg-brand/5 p-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Intensidade de projeto</div>
                <div className="font-sans text-xl font-bold text-text-primary">{intensidade.toFixed(2)} mm/h</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Comprimento crítico</div>
                <div className="font-sans text-xl font-bold text-brand">{memorial.comprimentoCriticoM.toFixed(2)} m</div>
              </div>
              {memorial.modoDeclividade !== 'informada' && (
                <div className="col-span-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                    Declividade longitudinal efetiva ({MODO_DECLIVIDADE_LABELS[memorial.modoDeclividade]})
                  </div>
                  <div className="font-sans text-lg font-bold text-text-primary">{(memorial.declividadeLongitudinalMM * 100).toFixed(3)}%</div>
                </div>
              )}
            </div>

            <button
              onClick={() => setMostrarMemorial((v) => !v)}
              className="mt-3 flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-brand"
            >
              {mostrarMemorial ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {mostrarMemorial ? 'Ocultar' : 'Ver'} memorial de cálculo
            </button>

            {mostrarMemorial && (
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-border bg-elevated/40 p-4 text-sm sm:grid-cols-3">
                <MemorialItem label="Área molhada" value={`${memorial.areaMolhadaM2.toFixed(5)} m²`} />
                <MemorialItem label="Perímetro molhado" value={`${memorial.perimetroMolhadoM.toFixed(4)} m`} />
                <MemorialItem label="Raio hidráulico (Rh)" value={`${memorial.raioHidraulicoM.toFixed(5)} m`} />
                <MemorialItem label="Rh^(2/3)" value={memorial.raioHidraulicoElevadoDoisTercos.toFixed(5)} />
                <MemorialItem label="Declividade longitudinal" value={`${(memorial.declividadeLongitudinalMM * 100).toFixed(4)}%`} />
                <MemorialItem label="Velocidade" value={`${memorial.velocidadeMs.toFixed(4)} m/s`} />
                <MemorialItem label="Vazão da sarjeta" value={`${memorial.vazaoM3s.toFixed(6)} m³/s`} />
                <MemorialItem label="Numerador (Q)" value={memorial.numerador.toFixed(6)} />
                <MemorialItem label="Denominador (K·C·i·L)" value={memorial.denominador.toExponential(4)} />
                <MemorialItem label="Comprimento crítico" value={`${memorial.comprimentoCriticoM.toFixed(2)} m`} />
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
                <th className="px-4 py-2 font-medium">Via</th>
                <th className="px-4 py-2 font-medium">Seção</th>
                <th className="px-4 py-2 font-medium">Intensidade (mm/h)</th>
                <th className="px-4 py-2 font-medium">Rh (m)</th>
                <th className="px-4 py-2 font-medium">Velocidade (m/s)</th>
                <th className="px-4 py-2 font-medium">Vazão (m³/s)</th>
                <th className="px-4 py-2 font-medium">Comprimento crítico (m)</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h) => (
                <tr key={h.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 text-text-primary">{h.nome_via}</td>
                  <td className="px-4 py-2 text-text-secondary">{h.tipo_secao === 'triangular_simetrica' ? 'V simétrico' : 'Triangular'}</td>
                  <td className="px-4 py-2 text-text-secondary">{h.intensidade_mm_h.toFixed(2)}</td>
                  <td className="px-4 py-2 text-text-secondary">{h.raio_hidraulico_m?.toFixed(4) ?? '—'}</td>
                  <td className="px-4 py-2 text-text-secondary">{h.velocidade_ms?.toFixed(3) ?? '—'}</td>
                  <td className="px-4 py-2 text-text-secondary">{h.vazao_m3s?.toFixed(5) ?? '—'}</td>
                  <td className="px-4 py-2 font-medium text-brand">{h.comprimento_critico_m?.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
