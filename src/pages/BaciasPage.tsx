import { Fragment, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FolderOpen, Lock, Loader2, Pencil, Trash2, Upload } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { fieldInputClass } from '../components/ui/Field'
import { useRevisaoContext } from '../lib/RevisaoContext'
import { parseLandXml } from '../engine/landxml'
import { parseBaciasCsv } from '../engine/csvBacias'
import { importarRedeLandXml, listCaixas, listTrechos, updateTrechoManning, type CaixaRecord, type TrechoRecord } from '../lib/redeStorage'
import { importarBaciasCsv, listBacias, updateBaciaVinculo, updateDestinoRestante, type BaciaRecord } from '../lib/baciasStorage'
import { listCaptacoesPorRevisao, upsertCaptacao, deleteCaptacao, type CaptacaoRecord } from '../lib/captacaoStorage'
import { listMateriaisManning, toMateriaisManningMap } from '../lib/materiaisStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'
const SMALL_BTN =
  'flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'

export function BaciasPage() {
  const { revisaoAtiva } = useRevisaoContext()
  const [caixas, setCaixas] = useState<CaixaRecord[]>([])
  const [trechos, setTrechos] = useState<TrechoRecord[]>([])
  const [bacias, setBacias] = useState<BaciaRecord[]>([])
  const [captacoes, setCaptacoes] = useState<CaptacaoRecord[]>([])
  const [baciasExpandidas, setBaciasExpandidas] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const landXmlInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    if (!revisaoAtiva) return
    const [c, t, b] = await Promise.all([listCaixas(revisaoAtiva.id), listTrechos(revisaoAtiva.id), listBacias(revisaoAtiva.id)])
    setCaixas(c)
    setTrechos(t)
    setBacias(b)
    // isolado do Promise.all acima de propósito: a tabela bacia_dispositivo é
    // nova (migração 009) e pode ainda não existir no banco — se faltar, o
    // resto da página (caixas/trechos/bacias) continua funcionando normalmente
    try {
      setCaptacoes(await listCaptacoesPorRevisao(revisaoAtiva.id))
    } catch {
      setCaptacoes([])
    }
  }

  const toggleExpandida = (baciaId: string) =>
    setBaciasExpandidas((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(baciaId)) proximo.delete(baciaId)
      else proximo.add(baciaId)
      return proximo
    })

  const handleAdicionarCaptacao = async (baciaId: string, dispositivoId: string, percentual: number) => {
    try {
      await upsertCaptacao(baciaId, dispositivoId, percentual, 'manual')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar captação — confira se a soma não ultrapassa 100%.')
    }
  }

  const handleEditarPercentual = async (captacao: CaptacaoRecord, novoPercentual: number) => {
    if (captacao.origem !== 'manual') return
    try {
      await upsertCaptacao(captacao.bacia_id, captacao.dispositivo_id, novoPercentual, 'manual')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar captação — confira se a soma não ultrapassa 100%.')
    }
  }

  const handleRemoverCaptacao = async (id: string) => {
    try {
      await deleteCaptacao(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover captação.')
    }
  }

  const handleDeclararRestante = async (baciaId: string, destino: string) => {
    try {
      await updateDestinoRestante(baciaId, destino.trim() || null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar declaração do restante.')
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisaoAtiva])

  const handleImportLandXml = async (file: File) => {
    if (!revisaoAtiva) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const text = await file.text()
      const materiais = await listMateriaisManning()
      const resultado = parseLandXml(text, toMateriaisManningMap(materiais))
      await importarRedeLandXml(revisaoAtiva.id, resultado)
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
    if (!revisaoAtiva) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const text = await file.text()
      const parsed = parseBaciasCsv(text)
      await importarBaciasCsv(revisaoAtiva.id, parsed)
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

  if (!revisaoAtiva) {
    return (
      <div className="mx-auto max-w-4xl">
        <Breadcrumb items={['Cadastros', 'Bacias']} />
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          Selecione ou crie um projeto e uma revisão em Cadastros → Projetos antes de importar rede e bacias.
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
        <h1 className="font-sans text-xl font-bold text-text-primary">
          Bacias — {revisaoAtiva.projeto_nome} — {revisaoAtiva.nome}
        </h1>
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
                <th className="pb-2 font-medium">Vínculo (legado)</th>
                <th className="pb-2 font-medium">Captação</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {bacias.map((b) => {
                const captacoesDaBacia = captacoes.filter((c) => c.bacia_id === b.id)
                const soma = captacoesDaBacia.reduce((acc, c) => acc + c.percentual, 0)
                const expandida = baciasExpandidas.has(b.id)
                return (
                  <Fragment key={b.id}>
                    <tr className="border-b border-border/60">
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
                      <td className="py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            soma === 100
                              ? 'bg-accent-green/10 text-accent-green'
                              : soma > 100
                                ? 'bg-accent-red/10 text-accent-red'
                                : 'bg-accent-amber/10 text-accent-amber'
                          }`}
                        >
                          {captacoesDaBacia.length} dispositivo(s) · {soma.toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-2">
                        <button onClick={() => toggleExpandida(b.id)} className="text-text-secondary hover:text-brand">
                          {expandida ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </td>
                    </tr>
                    {expandida && (
                      <tr className="border-b border-border/60 last:border-0">
                        <td colSpan={7} className="bg-elevated/40 px-2 py-3">
                          <CaptacaoPorBacia
                            bacia={b}
                            captacoes={captacoesDaBacia}
                            caixas={caixas}
                            onAdicionar={handleAdicionarCaptacao}
                            onEditarPercentual={handleEditarPercentual}
                            onRemover={handleRemoverCaptacao}
                            onDeclararRestante={handleDeclararRestante}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function CaptacaoPorBacia({
  bacia,
  captacoes,
  caixas,
  onAdicionar,
  onEditarPercentual,
  onRemover,
  onDeclararRestante,
}: {
  bacia: BaciaRecord
  captacoes: CaptacaoRecord[]
  caixas: CaixaRecord[]
  onAdicionar: (baciaId: string, dispositivoId: string, percentual: number) => Promise<void>
  onEditarPercentual: (captacao: CaptacaoRecord, novoPercentual: number) => Promise<void>
  onRemover: (id: string) => Promise<void>
  onDeclararRestante: (baciaId: string, destino: string) => Promise<void>
}) {
  const [novoDispositivoId, setNovoDispositivoId] = useState('')
  const [novoPercentual, setNovoPercentual] = useState('')
  const [restante, setRestante] = useState(bacia.destino_restante_nao_captado ?? '')

  const soma = captacoes.reduce((acc, c) => acc + c.percentual, 0)
  const disponiveis = caixas.filter((c) => !captacoes.some((cap) => cap.dispositivo_id === c.id))
  const percentualNum = Number(novoPercentual)
  const excederia = Number.isFinite(percentualNum) && soma + percentualNum > 100

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
        Captação por dispositivo — {bacia.nome}
      </div>

      {captacoes.length > 0 && (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="pb-1.5 font-medium">Dispositivo</th>
              <th className="pb-1.5 font-medium">Percentual</th>
              <th className="pb-1.5 font-medium">Origem</th>
              <th className="pb-1.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {captacoes.map((c) => {
              const dispositivo = caixas.find((cx) => cx.id === c.dispositivo_id)
              return (
                <tr key={c.id} className="border-b border-border/60 last:border-0">
                  <td className="py-1.5">{dispositivo?.nome ?? '—'}</td>
                  <td className="py-1.5">
                    {c.origem === 'manual' ? (
                      <input
                        type="number"
                        step="any"
                        min={0}
                        max={100}
                        defaultValue={c.percentual}
                        className={`${fieldInputClass} w-20 py-1`}
                        onBlur={(e) => {
                          const n = Number(e.target.value)
                          if (Number.isFinite(n) && n > 0 && n !== c.percentual) onEditarPercentual(c, n)
                        }}
                      />
                    ) : (
                      <span className="font-mono">{c.percentual.toFixed(1)}%</span>
                    )}
                  </td>
                  <td className="py-1.5">
                    {c.origem === 'derivado_rede' ? (
                      <span className="flex items-center gap-1 text-accent-green" title="Calculado automaticamente da geometria da rede — trave a edição direta">
                        <Lock size={12} /> automático
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-accent-blue" title="Estimado manualmente pelo engenheiro">
                        <Pencil size={12} /> manual
                      </span>
                    )}
                  </td>
                  <td className="py-1.5">
                    {c.origem === 'manual' && (
                      <button onClick={() => onRemover(c.id)} className="text-text-secondary hover:text-accent-red">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <div className="flex items-center gap-2">
        <select value={novoDispositivoId} onChange={(e) => setNovoDispositivoId(e.target.value)} className={`${fieldInputClass} w-48 py-1.5 text-xs`}>
          <option value="">Adicionar dispositivo...</option>
          {disponiveis.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="any"
          min={0}
          max={100}
          placeholder="%"
          value={novoPercentual}
          onChange={(e) => setNovoPercentual(e.target.value)}
          className={`${fieldInputClass} w-20 py-1.5 text-xs`}
        />
        <button
          disabled={!novoDispositivoId || !Number.isFinite(percentualNum) || percentualNum <= 0 || excederia}
          onClick={async () => {
            await onAdicionar(bacia.id, novoDispositivoId, percentualNum)
            setNovoDispositivoId('')
            setNovoPercentual('')
          }}
          className={SMALL_BTN}
        >
          Adicionar
        </button>
        {excederia && <span className="text-xs text-accent-red">soma passaria de 100%</span>}
      </div>

      <div className="text-xs">
        Soma atual:{' '}
        <span className={`font-semibold ${soma === 100 ? 'text-accent-green' : soma > 100 ? 'text-accent-red' : 'text-accent-amber'}`}>
          {soma.toFixed(1)}%
        </span>
      </div>

      {soma < 100 && (
        <div className="rounded-md border border-accent-amber/40 bg-accent-amber/10 p-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-accent-amber">
            <AlertTriangle size={13} />
            Soma abaixo de 100% — declare o destino do restante ({(100 - soma).toFixed(1)}%)
          </div>
          <div className="flex items-center gap-2">
            <input
              value={restante}
              onChange={(e) => setRestante(e.target.value)}
              placeholder="ex.: dispositivo a jusante fora da bacia modelada, infiltração, vazão residual não tratada"
              className={`${fieldInputClass} flex-1 py-1.5 text-xs`}
            />
            <button onClick={() => onDeclararRestante(bacia.id, restante)} className={SMALL_BTN}>
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
