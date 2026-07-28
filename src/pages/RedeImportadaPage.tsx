import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckSquare, Loader2, Square } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { fieldInputClass } from '../components/ui/Field'
import { useRevisaoContext } from '../lib/RevisaoContext'
import { recalcularCascataJusante, type PatchCascata } from '../engine/cascataJusante'
import {
  listCaixas,
  listTrechos,
  updateCaixa,
  updateCaixasTipoEmLote,
  updateTrecho,
  updateTrechosManningEmLote,
  type CaixaRecord,
  type TrechoRecord,
} from '../lib/redeStorage'
import { supabase } from '../lib/supabase'

const TIPOS_CAIXA = [
  { value: 'pv', label: 'PV' },
  { value: 'boca_de_lobo', label: 'Boca de lobo' },
  { value: 'caixa_passagem', label: 'Caixa de passagem' },
]

const SMALL_BTN =
  'flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'

export function RedeImportadaPage() {
  const { revisaoAtiva } = useRevisaoContext()
  const [aba, setAba] = useState<'estruturas' | 'tubos'>('estruturas')
  const [caixas, setCaixas] = useState<CaixaRecord[]>([])
  const [trechos, setTrechos] = useState<TrechoRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')
  const [selecionadosCaixas, setSelecionadosCaixas] = useState<Set<string>>(new Set())
  const [selecionadosTrechos, setSelecionadosTrechos] = useState<Set<string>>(new Set())
  const [tipoLote, setTipoLote] = useState('pv')
  const [manningLote, setManningLote] = useState('')
  const [cascataPendente, setCascataPendente] = useState<{ trechoNome: string; patches: PatchCascata[] } | null>(null)

  const load = async () => {
    if (!revisaoAtiva) return
    const [c, t] = await Promise.all([listCaixas(revisaoAtiva.id), listTrechos(revisaoAtiva.id)])
    setCaixas(c)
    setTrechos(t)
  }

  useEffect(() => {
    load().catch((e) => setError(e.message))
    setSelecionadosCaixas(new Set())
    setSelecionadosTrechos(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisaoAtiva])

  const caixasFiltradas = useMemo(
    () => caixas.filter((c) => c.nome.toLowerCase().includes(filtro.toLowerCase())),
    [caixas, filtro],
  )
  const trechosFiltrados = useMemo(
    () => trechos.filter((t) => t.nome.toLowerCase().includes(filtro.toLowerCase())),
    [trechos, filtro],
  )

  const toggleSelecaoCaixa = (id: string) =>
    setSelecionadosCaixas((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })

  const toggleSelecionarTodasCaixas = () =>
    setSelecionadosCaixas((atual) =>
      atual.size === caixasFiltradas.length ? new Set() : new Set(caixasFiltradas.map((c) => c.id)),
    )

  const toggleSelecaoTrecho = (id: string) =>
    setSelecionadosTrechos((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })

  const toggleSelecionarTodosTrechos = () =>
    setSelecionadosTrechos((atual) =>
      atual.size === trechosFiltrados.length ? new Set() : new Set(trechosFiltrados.map((t) => t.id)),
    )

  const handleAplicarTipoLote = async () => {
    setBusy(true)
    setError(null)
    try {
      await updateCaixasTipoEmLote([...selecionadosCaixas], tipoLote)
      setSelecionadosCaixas(new Set())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aplicar tipo em lote.')
    } finally {
      setBusy(false)
    }
  }

  const handleAplicarManningLote = async () => {
    const n = Number(manningLote)
    if (!Number.isFinite(n) || n <= 0) return
    setBusy(true)
    setError(null)
    try {
      await updateTrechosManningEmLote([...selecionadosTrechos], n)
      setSelecionadosTrechos(new Set())
      setManningLote('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aplicar manning em lote.')
    } finally {
      setBusy(false)
    }
  }

  const handleEditCaixaTipo = async (id: string, tipo: string) => {
    try {
      await updateCaixa(id, { tipo })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao editar caixa.')
    }
  }

  const handleEditCaixaCota = async (id: string, campo: 'cota_terreno' | 'cota_fundo', valor: string) => {
    const n = valor === '' ? null : Number(valor)
    if (n !== null && !Number.isFinite(n)) return
    try {
      await updateCaixa(id, { [campo]: n })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao editar caixa.')
    }
  }

  const handleEditTrecho = async (id: string, patch: Parameters<typeof updateTrecho>[1]) => {
    try {
      await updateTrecho(id, patch)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao editar trecho.')
    }
  }

  const aplicarPatchesCascata = async (patches: PatchCascata[]) => {
    setBusy(true)
    setError(null)
    try {
      for (const p of patches) {
        await updateTrecho(p.id, {
          diametro_m: p.diametroM,
          declividade_m_m: p.declividadeMM,
          cota_fundo_montante: p.cotaFundoMontante,
          cota_fundo_jusante: p.cotaFundoJusante,
          cota_topo_montante: p.cotaTopoMontante,
          cota_topo_jusante: p.cotaTopoJusante,
        })
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao recalcular a cascata.')
    } finally {
      setBusy(false)
    }
  }

  // Diâmetro/declividade não é só um campo isolado: mudar um trecho desloca a cota de
  // fundo de tudo a jusante dele (e pode forçar o diâmetro dos trechos seguintes a subir,
  // já que diâmetro nunca diminui de montante pra jusante). Quando a mudança afeta mais
  // do que o próprio trecho, pede confirmação antes de aplicar em cascata.
  const handleEditTrechoComCascata = (t: TrechoRecord, diametroM: number, declividadeMM: number) => {
    if (t.cota_fundo_montante == null) {
      // sem cota de fundo conhecida pra esse trecho — não dá pra recalcular a cascata
      // com segurança, então só atualiza o próprio trecho (comportamento antigo).
      handleEditTrecho(t.id, { diametro_m: diametroM, declividade_m_m: declividadeMM })
      return
    }
    const grafo = trechos.map((x) => ({
      id: x.id,
      caixaMontanteId: x.caixa_montante_id,
      caixaJusanteId: x.caixa_jusante_id,
      comprimentoM: x.comprimento_m,
      diametroM: x.diametro_m,
      declividadeMM: x.declividade_m_m,
      cotaFundoMontante: x.cota_fundo_montante,
    }))
    const patches = recalcularCascataJusante(grafo, t.id, diametroM, declividadeMM)
    if (patches.length <= 1) {
      aplicarPatchesCascata(patches)
      return
    }
    setCascataPendente({ trechoNome: t.nome, patches })
  }

  const handleConfirmarCascata = async () => {
    if (!cascataPendente) return
    await aplicarPatchesCascata(cascataPendente.patches)
    setCascataPendente(null)
  }

  if (!supabase) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumb items={['Cadastros', 'Rede Importada']} />
        <div className="rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3 text-sm text-accent-amber">
          Supabase não configurado.
        </div>
      </div>
    )
  }

  if (!revisaoAtiva) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumb items={['Cadastros', 'Rede Importada']} />
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          Selecione uma revisão em Cadastros → Projetos.
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={['Cadastros', 'Rede Importada']} />

      <div className="mb-4">
        <h1 className="font-sans text-xl font-bold text-text-primary">
          Rede Importada — {revisaoAtiva.projeto_nome} — {revisaoAtiva.nome}
        </h1>
        <p className="text-sm text-text-secondary">
          Edite os dados importados do LandXML: {caixas.length} estrutura(s), {trechos.length} tubo(s).
        </p>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}

      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setAba('estruturas')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            aba === 'estruturas' ? 'bg-brand text-white' : 'bg-surface text-text-secondary hover:text-text-primary'
          }`}
        >
          Estruturas ({caixas.length})
        </button>
        <button
          onClick={() => setAba('tubos')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            aba === 'tubos' ? 'bg-brand text-white' : 'bg-surface text-text-secondary hover:text-text-primary'
          }`}
        >
          Tubos ({trechos.length})
        </button>
        <input
          placeholder="Filtrar por nome..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className={`${fieldInputClass} ml-auto w-56 py-1.5`}
        />
      </div>

      {aba === 'estruturas' ? (
        <>
          {selecionadosCaixas.size > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/5 p-3">
              <span className="text-sm text-text-primary">{selecionadosCaixas.size} selecionada(s)</span>
              <select value={tipoLote} onChange={(e) => setTipoLote(e.target.value)} className={`${fieldInputClass} w-48 py-1.5`}>
                {TIPOS_CAIXA.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <button onClick={handleAplicarTipoLote} disabled={busy} className={SMALL_BTN}>
                {busy && <Loader2 size={14} className="animate-spin" />}
                Aplicar tipo aos selecionados
              </button>
              <button onClick={() => setSelecionadosCaixas(new Set())} className="text-xs text-text-secondary hover:text-text-primary">
                Limpar seleção
              </button>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated/50 text-left text-xs text-text-secondary">
                  <th className="w-10 px-3 py-2">
                    <button onClick={toggleSelecionarTodasCaixas} className="flex items-center text-text-secondary hover:text-brand">
                      {selecionadosCaixas.size === caixasFiltradas.length && caixasFiltradas.length > 0 ? (
                        <CheckSquare size={16} />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-2 font-medium">Nome</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Cota terreno</th>
                  <th className="px-3 py-2 font-medium">Cota fundo</th>
                  <th className="px-3 py-2 font-medium">Origem</th>
                </tr>
              </thead>
              <tbody>
                {caixasFiltradas.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-1.5">
                      <button onClick={() => toggleSelecaoCaixa(c.id)} className="flex items-center text-text-secondary hover:text-brand">
                        {selecionadosCaixas.has(c.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 text-text-primary">{c.nome}</td>
                    <td className="px-3 py-1.5">
                      <select
                        value={c.tipo}
                        onChange={(e) => handleEditCaixaTipo(c.id, e.target.value)}
                        className={`${fieldInputClass} w-40 py-1`}
                      >
                        {TIPOS_CAIXA.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        step="any"
                        defaultValue={c.cota_terreno ?? ''}
                        onBlur={(e) => handleEditCaixaCota(c.id, 'cota_terreno', e.target.value)}
                        className={`${fieldInputClass} w-28 py-1`}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        step="any"
                        defaultValue={c.cota_fundo ?? ''}
                        onBlur={(e) => handleEditCaixaCota(c.id, 'cota_fundo', e.target.value)}
                        className={`${fieldInputClass} w-28 py-1`}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-text-secondary">{c.origem}</td>
                  </tr>
                ))}
                {caixasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-text-secondary">
                      Nenhuma estrutura encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {cascataPendente && (
            <div className="mb-3 rounded-lg border border-accent-amber/40 bg-accent-amber/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                <AlertTriangle size={16} className="text-accent-amber shrink-0" />
                Editar {cascataPendente.trechoNome} recalcula {cascataPendente.patches.length - 1} trecho(s) a jusante
                (cota de fundo deslocada e diâmetro elevado quando necessário).
              </div>
              <div className="mb-3 max-h-40 overflow-y-auto rounded-md border border-border/60 bg-surface">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-text-secondary">
                      <th className="px-2 py-1 font-medium">Trecho</th>
                      <th className="px-2 py-1 font-medium">Montante</th>
                      <th className="px-2 py-1 font-medium">Jusante</th>
                      <th className="px-2 py-1 font-medium">Diâm. novo (m)</th>
                      <th className="px-2 py-1 font-medium">Cota fundo montante</th>
                      <th className="px-2 py-1 font-medium">Cota fundo jusante</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cascataPendente.patches.map((p) => {
                      const trecho = trechos.find((t) => t.id === p.id)
                      const nomeMontante = caixas.find((c) => c.id === trecho?.caixa_montante_id)?.nome ?? '—'
                      const nomeJusante = caixas.find((c) => c.id === trecho?.caixa_jusante_id)?.nome ?? '—'
                      return (
                        <tr key={p.id} className="border-b border-border/40 last:border-0">
                          <td className="px-2 py-1 text-text-primary">{trecho?.nome ?? p.id}</td>
                          <td className="px-2 py-1 text-text-secondary">{nomeMontante}</td>
                          <td className="px-2 py-1 text-text-secondary">{nomeJusante}</td>
                          <td className="px-2 py-1 text-text-secondary">{p.diametroM.toFixed(3)}</td>
                          <td className="px-2 py-1 text-text-secondary">{p.cotaFundoMontante.toFixed(3)}</td>
                          <td className="px-2 py-1 text-text-secondary">{p.cotaFundoJusante.toFixed(3)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2">
                {/* onMouseDown com preventDefault evita que o clique tire o foco do campo
                    editado antes do onClick rodar — sem isso, o blur do campo dispara de
                    novo com o valor antigo e sobrescreve a cascata calculada aqui. */}
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleConfirmarCascata}
                  disabled={busy}
                  className={SMALL_BTN}
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  Aplicar recálculo em cascata
                </button>
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setCascataPendente(null)}
                  className="text-xs text-text-secondary hover:text-text-primary"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {selecionadosTrechos.size > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/5 p-3">
              <span className="text-sm text-text-primary">{selecionadosTrechos.size} selecionado(s)</span>
              <input
                type="number"
                step="0.001"
                placeholder="manning n"
                value={manningLote}
                onChange={(e) => setManningLote(e.target.value)}
                className={`${fieldInputClass} w-32 py-1.5`}
              />
              <button onClick={handleAplicarManningLote} disabled={busy || !manningLote} className={SMALL_BTN}>
                {busy && <Loader2 size={14} className="animate-spin" />}
                Aplicar manning n aos selecionados
              </button>
              <button onClick={() => setSelecionadosTrechos(new Set())} className="text-xs text-text-secondary hover:text-text-primary">
                Limpar seleção
              </button>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-elevated/50 text-left text-xs text-text-secondary">
                  <th className="w-10 px-3 py-2">
                    <button onClick={toggleSelecionarTodosTrechos} className="flex items-center text-text-secondary hover:text-brand">
                      {selecionadosTrechos.size === trechosFiltrados.length && trechosFiltrados.length > 0 ? (
                        <CheckSquare size={16} />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  <th className="px-3 py-2 font-medium">Trecho</th>
                  <th className="px-3 py-2 font-medium">Montante</th>
                  <th className="px-3 py-2 font-medium">Jusante</th>
                  <th className="px-3 py-2 font-medium">Comp. (m)</th>
                  <th className="px-3 py-2 font-medium">Diâm. (m)</th>
                  <th className="px-3 py-2 font-medium">Decl. (m/m)</th>
                  <th className="px-3 py-2 font-medium">Material</th>
                  <th className="px-3 py-2 font-medium">Manning n</th>
                  <th className="px-3 py-2 font-medium">Origem manning</th>
                </tr>
              </thead>
              <tbody>
                {trechosFiltrados.map((t) => {
                  const nomeMontante = caixas.find((c) => c.id === t.caixa_montante_id)?.nome ?? '—'
                  const nomeJusante = caixas.find((c) => c.id === t.caixa_jusante_id)?.nome ?? '—'
                  return (
                    <tr key={t.id} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-1.5">
                        <button onClick={() => toggleSelecaoTrecho(t.id)} className="flex items-center text-text-secondary hover:text-brand">
                          {selecionadosTrechos.has(t.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-text-primary">{t.nome}</td>
                      <td className="px-3 py-1.5 text-text-secondary">{nomeMontante}</td>
                      <td className="px-3 py-1.5 text-text-secondary">{nomeJusante}</td>
                      <td className="px-3 py-1.5 text-text-secondary">{t.comprimento_m.toFixed(2)}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="any"
                          defaultValue={t.diametro_m}
                          onBlur={(e) => {
                            const n = Number(e.target.value)
                            if (Number.isFinite(n) && n > 0) handleEditTrechoComCascata(t, n, t.declividade_m_m)
                          }}
                          className={`${fieldInputClass} w-20 py-1`}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="any"
                          defaultValue={t.declividade_m_m}
                          onBlur={(e) => {
                            const n = Number(e.target.value)
                            if (Number.isFinite(n) && n > 0) handleEditTrechoComCascata(t, t.diametro_m, n)
                          }}
                          className={`${fieldInputClass} w-24 py-1`}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          defaultValue={t.material ?? ''}
                          onBlur={(e) => handleEditTrecho(t.id, { material: e.target.value.trim() || null })}
                          className={`${fieldInputClass} w-32 py-1`}
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.001"
                          defaultValue={t.manning_n ?? ''}
                          placeholder="informar"
                          onBlur={(e) => {
                            const n = Number(e.target.value)
                            if (Number.isFinite(n) && n > 0) handleEditTrecho(t.id, { manning_n: n, manning_n_origem: 'manual' })
                          }}
                          className={`${fieldInputClass} w-24 py-1 ${t.manning_n == null ? 'border-accent-red/60' : ''}`}
                        />
                      </td>
                      <td className="px-3 py-1.5 text-text-secondary">{t.manning_n_origem}</td>
                    </tr>
                  )
                })}
                {trechosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-text-secondary">
                      Nenhum tubo encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
