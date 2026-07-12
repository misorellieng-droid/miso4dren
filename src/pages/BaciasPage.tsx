import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FolderOpen, Loader2, Upload } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { fieldInputClass } from '../components/ui/Field'
import { useObraContext } from '../lib/ObraContext'
import { parseLandXml } from '../engine/landxml'
import { parseBaciasCsv } from '../engine/csvBacias'
import { importarRedeLandXml, listCaixas, listTrechos, updateTrechoManning, type CaixaRecord, type TrechoRecord } from '../lib/redeStorage'
import { importarBaciasCsv, listBacias, updateBaciaVinculo, type BaciaRecord } from '../lib/baciasStorage'
import { listMateriaisManning, toMateriaisManningMap } from '../lib/materiaisStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'

export function BaciasPage() {
  const { obraAtiva } = useObraContext()
  const [caixas, setCaixas] = useState<CaixaRecord[]>([])
  const [trechos, setTrechos] = useState<TrechoRecord[]>([])
  const [bacias, setBacias] = useState<BaciaRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const landXmlInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    if (!obraAtiva) return
    const [c, t, b] = await Promise.all([listCaixas(obraAtiva.id), listTrechos(obraAtiva.id), listBacias(obraAtiva.id)])
    setCaixas(c)
    setTrechos(t)
    setBacias(b)
  }

  useEffect(() => {
    load().catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraAtiva])

  const handleImportLandXml = async (file: File) => {
    if (!obraAtiva) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const text = await file.text()
      const materiais = await listMateriaisManning()
      const resultado = parseLandXml(text, toMateriaisManningMap(materiais))
      await importarRedeLandXml(obraAtiva.id, resultado)
      setMessage(`Rede importada: ${resultado.caixas.length} caixa(s), ${resultado.trechos.length} trecho(s).`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar LandXML.')
    } finally {
      setBusy(false)
      if (landXmlInputRef.current) landXmlInputRef.current.value = ''
    }
  }

  const handleImportCsv = async (file: File) => {
    if (!obraAtiva) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const text = await file.text()
      const parsed = parseBaciasCsv(text)
      await importarBaciasCsv(obraAtiva.id, parsed)
      setMessage(`${parsed.length} bacia(s) importada(s).`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar CSV de bacias.')
    } finally {
      setBusy(false)
      if (csvInputRef.current) csvInputRef.current.value = ''
    }
  }

  const handleManualVinculo = async (baciaId: string, caixaId: string) => {
    try {
      await updateBaciaVinculo(baciaId, caixaId || null, caixaId ? 'manual' : 'pendente')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao vincular bacia.')
    }
  }

  const handleManningEdit = async (trechoId: string, value: string) => {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return
    try {
      await updateTrechoManning(trechoId, n)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar manning_n.')
    }
  }

  if (!supabase) {
    return (
      <div className="mx-auto max-w-4xl">
        <Breadcrumb items={['Cadastros', 'Bacias']} />
        <div className="rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3 text-sm text-accent-amber">
          Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.
        </div>
      </div>
    )
  }

  if (!obraAtiva) {
    return (
      <div className="mx-auto max-w-4xl">
        <Breadcrumb items={['Cadastros', 'Bacias']} />
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          Selecione ou crie uma obra em Cadastros → Obras antes de importar rede e bacias.
        </div>
      </div>
    )
  }

  const trechosParaRevisao = trechos.filter((t) => t.manning_n_origem === 'tabela_interna' || t.manning_n == null)
  const baciasPendentes = bacias.filter((b) => b.vinculo_status === 'pendente')

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb items={['Cadastros', 'Bacias']} />

      <div className="mb-6">
        <h1 className="font-sans text-xl font-bold text-text-primary">Bacias — {obraAtiva.nome}</h1>
        <p className="text-sm text-text-secondary">Importe a rede (LandXML) e as bacias (CSV), depois revise as exceções abaixo.</p>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}
      {message && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-accent-green/40 bg-accent-green/10 p-3 text-sm text-accent-green">
          <CheckCircle2 size={16} /> {message}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 font-sans text-sm font-semibold text-text-primary">1. Importar rede (LandXML)</div>
          <p className="mb-3 text-xs text-text-secondary">Exportado do Pipe Network do Civil 3D — caixas e trechos.</p>
          <input ref={landXmlInputRef} type="file" accept=".xml" className="hidden" onChange={(e) => e.target.files?.[0] && handleImportLandXml(e.target.files[0])} />
          <button onClick={() => landXmlInputRef.current?.click()} disabled={busy} className={PRIMARY_BTN}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Selecionar arquivo .xml
          </button>
          <div className="mt-2 text-xs text-text-secondary">{caixas.length} caixa(s) · {trechos.length} trecho(s) cadastrados</div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 font-sans text-sm font-semibold text-text-primary">2. Importar bacias (CSV)</div>
          <p className="mb-3 text-xs text-text-secondary">Data Extraction de Catchment — nome, área, C, Tc, pour point.</p>
          <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleImportCsv(e.target.files[0])} />
          <button onClick={() => csvInputRef.current?.click()} disabled={busy} className={PRIMARY_BTN}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Selecionar arquivo .csv
          </button>
          <div className="mt-2 text-xs text-text-secondary">{bacias.length} bacia(s) cadastradas</div>
        </div>
      </div>

      {/* Revisão: manning_n vindo da tabela interna ou ausente */}
      {trechosParaRevisao.length > 0 && (
        <div className="mb-6 rounded-lg border border-accent-amber/40 bg-surface p-4">
          <div className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold text-text-primary">
            <AlertTriangle size={16} className="text-accent-amber" />
            Revisar rugosidade de Manning ({trechosParaRevisao.length})
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-secondary">
                <th className="pb-2 font-medium">Trecho</th>
                <th className="pb-2 font-medium">Material</th>
                <th className="pb-2 font-medium">Origem</th>
                <th className="pb-2 font-medium">Manning n</th>
              </tr>
            </thead>
            <tbody>
              {trechosParaRevisao.map((t) => (
                <tr key={t.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2">{t.nome}</td>
                  <td className="py-2 text-text-secondary">{t.material ?? '—'}</td>
                  <td className="py-2 text-text-secondary">
                    {t.manning_n_origem === 'tabela_interna' ? 'Tabela interna' : t.manning_n == null ? 'Pendente' : 'Manual'}
                  </td>
                  <td className="py-2">
                    <input
                      type="number"
                      step="0.001"
                      defaultValue={t.manning_n ?? ''}
                      placeholder="informar"
                      className={`${fieldInputClass} w-28 py-1`}
                      onBlur={(e) => handleManningEdit(t.id, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Revisão: vínculo bacia -> caixa pendente */}
      {baciasPendentes.length > 0 && (
        <div className="mb-6 rounded-lg border border-accent-amber/40 bg-surface p-4">
          <div className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold text-text-primary">
            <AlertTriangle size={16} className="text-accent-amber" />
            Vincular bacias sem caixa de destino ({baciasPendentes.length})
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-secondary">
                <th className="pb-2 font-medium">Bacia</th>
                <th className="pb-2 font-medium">Área (m²)</th>
                <th className="pb-2 font-medium">Caixa de destino</th>
              </tr>
            </thead>
            <tbody>
              {baciasPendentes.map((b) => (
                <tr key={b.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2">{b.nome}</td>
                  <td className="py-2 text-text-secondary">{b.area_m2.toFixed(1)}</td>
                  <td className="py-2">
                    <select
                      className={`${fieldInputClass} w-48 py-1`}
                      defaultValue=""
                      onChange={(e) => handleManualVinculo(b.id, e.target.value)}
                    >
                      <option value="">Selecione a caixa...</option>
                      {caixas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Lista geral de bacias */}
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold text-text-primary">
          <FolderOpen size={16} className="text-brand" />
          Bacias cadastradas
        </div>
        {bacias.length === 0 ? (
          <div className="text-sm text-text-secondary">Nenhuma bacia importada ainda.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-secondary">
                <th className="pb-2 font-medium">Nome</th>
                <th className="pb-2 font-medium">Área (m²)</th>
                <th className="pb-2 font-medium">C</th>
                <th className="pb-2 font-medium">Tc (min)</th>
                <th className="pb-2 font-medium">Vínculo</th>
              </tr>
            </thead>
            <tbody>
              {bacias.map((b) => (
                <tr key={b.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2">{b.nome}</td>
                  <td className="py-2 text-text-secondary">{b.area_m2.toFixed(1)}</td>
                  <td className="py-2 text-text-secondary">{b.coef_c}</td>
                  <td className="py-2 text-text-secondary">{b.tc_min ?? '—'}</td>
                  <td className="py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        b.vinculo_status === 'automatico'
                          ? 'bg-accent-green/10 text-accent-green'
                          : b.vinculo_status === 'manual'
                            ? 'bg-accent-blue/10 text-accent-blue'
                            : 'bg-accent-amber/10 text-accent-amber'
                      }`}
                    >
                      {b.vinculo_status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
