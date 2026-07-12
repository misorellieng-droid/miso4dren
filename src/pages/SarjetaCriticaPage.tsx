import { useEffect, useState } from 'react'
import { Loader2, Save, Waves } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Field, fieldInputClass } from '../components/ui/Field'
import { useObraContext } from '../lib/ObraContext'
import { calcularIntensidadeIdf } from '../engine/idf'
import { calcularComprimentoCritico } from '../engine/sarjeta'
import { listEquacoesIdf, type EquacaoIdfRecord } from '../lib/idfStorage'
import { listResultadosSarjeta, saveResultadoSarjeta, type ResultadoSarjetaRecord } from '../lib/resultadosStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'

const DEFAULT_FORM = {
  nomeVia: '',
  y0M: '0.13',
  z: '24',
  declividadeLongitudinal: '0.02',
  coefC: '0.9',
  larguraImpluvioM: '10',
  manningN: '0.016',
  tcMin: '10',
}

export function SarjetaCriticaPage() {
  const { obraAtiva } = useObraContext()
  const [equacao, setEquacao] = useState<EquacaoIdfRecord | null>(null)
  const [historico, setHistorico] = useState<ResultadoSarjetaRecord[]>([])
  const [form, setForm] = useState(DEFAULT_FORM)
  const [resultado, setResultado] = useState<{ intensidade: number; comprimento: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!obraAtiva) return
    listResultadosSarjeta(obraAtiva.id).then(setHistorico).catch(() => {})
    if (obraAtiva.equacao_idf_id) {
      listEquacoesIdf().then((eqs) => setEquacao(eqs.find((e) => e.id === obraAtiva.equacao_idf_id) ?? null)).catch(() => {})
    } else {
      setEquacao(null)
    }
  }, [obraAtiva])

  const handleCalcular = () => {
    setError(null)
    if (!equacao) {
      setError('A obra ativa não tem uma equação IDF vinculada — configure em Cadastros → Obras.')
      return
    }
    const y0M = Number(form.y0M)
    const z = Number(form.z)
    const declividadeLongitudinal = Number(form.declividadeLongitudinal)
    const coefC = Number(form.coefC)
    const larguraImpluvioM = Number(form.larguraImpluvioM)
    const manningN = Number(form.manningN)
    const tcMin = Number(form.tcMin)

    if ([y0M, z, declividadeLongitudinal, coefC, larguraImpluvioM, manningN, tcMin].some((v) => !Number.isFinite(v) || v <= 0)) {
      setError('Preencha todos os parâmetros com valores numéricos positivos.')
      return
    }

    const intensidade = calcularIntensidadeIdf(equacao, obraAtiva!.tempo_retorno_anos ?? 10, tcMin)
    const comprimento = calcularComprimentoCritico({ y0M, z, declividadeLongitudinal, coefC, intensidadeMmH: intensidade, larguraImpluvioM, manningN })
    setResultado({ intensidade, comprimento })
  }

  const handleSalvar = async () => {
    if (!obraAtiva || !resultado || !form.nomeVia.trim()) {
      setError('Informe o nome da via antes de salvar.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await saveResultadoSarjeta({
        obra_id: obraAtiva.id,
        nome_via: form.nomeVia.trim(),
        y0_m: Number(form.y0M),
        z: Number(form.z),
        declividade_longitudinal: Number(form.declividadeLongitudinal),
        coef_c: Number(form.coefC),
        largura_impluvio_m: Number(form.larguraImpluvioM),
        manning_n: Number(form.manningN),
        intensidade_mm_h: resultado.intensidade,
        comprimento_critico_m: resultado.comprimento,
      })
      setHistorico(await listResultadosSarjeta(obraAtiva.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar resultado.')
    } finally {
      setSaving(false)
    }
  }

  if (!supabase || !obraAtiva) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumb items={['Cálculos', 'Sarjeta Crítica']} />
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          {!supabase ? 'Supabase não configurado.' : 'Selecione uma obra em Cadastros → Obras.'}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={['Cálculos', 'Sarjeta Crítica']} />

      <div className="mb-6">
        <h1 className="font-sans text-xl font-bold text-text-primary">Sarjeta Crítica — {obraAtiva.nome}</h1>
        <p className="text-sm text-text-secondary">Comprimento crítico de sarjeta, que define o espaçamento entre bocas de lobo.</p>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}

      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Field label="Nome da via" required>
              <input className={fieldInputClass} value={form.nomeVia} onChange={(e) => setForm({ ...form, nomeVia: e.target.value })} />
            </Field>
          </div>
          <Field label="Y0 — altura d'água limite (m)" required>
            <input type="number" step="any" className={fieldInputClass} value={form.y0M} onChange={(e) => setForm({ ...form, y0M: e.target.value })} />
          </Field>
          <Field label="Z — recíproca da declividade transversal" required>
            <input type="number" step="any" className={fieldInputClass} value={form.z} onChange={(e) => setForm({ ...form, z: e.target.value })} />
          </Field>
          <Field label="Declividade longitudinal (m/m)" required>
            <input type="number" step="any" className={fieldInputClass} value={form.declividadeLongitudinal} onChange={(e) => setForm({ ...form, declividadeLongitudinal: e.target.value })} />
          </Field>
          <Field label="Coeficiente de escoamento C" required>
            <input type="number" step="any" className={fieldInputClass} value={form.coefC} onChange={(e) => setForm({ ...form, coefC: e.target.value })} />
          </Field>
          <Field label="Largura do impluvio (m)" required>
            <input type="number" step="any" className={fieldInputClass} value={form.larguraImpluvioM} onChange={(e) => setForm({ ...form, larguraImpluvioM: e.target.value })} />
          </Field>
          <Field label="Manning n da sarjeta" required>
            <input type="number" step="any" className={fieldInputClass} value={form.manningN} onChange={(e) => setForm({ ...form, manningN: e.target.value })} />
          </Field>
          <Field label="Tc — tempo de concentração (min)" required hint={equacao ? `Equação IDF: ${equacao.nome} · TR: ${obraAtiva.tempo_retorno_anos} anos` : 'Obra sem equação IDF vinculada'}>
            <input type="number" step="any" className={fieldInputClass} value={form.tcMin} onChange={(e) => setForm({ ...form, tcMin: e.target.value })} />
          </Field>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button onClick={handleCalcular} className={PRIMARY_BTN}>
            <Waves size={16} />
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
          <div className="mt-5 grid grid-cols-2 gap-4 rounded-lg border border-brand/30 bg-brand/5 p-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Intensidade de projeto</div>
              <div className="font-sans text-xl font-bold text-text-primary">{resultado.intensidade.toFixed(2)} mm/h</div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Comprimento crítico</div>
              <div className="font-sans text-xl font-bold text-brand">{resultado.comprimento.toFixed(2)} m</div>
            </div>
          </div>
        )}
      </div>

      {historico.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50 text-left text-xs text-text-secondary">
                <th className="px-4 py-2 font-medium">Via</th>
                <th className="px-4 py-2 font-medium">Intensidade (mm/h)</th>
                <th className="px-4 py-2 font-medium">Comprimento crítico (m)</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((h) => (
                <tr key={h.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 text-text-primary">{h.nome_via}</td>
                  <td className="px-4 py-2 text-text-secondary">{h.intensidade_mm_h.toFixed(2)}</td>
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
