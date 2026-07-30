import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Download, Droplets, Eye, EyeOff, FileSpreadsheet, Loader2, Network, RotateCcw, XCircle } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Field, fieldInputClass } from '../components/ui/Field'
import { RedeDiagrama } from '../components/RedeDiagrama'
import { MemoriaCalculoModal } from '../components/MemoriaCalculoModal'
import { useRevisaoContext } from '../lib/RevisaoContext'
import { calcularIntensidadeIdf } from '../engine/idf'
import { acumularVazao, calcularQProjeto, calcularTcSistema, identificarTroncoRede, ordenarTrechosPorFluxo } from '../engine/rede'
import { calcularCotaMontantePorEnergia, calcularCotasPorEnergia } from '../engine/energia'
import { resolverLamina } from '../engine/bissecao'
import { sugerirDeclividade, sugerirDiametro } from '../engine/sugestao'
import { exportarRedeXmlAtualizado } from '../lib/exportRedeXml'
import { baixarRelatorioDiametros } from '../lib/relatorioDiametros'
import { listBibliotecaPecas, type ItemBiblioteca } from '../lib/bibliotecaStorage'
import { listEquacoesIdf, type EquacaoIdfRecord } from '../lib/idfStorage'
import { listCaixas, listTrechos, updateTrecho, type CaixaRecord, type TrechoRecord } from '../lib/redeStorage'
import { listBacias, type BaciaRecord } from '../lib/baciasStorage'
import { listCaptacoesPorRevisao, type CaptacaoRecord } from '../lib/captacaoStorage'
import {
  deleteResultadosRedeByTrechoIds,
  listResultadosRedeByRevisao,
  saveResultadoRede,
  type ResultadoRedeRecord,
} from '../lib/resultadosStorage'
import type { RevisaoComProjeto } from '../lib/revisoesStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'

type ColunaKey =
  | 'trecho'
  | 'caixaMontante'
  | 'caixaJusante'
  | 'diametro'
  | 'inclinacao'
  | 'cotaFundoMontante'
  | 'cotaFundoJusante'
  | 'degrauEnergia'
  | 'manning'
  | 'ca'
  | 'intensidade'
  | 'qProjeto'
  | 'lamina'
  | 'yd'
  | 'velocidade'
  | 'tc'
  | 'conformidade'

const COLUNAS: { key: ColunaKey; label: string }[] = [
  { key: 'trecho', label: 'Trecho' },
  { key: 'caixaMontante', label: 'Caixa montante' },
  { key: 'caixaJusante', label: 'Caixa jusante' },
  { key: 'diametro', label: 'Diâm. (m)' },
  { key: 'inclinacao', label: 'Inclinação (m/m)' },
  { key: 'cotaFundoMontante', label: 'Cota fundo montante (m)' },
  { key: 'cotaFundoJusante', label: 'Cota fundo jusante (m)' },
  { key: 'degrauEnergia', label: 'Degrau de energia (m)' },
  { key: 'manning', label: 'Manning n' },
  { key: 'ca', label: 'ΣC×A (m²)' },
  { key: 'intensidade', label: 'Intensidade (mm/h)' },
  { key: 'qProjeto', label: 'Q projeto (m³/s)' },
  { key: 'lamina', label: 'Lâmina (m)' },
  { key: 'yd', label: 'y/D' },
  { key: 'velocidade', label: 'Velocidade (m/s)' },
  { key: 'tc', label: 'Tc sistema (min)' },
  { key: 'conformidade', label: 'Conformidade' },
]

const DEFAULT_LIMITES = {
  limiteYD: 0.85,
  velMinMs: 0.75,
  velMaxMs: 5,
  declMinMM: 0.004,
  declMaxMM: 0.15,
}

interface LinhaResultado extends ResultadoRedeRecord {
  trecho_nome: string
}

interface DadosCalculo {
  revisaoAtiva: RevisaoComProjeto
  equacao: EquacaoIdfRecord
  caixas: CaixaRecord[]
  trechos: TrechoRecord[]
  bacias: BaciaRecord[]
  captacoes: CaptacaoRecord[]
  limites: typeof DEFAULT_LIMITES
}

/**
 * Roda o dimensionamento hidráulico da rede e persiste os resultados.
 * Método: ΣC×A acumulado pela rede (não depende de Q/Tc) × intensidade no
 * Tc do sistema (caminho crítico) em cada trecho — método padrão de
 * dimensionamento de rede pluvial, em vez de somar vazões de pico já
 * prontas de cada bacia com Tc's diferentes entre si.
 *
 * Como o Tc do sistema depende da velocidade (que depende do Q, que depende
 * do Tc...), roda em duas passadas: a 1ª estima o Tc assumindo 1 m/s em
 * todo mundo, a 2ª usa esse Tc pra calcular o Q real e resolve a hidráulica
 * final — evita a dependência circular sem precisar de um solver iterativo.
 * Função pura (sem depender de estado do React) pra poder ser chamada tanto
 * pelo botão "Rodar cálculo" quanto depois de uma edição no modal de
 * memória de cálculo, sempre com dado fresco vindo do banco.
 */
