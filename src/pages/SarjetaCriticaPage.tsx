import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, FileDown, Loader2, Save, Waves } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Field, fieldInputClass } from '../components/ui/Field'
import { useRevisaoContext } from '../lib/RevisaoContext'
import { calcularIntensidadeIdf } from '../engine/idf'
import { calcularSarjeta, type MemorialCalculoSarjeta, type ModoDeclividade } from '../engine/sarjeta'
import { listEquacoesIdf, type EquacaoIdfRecord } from '../lib/idfStorage'
import { listResultadosSarjeta, saveResultadoSarjeta, type ResultadoSarjetaRecord } from '../lib/resultadosStorage'
import { exportSarjetaCriticaPdf, type ParametrosExibicaoCritica } from '../lib/exportSarjetaCriticaPdf'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'
const SECONDARY_BTN =
  'flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm transition hover:border-brand/50 hover:text-brand disabled:opacity-60'
const TAB_BTN = 'rounded-lg border px-3 py-1.5 text-xs font-medium transition'
const TAB_BTN_ACTIVE = `${TAB_BTN} border-brand bg-brand/10 text-brand`
const TAB_BTN_INACTIVE = `${TAB_BTN} border-border text-text-secondary hover:border-brand/50 hover:text-text-primary`
const FORMULA_LINE = 'block font-mono text-[11px] leading-relaxed text-text-primary'

const MODO_DECLIVIDADE_LABELS: Record<ModoDeclividade, string> = {
  informada: 'Declividade longitudinal informada',
  velocidade_minima: 'Calculada (velocidade mínima)',
}

