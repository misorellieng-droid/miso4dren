import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckSquare, Download, Droplets, Loader2, Network, Square, Trash2 } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { fieldInputClass } from '../components/ui/Field'
import { useRevisaoContext } from '../lib/RevisaoContext'
import { recalcularCascataJusante, type PatchCascata } from '../engine/cascataJusante'
import { exportarRedeXmlAtualizado } from '../lib/exportRedeXml'
import { nomeSemRede } from '../lib/nomeRede'
import {
  excluirCaixa,
  listCaixas,
  listTrechos,
  updateCaixa,
  updateCaixasEhTroncoEmLote,
  updateCaixasRecebeVazaoEmLote,
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
  const { revisaoAtiva, ocultarNomeRede } = useRevisaoContext()
  const nomeExibido = (nome: string, redeNome: string | null) => (ocultarNomeRede ? nomeSemRede(nome, redeNome) : nome)
  const [aba, setAba] = useState<'estruturas' | 'tubos'>('estruturas')
  const [caixas, setCaixas] = useState<CaixaRecord[]>([])
  const [trechos, setTrechos] = useState<TrechoRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')
  const [selecionadosCaixas, setSelecionadosCaixas] = useState<Set<string>>(new Set())
  const [selecionadosTrechos, setSelecionadosTrechos] = useState<Set<string>>(new Set())
  const [tipoLote, setTipoLote] = useState('pv')
  const [recebeVazaoLote, setRecebeVazaoLote] = useState('true')
  const [ehTroncoLote, setEhTroncoLote] = useState('true')
  const [manningLote, setManningLote] = useState('')
  const [cascataPendente, setCascataPendente] = useState<{ trechoNome: string; patches: PatchCascata[] } | null>(null)
  const [redeSelecionada, setRedeSelecionada] = useState<string>('todas')
  const [avisoExport, setAvisoExport] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)

  const load = async () => {
    if (!revisaoAtiva) return
    const [c, t] = await Promise.all([listCaixas(revisaoAtiva.id), listTrechos(revisaoAtiva.id)])
    setCaixas(c)
    setTrechos(t)
  }

  const handleExportarXml = async () => {
    if (!revisaoAtiva) return
    setExportando(true)
    setAvisoExport(null)
    try {
      const { modo } = await exportarRedeXmlAtualizado(
        revisaoAtiva.id,
        `rede-${revisaoAtiva.nome.replace(/\s+/g, '-')}.xml`,
        caixas,
        trechos
      )
      if (modo === 'gerado') {
        setAvisoExport(
          'Não achei o LandXML original salvo pra essa revisão (importado antes dessa funcionalidade existir) — gerei um arquivo do zero, ' +
            'que não traz a geometria física das estruturas e pode ser rejeitado pelo Civil 3D ao reimportar. Reimporte a rede uma vez (mesmo arquivo de sempre) pra habilitar o modo completo.'
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar o XML.')
    } finally {
      setExportando(false)
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e.message))
    setSelecionadosCaixas(new Set())
    setSelecionadosTrechos(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisaoAtiva])

  const redesDisponiveis = useMemo(() => {
    const nomes = new Set<string>()
    for (const c of caixas) if (c.rede_nome) nomes.add(c.rede_nome)
    for (const t of trechos) if (t.rede_nome) nomes.add(t.rede_nome)
    return [...nomes].sort()
  }, [caixas, trechos])

  // Trecho de conexão entre redes: a caixa de montante dele não recebe nenhum
  // outro trecho DENTRO DA MESMA REDE (ou seja, é cabeceira local daquela rede)
  // e a caixa de jusante pertence a uma rede diferente — é onde uma rede
  // desemboca na outra.
  const idsConexaoEntreRedes = useMemo(() => {
    const ids = new Set<string>()
    const caixaPorId = new Map(caixas.map((c) => [c.id, c]))
    for (const t of trechos) {
      if (!t.rede_nome) continue
      const temEntradaNaMesmaRede = trechos.some(
        (outro) => outro.id !== t.id && outro.caixa_jusante_id === t.caixa_montante_id && outro.rede_nome === t.rede_nome,
      )
      if (temEntradaNaMesmaRede) continue
      const caixaJusante = caixaPorId.get(t.caixa_jusante_id)
      if (caixaJusante?.rede_nome && caixaJusante.rede_nome !== t.rede_nome) ids.add(t.id)
    }
    return ids
  }, [caixas, trechos])

  const caixasFiltradas = useMemo(
    () =>
      caixas.filter(
        (c) => c.nome.toLowerCase().includes(filtro.toLowerCase()) && (redeSelecionada === 'todas' || c.rede_nome === redeSelecionada),
      ),
    [caixas, filtro, redeSelecionada],
  )
  const trechosFiltrados = useMemo(
    () =>
      trechos.filter(
        (t) => t.nome.toLowerCase().includes(filtro.toLowerCase()) && (redeSelecionada === 'todas' || t.rede_nome === redeSelecionada),
      ),
    [trechos, filtro, redeSelecionada],
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

  const handleAplicarRecebeVazaoLote = async () => {
    setBusy(true)
    setError(null)
    try {
      await updateCaixasRecebeVazaoEmLote([...selecionadosCaixas], recebeVazaoLote === 'true')
      setSelecionadosCaixas(new Set())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aplicar recebe vazão em lote.')
    } finally {
      setBusy(false)
    }
  }

  const handleAplicarEhTroncoLote = async () => {
    setBusy(true)
    setError(null)
    try {
      await updateCaixasEhTroncoEmLote([...selecionadosCaixas], ehTroncoLote === 'true')
      setSelecionadosCaixas(new Set())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aplicar rede tronco em lote.')
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

  const handleEditCaixaRecebeVazao = async (id: string, recebeVazao: boolean) => {
    try {
      await updateCaixa(id, { recebe_vazao: recebeVazao })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao editar caixa.')
    }
  }

  const handleEditCaixaEhTronco = async (id: string, ehTronco: boolean) => {
    try {
      await updateCaixa(id, { eh_tronco: ehTronco })
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

  const handleExcluirCaixa = async (c: CaixaRecord) => {
    const trechosLigados = trechos.filter((t) => t.caixa_montante_id === c.id || t.caixa_jusante_id === c.id)
    const aviso =
      trechosLigados.length > 0
        ? `Excluir a estrutura "${c.nome}"? Ela tem ${trechosLigados.length} tubo(s) ligado(s) (${trechosLigados
            .map((t) => t.nome)
            .join(', ')}) que também serão excluídos junto. Não pode ser desfeito.`
        : `Excluir a estrutura "${c.nome}"? Não pode ser desfeito.`
    if (!window.confirm(aviso)) return
    try {
      await excluirCaixa(c.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir estrutura.')
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

      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-sans text-xl font-bold text-text-primary">
            Rede Importada — {revisaoAtiva.projeto_nome} — {revisaoAtiva.nome}
          </h1>
          <p className="text-sm text-text-secondary">
            Edite os dados importados do LandXML: {caixas.length} estrutura(s), {trechos.length} tubo(s).
          </p>
        </div>
        {caixas.length > 0 && (
          <button
            onClick={handleExportarXml}
            disabled={exportando}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text-secondary shadow-sm transition hover:text-text-primary disabled:opacity-60"
            title="Edita o LandXML original importado com as cotas/diâmetro/declividade/material/manning atuais (já com as correções feitas no app) pra reimportar no Civil 3D."
          >
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Baixar XML atualizado
          </button>
        )}
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}
      {avisoExport && (
        <div className="mb-4 rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3 text-sm text-accent-amber">{avisoExport}</div>
      )}

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
        {redesDisponiveis.length > 1 && (
          <select
            value={redeSelecionada}
            onChange={(e) => setRedeSelecionada(e.target.value)}
            className={`${fieldInputClass} ml-auto w-44 py-1.5`}
          >
            <option value="todas">Todas as redes</option>
            {redesDisponiveis.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
        <input
          placeholder="Filtrar por nome..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className={`${fieldInputClass} ${redesDisponiveis.length > 1 ? '' : 'ml-auto'} w-56 py-1.5`}
        />
      </div>

      {redesDisponiveis.length > 1 && idsConexaoEntreRedes.size > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-accent-blue/40 bg-accent-blue/5 p-3 text-sm text-text-primary">
          <AlertTriangle size={16} className="text-accent-blue shrink-0" />
          {idsConexaoEntreRedes.size} trecho(s) de conexão entre redes identificado(s) automaticamente — marcado(s) na aba Tubos.
        </div>
      )}

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
              <span className="h-4 w-px bg-border" />
              <select value={recebeVazaoLote} onChange={(e) => setRecebeVazaoLote(e.target.value)} className={`${fieldInputClass} w-40 py-1.5`}>
                <option value="true">Recebe vazão: sim</option>
                <option value="false">Recebe vazão: não</option>
              </select>
              <button onClick={handleAplicarRecebeVazaoLote} disabled={busy} className={SMALL_BTN}>
                {busy && <Loader2 size={14} className="animate-spin" />}
                Aplicar aos selecionados
              </button>
              <span className="h-4 w-px bg-border" />
              <select value={ehTroncoLote} onChange={(e) => setEhTroncoLote(e.target.value)} className={`${fieldInputClass} w-40 py-1.5`}>
                <option value="true">Rede tronco: sim</option>
                <option value="false">Rede tronco: não</option>
              </select>
              <button onClick={handleAplicarEhTroncoLote} disabled={busy} className={SMALL_BTN}>
                {busy && <Loader2 size={14} className="animate-spin" />}
                Aplicar aos selecionados
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
                  {redesDisponiveis.length > 1 && <th className="px-3 py-2 font-medium">Rede</th>}
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium" title="Se essa caixa pode receber vazão de bacia diretamente (aparece como opção de captação em Cadastros → Bacias)">
                    Recebe vazão
                  </th>
                  <th
                    className="px-3 py-2 font-medium"
                    title="Se essa caixa faz parte da rede tronco (filtro 'Só rede tronco' em Rede Pluvial) -- por padrão PV e boca de lobo entram, caixa de passagem não; ajuste manualmente quando o padrão não bater com o projeto"
                  >
                    Rede tronco
                  </th>
                  <th className="px-3 py-2 font-medium">Cota terreno</th>
                  <th className="px-3 py-2 font-medium">Cota fundo</th>
                  <th className="px-3 py-2 font-medium">Origem</th>
                  <th className="w-10 px-3 py-2" />
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
                    <td className="px-3 py-1.5 text-text-primary">{nomeExibido(c.nome, c.rede_nome)}</td>
                    {redesDisponiveis.length > 1 && <td className="px-3 py-1.5 text-text-secondary">{c.rede_nome ?? '—'}</td>}
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
                      <button
                        onClick={() => handleEditCaixaRecebeVazao(c.id, !c.recebe_vazao)}
                        className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition ${
                          c.recebe_vazao ? 'bg-accent-blue/10 text-accent-blue' : 'bg-elevated text-text-secondary hover:text-text-primary'
                        }`}
                        title="Clique pra alternar"
                      >
                        <Droplets size={12} />
                        {c.recebe_vazao ? 'Sim' : 'Não'}
                      </button>
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        onClick={() => handleEditCaixaEhTronco(c.id, !c.eh_tronco)}
                        className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium transition ${
                          c.eh_tronco ? 'bg-accent-blue/10 text-accent-blue' : 'bg-elevated text-text-secondary hover:text-text-primary'
                        }`}
                        title="Clique pra alternar"
                      >
                        <Network size={12} />
                        {c.eh_tronco ? 'Sim' : 'Não'}
                      </button>
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
                    <td className="px-3 py-1.5">
                      <button
                        onClick={() => handleExcluirCaixa(c)}
                        className="flex items-center text-text-secondary hover:text-accent-red"
                        title="Excluir estrutura"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {caixasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={redesDisponiveis.length > 1 ? 9 : 8} className="px-3 py-6 text-center text-text-secondary">
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
                      const caixaMontante = caixas.find((c) => c.id === trecho?.caixa_montante_id)
                      const caixaJusante = caixas.find((c) => c.id === trecho?.caixa_jusante_id)
                      const nomeMontante = caixaMontante ? nomeExibido(caixaMontante.nome, caixaMontante.rede_nome) : '—'
                      const nomeJusante = caixaJusante ? nomeExibido(caixaJusante.nome, caixaJusante.rede_nome) : '—'
                      return (
                        <tr key={p.id} className="border-b border-border/40 last:border-0">
                          <td className="px-2 py-1 text-text-primary">{trecho ? nomeExibido(trecho.nome, trecho.rede_nome) : p.id}</td>
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
                  {redesDisponiveis.length > 1 && <th className="px-3 py-2 font-medium">Rede</th>}
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
                  const caixaMontante = caixas.find((c) => c.id === t.caixa_montante_id)
                  const caixaJusante = caixas.find((c) => c.id === t.caixa_jusante_id)
                  const nomeMontante = caixaMontante ? nomeExibido(caixaMontante.nome, caixaMontante.rede_nome) : '—'
                  const nomeJusante = caixaJusante ? nomeExibido(caixaJusante.nome, caixaJusante.rede_nome) : '—'
                  const isConexao = idsConexaoEntreRedes.has(t.id)
                  return (
                    <tr key={t.id} className={`border-b border-border/60 last:border-0 ${isConexao ? 'bg-accent-blue/5' : ''}`}>
                      <td className="px-3 py-1.5">
                        <button onClick={() => toggleSelecaoTrecho(t.id)} className="flex items-center text-text-secondary hover:text-brand">
                          {selecionadosTrechos.has(t.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-text-primary">
                        <span className="flex items-center gap-1.5">
                          {nomeExibido(t.nome, t.rede_nome)}
                          {isConexao && (
                            <span
                              className="rounded-full bg-accent-blue/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-blue"
                              title="Trecho sem entrada dentro da própria rede, descarregando em outra rede"
                            >
                              conexão entre redes
                            </span>
                          )}
                        </span>
                      </td>
                      {redesDisponiveis.length > 1 && <td className="px-3 py-1.5 text-text-secondary">{t.rede_nome ?? '—'}</td>}
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
                    <td colSpan={redesDisponiveis.length > 1 ? 11 : 10} className="px-3 py-6 text-center text-text-secondary">
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
