import { Fragment, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Download, FolderOpen, Lock, Loader2, Pencil, Trash2, Upload } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { fieldInputClass } from '../components/ui/Field'
import { useRevisaoContext } from '../lib/RevisaoContext'
import { parseLandXml, parseLandXmlParcels, type ResultadoImportLandXml } from '../engine/landxml'
import { parseBaciasCsv } from '../engine/csvBacias'
import { pontoDentroAlgumPoligono } from '../engine/poligono'
import { compararImportacao, temMudancas, type DiffImportacao } from '../engine/reimportDiff'
import { gerarPlanilhaCaptacao, parsePlanilhaCaptacao } from '../engine/xlsxCaptacao'
import { nomeSemRede } from '../lib/nomeRede'
import { ImportacaoDiffModal } from '../components/ImportacaoDiffModal'
import {
  aplicarReimportacao,
  importarRedeLandXml,
  listCaixas,
  listTrechos,
  salvarXmlOriginal,
  updateTrechoManning,
  type CaixaRecord,
  type ModoReimportacao,
  type TrechoRecord,
} from '../lib/redeStorage'
import {
  importarBaciasCsv,
  importarBaciasLandXml,
  listBacias,
  updateBaciaCoefC,
  updateBaciaVinculo,
  updateDestinoRestante,
  type BaciaRecord,
} from '../lib/baciasStorage'
import {
  listCaptacoesPorRevisao,
  upsertCaptacao,
  deleteCaptacao,
  replaceCaptacoesDaBacia,
  type CaptacaoRecord,
} from '../lib/captacaoStorage'
import { criarImportacao, excluirImportacao, listImportacoes, type ImportacaoRecord } from '../lib/importacoesStorage'
import { listMateriaisManning, toMateriaisManningMap } from '../lib/materiaisStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'
const SMALL_BTN =
  'flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'