const DEFAULT_FORM = {
  nomeVia: '',
  y0M: '0.13',
  larguraSarjetaM: '0.5',
  declividadeTransversalViaPct: '2',
  declividadeTransversalSarjetaPct: '6',
  larguraImpluvioM: '10',
  declividadeLongitudinalPct: '2',
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

  const camposDeclividade: FormField[] = modoDeclividade === 'informada' ? ['declividadeLongitudinalPct'] : ['velocidadeMinimaMs']

  const setCampo = (campo: FormField, valor: string) => setForm((f) => ({ ...f, [campo]: valor }))

  const handleCalcular = () => {
    setError(null)
    if (!equacao) {
      setError('A revisão ativa não tem uma equação IDF vinculada — configure em Cadastros → Projetos.')
      return
    }

    const camposObrigatorios: FormField[] = [
      'y0M',
      'larguraSarjetaM',
      'declividadeTransversalViaPct',
      'declividadeTransversalSarjetaPct',
      'larguraImpluvioM',
      'manningN',
      'coefC',
      'tcMin',
      ...camposDeclividade,
    ]
    const valores = Object.fromEntries(camposObrigatorios.map((k) => [k, Number(form[k])])) as Record<FormField, number>

    if (camposObrigatorios.some((k) => !Number.isFinite(valores[k]) || valores[k] <= 0)) {
      setError('Preencha todos os parâmetros com valores numéricos positivos.')
      return
    }

    try {
      const i = calcularIntensidadeIdf(equacao, revisaoAtiva!.tempo_retorno_anos ?? 10, valores.tcMin)

      const geometria: Parameters<typeof calcularSarjeta>[0]['geometria'] = {
        tipo: 'triangular',
        y0M: valores.y0M,
        larguraSarjetaM: valores.larguraSarjetaM,
        declividadeTransversalViaMM: valores.declividadeTransversalViaPct / 100,
        declividadeTransversalSarjetaMM: valores.declividadeTransversalSarjetaPct / 100,
      }
      const modoParams: Pick<Parameters<typeof calcularSarjeta>[0], 'declividadeLongitudinalMM' | 'velocidadeMinimaMs'> =
        modoDeclividade === 'informada'
          ? { declividadeLongitudinalMM: valores.declividadeLongitudinalPct / 100 }
          : { velocidadeMinimaMs: valores.velocidadeMinimaMs }

      const resultado = calcularSarjeta({
        geometria,
        manningN: valores.manningN,
        coefC: valores.coefC,
        intensidadeMmH: i,
        larguraImpluvioM: valores.larguraImpluvioM,
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
      await saveResultadoSarjeta({
        revisao_id: revisaoAtiva.id,
        nome_via: form.nomeVia.trim(),
        tipo_secao: 'triangular',
        y0_m: Number(form.y0M),
        z: null,
        largura_sarjeta_m: Number(form.larguraSarjetaM),
        declividade_transversal_via_m_m: Number(form.declividadeTransversalViaPct) / 100,
        declividade_transversal_sarjeta_m_m: Number(form.declividadeTransversalSarjetaPct) / 100,
        declividade_transversal_min_m_m: null,
        declividade_longitudinal: memorial.declividadeLongitudinalMM,
        declividade_calculada_por_velocidade: memorial.modoDeclividade !== 'informada',
        modo_declividade: memorial.modoDeclividade,
        velocidade_minima_ms: modoDeclividade === 'velocidade_minima' ? Number(form.velocidadeMinimaMs) : null,
        desnivel_m: null,
        coef_c: Number(form.coefC),
        largura_impluvio_m: Number(form.larguraImpluvioM),
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

  const parametrosExibicao: ParametrosExibicaoCritica = {
    y0M: Number(form.y0M),
    larguraSarjetaM: Number(form.larguraSarjetaM),
    declividadeTransversalVia: Number(form.declividadeTransversalViaPct) / 100,
    declividadeTransversalSarjeta: Number(form.declividadeTransversalSarjetaPct) / 100,
    larguraImpluvioM: Number(form.larguraImpluvioM),
    manningN: Number(form.manningN),
    coefC: Number(form.coefC),
    tcMin: Number(form.tcMin),
    modoDeclividade,
    velocidadeMinimaMs: modoDeclividade === 'velocidade_minima' ? Number(form.velocidadeMinimaMs) : undefined,
  }

  const handleExportarPdf = () => {
    if (!revisaoAtiva || !memorial || intensidade == null || !form.nomeVia.trim()) {
      setError('Informe o nome da via antes de exportar.')
      return
    }
    exportSarjetaCriticaPdf({
      nomeVia: form.nomeVia.trim(),
      projetoNome: revisaoAtiva.projeto_nome ?? 'Sem projeto',
      revisaoNome: revisaoAtiva.nome,
      equacaoNome: equacao?.nome ?? null,
      tempoRetornoAnos: revisaoAtiva.tempo_retorno_anos ?? 10,
      intensidadeMmH: intensidade,
      parametros: parametrosExibicao,
      memorial,
    })
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
          espaçamento entre bocas de lobo. Sarjeta triangular composta (via + calha) — para via sem declividade
          longitudinal (sarjetão em dente de serra), use o módulo dedicado "Sarjetão Dente de Serra".
        </p>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}

      <div className="rounded-lg border border-border bg-surface p-5">
        <Field label="Nome da via" required>
          <input className={fieldInputClass} value={form.nomeVia} onChange={(e) => setCampo('nomeVia', e.target.value)} />
        </Field>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Geometria da sarjeta (triangular)</div>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <Field label="Y0 — altura limite da lâmina d'água (m)" required>
            <input type="number" step="any" className={fieldInputClass} value={form.y0M} onChange={(e) => setCampo('y0M', e.target.value)} />
          </Field>
          <Field label="Largura da sarjeta (m)" required>
            <input type="number" step="any" className={fieldInputClass} value={form.larguraSarjetaM} onChange={(e) => setCampo('larguraSarjetaM', e.target.value)} />
          </Field>
          <Field label="Declividade transversal da via (%)" required hint="Sx — fora da calha da sarjeta">
            <input
              type="number"
              step="any"
              className={fieldInputClass}
              value={form.declividadeTransversalViaPct}
              onChange={(e) => setCampo('declividadeTransversalViaPct', e.target.value)}
            />
          </Field>
          <Field label="Declividade transversal da sarjeta (%)" required hint="Sw — igual à da via = sarjeta simples; maior = sarjeta com depressão">
            <input
              type="number"
              step="any"
              className={fieldInputClass}
              value={form.declividadeTransversalSarjetaPct}
              onChange={(e) => setCampo('declividadeTransversalSarjetaPct', e.target.value)}
            />
          </Field>
          <Field label="Largura do impluvio (m)" required>
            <input type="number" step="any" className={fieldInputClass} value={form.larguraImpluvioM} onChange={(e) => setCampo('larguraImpluvioM', e.target.value)} />
          </Field>
        </div>

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
        </div>
        <div className="mt-2 grid grid-cols-2 gap-4">
          {modoDeclividade === 'informada' ? (
            <Field label="Declividade longitudinal (%)" required>
              <input
                type="number"
                step="any"
                className={fieldInputClass}
                value={form.declividadeLongitudinalPct}
                onChange={(e) => setCampo('declividadeLongitudinalPct', e.target.value)}
              />
            </Field>
          ) : (
            <Field label="Velocidade mínima de autolimpeza (m/s)" required hint="A declividade necessária pra atingir essa velocidade é calculada automaticamente">
              <input type="number" step="any" className={fieldInputClass} value={form.velocidadeMinimaMs} onChange={(e) => setCampo('velocidadeMinimaMs', e.target.value)} />
            </Field>
          )}
        </div>

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
          {memorial && (
            <button onClick={handleExportarPdf} className={SECONDARY_BTN}>
              <FileDown size={16} />
              Exportar memória de cálculo (PDF)
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
              <MemorialPontoAPonto memorial={memorial} parametros={parametrosExibicao} intensidadeMmH={intensidade} />
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

function MemorialPontoAPonto({
  memorial,
  parametros: p,
  intensidadeMmH,
}: {
  memorial: MemorialCalculoSarjeta
  parametros: ParametrosExibicaoCritica
  intensidadeMmH: number
}) {
  return (
    <div className="mt-3 rounded-lg border border-border bg-elevated/40 p-4 text-sm">
      <div className="mb-1 text-[11px] font-semibold text-text-secondary">1. Geometria da sarjeta (seção composta via + calha)</div>
      <p className="mb-1 text-[11px] text-text-secondary">
        Dois planos de declividade transversal (Sx da via, Sw da própria sarjeta) — área e perímetro pela composição HEC-22.
      </p>
      <span className={FORMULA_LINE}>Y0 = {p.y0M.toFixed(3)} m · Sx = {(p.declividadeTransversalVia * 100).toFixed(2)}% · Sw = {(p.declividadeTransversalSarjeta * 100).toFixed(2)}%</span>
      <span className={FORMULA_LINE}>A = {memorial.areaMolhadaM2.toFixed(5)} m² · P = {memorial.perimetroMolhadoM.toFixed(4)} m · Rh = A/P = {memorial.raioHidraulicoM.toFixed(5)} m</span>

      {p.modoDeclividade === 'velocidade_minima' ? (
        <>
          <div className="mb-1 mt-3 text-[11px] font-semibold text-text-secondary">2. Declividade longitudinal (inversão de Manning p/ velocidade mínima)</div>
          <span className={FORMULA_LINE}>S = (V · n / Rh^(2/3))²</span>
          <span className={FORMULA_LINE}>
            S = ({(p.velocidadeMinimaMs ?? 0).toFixed(3)} × {p.manningN.toFixed(4)} / {memorial.raioHidraulicoElevadoDoisTercos.toFixed(5)})² = {(memorial.declividadeLongitudinalMM * 100).toFixed(4)}%
          </span>
        </>
      ) : (
        <>
          <div className="mb-1 mt-3 text-[11px] font-semibold text-text-secondary">2. Declividade longitudinal</div>
          <span className={FORMULA_LINE}>S = {(memorial.declividadeLongitudinalMM * 100).toFixed(4)}% (informada diretamente)</span>
        </>
      )}

      <div className="mb-1 mt-3 text-[11px] font-semibold text-text-secondary">3. Seu método — capacidade da sarjeta (Manning)</div>
      <span className={FORMULA_LINE}>V = (1/n) · Rh^(2/3) · S^(1/2)</span>
      <span className={FORMULA_LINE}>
        V = (1/{p.manningN.toFixed(4)}) × {memorial.raioHidraulicoElevadoDoisTercos.toFixed(5)} × {Math.sqrt(memorial.declividadeLongitudinalMM).toFixed(5)} = {memorial.velocidadeMs.toFixed(4)} m/s
      </span>
      <span className={FORMULA_LINE}>Q = A · V = {memorial.areaMolhadaM2.toFixed(5)} × {memorial.velocidadeMs.toFixed(4)} = {memorial.vazaoM3s.toFixed(6)} m³/s</span>

      <div className="mb-1 mt-3 text-[11px] font-semibold text-text-secondary">4. Método racional — vazão de projeto e comprimento crítico</div>
      <span className={FORMULA_LINE}>Q = K · C · i · largura_impluvio · L (K = 2,78e-7)</span>
      <span className={FORMULA_LINE}>L = Q / (K · C · i · largura_impluvio)</span>
      <span className={FORMULA_LINE}>
        L = {memorial.vazaoM3s.toFixed(6)} / (2,78e-7 × {p.coefC.toFixed(2)} × {intensidadeMmH.toFixed(2)} × {p.larguraImpluvioM.toFixed(2)}) = {memorial.comprimentoCriticoM.toFixed(2)} m
      </span>

      <div className="mb-1 mt-3 text-[11px] font-semibold text-text-secondary">5. Resultado</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-surface p-3 sm:grid-cols-3">
        <MemorialItem label="Rh^(2/3)" value={memorial.raioHidraulicoElevadoDoisTercos.toFixed(5)} />
        <MemorialItem label="Velocidade" value={`${memorial.velocidadeMs.toFixed(4)} m/s`} />
        <MemorialItem label="Vazão da sarjeta" value={`${memorial.vazaoM3s.toFixed(6)} m³/s`} />
        <MemorialItem label="Intensidade" value={`${intensidadeMmH.toFixed(2)} mm/h`} />
        <MemorialItem label="Comprimento crítico" value={`${memorial.comprimentoCriticoM.toFixed(2)} m`} />
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