async function executarCalculoRede(dados: DadosCalculo): Promise<{ avisos: string[] }> {
  const { revisaoAtiva, equacao, caixas, trechos, bacias, captacoes, limites } = dados
  const tempoRetorno = revisaoAtiva.tempo_retorno_anos ?? 10

  const caixaIds = caixas.map((c) => c.id)
  const trechosGrafo = trechos.map((t) => ({ id: t.id, montanteId: t.caixa_montante_id, jusanteId: t.caixa_jusante_id }))
  const trechosComComprimento = trechos.map((t) => ({
    id: t.id,
    montanteId: t.caixa_montante_id,
    jusanteId: t.caixa_jusante_id,
    comprimentoM: t.comprimento_m,
    declividadeMM: t.declividade_m_m,
  }))

  const baciaIdsCaptadas = new Set(captacoes.map((c) => c.bacia_id))
  const baciasCaptadas = bacias.filter((b) => baciaIdsCaptadas.has(b.id))

  const avisos: string[] = []
  const baciasSemTc = baciasCaptadas.filter((b) => b.tc_min == null)
  if (baciasSemTc.length > 0) {
    avisos.push(`${baciasSemTc.length} bacia(s) sem Tc próprio — usando 10 min como padrão.`)
  }
  const baciasSemCoefC = baciasCaptadas.filter((b) => b.coef_c == null)
  if (baciasSemCoefC.length > 0) {
    avisos.push(
      `${baciasSemCoefC.length} bacia(s) sem coeficiente C — não entraram no cálculo: ${baciasSemCoefC.map((b) => b.nome).join(', ')}.`
    )
  }

  // ΣC×A acumulado por trecho — geometria pura, não depende de Q nem de Tc.
  const caPorBaciaId = new Map(
    baciasCaptadas.filter((b) => b.coef_c != null).map((b) => [b.id, (b.coef_c as number) * b.area_m2])
  )
  const caEntradaPorCaixa = new Map<string, number>()
  for (const cap of captacoes) {
    const ca = caPorBaciaId.get(cap.bacia_id)
    if (ca == null) continue
    const parcela = ca * (cap.percentual / 100)
    caEntradaPorCaixa.set(cap.dispositivo_id, (caEntradaPorCaixa.get(cap.dispositivo_id) ?? 0) + parcela)
  }
  const caAcumuladoPorTrecho = acumularVazao(caixaIds, trechosGrafo, caEntradaPorCaixa)

  const tcInicialPorCaixa = new Map<string, number>()
  for (const cap of captacoes) {
    const bacia = bacias.find((b) => b.id === cap.bacia_id)
    if (!bacia) continue
    const atual = tcInicialPorCaixa.get(cap.dispositivo_id) ?? 0
    tcInicialPorCaixa.set(cap.dispositivo_id, Math.max(atual, bacia.tc_min ?? 10))
  }

  let velocidadePorTrecho = new Map<string, number>(trechos.map((t) => [t.id, 1]))
  let linhas: Omit<ResultadoRedeRecord, 'id'>[] = []
  const laminaFinalPorTrecho = new Map<string, number>()
  const velocidadeFinalPorTrecho = new Map<string, number>()

  const NUM_PASSADAS = 2
  for (let passada = 0; passada < NUM_PASSADAS; passada++) {
    const ultimaPassada = passada === NUM_PASSADAS - 1
    const tcPorCaixa = calcularTcSistema(caixaIds, trechosComComprimento, velocidadePorTrecho, tcInicialPorCaixa)
    const novaVelocidadePorTrecho = new Map<string, number>()
    linhas = []

    for (const t of trechos) {
      const ca = caAcumuladoPorTrecho.get(t.id) ?? 0
      // Tc usado pra dimensionar ESTE trecho é o Tc que já chegou na caixa MONTANTE dele
      // (tempo de concentração inicial da bacia, ou acumulado dos trechos anteriores) — não
      // o Tc da caixa jusante, que já inclui o tempo de percurso deste próprio trecho. Esse
      // Tc(jusante) = Tc(montante) + Tp(trecho) só deve entrar no cálculo do PRÓXIMO trecho.
      const tcSistema = tcPorCaixa.get(t.caixa_montante_id) ?? tempoRetorno
      const intensidade = calcularIntensidadeIdf(equacao, tempoRetorno, tcSistema)
      const qProjeto = calcularQProjeto(ca, intensidade)

      if (t.manning_n == null) {
        if (ultimaPassada) avisos.push(`Trecho ${t.nome}: sem manning_n definido — não calculado. Revise em Cadastros → Bacias.`)
        continue
      }

      const solver = resolverLamina({
        qProjetoM3s: qProjeto,
        diametroM: t.diametro_m,
        declividadeMM: t.declividade_m_m,
        manningN: t.manning_n,
      })
      novaVelocidadePorTrecho.set(t.id, solver.velocidade)

      if (!ultimaPassada) continue

      laminaFinalPorTrecho.set(t.id, solver.lamina)
      velocidadeFinalPorTrecho.set(t.id, solver.velocidade)

      const yD = solver.lamina / t.diametro_m
      const motivos: string[] = []
      if (!solver.convergiu) motivos.push('vazão de projeto excede a capacidade do tubo até 0,93×D')
      if (yD > limites.limiteYD) motivos.push(`y/D (${(yD * 100).toFixed(0)}%) acima do limite (${(limites.limiteYD * 100).toFixed(0)}%)`)
      if (solver.velocidade < limites.velMinMs) motivos.push(`velocidade (${solver.velocidade.toFixed(2)} m/s) abaixo da mínima de autolimpeza`)
      if (solver.velocidade > limites.velMaxMs) motivos.push(`velocidade (${solver.velocidade.toFixed(2)} m/s) acima da máxima`)
      if (t.declividade_m_m < limites.declMinMM) motivos.push('declividade abaixo da faixa mínima')
      if (t.declividade_m_m > limites.declMaxMM) motivos.push('declividade acima da faixa máxima')

      linhas.push({
        trecho_id: t.id,
        q_entrada_m3s: null,
        ca_acumulado: ca,
        q_projeto_m3s: qProjeto,
        tc_sistema_min: tcSistema,
        intensidade_mm_h: intensidade,
        lamina_m: solver.lamina,
        y_sobre_d_pct: yD * 100,
        raio_hidraulico_m: solver.raioHidraulico,
        velocidade_ms: solver.velocidade,
        vazao_calculada_m3s: solver.vazaoCalculada,
        conforme: motivos.length === 0,
        motivo_nao_conformidade: motivos.length > 0 ? motivos.join('; ') : null,
      })
    }

    velocidadePorTrecho = novaVelocidadePorTrecho
  }

  // Ajusta a cota de fundo de cada trecho pra manter a linha de energia (EGL — cota de
  // fundo + lâmina + V²/2g) contínua entre montante e jusante, em vez de só continuar a
  // cota diretamente — necessário sempre que lâmina/velocidade mudam numa confluência
  // (tipicamente quando o diâmetro muda). Cabeceiras preservam a própria cota atual como
  // âncora; o restante é recalculado a partir dela, trecho a trecho, na ordem do fluxo.
  const cotaFundoMontanteAtualPorTrecho = new Map(trechos.map((t) => [t.id, t.cota_fundo_montante ?? 0]))
  const cotasPorEnergia = calcularCotasPorEnergia(
    caixaIds,
    trechosComComprimento,
    cotaFundoMontanteAtualPorTrecho,
    laminaFinalPorTrecho,
    velocidadeFinalPorTrecho
  )
  const TOLERANCIA_COTA_M = 0.001
  let trechosComCotaAjustada = 0
  for (const t of trechos) {
    const nova = cotasPorEnergia.get(t.id)
    if (!nova) continue
    const mudouMontante = t.cota_fundo_montante == null || Math.abs(t.cota_fundo_montante - nova.cotaFundoMontante) > TOLERANCIA_COTA_M
    const mudouJusante = t.cota_fundo_jusante == null || Math.abs(t.cota_fundo_jusante - nova.cotaFundoJusante) > TOLERANCIA_COTA_M
    if (!mudouMontante && !mudouJusante) continue
    await updateTrecho(t.id, {
      cota_fundo_montante: nova.cotaFundoMontante,
      cota_fundo_jusante: nova.cotaFundoJusante,
      cota_topo_montante: nova.cotaFundoMontante + t.diametro_m,
      cota_topo_jusante: nova.cotaFundoJusante + t.diametro_m,
    })
    trechosComCotaAjustada++
  }
  if (trechosComCotaAjustada > 0) {
    avisos.push(`${trechosComCotaAjustada} trecho(s) tiveram a cota de fundo ajustada pra manter a linha de energia contínua entre montante e jusante.`)
  }

  await deleteResultadosRedeByTrechoIds(trechos.map((t) => t.id))
  for (const linha of linhas) {
    await saveResultadoRede(linha)
  }

  return { avisos }
}