export function BaciasPage() {
  const { revisaoAtiva, ocultarNomeRede } = useRevisaoContext()
  const nomeExibido = (nome: string, redeNome: string | null) => (ocultarNomeRede ? nomeSemRede(nome, redeNome) : nome)
  const [caixas, setCaixas] = useState<CaixaRecord[]>([])
  const [trechos, setTrechos] = useState<TrechoRecord[]>([])
  const [bacias, setBacias] = useState<BaciaRecord[]>([])
  const [captacoes, setCaptacoes] = useState<CaptacaoRecord[]>([])
  const [baciasExpandidas, setBaciasExpandidas] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [diffPendente, setDiffPendente] = useState<{
    resultado: ResultadoImportLandXml
    diff: DiffImportacao
    textoOriginal: string
    nomeArquivo: string
  } | null>(null)
  const [importacoes, setImportacoes] = useState<ImportacaoRecord[]>([])
  const [excluindoImportacaoId, setExcluindoImportacaoId] = useState<string | null>(null)

  const landXmlInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const parcelXmlInputRef = useRef<HTMLInputElement>(null)
  const planilhaCaptacaoInputRef = useRef<HTMLInputElement>(null)

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
    // isolado: tabela importacoes é nova (migração 020) e pode ainda não existir
    try {
      setImportacoes(await listImportacoes(revisaoAtiva.id))
    } catch {
      setImportacoes([])
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

      // Se ainda não há nada cadastrado na revisão, é primeira importação —
      // não há o que comparar, importa direto sem abrir a tela de diff.
      if (caixas.length === 0 && trechos.length === 0) {
        await importarRedeLandXml(revisaoAtiva.id, resultado, file.name)
        // guarda o XML bruto pro botão "Baixar XML atualizado" poder editar em cima
        // do original (preserva geometria da estrutura) em vez de gerar do zero
        try {
          await salvarXmlOriginal(revisaoAtiva.id, text)
        } catch {
          // não bloqueia a importação se isso falhar (ex.: migração 019 ainda não aplicada)
        }
        setMessage(`Rede importada: ${resultado.caixas.length} caixa(s), ${resultado.trechos.length} trecho(s).`)
        await load()
        return
      }

      const diff = compararImportacao(resultado, caixas, trechos)
      if (!temMudancas(diff)) {
        setMessage('Nada novo pra importar — esse XML já bate com a rede cadastrada.')
        return
      }
      setDiffPendente({ resultado, diff, textoOriginal: text, nomeArquivo: file.name })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar LandXML.')
    } finally {
      setBusy(false)
      if (landXmlInputRef.current) landXmlInputRef.current.value = ''
    }
  }

  const handleEscolherModoReimportacao = async (modo: ModoReimportacao) => {
    if (!revisaoAtiva || !diffPendente) return
    setBusy(true)
    setError(null)
    try {
      const resumo = await aplicarReimportacao(revisaoAtiva.id, diffPendente.diff, modo, diffPendente.nomeArquivo)
      try {
        await salvarXmlOriginal(revisaoAtiva.id, diffPendente.textoOriginal)
      } catch {
        // não bloqueia a reimportação se isso falhar (ex.: migração 019 ainda não aplicada)
      }
      const partes = [`${resumo.caixasInseridas} caixa(s) nova(s)`, `${resumo.trechosInseridos} trecho(s) novo(s)`]
      if (modo !== 'ignorar') {
        partes.push(`${resumo.caixasAtualizadas} caixa(s) atualizada(s)`, `${resumo.trechosAtualizados} trecho(s) atualizado(s)`)
      }
      if (resumo.trechosNaoResolvidos > 0) partes.push(`${resumo.trechosNaoResolvidos} trecho(s) não puderam ser resolvidos`)
      setMessage(`Reimportação (${modo}): ${partes.join(', ')}.`)
      setDiffPendente(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aplicar a reimportação.')
    } finally {
      setBusy(false)
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
      await importarBaciasCsv(revisaoAtiva.id, parsed, 5, file.name)
      setMessage(`${parsed.length} bacia(s) importada(s).`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar CSV de bacias.')
    } finally {
      setBusy(false)
      if (csvInputRef.current) csvInputRef.current.value = ''
    }
  }

  const handleImportParcelXml = async (file: File) => {
    if (!revisaoAtiva) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const text = await file.text()
      const { bacias: parcelas } = parseLandXmlParcels(text)
      if (parcelas.length === 0) {
        setError('Nenhum Parcel com contorno utilizável encontrado nesse XML.')
        return
      }
      const resumo = await importarBaciasLandXml(revisaoAtiva.id, parcelas, file.name)
      const partes = [`${resumo.novas} bacia(s) nova(s)`, `${resumo.automaticas} vinculada(s) automaticamente`]
      if (resumo.divididas.size > 0) {
        const detalheDivididas = [...resumo.divididas.entries()].map(([nome, cs]) => `${nome} (${cs.length}× — ${cs.join(', ')})`).join('; ')
        partes.push(`${resumo.divididas.size} com captação dividida igualmente entre 2+ caixas: ${detalheDivididas}`)
      }
      if (resumo.jaExistentes > 0) partes.push(`${resumo.jaExistentes} já existente(s) (nome repetido, ignoradas)`)
      if (resumo.pendentes.length > 0) {
        partes.push(`${resumo.pendentes.length} pendente(s) (nenhuma caixa dentro) — revise abaixo: ${resumo.pendentes.join(', ')}`)
      }
      setMessage(partes.join(', ') + '. Coeficiente C não vem do Parcel — informe manualmente na tabela abaixo.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar Parcels (LandXML).')
    } finally {
      setBusy(false)
      if (parcelXmlInputRef.current) parcelXmlInputRef.current.value = ''
    }
  }

  const handleExportarPlanilhaCaptacao = () => {
    if (!revisaoAtiva) return
    if (bacias.length === 0) {
      setError('Nenhuma bacia cadastrada ainda — importe as bacias antes de exportar a tabela de captação.')
      return
    }
    const dispositivos = caixas.filter((c) => c.recebe_vazao)
    gerarPlanilhaCaptacao(bacias, dispositivos, captacoes, revisaoAtiva.nome)
    setMessage('Planilha de captação baixada — edite e reimporte pelo card "3. Importação da tabela ajustada".')
    setError(null)
  }

  const handleImportPlanilhaCaptacao = async (file: File) => {
    if (!revisaoAtiva) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const buffer = await file.arrayBuffer()
      const { entradas, coefCs, baciasNaPlanilha, avisos } = parsePlanilhaCaptacao(buffer)

      const baciasNaoEncontradas = baciasNaPlanilha.filter((nome) => !bacias.some((b) => b.nome === nome))
      if (baciasNaoEncontradas.length > 0) {
        throw new Error(`Bacia(s) da planilha não encontrada(s) no cadastro: ${baciasNaoEncontradas.join(', ')}.`)
      }
      const dispositivosHabilitados = caixas.filter((c) => c.recebe_vazao)
      const nomesDispositivo = [...new Set(entradas.map((e) => e.dispositivoNome))]
      const dispositivosNaoEncontrados = nomesDispositivo.filter((nome) => !dispositivosHabilitados.some((c) => c.nome === nome))
      if (dispositivosNaoEncontrados.length > 0) {
        throw new Error(
          `Dispositivo(s) da planilha não encontrado(s) entre as caixas habilitadas a receber vazão: ${dispositivosNaoEncontrados.join(', ')}.`
        )
      }

      const somaPorBacia = new Map<string, number>()
      for (const e of entradas) somaPorBacia.set(e.baciaNome, (somaPorBacia.get(e.baciaNome) ?? 0) + e.percentual)
      // soma > 100.01 (não > 100): soma de percentuais em ponto flutuante frequentemente fecha em
      // algo como 100.00000000000004 mesmo quando os valores digitados somam exatamente 100.
      const baciasExcedidas = [...somaPorBacia.entries()].filter(([, soma]) => soma > 100.01)
      if (baciasExcedidas.length > 0) {
        throw new Error(`Bacia(s) com soma acima de 100% na planilha: ${baciasExcedidas.map(([n, s]) => `${n} (${s.toFixed(1)}%)`).join(', ')}.`)
      }

      // planilha é a fonte da verdade completa: toda bacia presente nela tem
      // seus vínculos substituídos por inteiro, mesmo as que ficam sem nenhuma entrada
      for (const baciaNome of baciasNaPlanilha) {
        const bacia = bacias.find((b) => b.nome === baciaNome)!
        const entradasDaBacia = entradas
          .filter((e) => e.baciaNome === baciaNome)
          .map((e) => ({ dispositivoId: dispositivosHabilitados.find((c) => c.nome === e.dispositivoNome)!.id, percentual: e.percentual }))
        await replaceCaptacoesDaBacia(bacia.id, entradasDaBacia)
      }

      for (const { baciaNome, coefC } of coefCs) {
        const bacia = bacias.find((b) => b.nome === baciaNome)
        if (bacia) await updateBaciaCoefC(bacia.id, coefC)
      }

      try {
        await criarImportacao(
          revisaoAtiva.id,
          'bacia_dispositivo_planilha',
          file.name,
          `${entradas.length} vínculo(s) aplicado(s) em ${baciasNaPlanilha.length} bacia(s).`
        )
      } catch {
        // não bloqueia a importação se isso falhar (ex.: migração 020 ainda não aplicada)
      }

      const partes = [`${baciasNaPlanilha.length} bacia(s) atualizada(s)`, `${entradas.length} vínculo(s) aplicado(s)`]
      if (coefCs.length > 0) partes.push(`${coefCs.length} coeficiente(s) C atualizado(s)`)
      if (avisos.length > 0) partes.push(`${avisos.length} aviso(s): ${avisos.join(' ')}`)
      setMessage(partes.join(', ') + '.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar a tabela ajustada.')
    } finally {
      setBusy(false)
      if (planilhaCaptacaoInputRef.current) planilhaCaptacaoInputRef.current.value = ''
    }
  }

  const handleExcluirImportacao = async (importacaoId: string) => {
    if (!confirm('Excluir essa importação inteira? Remove todas as caixas/trechos/bacias que vieram dela (e os resultados calculados a partir delas).')) {
      return
    }
    setExcluindoImportacaoId(importacaoId)
    setError(null)
    try {
      await excluirImportacao(importacaoId)
      setMessage('Importação excluída.')
      await load()
    } catch (err) {
      setError(
        err instanceof Error
          ? `Erro ao excluir a importação: ${err.message} — provavelmente algo dessa importação está referenciado por outra (ex.: um trecho novo ligado numa caixa antiga).`
          : 'Erro ao excluir a importação.'
      )
    } finally {
      setExcluindoImportacaoId(null)
    }
  }

  const handleCoefCEdit = async (baciaId: string, value: string) => {
    const n = Number(value.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || n > 1) return
    try {
      await updateBaciaCoefC(baciaId, n)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar coeficiente C.')
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

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="mb-2 font-sans text-sm font-semibold text-text-primary">2. Importar bacias (Parcel LandXML)</div>
          <p className="mb-3 text-xs text-text-secondary">
            Exporte os Parcels do Civil 3D como LandXML — contorno completo, detecta sozinho quais caixas ficam dentro de cada bacia.
          </p>
          <input
            ref={parcelXmlInputRef}
            type="file"
            accept=".xml"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleImportParcelXml(e.target.files[0])}
          />
          <button onClick={() => parcelXmlInputRef.current?.click()} disabled={busy} className={PRIMARY_BTN}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Selecionar arquivo .xml
          </button>
          <div className="mt-2 text-xs text-text-secondary">{bacias.length} bacia(s) cadastradas</div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 font-sans text-sm font-semibold text-text-primary">2b. Importar bacias (CSV)</div>
          <p className="mb-3 text-xs text-text-secondary">Alternativa sem polígono — nome, área, C, Tc, pour point (vínculo por distância).</p>
          <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleImportCsv(e.target.files[0])} />
          <button onClick={() => csvInputRef.current?.click()} disabled={busy} className={PRIMARY_BTN}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Selecionar arquivo .csv
          </button>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-2 font-sans text-sm font-semibold text-text-primary">3. Importação da tabela ajustada</div>
          <p className="mb-3 text-xs text-text-secondary">
            Exporte a tabela bacia × dispositivo, ajuste no Excel (inclua dispositivos fora do polígono) e reimporte — substitui os vínculos das
            bacias presentes na planilha.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleExportarPlanilhaCaptacao} disabled={busy || bacias.length === 0} className={SMALL_BTN}>
              <Download size={14} />
              Exportar planilha
            </button>
            <input
              ref={planilhaCaptacaoInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleImportPlanilhaCaptacao(e.target.files[0])}
            />
            <button onClick={() => planilhaCaptacaoInputRef.current?.click()} disabled={busy || bacias.length === 0} className={SMALL_BTN}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Reimportar planilha
            </button>
          </div>
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
                  <td className="py-2">{nomeExibido(t.nome, t.rede_nome)}</td>
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
                <th className="pb-2 font-medium">Candidatas no polígono</th>
                <th className="pb-2 font-medium">Caixa de destino</th>
              </tr>
            </thead>
            <tbody>
              {baciasPendentes.map((b) => {
                const candidatas = b.poligonos
                  ? caixas.filter((c) => c.recebe_vazao && c.x != null && c.y != null && pontoDentroAlgumPoligono({ x: c.x, y: c.y }, b.poligonos!))
                  : []
                return (
                  <tr key={b.id} className="border-b border-border/60 last:border-0">
                    <td className="py-2">{b.nome}</td>
                    <td className="py-2 text-text-secondary">{b.area_m2.toFixed(1)}</td>
                    <td className="py-2 text-text-secondary">
                      {!b.poligonos
                        ? '—'
                        : candidatas.length === 0
                          ? 'nenhuma caixa dentro do polígono'
                          : candidatas.map((c) => c.nome).join(', ')}
                    </td>
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
                )
              })}
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
                      <td className="py-2">
                        <input
                          key={`coefc-${b.id}-${b.coef_c ?? 'vazio'}`}
                          type="number"
                          step="0.01"
                          min={0}
                          max={1}
                          defaultValue={b.coef_c ?? ''}
                          placeholder="informar"
                          className={`${fieldInputClass} w-20 py-1 ${b.coef_c == null ? 'border-accent-amber/60' : ''}`}
                          onBlur={(e) => handleCoefCEdit(b.id, e.target.value)}
                        />
                      </td>
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

      {importacoes.length > 0 && (
        <div className="mt-6 rounded-lg border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold text-text-primary">
            <FolderOpen size={16} className="text-brand" />
            Histórico de importações
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-secondary">
                <th className="pb-2 font-medium">Quando</th>
                <th className="pb-2 font-medium">Tipo</th>
                <th className="pb-2 font-medium">Arquivo</th>
                <th className="pb-2 font-medium">O que veio</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {importacoes.map((imp) => (
                <tr key={imp.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 text-text-secondary">{new Date(imp.criado_em).toLocaleString('pt-BR')}</td>
                  <td className="py-2 text-text-secondary">
                    {imp.tipo === 'rede_landxml'
                      ? 'Rede (LandXML)'
                      : imp.tipo === 'bacias_parcel_landxml'
                        ? 'Bacias (Parcel)'
                        : imp.tipo === 'bacias_csv'
                          ? 'Bacias (CSV)'
                          : 'Tabela ajustada (captação)'}
                  </td>
                  <td className="py-2 text-text-secondary">{imp.nome_arquivo ?? '—'}</td>
                  <td className="py-2 text-text-secondary">{imp.resumo}</td>
                  <td className="py-2">
                    <button
                      onClick={() => handleExcluirImportacao(imp.id)}
                      disabled={excluindoImportacaoId === imp.id}
                      className="flex items-center gap-1 text-xs text-accent-red hover:underline disabled:opacity-60"
                    >
                      {excluindoImportacaoId === imp.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {diffPendente && (
        <ImportacaoDiffModal
          diff={diffPendente.diff}
          busy={busy}
          onEscolher={handleEscolherModoReimportacao}
          onCancelar={() => setDiffPendente(null)}
        />
      )}
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
  // só caixas marcadas como "recebe vazão" aparecem aqui — evita vincular uma bacia
  // por engano numa PV que só conduz tubo. Editável em Cadastros → Rede Importada.
  const disponiveis = caixas.filter((c) => c.recebe_vazao && !captacoes.some((cap) => cap.dispositivo_id === c.id))
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
      {disponiveis.length === 0 && caixas.length > 0 && (
        <div className="text-xs text-text-secondary">
          Nenhuma caixa habilitada a receber vazão. Marque em Cadastros → Rede Importada (coluna "Recebe vazão").
        </div>
      )}

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
