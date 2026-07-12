import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Save, Waves } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Field, fieldInputClass } from '../components/ui/Field'
import { useRevisaoContext } from '../lib/RevisaoContext'
import { calcularIntensidadeIdf } from '../engine/idf'
import { calcularSarjeta, type MemorialCalculoSarjeta } from '../engine/sarjeta'
import { listEquacoesIdf, type EquacaoIdfRecord } from '../lib/idfStorage'
import { listResultadosSarjeta, saveResultadoSarjeta, type ResultadoSarjetaRecord } from '../lib/resultadosStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'

const DEFAULT_FORM = {
  nomeVia: '',
  y0M: '0.13',
  larguraSarjetaM: '0.5',
  declividadeTransversalViaMM: '0.02',
  declividadeTransversalSarjetaMM: '0.06',
  declividadeLongitudinal: '0.02',
  coefC: '0.9',
  larguraImpluvioM: '10',
  manningN: '0.016',
  tcMin: '10',
}

const NUMERIC_FIELDS = [
  'y0M',
  'larguraSarjetaM',
  'declividadeTransversalViaMM',
  'declividadeTransversalSarjetaMM',
  'declividadeLongitudinal',
  'coefC',
  'larguraImpluvioM',
  'manningN',
  'tcMin',
] as const

export function SarjetaCriticaPage() {
  const { revisaoAtiva } = useRevisaoContext()
  const [equacao, setEquacao] = useState<EquacaoIdfRecord | null>(null)
  const [historico, setHistorico] = useState<ResultadoSarjetaRecord[]>([])
  const [form, setForm] = useState(DEFAULT_FORM)
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

  const handleCalcular = () => {
    setError(null)
    if (!equacao) {
      setError('A revisão ativa não tem uma equação IDF vinculada — configure em Cadastros → Projetos.')
      return
    }

    const valores = Object.fromEntries(NUMERIC_FIELDS.map((k) => [k, Number(form[k])])) as Record<
      (typeof NUMERIC_FIELDS)[number],
      number
    >

    if (NUMERIC_FIELDS.some((k) => !Number.isFinite(valores[k]) || valores[k] <= 0)) {
      setError('Preencha todos os parâmetros com valores numéricos positivos.')
      return
    }

    try {
      const i = calcularIntensidadeIdf(equacao, revisaoAtiva!.tempo_retorno_anos ?? 10, valores.tcMin)
      const resultado = calcularSarjeta({
        geometria: {
          tipo: 'triangular',
          y0M: valores.y0M,
          larguraSarjetaM: valores.larguraSarjetaM,
          declividadeTransversalViaMM: valores.declividadeTransversalViaMM,
          declividadeTransversalSarjetaMM: valores.declividadeTransversalSarjetaMM,
        },
        declividadeLongitudinalMM: valores.declividadeLongitudinal,
        manningN: valores.manningN,
        coefC: valores.coefC,
        intensidadeMmH: i,
        larguraImpluvioM: valores.larguraImpluvioM,
      })
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
        y0_m: Number(form.y0M),
        z: null,
        largura_sarjeta_m: Number(form.larguraSarjetaM),
        declividade_transversal_via_m_m: Number(form.declividadeTransversalViaMM),
        declividade_transversal_sarjeta_m_m: Number(form.declividadeTransversalSarjetaMM),
        declividade_longitudinal: Number(form.declividadeLongitudinal),
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
            <input className={fieldInputClass} value={form.nomeVia} onChange={(e) => setForm({ ...form, nomeVia: e.target.value })} />
          </Field>
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Geometria da sarjeta (triangular)</div>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <Field label="Y0 — altura limite da lâmina d'água (m)" required>
            <input type="number" step="any" className={fieldInputClass} value={form.y0M} onChange={(e) => setForm({ ...form, y0M: e.target.value })} />
          </Field>
          <Field label="Largura da sarjeta (m)" required>
            <input type="number" step="any" className={fieldInputClass} value={form.larguraSarjetaM} onChange={(e) => setForm({ ...form, larguraSarjetaM: e.target.value })} />
          </Field>
          <Field label="Declividade transversal da via (m/m)" required hint="Sx — fora da calha da sarjeta">
            <input type="number" step="any" className={fieldInputClass} value={form.declividadeTransversalViaMM} onChange={(e) => setForm({ ...form, declividadeTransversalViaMM: e.target.value })} />
          </Field>
          <Field label="Declividade transversal da sarjeta (m/m)" required hint="Sw — igual à da via = sarjeta simples; maior = sarjeta com depressão">
            <input type="number" step="any" className={fieldInputClass} value={form.declividadeTransversalSarjetaMM} onChange={(e) => setForm({ ...form, declividadeTransversalSarjetaMM: e.target.value })} />
          </Field>
        </div>

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-text-secondary">Hidráulica e bacia</div>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <Field label="Declividade longitudinal (m/m)" required>
            <input type="number" step="any" className={fieldInputClass} value={form.declividadeLongitudinal} onChange={(e) => setForm({ ...form, declividadeLongitudinal: e.target.value })} />
          </Field>
          <Field label="Manning n da sarjeta" required>
            <input type="number" step="any" className={fieldInputClass} value={form.manningN} onChange={(e) => setForm({ ...form, manningN: e.target.value })} />
          </Field>
          <Field label="Coeficiente de escoamento C" required>
            <input type="number" step="any" className={fieldInputClass} value={form.coefC} onChange={(e) => setForm({ ...form, coefC: e.target.value })} />
          </Field>
          <Field label="Largura do impluvio (m)" required>
            <input type="number" step="any" className={fieldInputClass} value={form.larguraImpluvioM} onChange={(e) => setForm({ ...form, larguraImpluvioM: e.target.value })} />
          </Field>
          <Field label="Tc — tempo de concentração (min)" required hint={equacao ? `Equação IDF: ${equacao.nome} · TR: ${revisaoAtiva.tempo_retorno_anos} anos` : 'Revisão sem equação IDF vinculada'}>
            <input type="number" step="any" className={fieldInputClass} value={form.tcMin} onChange={(e) => setForm({ ...form, tcMin: e.target.value })} />
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

function MemorialItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-text-secondary">{label}</div>
      <div className="font-mono text-sm text-text-primary">{value}</div>
    </div>
  )
}