export function RedePluvialPage() {
  const { revisaoAtiva } = useRevisaoContext()
  const [caixas, setCaixas] = useState<CaixaRecord[]>([])
  const [trechos, setTrechos] = useState<TrechoRecord[]>([])
  const [bacias, setBacias] = useState<BaciaRecord[]>([])
  const [captacoes, setCaptacoes] = useState<CaptacaoRecord[]>([])
  const [equacao, setEquacao] = useState<EquacaoIdfRecord | null>(null)
  const [limites, setLimites] = useState(DEFAULT_LIMITES)
  const [resultados, setResultados] = useState<LinhaResultado[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [mostrarDiagrama, setMostrarDiagrama] = useState(false)
  const [visaoDiagrama, setVisaoDiagrama] = useState<'completa' | 'tronco'>('completa')
  const [trechoModalId, setTrechoModalId] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false)
  const [biblioteca, setBiblioteca] = useState<ItemBiblioteca[]>([])
  const [fonteCompacta, setFonteCompacta] = useState(false)
  const [colunasOcultas, setColunasOcultas] = useState<Set<ColunaKey>>(new Set())

  const load = async () => {
    if (!revisaoAtiva) return
    const [c, t, b] = await Promise.all([listCaixas(revisaoAtiva.id), listTrechos(revisaoAtiva.id), listBacias(revisaoAtiva.id)])
    setCaixas(c)
    setTrechos(t)
    setBacias(b)
    // isolado: biblioteca_pecas é nova (migração 021) e pode ainda não existir no banco
    try {
      setBiblioteca(await listBibliotecaPecas())
    } catch {
      setBiblioteca([])
    }
    // isolado de propósito: bacia_dispositivo é nova (migração 009) e pode
    // ainda não existir no banco — o resto da página continua funcionando
    try {
      setCaptacoes(await listCaptacoesPorRevisao(revisaoAtiva.id))
    } catch {
      setCaptacoes([])
    }
    if (revisaoAtiva.equacao_idf_id) {
      const eqs = await listEquacoesIdf()
      setEquacao(eqs.find((e) => e.id === revisaoAtiva.equacao_idf_id) ?? null)
    } else {
      setEquacao(null)
    }
    const existentes = await listResultadosRedeByRevisao(revisaoAtiva.id)
    setResultados(existentes)
  }

  useEffect(() => {
    load().catch((e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisaoAtiva])

  const handleRodar = async () => {
    if (!revisaoAtiva) return
    setError(null)
    setAvisos([])
    if (!equacao) {
      setError('A revisão não tem equação IDF vinculada — configure em Cadastros → Projetos.')
      return
    }
    setRunning(true)
    try {
      const { avisos: novosAvisos } = await executarCalculoRede({ revisaoAtiva, equacao, caixas, trechos, bacias, captacoes, limites })
      setAvisos(novosAvisos)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao calcular a rede.')
    } finally {
      setRunning(false)
    }
  }

  const handleExportarXml = async () => {
    if (!revisaoAtiva) return
    setExportando(true)
    try {
      const { modo } = await exportarRedeXmlAtualizado(
        revisaoAtiva.id,
        `rede-${revisaoAtiva.nome.replace(/\s+/g, '-')}.xml`,
        caixas,
        trechos
      )
      if (modo === 'gerado') {
        setAvisos((atual) => [
          ...atual,
          'Não achei o LandXML original salvo pra essa revisão (importado antes dessa funcionalidade existir) — gerei um arquivo do zero, ' +
            'que não traz a geometria física das estruturas e pode ser rejeitado pelo Civil 3D ao reimportar. Reimporte a rede uma vez (mesmo arquivo de sempre) pra habilitar o modo completo.',
        ])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar o XML.')
    } finally {
      setExportando(false)
    }
  }

  const handleBaixarRelatorioDiametros = async () => {
    if (!revisaoAtiva) return
    setGerandoRelatorio(true)
    try {
      const { modo, quantidade } = await baixarRelatorioDiametros(
        revisaoAtiva.id,
        `diametros-alterados-${revisaoAtiva.nome.replace(/\s+/g, '-')}.csv`,
        trechos
      )
      if (modo === 'sem-xml-original') {
        setError('Não achei o LandXML original salvo pra essa revisão — reimporte a rede uma vez (mesmo arquivo de sempre) pra habilitar esse relatório.')
      } else if (quantidade === 0) {
        setAvisos((atual) => [...atual, 'Nenhum trecho com diâmetro alterado desde a última importação — nada pra baixar.'])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar o relatório de diâmetros.')
    } finally {
      setGerandoRelatorio(false)
    }
  }

  // Chamado pelo modal de memória de cálculo depois de editar diâmetro/declividade
  // (já persistido, com cascata aplicada) — busca dado fresco do banco (não confia
  // no estado do componente, que ainda não foi re-renderizado) e roda o cálculo de novo.
  const handleRecalcularAposEdicao = async () => {
    if (!revisaoAtiva || !equacao) return
    const [caixasFrescas, trechosFrescos] = await Promise.all([listCaixas(revisaoAtiva.id), listTrechos(revisaoAtiva.id)])
    setCaixas(caixasFrescas)
    setTrechos(trechosFrescos)
    const { avisos: novosAvisos } = await executarCalculoRede({
      revisaoAtiva,
      equacao,
      caixas: caixasFrescas,
      trechos: trechosFrescos,
      bacias,
      captacoes,
      limites,
    })
    setAvisos(novosAvisos)
    const existentes = await listResultadosRedeByRevisao(revisaoAtiva.id)
    setResultados(existentes)
  }

  // Ordem de fluxo real: tronco + ramais (ver doc de ordenarTrechosPorFluxo em
  // engine/rede.ts) — em cada confluência o trecho de maior diâmetro é tratado
  // como a continuação do tronco, ramais menores desaguam nele em seguida.
  const ordemTrechos = useMemo(() => {
    if (caixas.length === 0 || trechos.length === 0) return new Map<string, number>()
    return ordenarTrechosPorFluxo(
      caixas.map((c) => ({ id: c.id, nome: c.nome })),
      trechos.map((t) => ({ id: t.id, montanteId: t.caixa_montante_id, jusanteId: t.caixa_jusante_id, nome: t.nome, diametroM: t.diametro_m }))
    )
  }, [caixas, trechos])

  // Rede tronco = cadeia principal (maior diâmetro em cada confluência) partindo de cada
  // saída da rede, sem os ramais menores — mesmo critério usado em ordenarTrechosPorFluxo.
  // Filtra tanto o diagrama quanto a tabela de resultados quando "Só rede tronco" está ativo.
  const troncoIds = useMemo(() => {
    if (caixas.length === 0 || trechos.length === 0) return new Set<string>()
    return identificarTroncoRede(
      caixas.map((c) => ({ id: c.id, nome: c.nome })),
      trechos.map((t) => ({ id: t.id, montanteId: t.caixa_montante_id, jusanteId: t.caixa_jusante_id, nome: t.nome, diametroM: t.diametro_m }))
    )
  }, [caixas, trechos])

  const resultadosOrdenados = useMemo(() => {
    const base = visaoDiagrama === 'tronco' ? resultados.filter((r) => troncoIds.has(r.trecho_id)) : resultados
    const posicao = (r: LinhaResultado) => ordemTrechos.get(r.trecho_id) ?? Number.MAX_SAFE_INTEGER
    return [...base].sort((a, b) => posicao(a) - posicao(b))
  }, [resultados, ordemTrechos, troncoIds, visaoDiagrama])

  const conformidadePorTrecho = useMemo(() => new Map(resultados.map((r) => [r.trecho_id, r.conforme])), [resultados])

  const trechosDiagrama = useMemo(
    () => (visaoDiagrama === 'tronco' ? trechos.filter((t) => troncoIds.has(t.id)) : trechos),
    [trechos, troncoIds, visaoDiagrama]
  )
  const caixasDiagrama = useMemo(() => {
    if (visaoDiagrama !== 'tronco') return caixas
    const idsUsados = new Set(trechosDiagrama.flatMap((t) => [t.caixa_montante_id, t.caixa_jusante_id]))
    return caixas.filter((c) => idsUsados.has(c.id))
  }, [caixas, trechosDiagrama, visaoDiagrama])

  const trechoPorId = useMemo(() => new Map(trechos.map((t) => [t.id, t])), [trechos])
  const nomeCaixaPorId = useMemo(() => new Map(caixas.map((c) => [c.id, c.nome])), [caixas])

  // Degrau de energia (informativo, memória de cálculo) = o quanto a linha de energia PEDIRIA
  // mudar a cota de fundo montante em relação à continuação "ingênua" (menor cota de fundo
  // jusante entre os trechos que chegam na caixa montante), calculado pela fórmula bruta —
  // SEM o limite anti-represamento aplicado no cálculo que é persistido (ver
  // calcularCotasPorEnergia em engine/energia.ts, que nunca deixa a cota subir acima da
  // continuação pra não represar água na caixa). Aqui é só pra mostrar na tabela/memória o que
  // a energia "pediria": positivo = degrau pra baixo (energia sobrando, aplicado normalmente);
  // negativo = a energia pediria SUBIR a cota (não é aplicado — fica só como registro).
  // Cabeceira (nenhum trecho chega na caixa montante) não tem continuação pra comparar: '—'.
  const entradasPorCaixa = useMemo(() => {
    const mapa = new Map<string, TrechoRecord[]>()
    for (const t of trechos) {
      const lista = mapa.get(t.caixa_jusante_id) ?? []
      lista.push(t)
      mapa.set(t.caixa_jusante_id, lista)
    }
    return mapa
  }, [trechos])

  const laminaPorTrechoResultado = useMemo(() => new Map(resultados.map((r) => [r.trecho_id, r.lamina_m])), [resultados])
  const velocidadePorTrechoResultado = useMemo(() => new Map(resultados.map((r) => [r.trecho_id, r.velocidade_ms])), [resultados])

  const degrauEnergiaPorTrecho = useMemo(() => {
    const mapa = new Map<string, number | null>()
    for (const t of trechos) {
      const laminaSaida = laminaPorTrechoResultado.get(t.id)
      const velocidadeSaida = velocidadePorTrechoResultado.get(t.id)
      if (laminaSaida == null || velocidadeSaida == null) {
        mapa.set(t.id, null)
        continue
      }
      const entradas = (entradasPorCaixa.get(t.caixa_montante_id) ?? []).filter((e) => e.cota_fundo_jusante != null)
      if (entradas.length === 0) {
        mapa.set(t.id, null)
        continue
      }
      const candidatos: number[] = []
      let continuacaoNaive = Infinity
      for (const e of entradas) {
        const laminaEntrada = laminaPorTrechoResultado.get(e.id)
        const velocidadeEntrada = velocidadePorTrechoResultado.get(e.id)
        if (laminaEntrada == null || velocidadeEntrada == null) continue
        const cotaEntrada = e.cota_fundo_jusante as number
        continuacaoNaive = Math.min(continuacaoNaive, cotaEntrada)
        candidatos.push(calcularCotaMontantePorEnergia(cotaEntrada, laminaEntrada, velocidadeEntrada, laminaSaida, velocidadeSaida))
      }
      if (candidatos.length === 0) {
        mapa.set(t.id, null)
        continue
      }
      mapa.set(t.id, continuacaoNaive - Math.min(...candidatos))
    }
    return mapa
  }, [trechos, entradasPorCaixa, laminaPorTrechoResultado, velocidadePorTrechoResultado])

  // Sugestão de correção (diâmetro comercial mínimo ou declividade mais próxima da atual)
  // pra cada trecho não conforme, dentro dos critérios configurados acima.
  const sugestoesPorTrecho = useMemo(() => {
    const mapa = new Map<string, { diametroM: number | null; declividadeMM: number | null }>()
    for (const r of resultados) {
      if (r.conforme || r.q_projeto_m3s == null) continue
      const trecho = trechoPorId.get(r.trecho_id)
      if (!trecho || trecho.manning_n == null) continue
      mapa.set(r.trecho_id, {
        diametroM: sugerirDiametro(r.q_projeto_m3s, trecho.declividade_m_m, trecho.manning_n, limites),
        declividadeMM: sugerirDeclividade(r.q_projeto_m3s, trecho.diametro_m, trecho.manning_n, limites, trecho.declividade_m_m),
      })
    }
    return mapa
  }, [resultados, trechoPorId, limites])

  const resultadoModal = trechoModalId ? (resultados.find((r) => r.trecho_id === trechoModalId) ?? null) : null
  const trechoModal = trechoModalId ? (trechos.find((t) => t.id === trechoModalId) ?? null) : null
  const sugestaoModal = trechoModalId ? (sugestoesPorTrecho.get(trechoModalId) ?? null) : null

  // Navegação anterior/próximo no modal segue a mesma ordem de fluxo da tabela (tronco
  // primeiro em cada confluência, ver ordenarTrechosPorFluxo) — respeita o filtro "só rede
  // tronco" ativo no momento, já que resultadosOrdenados já vem filtrado por ele.
  const indiceModalNaOrdem = trechoModalId ? resultadosOrdenados.findIndex((r) => r.trecho_id === trechoModalId) : -1
  const trechoAnteriorId =
    indiceModalNaOrdem > 0 ? resultadosOrdenados[indiceModalNaOrdem - 1].trecho_id : null
  const trechoProximoId =
    indiceModalNaOrdem >= 0 && indiceModalNaOrdem < resultadosOrdenados.length - 1
      ? resultadosOrdenados[indiceModalNaOrdem + 1].trecho_id
      : null

  if (!supabase || !revisaoAtiva) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumb items={['Cálculos', 'Rede Pluvial']} />
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          {!supabase ? 'Supabase não configurado.' : 'Selecione uma revisão em Cadastros → Projetos.'}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <Breadcrumb items={['Cálculos', 'Rede Pluvial']} />

      <div className="mb-6">
        <h1 className="font-sans text-xl font-bold text-text-primary">
          Rede Pluvial — {revisaoAtiva.projeto_nome} — {revisaoAtiva.nome}
        </h1>
        <p className="text-sm text-text-secondary">
          Dimensionamento hidráulico trecho a trecho: {caixas.length} caixa(s), {trechos.length} trecho(s), {bacias.length} bacia(s).
        </p>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}
      {avisos.map((a, i) => (
        <div key={i} className="mb-2 rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3 text-sm text-accent-amber">
          {a}
        </div>
      ))}

      <div className="mb-6 rounded-lg border border-border bg-surface p-4">
        <div className="mb-3 font-sans text-sm font-semibold text-text-primary">Critérios de conformidade</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Field label="y/D máx (%)">
            <input
              type="number"
              step="any"
              className={`${fieldInputClass} py-1.5`}
              // arredonda o valor exibido -- limiteYD*100 sofre ruído de ponto flutuante
              // (ex.: 0.07*100 = 7.000000000000001 em JS) que aparecia direto no campo
              value={Number((limites.limiteYD * 100).toFixed(4))}
              onChange={(e) => setLimites({ ...limites, limiteYD: Number(e.target.value) / 100 })}
            />
          </Field>
          <Field label="V mín (m/s)">
            <input type="number" step="any" className={`${fieldInputClass} py-1.5`} value={limites.velMinMs} onChange={(e) => setLimites({ ...limites, velMinMs: Number(e.target.value) })} />
          </Field>
          <Field label="V máx (m/s)">
            <input type="number" step="any" className={`${fieldInputClass} py-1.5`} value={limites.velMaxMs} onChange={(e) => setLimites({ ...limites, velMaxMs: Number(e.target.value) })} />
          </Field>
          <Field label="Decl. mín (m/m)">
            <input type="number" step="any" className={`${fieldInputClass} py-1.5`} value={limites.declMinMM} onChange={(e) => setLimites({ ...limites, declMinMM: Number(e.target.value) })} />
          </Field>
          <Field label="Decl. máx (m/m)">
            <input type="number" step="any" className={`${fieldInputClass} py-1.5`} value={limites.declMaxMM} onChange={(e) => setLimites({ ...limites, declMaxMM: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={handleRodar} disabled={running || trechos.length === 0} className={PRIMARY_BTN}>
            {running ? <Loader2 size={16} className="animate-spin" /> : <Droplets size={16} />}
            Rodar cálculo da rede
          </button>
          {caixas.length > 0 && trechos.length > 0 && (
            <button
              onClick={() => setMostrarDiagrama((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary shadow-sm transition hover:text-text-primary"
            >
              <Network size={16} />
              {mostrarDiagrama ? 'Ocultar diagrama' : 'Ver diagrama da rede'}
            </button>
          )}
          {caixas.length > 0 && (
            <button
              onClick={handleExportarXml}
              disabled={exportando}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary shadow-sm transition hover:text-text-primary disabled:opacity-60"
              title="Edita o LandXML original importado com as cotas/diâmetro/declividade/material/manning atuais (já com as correções feitas aqui) pra reimportar no Civil 3D."
            >
              {exportando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              Baixar XML atualizado
            </button>
          )}
          {caixas.length > 0 && (
            <button
              onClick={handleBaixarRelatorioDiametros}
              disabled={gerandoRelatorio}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary shadow-sm transition hover:text-text-primary disabled:opacity-60"
              title="Lista os trechos com diâmetro alterado no app (nome, diâmetro antigo e novo) — diâmetro não aplica de volta via reimportação de LandXML (limitação do Civil 3D), use essa lista pra editar em lote no Panorama."
            >
              {gerandoRelatorio ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}
              Relatório de diâmetros alterados
            </button>
          )}
        </div>
      </div>

      {caixas.length > 0 && trechos.length > 0 && (
        <div className="mb-4">
          <div className="inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs">
            <button
              onClick={() => setVisaoDiagrama('completa')}
              className={`rounded-md px-3 py-1.5 font-medium transition ${
                visaoDiagrama === 'completa' ? 'bg-brand text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Rede completa
            </button>
            <button
              onClick={() => setVisaoDiagrama('tronco')}
              className={`rounded-md px-3 py-1.5 font-medium transition ${
                visaoDiagrama === 'tronco' ? 'bg-brand text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Só rede tronco
            </button>
          </div>
          {visaoDiagrama === 'tronco' && (
            <div className="mt-1 text-[11px] text-text-secondary">
              Mostra só a cadeia principal (maior diâmetro em cada confluência) — os ramais menores ficam ocultos na tabela e no diagrama.
            </div>
          )}
        </div>
      )}

      {mostrarDiagrama && caixas.length > 0 && (
        <div className="mb-6">
          <RedeDiagrama
            caixas={caixasDiagrama}
            trechos={trechosDiagrama}
            conformidadePorTrecho={conformidadePorTrecho}
            onSelecionarTrecho={(trechoId) => setTrechoModalId(trechoId)}
          />
        </div>
      )}

      {resultados.length > 0 && (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <Eye size={13} />
              Clique numa linha pra ver a memória de cálculo do trecho (e editar diâmetro/declividade).
            </div>
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={fonteCompacta}
                  onChange={(e) => setFonteCompacta(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border"
                />
                Fonte compacta (caber mais colunas na tela)
              </label>
              {colunasOcultas.size > 0 && (
                <button
                  onClick={() => setColunasOcultas(new Set())}
                  className="flex items-center gap-1 text-xs text-brand hover:underline"
                >
                  <RotateCcw size={12} />
                  Restaurar {colunasOcultas.size} coluna(s) oculta(s)
                </button>
              )}
            </div>
          </div>
          <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-surface">
            <table className={`w-full whitespace-nowrap ${fonteCompacta ? 'text-xs' : 'text-sm'}`}>
              <thead>
                <tr className="border-b border-border bg-elevated text-left text-xs text-text-secondary">
                  {COLUNAS.filter((c) => !colunasOcultas.has(c.key)).map((c) => (
                    <th
                      key={c.key}
                      className={`group/th sticky top-0 z-10 bg-elevated align-bottom font-medium ${fonteCompacta ? 'px-2 py-1' : 'px-3 py-2'}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="block max-w-[90px] whitespace-normal break-words leading-tight">{c.label}</span>
                        <button
                          onClick={() => setColunasOcultas((prev) => new Set(prev).add(c.key))}
                          className="shrink-0 text-text-secondary/50 opacity-0 transition hover:text-accent-red group-hover/th:opacity-100"
                          title={`Ocultar coluna "${c.label}"`}
                        >
                          <EyeOff size={12} />
                        </button>
                      </div>
                    </th>
                  ))}
                  <th className="sticky top-0 z-10 w-8 bg-elevated px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {resultadosOrdenados.map((r) => {
                  const trecho = trechoPorId.get(r.trecho_id)
                  const corTexto = r.conforme ? 'text-accent-green' : 'text-accent-red'
                  const tdBase = fonteCompacta ? 'px-2 py-1' : 'px-4 py-2'
                  const degrau = degrauEnergiaPorTrecho.get(r.trecho_id)
                  const valores: Record<Exclude<ColunaKey, 'conformidade'>, string> = {
                    trecho: r.trecho_nome,
                    caixaMontante: trecho ? (nomeCaixaPorId.get(trecho.caixa_montante_id) ?? '—') : '—',
                    caixaJusante: trecho ? (nomeCaixaPorId.get(trecho.caixa_jusante_id) ?? '—') : '—',
                    diametro: trecho?.diametro_m.toFixed(3) ?? '—',
                    inclinacao: trecho?.declividade_m_m.toFixed(4) ?? '—',
                    cotaFundoMontante: trecho?.cota_fundo_montante?.toFixed(3) ?? '—',
                    cotaFundoJusante: trecho?.cota_fundo_jusante?.toFixed(3) ?? '—',
                    degrauEnergia: degrau != null ? `${degrau >= 0 ? '+' : ''}${degrau.toFixed(3)}` : '—',
                    manning: trecho?.manning_n?.toFixed(4) ?? '—',
                    ca: r.ca_acumulado?.toFixed(2) ?? '—',
                    intensidade: r.intensidade_mm_h?.toFixed(2) ?? '—',
                    qProjeto: r.q_projeto_m3s?.toFixed(4) ?? '—',
                    lamina: r.lamina_m?.toFixed(3) ?? '—',
                    yd: r.y_sobre_d_pct != null ? `${r.y_sobre_d_pct.toFixed(0)}%` : '—',
                    velocidade: r.velocidade_ms?.toFixed(2) ?? '—',
                    tc: r.tc_sistema_min?.toFixed(1) ?? '—',
                  }
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setTrechoModalId(r.trecho_id)}
                      className="group cursor-pointer border-b border-border/60 last:border-0 hover:bg-elevated/40"
                      title="Ver memória de cálculo"
                    >
                      {COLUNAS.filter((c) => !colunasOcultas.has(c.key)).map((c) => {
                        if (c.key === 'conformidade') {
                          return (
                            <td key={c.key} className={`max-w-[260px] whitespace-normal align-top ${tdBase}`}>
                              {r.conforme ? (
                                <span className="flex items-center gap-1 text-accent-green"><CheckCircle2 size={14} /> Conforme</span>
                              ) : (
                                <div>
                                  <span className="flex items-center gap-1 text-accent-red"><XCircle size={14} /> Não conforme</span>
                                  {r.motivo_nao_conformidade && (
                                    <div className="mt-0.5 text-[11px] leading-tight text-text-secondary">{r.motivo_nao_conformidade}</div>
                                  )}
                                  {(() => {
                                    const s = sugestoesPorTrecho.get(r.trecho_id)
                                    if (!s) return null
                                    if (s.diametroM == null && s.declividadeMM == null) {
                                      return (
                                        <div className="mt-1 text-[11px] leading-tight text-accent-amber">
                                          Nenhum diâmetro comercial nem inclinação na faixa configurada resolve sozinho.
                                        </div>
                                      )
                                    }
                                    const partes: string[] = []
                                    if (s.diametroM != null) partes.push(`Ø ${s.diametroM.toFixed(3)} m`)
                                    if (s.declividadeMM != null) partes.push(`i ${s.declividadeMM.toFixed(4)} m/m`)
                                    return (
                                      <div className="mt-1 text-[11px] leading-tight text-brand">Sugestão: {partes.join(' ou ')}</div>
                                    )
                                  })()}
                                </div>
                              )}
                            </td>
                          )
                        }
                        return (
                          <td
                            key={c.key}
                            className={`${tdBase} ${corTexto} ${c.key === 'trecho' ? 'font-medium' : ''}`}
                            title={
                              c.key === 'degrauEnergia' && degrau != null && degrau < 0
                                ? 'A linha de energia pediria subir a cota de fundo aqui, mas isso não foi aplicado (deixaria água represada na caixa) — valor só informativo.'
                                : undefined
                            }
                          >
                            {valores[c.key]}
                          </td>
                        )
                      })}
                      <td className={`text-text-secondary/40 group-hover:text-brand ${fonteCompacta ? 'px-2 py-1' : 'px-2 py-2'}`}>
                        <Eye size={fonteCompacta ? 13 : 15} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {trechoModal && (
        <MemoriaCalculoModal
          resultado={resultadoModal}
          trecho={trechoModal}
          trechos={trechos}
          biblioteca={biblioteca}
          caixas={caixas}
          sugestaoDiametroM={sugestaoModal?.diametroM ?? null}
          sugestaoDeclividadeMM={sugestaoModal?.declividadeMM ?? null}
          onClose={() => setTrechoModalId(null)}
          onRecalcular={handleRecalcularAposEdicao}
          onAnterior={trechoAnteriorId ? () => setTrechoModalId(trechoAnteriorId) : null}
          onProximo={trechoProximoId ? () => setTrechoModalId(trechoProximoId) : null}
        />
      )}
    </div>
  )
}
