import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Download,
  Droplets,
  Eye,
  EyeOff,
  FileDown,
  FileSpreadsheet,
  FileText,
  Loader2,
  Network,
  NotebookText,
  RefreshCw,
  RotateCcw,
  Scale,
  XCircle,
} from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Field, fieldInputClass } from '../components/ui/Field'
import { RedeDiagrama } from '../components/RedeDiagrama'
import { MemoriaCalculoModal } from '../components/MemoriaCalculoModal'
import { useRevisaoContext } from '../lib/RevisaoContext'
import { nomeSemRede } from '../lib/nomeRede'
import { calcularIntensidadeIdf } from '../engine/idf'
import { avaliarBalanceamentoRede } from '../engine/balanceamentoRede'
import {
  acumularVazao,
  calcularQProjeto,
  calcularTcSistema,
  corrigirRecobrimentoRedeCompleta,
  identificarCaixasComMultiplasSaidas,
  identificarCaixasIsoladas,
  identificarCaixasSemJusante,
  identificarRecobrimentoInsuficiente,
  identificarRedesPorPvCabeceira,
  identificarTroncoRede,
  ordenarTrechosPorFluxo,
  recalcularPerfilRedeUniforme,
  type PatchPerfilRede,
} from '../engine/rede'
import { calcularCotaMontantePorEnergia, calcularCotasPorEnergia, calcularLinhaEnergia } from '../engine/energia'
import { agruparQuantidadesPorItem, calcularVolumesTrecho, type ParametrosEscavacao } from '../engine/quantitativos'
import { resolverLamina } from '../engine/bissecao'
import { sugerirDeclividade, sugerirDiametro } from '../engine/sugestao'
import { exportarRedeXmlAtualizado } from '../lib/exportRedeXml'
import { exportarTabelaRedePluvialPdf } from '../lib/exportRedePluvialPdf'
import { baixarRelatorioDiametros } from '../lib/relatorioDiametros'
import { listBibliotecaPecas, type ItemBiblioteca } from '../lib/bibliotecaStorage'
import { listEquacoesIdf, type EquacaoIdfRecord } from '../lib/idfStorage'
import { listMateriaisManning, type MaterialManningRecord } from '../lib/materiaisStorage'
import {
  listCaixas,
  listTrechos,
  renomearMaterialEmLote,
  updateTrecho,
  updateTrechosPerfilEmLote,
  type CaixaRecord,
  type TrechoRecord,
} from '../lib/redeStorage'
import { listBacias, type BaciaRecord } from '../lib/baciasStorage'
import { listCaptacoesPorRevisao, type CaptacaoRecord } from '../lib/captacaoStorage'
import {
  deleteResultadosRedeByTrechoIds,
  listResultadosRedeByRevisao,
  listResultadosSarjeta,
  saveResultadoRede,
  type ResultadoRedeRecord,
} from '../lib/resultadosStorage'
import { listResultadosSarjetao } from '../lib/resultadosSarjetaoStorage'
import { construirMemorialSarjetaCritica } from './SarjetaCriticaPage'
import { parametrosExibicaoDoRegistroSarjetao, recalcularSarjetaoDoRegistro } from './SarjetaoDenteServaPage'
import { gerarSvgDiagrama, rasterizarSvgParaPngDataUrl } from '../lib/diagramaSvg'
import { getProjetoDetail } from '../lib/projetosStorage'
import { carregarLogoParaPdf } from '../lib/configuracoesStorage'
import { ALTURA_FLUXO_MAXIMA_M, ALTURA_FLUXO_MINIMA_M, larguraMinimaEscadaM } from '../engine/escadaHidraulica'
import { gerarRelatorioCompletoPdf } from '../lib/exportRelatorioCompletoPdf'
import { updateCriteriosConformidade, type RevisaoComProjeto } from '../lib/revisoesStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'
const SECONDARY_BTN =
  'flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary shadow-sm transition hover:text-text-primary disabled:opacity-60'
const SMALL_BTN =
  'flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'

type ColunaMemorialKey =
  | 'trecho'
  | 'sistema'
  | 'caixaMontante'
  | 'caixaJusante'
  | 'ca'
  | 'tc'
  | 'intensidade'
  | 'qProjeto'
  | 'diametro'
  | 'extensao'
  | 'inclinacao'
  | 'velocidade'
  | 'yd'
  | 'tcPercurso'
  | 'tcProximo'
  | 'cotaEnergiaMontante'
  | 'cotaEnergiaJusante'
  | 'conformidade'

const COLUNAS_MEMORIAL: { key: ColunaMemorialKey; label: string }[] = [
  { key: 'trecho', label: 'Trecho' },
  { key: 'sistema', label: 'Sistema' },
  { key: 'caixaMontante', label: 'Caixa montante' },
  { key: 'caixaJusante', label: 'Caixa jusante' },
  { key: 'ca', label: 'ΣC×A (m²)' },
  { key: 'tc', label: 'Tc (min)' },
  { key: 'intensidade', label: 'Intensidade (mm/h)' },
  { key: 'qProjeto', label: 'Vazão (L/s)' },
  { key: 'diametro', label: 'Diâm. (m)' },
  { key: 'extensao', label: 'Extensão (m)' },
  { key: 'inclinacao', label: 'Inclinação (m/m)' },
  { key: 'velocidade', label: 'Velocidade (m/s)' },
  { key: 'yd', label: 'y/D' },
  { key: 'tcPercurso', label: 'Tc percurso do trecho (min)' },
  { key: 'tcProximo', label: 'Tc próximo trecho (min)' },
  { key: 'cotaEnergiaMontante', label: 'Cota energia montante (m)' },
  { key: 'cotaEnergiaJusante', label: 'Cota energia jusante (m)' },
  { key: 'conformidade', label: 'Conformidade' },
]

type ColunaNotaServicoKey =
  | 'trecho'
  | 'sistema'
  | 'caixaMontante'
  | 'caixaJusante'
  | 'diametro'
  | 'extensao'
  | 'inclinacao'
  | 'ctMontante'
  | 'ctJusante'
  | 'fitMontante'
  | 'fitJusante'
  | 'xMontante'
  | 'yMontante'
  | 'xJusante'
  | 'yJusante'

const COLUNAS_NOTA_SERVICO: { key: ColunaNotaServicoKey; label: string }[] = [
  { key: 'trecho', label: 'Trecho' },
  { key: 'sistema', label: 'Sistema' },
  { key: 'caixaMontante', label: 'Caixa montante' },
  { key: 'caixaJusante', label: 'Caixa jusante' },
  { key: 'diametro', label: 'Diâm. (m)' },
  { key: 'extensao', label: 'Extensão (m)' },
  { key: 'inclinacao', label: 'Inclinação (m/m)' },
  { key: 'ctMontante', label: 'CT montante (m)' },
  { key: 'ctJusante', label: 'CT jusante (m)' },
  { key: 'fitMontante', label: 'FIT montante (m)' },
  { key: 'fitJusante', label: 'FIT jusante (m)' },
  { key: 'xMontante', label: 'X montante' },
  { key: 'yMontante', label: 'Y montante' },
  { key: 'xJusante', label: 'X jusante' },
  { key: 'yJusante', label: 'Y jusante' },
]

type ColunaQuantidadeKey =
  | 'trecho'
  | 'sistema'
  | 'caixaMontante'
  | 'caixaJusante'
  | 'diametro'
  | 'extensao'
  | 'volEscavacao'
  | 'volBerco'
  | 'volReaterro'

const COLUNAS_QUANTIDADE: { key: ColunaQuantidadeKey; label: string }[] = [
  { key: 'trecho', label: 'Trecho' },
  { key: 'sistema', label: 'Sistema' },
  { key: 'caixaMontante', label: 'Caixa montante' },
  { key: 'caixaJusante', label: 'Caixa jusante' },
  { key: 'diametro', label: 'Diâm. (m)' },
  { key: 'extensao', label: 'Extensão (m)' },
  { key: 'volEscavacao', label: 'Vol. escavação (m³)' },
  { key: 'volBerco', label: 'Vol. berço (m³)' },
  { key: 'volReaterro', label: 'Vol. reaterro (m³)' },
]

const TOLERANCIA_DIAMETRO_BIBLIOTECA_M = 0.001

/** Mesmo critério de correspondência usado no export XML (landxmlPatch.ts) — material +
 * diâmetro dentro de 1mm de tolerância, já que os dados vêm de conversões de unidade. */
function acharItemBiblioteca(biblioteca: ItemBiblioteca[], material: string | null, diametroM: number): ItemBiblioteca | null {
  if (!material) return null
  return (
    biblioteca.find(
      (i) => i.material.toUpperCase() === material.toUpperCase() && Math.abs(i.diametro_m - diametroM) <= TOLERANCIA_DIAMETRO_BIBLIOTECA_M
    ) ?? null
  )
}

const DEFAULT_LIMITES = {
  limiteYD: 0.75,
  velMinMs: 0.6,
  velMaxMs: 5,
  declMinMM: 0.003,
  declMaxMM: 0.15,
  diametroMinTroncoM: 0.4,
  diametroMinRamalM: 0.3,
  /** Quando true, calcularCotasPorEnergia só aciona o cálculo por linha de energia (EGL) numa
   * troca de diâmetro se TODOS os lados envolvidos forem rede tronco -- uma boca de lobo (ramal)
   * menor entrando num PV maior da rede tronco continua com degrau zero simples. */
  energiaSoTronco: false,
  /** Mínimo pro alerta/correção de recobrimento insuficiente -- 0 m só acusa o caso impossível
   * (tubo acima da cota de terreno); suba pra também flagar cobertura positiva mas abaixo do
   * mínimo de projeto. */
  recobrimentoMinimoM: 0,
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
  // Rede tronco = trechos cuja caixa de MONTANTE é classificada como "rede tronco" (eh_tronco) --
  // usada pro critério de conformidade de diâmetro mínimo por categoria e pra decidir quando o
  // ajuste de cota por linha de energia entra em jogo (ver limites.energiaSoTronco).
  const troncoIds = identificarTroncoRede(
    caixas.map((c) => ({ id: c.id, nome: c.nome, ehTronco: c.eh_tronco })),
    trechos.map((t) => ({ id: t.id, montanteId: t.caixa_montante_id, jusanteId: t.caixa_jusante_id, nome: t.nome, diametroM: t.diametro_m }))
  )
  const trechosComComprimento = trechos.map((t) => ({
    id: t.id,
    montanteId: t.caixa_montante_id,
    jusanteId: t.caixa_jusante_id,
    comprimentoM: t.comprimento_m,
    declividadeMM: t.declividade_m_m,
    diametroM: t.diametro_m,
    ehTronco: troncoIds.has(t.id),
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

      // Escada hidráulica não é um tubo circular -- a hidráulica de Manning/y-D/velocidade de
      // autolimpeza não se aplica (fisicamente outro fenômeno, degrau em queda livre). Fica de
      // fora do solver e da checagem de conformidade "de tubo" (o dimensionamento próprio dela é
      // feito à parte, ver src/engine/escadaHidraulica.ts e a página Escadas Hidráulicas) -- só
      // continua carregando ΣC×A/Q adiante pra não quebrar a cascata de vazão da rede.
      if (t.eh_escada_hidraulica) {
        if (!ultimaPassada) continue
        linhas.push({
          trecho_id: t.id,
          q_entrada_m3s: null,
          ca_acumulado: ca,
          q_projeto_m3s: qProjeto,
          tc_sistema_min: tcSistema,
          intensidade_mm_h: intensidade,
          lamina_m: null,
          y_sobre_d_pct: null,
          raio_hidraulico_m: null,
          velocidade_ms: null,
          vazao_calculada_m3s: null,
          conforme: true,
          motivo_nao_conformidade: null,
        })
        continue
      }

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
      const diametroMinCategoria = troncoIds.has(t.id) ? limites.diametroMinTroncoM : limites.diametroMinRamalM
      if (t.diametro_m < diametroMinCategoria) {
        motivos.push(`diâmetro abaixo do mínimo de ${troncoIds.has(t.id) ? 'rede tronco' : 'ramal'} (${diametroMinCategoria} m)`)
      }

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
    velocidadeFinalPorTrecho,
    { apenasTroncoParaEnergia: limites.energiaSoTronco }
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
  const { revisaoAtiva, ocultarNomeRede } = useRevisaoContext()
  const [caixas, setCaixas] = useState<CaixaRecord[]>([])
  const [trechos, setTrechos] = useState<TrechoRecord[]>([])
  const [bacias, setBacias] = useState<BaciaRecord[]>([])
  const [captacoes, setCaptacoes] = useState<CaptacaoRecord[]>([])
  const [equacao, setEquacao] = useState<EquacaoIdfRecord | null>(null)
  const [limites, setLimites] = useState(DEFAULT_LIMITES)
  // Critérios de conformidade ficam vinculados à revisão (migração 025) -- todo estudo desta
  // versão adota os mesmos valores, e eles sobrevivem a um F5 em vez de voltar pro padrão do
  // sistema. `limitesRevisaoIdRef` marca de qual revisão o `limites` atual já reflete os
  // critérios salvos, pra distinguir "acabei de carregar" (não precisa regravar) de "usuário
  // editou" (precisa persistir) no efeito de salvamento abaixo.
  const limitesRevisaoIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!revisaoAtiva) return
    setLimites({
      limiteYD: revisaoAtiva.criterio_limite_yd ?? DEFAULT_LIMITES.limiteYD,
      velMinMs: revisaoAtiva.criterio_vel_min_ms ?? DEFAULT_LIMITES.velMinMs,
      velMaxMs: revisaoAtiva.criterio_vel_max_ms ?? DEFAULT_LIMITES.velMaxMs,
      declMinMM: revisaoAtiva.criterio_decl_min_mm ?? DEFAULT_LIMITES.declMinMM,
      declMaxMM: revisaoAtiva.criterio_decl_max_mm ?? DEFAULT_LIMITES.declMaxMM,
      diametroMinTroncoM: revisaoAtiva.criterio_diametro_min_tronco_m ?? DEFAULT_LIMITES.diametroMinTroncoM,
      diametroMinRamalM: revisaoAtiva.criterio_diametro_min_ramal_m ?? DEFAULT_LIMITES.diametroMinRamalM,
      energiaSoTronco: revisaoAtiva.criterio_energia_so_tronco ?? DEFAULT_LIMITES.energiaSoTronco,
      recobrimentoMinimoM: revisaoAtiva.criterio_recobrimento_minimo_m ?? DEFAULT_LIMITES.recobrimentoMinimoM,
    })
    limitesRevisaoIdRef.current = revisaoAtiva.id
  }, [revisaoAtiva])
  useEffect(() => {
    if (!revisaoAtiva || limitesRevisaoIdRef.current !== revisaoAtiva.id) return
    const t = setTimeout(() => {
      updateCriteriosConformidade(revisaoAtiva.id, limites).catch((err) => {
        setError(err instanceof Error ? err.message : 'Erro ao salvar os critérios de conformidade.')
      })
    }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limites, revisaoAtiva?.id])
  const [resultados, setResultados] = useState<LinhaResultado[]>([])
  const [running, setRunning] = useState(false)
  const [atualizando, setAtualizando] = useState(false)
  // Serializa toda chamada de executarCalculoRede (botão "Rodar cálculo" E o recálculo
  // automático depois de editar um trecho na memória de cálculo) -- sem isso, duas chamadas
  // sobrepostas (duplo clique, ou editar um trecho enquanto o recálculo do anterior ainda não
  // tinha terminado) corriam em paralelo, cada uma com seu próprio delete-então-insere sobre
  // TODOS os trechos, e dependendo do timing da corrida alguns trechos acabavam com duas linhas
  // de resultado em vez de uma. Uma promise encadeada (não um booleano) porque precisa GARANTIR
  // que a segunda chamada só comece depois que a primeira terminar de vez, não só bloquear.
  const filaCalculoRef = useRef<Promise<void>>(Promise.resolve())
  const executarCalculoSerializado = (fn: () => Promise<void>): Promise<void> => {
    const proxima = filaCalculoRef.current.then(fn, fn)
    filaCalculoRef.current = proxima.catch(() => {})
    return proxima
  }
  const [error, setError] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [mostrarDiagrama, setMostrarDiagrama] = useState(false)
  const [visaoDiagrama, setVisaoDiagrama] = useState<'completa' | 'tronco'>('completa')
  const [redeSelecionada, setRedeSelecionada] = useState<number | 'todas'>('todas')
  const [apenasNaoConformes, setApenasNaoConformes] = useState(false)
  const [trechoModalId, setTrechoModalId] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false)
  const [biblioteca, setBiblioteca] = useState<ItemBiblioteca[]>([])
  const [materiaisManning, setMateriaisManning] = useState<MaterialManningRecord[]>([])
  const [materialOrigem, setMaterialOrigem] = useState<string>('__todos__')
  const [materialDestino, setMaterialDestino] = useState('')
  const [renomeandoMaterial, setRenomeandoMaterial] = useState(false)
  const [fonteCompacta, setFonteCompacta] = useState(false)
  const [colunasOcultas, setColunasOcultas] = useState<Set<ColunaMemorialKey>>(new Set())
  const [colunasOcultasNotaServico, setColunasOcultasNotaServico] = useState<Set<ColunaNotaServicoKey>>(new Set())
  const [colunasOcultasQuantidade, setColunasOcultasQuantidade] = useState<Set<ColunaQuantidadeKey>>(new Set())
  const [aba, setAba] = useState<'memorial' | 'notaServico' | 'quantidade'>('memorial')
  const [declividadePerfilPct, setDeclividadePerfilPct] = useState('0.50')
  const [recobrimentoPerfil, setRecobrimentoPerfil] = useState('1.20')
  const [perfilPendente, setPerfilPendente] = useState<{ patches: PatchPerfilRede[]; cabeceirasSemCotaTerreno: string[] } | null>(null)
  const [aplicandoPerfil, setAplicandoPerfil] = useState(false)

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
    try {
      setMateriaisManning(await listMateriaisManning())
    } catch {
      setMateriaisManning([])
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

  // Reconsulta o banco sempre que a aba volta a ficar visível/em foco -- sem isso, se o cálculo
  // rodou em outra aba/sessão (ou o próprio banco foi corrigido por fora) enquanto esta página
  // ficou aberta parada, ela continua mostrando cota/resultado antigo até alguém recarregar a
  // tela manualmente: o que aparece pode ficar diferente do que está gravado, mesmo o banco
  // estando certo.
  useEffect(() => {
    const recarregar = () => {
      if (document.visibilityState === 'visible') load().catch((e) => setError(e.message))
    }
    window.addEventListener('focus', recarregar)
    document.addEventListener('visibilitychange', recarregar)
    return () => {
      window.removeEventListener('focus', recarregar)
      document.removeEventListener('visibilitychange', recarregar)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisaoAtiva])

  const handleAtualizar = async () => {
    setAtualizando(true)
    try {
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao atualizar os dados.')
    } finally {
      setAtualizando(false)
    }
  }

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
      await executarCalculoSerializado(async () => {
        const { avisos: novosAvisos } = await executarCalculoRede({ revisaoAtiva, equacao, caixas, trechos, bacias, captacoes, limites })
        setAvisos(novosAvisos)
        await load()
      })
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
    await executarCalculoSerializado(async () => {
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
    })
  }

  // Calcula (sem gravar ainda) o resultado de aplicar uma declividade + recobrimento uniformes
  // desde cada cabeceira -- sobrepõe as cotas vindas do Civil 3D. Fica pendente de confirmação
  // (handleAplicarPerfil) porque mexe potencialmente em centenas de trechos de uma vez.
  const handleCalcularPerfil = () => {
    setError(null)
    const declividadeMM = Number(declividadePerfilPct) / 100
    const recobrimentoM = Number(recobrimentoPerfil)
    if (!Number.isFinite(declividadeMM) || declividadeMM <= 0) {
      setError('Declividade uniforme inválida — informe um número maior que zero.')
      return
    }
    if (!Number.isFinite(recobrimentoM) || recobrimentoM < 0) {
      setError('Recobrimento inválido — informe um número maior ou igual a zero.')
      return
    }
    const trechosEscopo = trechos.filter((t) => redeSelecionada === 'todas' || redePorTrecho.get(t.id) === redeSelecionada)
    const resultado = recalcularPerfilRedeUniforme(
      caixas.map((c) => ({ id: c.id, nome: c.nome, cotaTerreno: c.cota_terreno })),
      trechosEscopo.map((t) => ({
        id: t.id,
        montanteId: t.caixa_montante_id,
        jusanteId: t.caixa_jusante_id,
        nome: t.nome,
        diametroM: t.diametro_m,
        comprimentoM: t.comprimento_m,
      })),
      declividadeMM,
      recobrimentoM
    )
    setPerfilPendente(resultado)
  }

  const handleAplicarPerfil = async () => {
    if (!perfilPendente) return
    setAplicandoPerfil(true)
    setError(null)
    try {
      await updateTrechosPerfilEmLote(
        perfilPendente.patches.map((p) => ({
          id: p.id,
          declividadeM_m: p.declividadeMM,
          cotaFundoMontante: p.cotaFundoMontante,
          cotaFundoJusante: p.cotaFundoJusante,
          cotaTopoMontante: p.cotaTopoMontante,
          cotaTopoJusante: p.cotaTopoJusante,
        }))
      )
      setPerfilPendente(null)
      await handleRecalcularAposEdicao()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao aplicar o perfil recalculado.')
    } finally {
      setAplicandoPerfil(false)
    }
  }

  // Materiais distintos já cadastrados nos trechos da revisão -- popula o seletor "material
  // atual" do renomeador em lote (ex.: Civil 3D às vezes traz parte como "CONCRETO" e parte como
  // "Reinforced Concrete", que não batem com o mesmo item da biblioteca de peças nem com a mesma
  // linha de Manning apesar de serem o mesmo material na prática).
  const materiaisDistintos = useMemo(
    () => [...new Set(trechos.map((t) => t.material).filter((m): m is string => !!m?.trim()))].sort((a, b) => a.localeCompare(b)),
    [trechos]
  )
  const qtdTrechosMaterialOrigem = useMemo(
    () =>
      materialOrigem === '__todos__'
        ? trechos.length
        : trechos.filter((t) => (t.material ?? '').toUpperCase() === materialOrigem.toUpperCase()).length,
    [trechos, materialOrigem]
  )

  const handleRenomearMaterial = async () => {
    if (!revisaoAtiva) return
    const novo = materialDestino.trim()
    if (!novo) {
      setError('Informe o material novo.')
      return
    }
    setRenomeandoMaterial(true)
    setError(null)
    try {
      const manningNovoMaterial = materiaisManning.find((m) => m.material.toUpperCase() === novo.toUpperCase())?.manning_n ?? null
      await renomearMaterialEmLote(revisaoAtiva.id, materialOrigem === '__todos__' ? null : materialOrigem, novo, manningNovoMaterial)
      setMaterialDestino('')
      setMaterialOrigem('__todos__')
      await handleRecalcularAposEdicao()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao renomear o material em lote.')
    } finally {
      setRenomeandoMaterial(false)
    }
  }

  // Ordem de fluxo real: tronco + ramais (ver doc de ordenarTrechosPorFluxo em
  // engine/rede.ts) — em cada confluência o trecho de maior diâmetro é tratado
  // como a continuação do tronco, ramais menores desaguam nele em seguida.
  const ordemTrechos = useMemo(() => {
    if (caixas.length === 0 || trechos.length === 0) return new Map<string, number>()
    return ordenarTrechosPorFluxo(
      caixas.map((c) => ({ id: c.id, nome: c.nome, ehTronco: c.eh_tronco })),
      trechos.map((t) => ({ id: t.id, montanteId: t.caixa_montante_id, jusanteId: t.caixa_jusante_id, nome: t.nome, diametroM: t.diametro_m }))
    )
  }, [caixas, trechos])

  // ΣC×A acumulado por trecho, já calculado -- usado pelo alerta de sistema inteiro fora da rede
  // tronco (dá contexto de quanto ele carrega, mesmo não fazendo mais parte da decisão de
  // inclusão em si).
  const caAcumuladoPorTrecho = useMemo(() => new Map(resultados.map((r) => [r.trecho_id, r.ca_acumulado ?? 0])), [resultados])

  // Rede tronco = trechos cuja caixa de MONTANTE é classificada como "rede tronco" (eh_tronco,
  // editável em Rede Importada) -- por padrão PV e boca de lobo entram, caixa de passagem não.
  // Critério explícito e controlado pelo engenheiro, não tenta adivinhar por diâmetro/vazão.
  // Filtra diagrama/tabela quando "Só rede tronco" está ativo; não muda o cálculo hidráulico
  // (ΣC×A/vazão sempre soma todas as entradas de toda caixa, mesmo as fora da rede tronco).
  const troncoIds = useMemo(() => {
    if (caixas.length === 0 || trechos.length === 0) return new Set<string>()
    return identificarTroncoRede(
      caixas.map((c) => ({ id: c.id, nome: c.nome, ehTronco: c.eh_tronco })),
      trechos.map((t) => ({ id: t.id, montanteId: t.caixa_montante_id, jusanteId: t.caixa_jusante_id, nome: t.nome, diametroM: t.diametro_m }))
    )
  }, [caixas, trechos])

  // Rede = a partir de cada PV de cabeceira, gera uma rede independente que se propaga rio abaixo
  // até desaguar em outra rede já estabelecida (na confluência, quem continua é a entrada
  // dominante — maior diâmetro). Um PV só vira cabeceira NOVA quando ninguém a montante (mesmo
  // atrás de uma boca de lobo/caixa de passagem no meio do caminho) já carrega uma rede — evita
  // cortar uma rede grande que passa por uma caixa não-PV antes de chegar num PV mais a jusante.
  // Não depende de rede_nome (nome do PipeNetwork importado do Civil3D). Permite isolar cada rede
  // pra análise (filtro abaixo).
  const redesPorPvCabeceira = useMemo(() => {
    if (caixas.length === 0 || trechos.length === 0) {
      return { redePorTrecho: new Map<string, number>(), redesQueDesaguamPorCaixa: new Map<string, number[]>(), erro: null as string | null }
    }
    try {
      return { ...identificarRedesPorPvCabeceira(
        caixas.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, ehTronco: c.eh_tronco })),
        trechos.map((t) => ({ id: t.id, montanteId: t.caixa_montante_id, jusanteId: t.caixa_jusante_id, nome: t.nome, diametroM: t.diametro_m }))
      ), erro: null as string | null }
    } catch (e) {
      // grafo com ciclo (dado de import inconsistente) -- não deixa a página inteira quebrar
      // (useMemo roda durante o render, um throw aqui vira erro não capturado)
      return { redePorTrecho: new Map<string, number>(), redesQueDesaguamPorCaixa: new Map<string, number[]>(), erro: e instanceof Error ? e.message : 'Erro ao identificar as redes.' }
    }
  }, [caixas, trechos])
  const redePorTrecho = redesPorPvCabeceira.redePorTrecho
  const redesQueDesaguamPorCaixa = redesPorPvCabeceira.redesQueDesaguamPorCaixa

  // Avaliação heurística de balanceamento entre sistemas (ver docstring de avaliarBalanceamentoRede
  // em engine/balanceamentoRede.ts) -- não redesenha nada, só aponta confluências onde um Sistema
  // deságua no outro com um degrau grande e sugere, quando existe uma caixa de outro "grupo final"
  // por perto e morro abaixo, religar o ramal ali pra equilibrar a vazão entre as saídas JUS.
  const vazaoPorTrecho = useMemo(() => new Map(resultados.map((r) => [r.trecho_id, r.q_projeto_m3s ?? 0])), [resultados])
  const balanceamento = useMemo(() => {
    if (caixas.length === 0 || trechos.length === 0 || resultados.length === 0) {
      return { saidasFinais: [], confluenciasSuspeitas: [] }
    }
    return avaliarBalanceamentoRede(
      caixas.map((c) => ({ id: c.id, nome: c.nome, x: c.x, y: c.y, cotaFundo: c.cota_fundo })),
      trechos.map((t) => ({
        id: t.id,
        nome: t.nome,
        montanteId: t.caixa_montante_id,
        jusanteId: t.caixa_jusante_id,
        comprimentoM: t.comprimento_m,
        cotaFundoMontante: t.cota_fundo_montante,
        cotaFundoJusante: t.cota_fundo_jusante,
      })),
      redePorTrecho,
      redesQueDesaguamPorCaixa,
      vazaoPorTrecho,
      caAcumuladoPorTrecho
    )
  }, [caixas, trechos, resultados, redePorTrecho, redesQueDesaguamPorCaixa, vazaoPorTrecho, caAcumuladoPorTrecho])
  const [mostrarBalanceamento, setMostrarBalanceamento] = useState(false)

  useEffect(() => {
    if (redesPorPvCabeceira.erro) setError(redesPorPvCabeceira.erro)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redesPorPvCabeceira.erro])

  // Texto pra anexar no nome da caixa montante quando ela é ponto de confluência entre sistemas
  // diferentes -- ex.: "PV - 04 (recebe Sistema 02)". "Sistema" aqui é a numeração topológica
  // do app (a partir de cada PV de cabeceira) -- não confundir com texto tipo "(REDE - 01)"
  // que às vezes já vem no nome das estruturas do Civil3D. Só o sistema que NÃO continua dali
  // pra frente aparece marcado (o dominante já é óbvio pelo próprio filtro/coluna Trecho).
  const sufixoRedesQueDesaguam = (caixaId: string): string => {
    const outras = redesQueDesaguamPorCaixa.get(caixaId)
    if (!outras || outras.length === 0) return ''
    const nomes = outras.map((n) => `Sistema ${String(n).padStart(2, '0')}`).join(', ')
    return ` (recebe ${nomes})`
  }

  const formatSistema = (n: number | undefined): string => (n != null ? `Sistema ${String(n).padStart(2, '0')}` : '—')

  // Caixas que recebem água mas não têm trecho de saída -- ou é a saída real do terreno, ou é
  // um vínculo quebrado no import (a rede "morre" ali sem ninguém perceber). Lista todas pra
  // conferência manual, sem tentar adivinhar qual é qual.
  const caixasSemJusante = useMemo(() => {
    if (caixas.length === 0 || trechos.length === 0) return [] as { id: string; nome: string; sistema: number | undefined }[]
    const ids = identificarCaixasSemJusante(
      caixas.map((c) => ({ id: c.id, nome: c.nome })),
      trechos.map((t) => ({ id: t.id, montanteId: t.caixa_montante_id, jusanteId: t.caixa_jusante_id, nome: t.nome, diametroM: t.diametro_m }))
    )
    const nomePorId = new Map(caixas.map((c) => [c.id, c.nome]))
    const sistemaPorCaixa = new Map<string, number>()
    for (const t of trechos) {
      const sistema = redePorTrecho.get(t.id)
      if (sistema != null) sistemaPorCaixa.set(t.caixa_jusante_id, sistema)
    }
    return ids.map((id) => ({ id, nome: nomePorId.get(id) ?? id, sistema: sistemaPorCaixa.get(id) })).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [caixas, trechos, redePorTrecho])

  // Caixas totalmente desconectadas (nenhum trecho ligado, nem montante nem jusante) --
  // normalmente uma estrutura que ficou solta na importação do LandXML.
  const caixasIsoladas = useMemo(() => {
    if (caixas.length === 0) return [] as { id: string; nome: string }[]
    const ids = identificarCaixasIsoladas(
      caixas.map((c) => ({ id: c.id, nome: c.nome })),
      trechos.map((t) => ({ id: t.id, montanteId: t.caixa_montante_id, jusanteId: t.caixa_jusante_id, nome: t.nome, diametroM: t.diametro_m }))
    )
    const nomePorId = new Map(caixas.map((c) => [c.id, c.nome]))
    return ids.map((id) => ({ id, nome: nomePorId.get(id) ?? id })).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [caixas, trechos])

  // Caixas com mais de um trecho de saída -- quebra a suposição ("no máximo 1 saída por caixa")
  // usada em toda a topologia do engine (rede tronco, cascata, Sistema, vazão acumulada).
  const caixasComMultiplasSaidas = useMemo(() => {
    if (caixas.length === 0 || trechos.length === 0) return [] as { id: string; nome: string; quantidade: number }[]
    const encontradas = identificarCaixasComMultiplasSaidas(
      caixas.map((c) => ({ id: c.id, nome: c.nome })),
      trechos.map((t) => ({ id: t.id, montanteId: t.caixa_montante_id, jusanteId: t.caixa_jusante_id, nome: t.nome, diametroM: t.diametro_m }))
    )
    const nomePorId = new Map(caixas.map((c) => [c.id, c.nome]))
    return encontradas
      .map((e) => ({ id: e.caixaId, nome: nomePorId.get(e.caixaId) ?? e.caixaId, quantidade: e.quantidade }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
  }, [caixas, trechos])

  // Caixas marcadas "recebe vazão" (aparecem como opção de captação em Cadastros → Bacias) mas
  // sem nenhuma bacia de fato vinculada a elas -- provavelmente esquecida na hora de montar a
  // captação, ou não devia estar marcada como "recebe vazão".
  const caixasRecebeVazaoSemCaptacao = useMemo(() => {
    const dispositivosCaptados = new Set(captacoes.map((c) => c.dispositivo_id))
    return caixas
      .filter((c) => c.recebe_vazao && !dispositivosCaptados.has(c.id))
      .map((c) => ({ id: c.id, nome: c.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
  }, [caixas, captacoes])

  // Recobrimento insuficiente (às vezes negativo -- tubo literalmente acima da cota de terreno
  // cadastrada, normalmente cota de fundo errada importada do Civil 3D numa estrutura de
  // captação). Critério PRÓPRIO, independente do campo "Recobrimento" da ferramenta de recálculo
  // de perfil (que é um parâmetro de ferramenta, não o mínimo de projeto) -- default 0 m, ou
  // seja, só acusa o caso realmente impossível (recobrimento negativo). O engenheiro pode subir
  // esse valor pra também flagar cobertura positiva mas abaixo do mínimo de projeto dele. Vive em
  // `limites` (vinculado à revisão, ver migração 026) junto com os demais critérios.
  const violacoesRecobrimento = useMemo(() => {
    if (caixas.length === 0 || trechos.length === 0) return []
    const recobrimentoMinimoM = limites.recobrimentoMinimoM
    if (!Number.isFinite(recobrimentoMinimoM)) return []
    return identificarRecobrimentoInsuficiente(
      caixas.map((c) => ({ id: c.id, nome: c.nome, cotaTerreno: c.cota_terreno })),
      trechos.map((t) => ({
        id: t.id,
        nome: t.nome,
        montanteId: t.caixa_montante_id,
        jusanteId: t.caixa_jusante_id,
        diametroM: t.diametro_m,
        comprimentoM: t.comprimento_m,
        declividadeMM: t.declividade_m_m,
        cotaTopoMontante: t.cota_topo_montante,
        cotaTopoJusante: t.cota_topo_jusante,
      })),
      recobrimentoMinimoM
    ).sort((a, b) => a.recobrimentoM - b.recobrimentoM)
  }, [caixas, trechos, limites.recobrimentoMinimoM])
  const [corrigindoRecobrimento, setCorrigindoRecobrimento] = useState(false)

  // Corrige a rede INTEIRA (não só cabeceiras) -- ver corrigirRecobrimentoRedeCompleta:
  // cabeceira empurra a própria cota, o resto da rede aumenta a própria declividade onde
  // precisar pra garantir o mínimo, herdando a cota mais funda em confluências.
  const handleCorrigirRecobrimento = async () => {
    const recobrimentoMinimoM = limites.recobrimentoMinimoM
    if (!Number.isFinite(recobrimentoMinimoM)) return
    setCorrigindoRecobrimento(true)
    setError(null)
    try {
      const correcoes = corrigirRecobrimentoRedeCompleta(
        caixas.map((c) => ({ id: c.id, nome: c.nome, cotaTerreno: c.cota_terreno })),
        trechos.map((t) => ({
          id: t.id,
          nome: t.nome,
          montanteId: t.caixa_montante_id,
          jusanteId: t.caixa_jusante_id,
          diametroM: t.diametro_m,
          comprimentoM: t.comprimento_m,
          declividadeMM: t.declividade_m_m,
          cotaTopoMontante: t.cota_topo_montante,
          cotaTopoJusante: t.cota_topo_jusante,
        })),
        recobrimentoMinimoM,
        limites.declMinMM
      )
      await Promise.all(
        correcoes.map((c) =>
          updateTrecho(c.trechoId, {
            cota_fundo_montante: c.cotaFundoMontante,
            cota_fundo_jusante: c.cotaFundoJusante,
            cota_topo_montante: c.cotaTopoMontante,
            cota_topo_jusante: c.cotaTopoJusante,
            declividade_m_m: c.declividadeMM,
          })
        )
      )
      await handleRecalcularAposEdicao()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao corrigir o recobrimento da rede.')
    } finally {
      setCorrigindoRecobrimento(false)
    }
  }

  // Sistema de quem CONTINUA a partir de cada caixa (o trecho de saída dali) -- permite marcar
  // o lado inverso da confluência: "sufixoRedesQueDesaguam" avisa na caixa montante quem chega
  // de fora, isso aqui avisa na caixa jusante de um trecho que ELE MESMO é quem deságua noutro
  // sistema (útil olhando o sistema de origem isolado, onde o trecho receptor fica fora do filtro).
  const sistemaContinuidadePorCaixa = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const t of trechos) {
      const sistema = redePorTrecho.get(t.id)
      if (sistema != null) mapa.set(t.caixa_montante_id, sistema)
    }
    return mapa
  }, [trechos, redePorTrecho])

  const sufixoDesaguaEmOutroSistema = (sistemaDoTrecho: number | undefined, caixaJusanteId: string): string => {
    if (sistemaDoTrecho == null) return ''
    const continuidade = sistemaContinuidadePorCaixa.get(caixaJusanteId)
    if (continuidade == null || continuidade === sistemaDoTrecho) return ''
    return ` (deságua em Sistema ${String(continuidade).padStart(2, '0')})`
  }

  // ΣC×A e vazão que cada sistema entrega em cada caixa onde ele deságua noutro sistema —
  // usado pra montar a linha sintética de interligação quando a tabela está filtrada por um
  // único sistema (ver linhasExibicaoMemorial): o trecho real que carrega essa água fica de
  // fora do filtro (é de OUTRO sistema), então sem isso a vazão "aparece do nada" no sistema
  // filtrado sem nenhuma linha explicando de onde veio.
  const contribuicaoPorCaixaSistema = useMemo(() => {
    const mapa = new Map<string, Map<number, { ca: number; q: number }>>()
    for (const t of trechos) {
      const sistema = redePorTrecho.get(t.id)
      if (sistema == null) continue
      const resultado = resultados.find((r) => r.trecho_id === t.id)
      if (!resultado) continue
      const porSistema = mapa.get(t.caixa_jusante_id) ?? new Map<number, { ca: number; q: number }>()
      const atual = porSistema.get(sistema) ?? { ca: 0, q: 0 }
      atual.ca += resultado.ca_acumulado ?? 0
      atual.q += resultado.q_projeto_m3s ?? 0
      porSistema.set(sistema, atual)
      mapa.set(t.caixa_jusante_id, porSistema)
    }
    return mapa
  }, [trechos, redePorTrecho, resultados])

  const numerosRedeDisponiveis = useMemo(() => [...new Set(redePorTrecho.values())].sort((a, b) => a - b), [redePorTrecho])

  const passaFiltros = (trechoId: string) =>
    (visaoDiagrama !== 'tronco' || troncoIds.has(trechoId)) && (redeSelecionada === 'todas' || redePorTrecho.get(trechoId) === redeSelecionada)

  // Escada hidráulica (dissipador em degraus) não é um tubo circular -- sai do memorial
  // justificativo (dimensionamento próprio na página Escadas Hidráulicas, ver
  // engine/escadaHidraulica.ts). Continua aparecendo normalmente em Nota de Serviço e
  // Quantidade (ainda é uma estrutura física com cotas/volume de escavação).
  const idsEscadaHidraulica = useMemo(() => new Set(trechos.filter((t) => t.eh_escada_hidraulica).map((t) => t.id)), [trechos])

  // Ordem pura de fluxo (ordenarTrechosPorFluxo, já ciente da classificação de rede tronco) --
  // NÃO agrupa por Sistema primeiro: quando um Sistema deságua no meio do caminho de outro
  // (ex.: uma rede inteira desaguando no PV-11 antes de seguir pro PV-12), esse ramal precisa
  // aparecer bem ali, avaliado ANTES de continuar pro próximo trecho do tronco -- agrupar por
  // Sistema separava esse ramal pra um bloco totalmente à parte, longe de onde ele realmente
  // se conecta fisicamente.
  const resultadosOrdenados = useMemo(() => {
    const base = resultados.filter(
      (r) => passaFiltros(r.trecho_id) && (!apenasNaoConformes || !r.conforme) && !idsEscadaHidraulica.has(r.trecho_id)
    )
    const posicao = (r: LinhaResultado) => ordemTrechos.get(r.trecho_id) ?? Number.MAX_SAFE_INTEGER
    return [...base].sort((a, b) => posicao(a) - posicao(b))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultados, ordemTrechos, troncoIds, redePorTrecho, visaoDiagrama, redeSelecionada, apenasNaoConformes, idsEscadaHidraulica])

  // Mesma ordem/filtro de resultadosOrdenados, mas a partir de `trechos` direto (não depende
  // de ter rodado o cálculo) — usado pelas abas Nota de Serviço e Quantidade.
  const trechosOrdenados = useMemo(() => {
    const base = trechos.filter((t) => passaFiltros(t.id))
    const posicao = (t: TrechoRecord) => ordemTrechos.get(t.id) ?? Number.MAX_SAFE_INTEGER
    return [...base].sort((a, b) => posicao(a) - posicao(b))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trechos, ordemTrechos, troncoIds, redePorTrecho, visaoDiagrama, redeSelecionada])

  const conformidadePorTrecho = useMemo(() => new Map(resultados.map((r) => [r.trecho_id, r.conforme])), [resultados])

  // Conta os não conformes já dentro do filtro de rede tronco/sistema ativo (mas ignorando o
  // próprio filtro "só não conformes"), pra mostrar quantos existem mesmo com o checkbox desligado.
  const naoConformesCount = useMemo(
    () => resultados.filter((r) => passaFiltros(r.trecho_id) && !r.conforme).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resultados, troncoIds, redePorTrecho, visaoDiagrama, redeSelecionada]
  )

  const trechosDiagrama = useMemo(() => {
    const filtrados = trechos.filter((t) => passaFiltros(t.id))
    return ocultarNomeRede ? filtrados.map((t) => ({ ...t, nome: nomeSemRede(t.nome, t.rede_nome) })) : filtrados
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trechos, troncoIds, redePorTrecho, visaoDiagrama, redeSelecionada, ocultarNomeRede])
  const caixasDiagrama = useMemo(() => {
    const idsUsados = new Set(trechosDiagrama.flatMap((t) => [t.caixa_montante_id, t.caixa_jusante_id]))
    const base = visaoDiagrama !== 'tronco' && redeSelecionada === 'todas' ? caixas : caixas.filter((c) => idsUsados.has(c.id))
    return ocultarNomeRede ? base.map((c) => ({ ...c, nome: nomeSemRede(c.nome, c.rede_nome) })) : base
  }, [caixas, trechosDiagrama, visaoDiagrama, redeSelecionada, ocultarNomeRede])

  const trechoPorId = useMemo(() => new Map(trechos.map((t) => [t.id, t])), [trechos])
  const nomeCaixaPorId = useMemo(
    () => new Map(caixas.map((c) => [c.id, ocultarNomeRede ? nomeSemRede(c.nome, c.rede_nome) : c.nome])),
    [caixas, ocultarNomeRede]
  )
  const nomeTrechoPorId = useMemo(
    () => new Map(trechos.map((t) => [t.id, ocultarNomeRede ? nomeSemRede(t.nome, t.rede_nome) : t.nome])),
    [trechos, ocultarNomeRede]
  )
  const caixaPorId = useMemo(() => new Map(caixas.map((c) => [c.id, c])), [caixas])

  // Sistema inteiro sem nenhum trecho na rede tronco -- ex.: todas as caixas de cabeceira desse
  // Sistema foram classificadas como não-tronco (ou o padrão do tipo não bateu com o projeto).
  // Não muda o cálculo, só avisa: vale conferir a classificação das caixas em Rede Importada.
  const sistemasForaDoTronco = useMemo(() => {
    if (trechos.length === 0 || troncoIds.size === 0) return [] as { sistema: number; maxCa: number; numTrechos: number }[]
    const porSistema = new Map<number, { numTrechos: number; maxCa: number }>()
    for (const t of trechos) {
      const sistema = redePorTrecho.get(t.id)
      if (sistema == null) continue
      const entry = porSistema.get(sistema) ?? { numTrechos: 0, maxCa: 0 }
      entry.numTrechos++
      entry.maxCa = Math.max(entry.maxCa, caAcumuladoPorTrecho.get(t.id) ?? 0)
      porSistema.set(sistema, entry)
    }
    const fora: { sistema: number; maxCa: number; numTrechos: number }[] = []
    for (const [sistema, info] of porSistema) {
      const temAlgumNoTronco = trechos.some((t) => redePorTrecho.get(t.id) === sistema && troncoIds.has(t.id))
      if (!temAlgumNoTronco && info.maxCa > 0) fora.push({ sistema, ...info })
    }
    return fora.sort((a, b) => b.maxCa - a.maxCa)
  }, [trechos, redePorTrecho, troncoIds, caAcumuladoPorTrecho])

  // Tc na caixa JUSANTE de cada trecho (o que vira o Tc de entrada do PRÓXIMO trecho) —
  // recalculado no cliente com as velocidades finais já persistidas, já que
  // executarCalculoRede só guarda o Tc de MONTANTE por trecho (tc_sistema_min).
  const tcPorCaixaFinal = useMemo(() => {
    if (caixas.length === 0 || trechos.length === 0 || resultados.length === 0) return new Map<string, number>()
    const caixaIds = caixas.map((c) => c.id)
    const trechosComComprimento = trechos.map((t) => ({
      id: t.id,
      montanteId: t.caixa_montante_id,
      jusanteId: t.caixa_jusante_id,
      comprimentoM: t.comprimento_m,
      declividadeMM: t.declividade_m_m,
    }))
    const tcInicialPorCaixa = new Map<string, number>()
    for (const cap of captacoes) {
      const bacia = bacias.find((b) => b.id === cap.bacia_id)
      if (!bacia) continue
      const atual = tcInicialPorCaixa.get(cap.dispositivo_id) ?? 0
      tcInicialPorCaixa.set(cap.dispositivo_id, Math.max(atual, bacia.tc_min ?? 10))
    }
    const velocidadePorTrecho = new Map(resultados.map((r) => [r.trecho_id, r.velocidade_ms ?? 1]))
    return calcularTcSistema(caixaIds, trechosComComprimento, velocidadePorTrecho, tcInicialPorCaixa)
  }, [caixas, trechos, resultados, captacoes, bacias])

  // Volumes de escavação/berço/reaterro (aba Quantidade) — precisa de largura/talude/altura
  // do berço cadastrados na Biblioteca de Peças pro material+diâmetro do trecho; sem isso o
  // trecho fica de fora (null) e a tabela mostra '—' pra ele.
  const volumesPorTrecho = useMemo(() => {
    const mapa = new Map<string, { escavacao: number; berco: number; reaterro: number } | null>()
    for (const t of trechos) {
      const caixaMontante = caixaPorId.get(t.caixa_montante_id)
      const caixaJusante = caixaPorId.get(t.caixa_jusante_id)
      const item = acharItemBiblioteca(biblioteca, t.material, t.diametro_m)
      if (
        !caixaMontante ||
        !caixaJusante ||
        caixaMontante.cota_terreno == null ||
        caixaJusante.cota_terreno == null ||
        t.cota_fundo_montante == null ||
        t.cota_fundo_jusante == null ||
        !item ||
        item.largura_escavacao_m == null ||
        item.talude_escavacao_hv == null ||
        item.altura_berco_m == null
      ) {
        mapa.set(t.id, null)
        continue
      }
      const params: ParametrosEscavacao = {
        larguraFundoM: item.largura_escavacao_m,
        taludeHv: item.talude_escavacao_hv,
        alturaBercoM: item.altura_berco_m,
      }
      const diametroExternoM = t.diametro_m + 2 * (item.espessura_parede_m ?? 0)
      const r = calcularVolumesTrecho(
        t.comprimento_m,
        caixaMontante.cota_terreno,
        t.cota_fundo_montante,
        caixaJusante.cota_terreno,
        t.cota_fundo_jusante,
        diametroExternoM,
        params
      )
      mapa.set(t.id, { escavacao: r.volumeEscavacaoM3, berco: r.volumeBercoM3, reaterro: r.volumeReaterroM3 })
    }
    return mapa
  }, [trechos, caixaPorId, biblioteca])

  // Degrau de energia (informativo, memória de cálculo) — só faz sentido quando há mudança de
  // diâmetro entre a(s) entrada(s) e a saída (mesmo critério do cálculo persistido, ver
  // calcularCotasPorEnergia em engine/energia.ts); sem mudança de diâmetro a cota é só
  // continuação simples, não há "degrau de energia" a mostrar. Quando há mudança, usa a
  // entrada de MENOR ENERGIA (EGL) como referência — não necessariamente a de menor cota —
  // calculado pela fórmula bruta, SEM o limite anti-represamento aplicado no cálculo
  // persistido (que nunca deixa a cota subir pra não represar água na caixa). Aqui é só pra
  // mostrar o que a energia "pediria": positivo = degrau pra baixo (aplicado normalmente);
  // negativo = a energia pediria SUBIR a cota (não é aplicado — fica só como registro).
  const TOLERANCIA_DIAMETRO_ENERGIA_M = 0.001
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
      const houveMudancaDiametro = entradas.some((e) => Math.abs(e.diametro_m - t.diametro_m) > TOLERANCIA_DIAMETRO_ENERGIA_M)
      if (entradas.length === 0 || !houveMudancaDiametro) {
        mapa.set(t.id, null)
        continue
      }
      let entradaMenorEnergia: TrechoRecord | null = null
      let menorEgl = Infinity
      for (const e of entradas) {
        const laminaEntrada = laminaPorTrechoResultado.get(e.id)
        const velocidadeEntrada = velocidadePorTrechoResultado.get(e.id)
        if (laminaEntrada == null || velocidadeEntrada == null) continue
        const egl = calcularLinhaEnergia(e.cota_fundo_jusante as number, laminaEntrada, velocidadeEntrada)
        if (egl < menorEgl) {
          menorEgl = egl
          entradaMenorEnergia = e
        }
      }
      if (!entradaMenorEnergia) {
        mapa.set(t.id, null)
        continue
      }
      const cotaEscolhida = entradaMenorEnergia.cota_fundo_jusante as number
      const candidato = calcularCotaMontantePorEnergia(
        cotaEscolhida,
        laminaPorTrechoResultado.get(entradaMenorEnergia.id) as number,
        velocidadePorTrechoResultado.get(entradaMenorEnergia.id) as number,
        laminaSaida,
        velocidadeSaida
      )
      mapa.set(t.id, cotaEscolhida - candidato)
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

  // Monta os valores de cada linha das tabelas em tela — extraído pra função
  // (em vez de inline no JSX) pra poder ser reaproveitado 1:1 pelo export em
  // PDF (exportarTabelaRedePluvialPdf), sem duplicar a lógica de cálculo.
  const montarValoresMemorial = (r: LinhaResultado): Record<Exclude<ColunaMemorialKey, 'conformidade'>, string> => {
    const trecho = trechoPorId.get(r.trecho_id)
    const tcPercurso = trecho && r.velocidade_ms ? trecho.comprimento_m / r.velocidade_ms / 60 : null
    const tcProximo = trecho ? (tcPorCaixaFinal.get(trecho.caixa_jusante_id) ?? null) : null
    const cotaEnergiaMontante =
      trecho?.cota_fundo_montante != null && r.lamina_m != null && r.velocidade_ms != null
        ? calcularLinhaEnergia(trecho.cota_fundo_montante, r.lamina_m, r.velocidade_ms)
        : null
    const cotaEnergiaJusante =
      trecho?.cota_fundo_jusante != null && r.lamina_m != null && r.velocidade_ms != null
        ? calcularLinhaEnergia(trecho.cota_fundo_jusante, r.lamina_m, r.velocidade_ms)
        : null
    return {
      trecho: nomeTrechoPorId.get(r.trecho_id) ?? r.trecho_nome,
      sistema: formatSistema(redePorTrecho.get(r.trecho_id)),
      caixaMontante: trecho
        ? (nomeCaixaPorId.get(trecho.caixa_montante_id) ?? '—') + sufixoRedesQueDesaguam(trecho.caixa_montante_id)
        : '—',
      caixaJusante: trecho
        ? (nomeCaixaPorId.get(trecho.caixa_jusante_id) ?? '—') +
          sufixoDesaguaEmOutroSistema(redePorTrecho.get(r.trecho_id), trecho.caixa_jusante_id)
        : '—',
      ca: r.ca_acumulado?.toFixed(2) ?? '—',
      tc: r.tc_sistema_min?.toFixed(1) ?? '—',
      intensidade: r.intensidade_mm_h?.toFixed(2) ?? '—',
      qProjeto: r.q_projeto_m3s != null ? (r.q_projeto_m3s * 1000).toFixed(2) : '—',
      diametro: trecho?.diametro_m.toFixed(3) ?? '—',
      extensao: trecho?.comprimento_m.toFixed(2) ?? '—',
      inclinacao: trecho?.declividade_m_m.toFixed(4) ?? '—',
      velocidade: r.velocidade_ms?.toFixed(2) ?? '—',
      yd: r.y_sobre_d_pct != null ? `${r.y_sobre_d_pct.toFixed(0)}%` : '—',
      tcPercurso: tcPercurso != null ? tcPercurso.toFixed(1) : '—',
      tcProximo: tcProximo != null ? tcProximo.toFixed(1) : '—',
      cotaEnergiaMontante: cotaEnergiaMontante != null ? cotaEnergiaMontante.toFixed(3) : '—',
      cotaEnergiaJusante: cotaEnergiaJusante != null ? cotaEnergiaJusante.toFixed(3) : '—',
    }
  }

  /** Texto puro da conformidade (com motivo e sugestão) — em tela isso vira ícone + parágrafos; no PDF é uma célula de texto. */
  const montarConformidadeTexto = (r: LinhaResultado): string => {
    if (r.conforme) return 'Conforme'
    const partes = [`Não conforme${r.motivo_nao_conformidade ? ' — ' + r.motivo_nao_conformidade : ''}`]
    const s = sugestoesPorTrecho.get(r.trecho_id)
    if (s && (s.diametroM != null || s.declividadeMM != null)) {
      const sugestaoPartes: string[] = []
      if (s.diametroM != null) sugestaoPartes.push(`Ø ${s.diametroM.toFixed(3)} m`)
      if (s.declividadeMM != null) sugestaoPartes.push(`i ${s.declividadeMM.toFixed(4)} m/m`)
      partes.push(`Sugestão: ${sugestaoPartes.join(' ou ')}`)
    }
    return partes.join(' · ')
  }

  interface LinhaInterligacao {
    tipo: 'interligacao'
    id: string
    caixaId: string
    sistemaOrigem: number
    ca: number
    q: number
  }
  type LinhaExibicaoMemorial = { tipo: 'trecho'; resultado: LinhaResultado } | LinhaInterligacao

  // Quando a tabela está filtrada por um único sistema, o trecho que traz água de OUTRO
  // sistema fica de fora do filtro — sem isso, o ΣC×A/vazão dá um salto na confluência sem
  // nenhuma linha explicando de onde veio. Insere uma linha sintética ali, com "Caixa
  // montante" = o nome do sistema de origem, só quando "Todos os sistemas" não está selecionado
  // (nesse caso o trecho real já aparece normalmente, a interligação ficaria redundante).
  const linhasExibicaoMemorial = useMemo((): LinhaExibicaoMemorial[] => {
    if (redeSelecionada === 'todas') return resultadosOrdenados.map((r) => ({ tipo: 'trecho' as const, resultado: r }))
    const linhas: LinhaExibicaoMemorial[] = []
    const jaInserido = new Set<string>()
    for (const r of resultadosOrdenados) {
      const trecho = trechoPorId.get(r.trecho_id)
      if (trecho) {
        const caixaM = trecho.caixa_montante_id
        const outras = redesQueDesaguamPorCaixa.get(caixaM)
        if (outras && outras.length > 0 && !jaInserido.has(caixaM)) {
          jaInserido.add(caixaM)
          for (const sistemaOrigem of outras) {
            const contrib = contribuicaoPorCaixaSistema.get(caixaM)?.get(sistemaOrigem)
            linhas.push({
              tipo: 'interligacao',
              id: `interligacao-${caixaM}-${sistemaOrigem}`,
              caixaId: caixaM,
              sistemaOrigem,
              ca: contrib?.ca ?? 0,
              q: contrib?.q ?? 0,
            })
          }
        }
      }
      linhas.push({ tipo: 'trecho', resultado: r })
    }
    return linhas
  }, [resultadosOrdenados, redeSelecionada, trechoPorId, redesQueDesaguamPorCaixa, contribuicaoPorCaixaSistema])

  const montarValoresInterligacao = (linha: LinhaInterligacao): Record<Exclude<ColunaMemorialKey, 'conformidade'>, string> => ({
    trecho: '— (interligação)',
    sistema: '—',
    caixaMontante: formatSistema(linha.sistemaOrigem),
    caixaJusante: nomeCaixaPorId.get(linha.caixaId) ?? '—',
    ca: linha.ca.toFixed(2),
    tc: '—',
    intensidade: '—',
    qProjeto: (linha.q * 1000).toFixed(2),
    diametro: '—',
    extensao: '—',
    inclinacao: '—',
    velocidade: '—',
    yd: '—',
    tcPercurso: '—',
    tcProximo: '—',
    cotaEnergiaMontante: '—',
    cotaEnergiaJusante: '—',
  })

  const montarValoresNotaServico = (t: TrechoRecord): Record<ColunaNotaServicoKey, string> => {
    const caixaMontante = caixaPorId.get(t.caixa_montante_id)
    const caixaJusante = caixaPorId.get(t.caixa_jusante_id)
    return {
      trecho: nomeTrechoPorId.get(t.id) ?? t.nome,
      sistema: formatSistema(redePorTrecho.get(t.id)),
      caixaMontante: (nomeCaixaPorId.get(t.caixa_montante_id) ?? '—') + sufixoRedesQueDesaguam(t.caixa_montante_id),
      caixaJusante:
        (nomeCaixaPorId.get(t.caixa_jusante_id) ?? '—') + sufixoDesaguaEmOutroSistema(redePorTrecho.get(t.id), t.caixa_jusante_id),
      diametro: t.diametro_m.toFixed(3),
      extensao: t.comprimento_m.toFixed(2),
      inclinacao: t.declividade_m_m.toFixed(4),
      ctMontante: caixaMontante?.cota_terreno?.toFixed(3) ?? '—',
      ctJusante: caixaJusante?.cota_terreno?.toFixed(3) ?? '—',
      fitMontante: t.cota_fundo_montante?.toFixed(3) ?? '—',
      fitJusante: t.cota_fundo_jusante?.toFixed(3) ?? '—',
      xMontante: caixaMontante?.x?.toFixed(3) ?? '—',
      yMontante: caixaMontante?.y?.toFixed(3) ?? '—',
      xJusante: caixaJusante?.x?.toFixed(3) ?? '—',
      yJusante: caixaJusante?.y?.toFixed(3) ?? '—',
    }
  }

  const montarValoresQuantidade = (t: TrechoRecord): Record<ColunaQuantidadeKey, string> => {
    const volumes = volumesPorTrecho.get(t.id)
    return {
      trecho: nomeTrechoPorId.get(t.id) ?? t.nome,
      sistema: formatSistema(redePorTrecho.get(t.id)),
      caixaMontante: (nomeCaixaPorId.get(t.caixa_montante_id) ?? '—') + sufixoRedesQueDesaguam(t.caixa_montante_id),
      caixaJusante:
        (nomeCaixaPorId.get(t.caixa_jusante_id) ?? '—') + sufixoDesaguaEmOutroSistema(redePorTrecho.get(t.id), t.caixa_jusante_id),
      diametro: t.diametro_m.toFixed(3),
      extensao: t.comprimento_m.toFixed(2),
      volEscavacao: volumes ? volumes.escavacao.toFixed(2) : '—',
      volBerco: volumes ? volumes.berco.toFixed(2) : '—',
      volReaterro: volumes ? volumes.reaterro.toFixed(2) : '—',
    }
  }

  const sistemaLabel =
    redeSelecionada === 'todas' ? `Todos os sistemas (${numerosRedeDisponiveis.length})` : `Sistema ${String(redeSelecionada).padStart(2, '0')}`

  const handleExportarPdf = () => {
    if (!revisaoAtiva) return
    const nomeBase = `${revisaoAtiva.projeto_nome ?? 'projeto'}-${revisaoAtiva.nome}`
    if (aba === 'memorial') {
      exportarTabelaRedePluvialPdf({
        projetoNome: revisaoAtiva.projeto_nome ?? 'Sem projeto',
        revisaoNome: revisaoAtiva.nome,
        sistemaLabel,
        tituloTabela: 'Memorial Justificativo',
        colunas: COLUNAS_MEMORIAL.filter((c) => !colunasOcultas.has(c.key)),
        linhas: linhasExibicaoMemorial.map((linha) =>
          linha.tipo === 'trecho'
            ? { ...montarValoresMemorial(linha.resultado), conformidade: montarConformidadeTexto(linha.resultado) }
            : { ...montarValoresInterligacao(linha), conformidade: '—' }
        ),
        nomeArquivo: `memorial-justificativo-${nomeBase}`,
      })
    } else if (aba === 'notaServico') {
      exportarTabelaRedePluvialPdf({
        projetoNome: revisaoAtiva.projeto_nome ?? 'Sem projeto',
        revisaoNome: revisaoAtiva.nome,
        sistemaLabel,
        tituloTabela: 'Nota de Serviço',
        colunas: COLUNAS_NOTA_SERVICO.filter((c) => !colunasOcultasNotaServico.has(c.key)),
        linhas: trechosOrdenados.map((t) => montarValoresNotaServico(t)),
        nomeArquivo: `nota-de-servico-${nomeBase}`,
      })
    } else {
      exportarTabelaRedePluvialPdf({
        projetoNome: revisaoAtiva.projeto_nome ?? 'Sem projeto',
        revisaoNome: revisaoAtiva.nome,
        sistemaLabel,
        tituloTabela: 'Quantitativo de materiais',
        colunas: COLUNAS_QUANTIDADE.filter((c) => !colunasOcultasQuantidade.has(c.key)),
        linhas: trechosOrdenados.map((t) => montarValoresQuantidade(t)),
        nomeArquivo: `quantitativo-${nomeBase}`,
      })
    }
  }

  const [gerandoRelatorioCompleto, setGerandoRelatorioCompleto] = useState(false)

  /**
   * Relatório completo do projeto: diagramas (tronco + completo), memorial justificativo, nota
   * de serviço, quantidade + resumo por item, critérios adotados, e a memória de cálculo de todo
   * estudo de sarjeta crítica/sarjetão já salvo na revisão -- um PDF só (ver
   * exportRelatorioCompletoPdf.ts). Sempre com escopo de rede INTEIRA/todos os sistemas,
   * independente do filtro "só rede tronco"/"sistema" ativo na tela no momento (esses filtros são
   * só pra navegação em tela) -- por isso monta as listas de novo aqui em vez de reaproveitar
   * resultadosOrdenados/trechosOrdenados (que já vêm filtrados).
   */
  const handleGerarRelatorioCompleto = async () => {
    if (!revisaoAtiva) return
    setGerandoRelatorioCompleto(true)
    setError(null)
    try {
      const [sarjetasRegistros, sarjetoesRegistros] = await Promise.all([
        listResultadosSarjeta(revisaoAtiva.id),
        listResultadosSarjetao(revisaoAtiva.id),
      ])

      const sarjetasCriticas = sarjetasRegistros.map((h) => {
        const { memorial, parametros } = construirMemorialSarjetaCritica(h)
        return {
          nomeVia: h.nome_via,
          projetoNome: revisaoAtiva.projeto_nome ?? 'Sem projeto',
          revisaoNome: revisaoAtiva.nome,
          equacaoNome: equacao?.nome ?? null,
          tempoRetornoAnos: revisaoAtiva.tempo_retorno_anos ?? 10,
          intensidadeMmH: h.intensidade_mm_h,
          parametros,
          memorial,
        }
      })

      // recalcularSarjetaoDoRegistro precisa da equação IDF da revisão (não persistida no
      // registro) -- sem equação vinculada, não dá pra regerar o memorial desses estudos.
      const sarjetoes = equacao
        ? sarjetoesRegistros.map((h) => ({
            nomeTrecho: h.nome_trecho,
            projetoNome: revisaoAtiva.projeto_nome ?? 'Sem projeto',
            revisaoNome: revisaoAtiva.nome,
            equacaoNome: equacao.nome,
            tempoRetornoAnos: h.tempo_retorno_anos,
            parametros: parametrosExibicaoDoRegistroSarjetao(h),
            memorial: recalcularSarjetaoDoRegistro(h, equacao),
          }))
        : []
      if (!equacao && sarjetoesRegistros.length > 0) {
        setError(
          `A revisão não tem equação IDF vinculada -- ${sarjetoesRegistros.length} estudo(s) de sarjetão foram deixados de fora do relatório.`
        )
      }

      const posicao = (id: string) => ordemTrechos.get(id) ?? Number.MAX_SAFE_INTEGER
      // Escada hidráulica sai do memorial (mesmo critério da tela, ver idsEscadaHidraulica) --
      // continua em nota de serviço e quantidade normalmente.
      const resultadosCompletos = [...resultados]
        .filter((r) => !idsEscadaHidraulica.has(r.trecho_id))
        .sort((a, b) => posicao(a.trecho_id) - posicao(b.trecho_id))
      const trechosCompletos = [...trechos].sort((a, b) => posicao(a.id) - posicao(b.id))

      const memorial = {
        colunas: COLUNAS_MEMORIAL,
        linhas: resultadosCompletos.map((r) => ({ ...montarValoresMemorial(r), conformidade: montarConformidadeTexto(r) })),
      }
      const notaServico = { colunas: COLUNAS_NOTA_SERVICO, linhas: trechosCompletos.map((t) => montarValoresNotaServico(t)) }
      const quantidade = { colunas: COLUNAS_QUANTIDADE, linhas: trechosCompletos.map((t) => montarValoresQuantidade(t)) }

      const resumoItens = agruparQuantidadesPorItem(
        trechos.map((t) => {
          const volumes = volumesPorTrecho.get(t.id)
          return {
            material: t.material,
            diametroM: t.diametro_m,
            comprimentoM: t.comprimento_m,
            volumeEscavacaoM3: volumes?.escavacao ?? 0,
            volumeBercoM3: volumes?.berco ?? 0,
            volumeReaterroM3: volumes?.reaterro ?? 0,
          }
        })
      )
      const resumoQuantidade = {
        colunas: [
          { key: 'material', label: 'Material' },
          { key: 'diametro', label: 'Diâm. (m)' },
          { key: 'quantidade', label: 'Qtd. trechos' },
          { key: 'extensao', label: 'Extensão total (m)' },
          { key: 'volEscavacao', label: 'Vol. escavação total (m³)' },
          { key: 'volBerco', label: 'Vol. berço total (m³)' },
          { key: 'volReaterro', label: 'Vol. reaterro total (m³)' },
        ],
        linhas: resumoItens.map((r) => ({
          material: r.material,
          diametro: r.diametroM.toFixed(3),
          quantidade: String(r.quantidade),
          extensao: r.comprimentoTotalM.toFixed(2),
          volEscavacao: r.volumeEscavacaoTotalM3.toFixed(2),
          volBerco: r.volumeBercoTotalM3.toFixed(2),
          volReaterro: r.volumeReaterroTotalM3.toFixed(2),
        })),
      }

      const svgCompleto = gerarSvgDiagrama(
        caixas.map((c) => ({ id: c.id, x: c.x, y: c.y })),
        trechos.map((t) => ({ id: t.id, caixa_montante_id: t.caixa_montante_id, caixa_jusante_id: t.caixa_jusante_id })),
        conformidadePorTrecho
      )
      const trechosTronco = trechos.filter((t) => troncoIds.has(t.id))
      const idsCaixasTronco = new Set(trechosTronco.flatMap((t) => [t.caixa_montante_id, t.caixa_jusante_id]))
      const svgTronco = gerarSvgDiagrama(
        caixas.filter((c) => idsCaixasTronco.has(c.id)).map((c) => ({ id: c.id, x: c.x, y: c.y })),
        trechosTronco.map((t) => ({ id: t.id, caixa_montante_id: t.caixa_montante_id, caixa_jusante_id: t.caixa_jusante_id })),
        conformidadePorTrecho
      )
      const alturaFluxoPadraoM = (ALTURA_FLUXO_MINIMA_M + ALTURA_FLUXO_MAXIMA_M) / 2
      const qProjetoPorTrecho = new Map(resultados.map((r) => [r.trecho_id, r.q_projeto_m3s]))
      const escadasHidraulicas = trechos
        .filter((t) => t.eh_escada_hidraulica)
        .map((t) => {
          const item = acharItemBiblioteca(biblioteca, t.material, t.diametro_m)
          const diametroExternoM = item?.espessura_parede_m != null ? t.diametro_m + 2 * item.espessura_parede_m : t.diametro_m
          return {
            nomeTrecho: nomeTrechoPorId.get(t.id) ?? t.nome,
            caixaMontante: nomeCaixaPorId.get(t.caixa_montante_id) ?? '—',
            caixaJusante: nomeCaixaPorId.get(t.caixa_jusante_id) ?? '—',
            larguraM: t.escada_largura_m ?? larguraMinimaEscadaM(diametroExternoM),
            alturaFluxoM: t.escada_altura_fluxo_m ?? alturaFluxoPadraoM,
            diametroExternoTuboChegadaM: diametroExternoM,
            qProjetoM3s: qProjetoPorTrecho.get(t.id) ?? null,
          }
        })

      const [diagramaCompleto, diagramaTronco, clienteNome, logo] = await Promise.all([
        svgCompleto ? rasterizarSvgParaPngDataUrl(svgCompleto) : Promise.resolve(null),
        svgTronco ? rasterizarSvgParaPngDataUrl(svgTronco) : Promise.resolve(null),
        revisaoAtiva.projeto_id
          ? getProjetoDetail(revisaoAtiva.projeto_id)
              .then((p) => p.cliente_nome)
              .catch(() => null)
          : Promise.resolve(null),
        carregarLogoParaPdf(),
      ])

      gerarRelatorioCompletoPdf({
        clienteNome,
        projetoNome: revisaoAtiva.projeto_nome ?? 'Sem projeto',
        revisaoNome: revisaoAtiva.nome,
        equacaoIdf: equacao,
        tempoRetornoAnos: revisaoAtiva.tempo_retorno_anos ?? 10,
        qtdCaixas: caixas.length,
        qtdTrechos: trechos.length,
        qtdBacias: bacias.length,
        logo,
        diagramaTronco,
        diagramaCompleto,
        memorial,
        notaServico,
        quantidade,
        resumoQuantidade,
        criterios: {
          limiteYD: limites.limiteYD,
          velMinMs: limites.velMinMs,
          velMaxMs: limites.velMaxMs,
          declMinMM: limites.declMinMM,
          declMaxMM: limites.declMaxMM,
          diametroMinTroncoM: limites.diametroMinTroncoM,
          diametroMinRamalM: limites.diametroMinRamalM,
          energiaSoTronco: limites.energiaSoTronco,
          recobrimentoMinimoM: limites.recobrimentoMinimoM,
        },
        materiaisManning,
        bibliotecaPecas: biblioteca,
        escadasHidraulicas,
        sarjetasCriticas,
        sarjetoes,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar o relatório completo.')
    } finally {
      setGerandoRelatorioCompleto(false)
    }
  }

  const resultadoModal = trechoModalId ? (resultados.find((r) => r.trecho_id === trechoModalId) ?? null) : null
  const trechoModal = trechoModalId ? (trechos.find((t) => t.id === trechoModalId) ?? null) : null
  const sugestaoModal = trechoModalId ? (sugestoesPorTrecho.get(trechoModalId) ?? null) : null

  // Navegação anterior/próximo no modal segue a mesma ordem de fluxo da tabela (tronco primeiro
  // em cada confluência, ver ordenarTrechosPorFluxo) — respeita os filtros ativos no momento
  // (rede tronco/sistema/só não conformes), já que resultadosOrdenados já vem filtrado por eles.
  // Usa a POSIÇÃO do trecho aberto (não o índice dele dentro do array já filtrado) pra achar
  // vizinho — assim, se editar o trecho aberto fizer ele ficar conforme e sair da lista (com "só
  // não conformes" ligado), "Próximo" ainda acha o não conforme seguinte em vez de travar.
  const posicaoModal = trechoModalId ? (ordemTrechos.get(trechoModalId) ?? -1) : -1
  const trechoAnteriorId =
    posicaoModal >= 0
      ? (resultadosOrdenados
          .filter((r) => (ordemTrechos.get(r.trecho_id) ?? -1) < posicaoModal)
          .at(-1)?.trecho_id ?? null)
      : null
  const trechoProximoId =
    posicaoModal >= 0
      ? (resultadosOrdenados.find((r) => (ordemTrechos.get(r.trecho_id) ?? Number.MAX_SAFE_INTEGER) > posicaoModal)?.trecho_id ?? null)
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

      {caixasSemJusante.length > 0 && (
        <div className="mb-4 rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3">
          <div className="mb-1.5 text-sm font-medium text-accent-amber">
            {caixasSemJusante.length} caixa(s) sem jusante definida
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-accent-amber">
            {caixasSemJusante.map((c) => (
              <li key={c.id}>
                Não há jusante definido para caixa {c.nome}
                {c.sistema != null ? ` (${formatSistema(c.sistema)})` : ''} — confira se é a saída real do terreno ou se ficou um vínculo
                quebrado na importação.
              </li>
            ))}
          </ul>
        </div>
      )}

      {caixasIsoladas.length > 0 && (
        <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3">
          <div className="mb-1.5 text-sm font-medium text-accent-red">
            {caixasIsoladas.length} caixa(s) sem nenhum trecho ligado
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-accent-red">
            {caixasIsoladas.map((c) => (
              <li key={c.id}>
                {c.nome} não tem tubo ligado nem a montante nem a jusante — erro de vínculo na importação (estrutura ficou solta).
              </li>
            ))}
          </ul>
        </div>
      )}

      {caixasComMultiplasSaidas.length > 0 && (
        <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3">
          <div className="mb-1.5 text-sm font-medium text-accent-red">
            {caixasComMultiplasSaidas.length} caixa(s) com mais de um trecho de saída
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-accent-red">
            {caixasComMultiplasSaidas.map((c) => (
              <li key={c.id}>
                {c.nome} tem {c.quantidade} trechos saindo dela — a rede assume no máximo 1 saída por caixa; com mais de uma, o resultado
                de Sistema/rede tronco/vazão acumulada fica indefinido ali. Corrija o vínculo no Civil 3D.
              </li>
            ))}
          </ul>
        </div>
      )}

      {caixasRecebeVazaoSemCaptacao.length > 0 && (
        <div className="mb-4 rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3">
          <div className="mb-1.5 text-sm font-medium text-accent-amber">
            {caixasRecebeVazaoSemCaptacao.length} caixa(s) marcada(s) "recebe vazão" sem nenhuma bacia vinculada
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-accent-amber">
            {caixasRecebeVazaoSemCaptacao.map((c) => (
              <li key={c.id}>
                {c.nome} está marcada como "recebe vazão" mas não tem nenhuma bacia vinculada em Cadastros → Bacias — provavelmente falta
                a captação, ou ela não devia estar marcada como "recebe vazão".
              </li>
            ))}
          </ul>
        </div>
      )}

      {(violacoesRecobrimento.length > 0 || limites.recobrimentoMinimoM > 0) && (
        <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-accent-red">
              {violacoesRecobrimento.length > 0
                ? `${violacoesRecobrimento.length} extremidade(s) de trecho com recobrimento insuficiente`
                : 'Nenhuma extremidade com recobrimento insuficiente'}
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs text-text-secondary">
                Mínimo p/ alertar (m)
                <input
                  type="number"
                  step="0.05"
                  value={limites.recobrimentoMinimoM}
                  onChange={(e) => setLimites({ ...limites, recobrimentoMinimoM: Number(e.target.value) })}
                  className="w-16 rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-text-primary"
                />
              </label>
              {violacoesRecobrimento.length > 0 && (
                <button
                  type="button"
                  onClick={handleCorrigirRecobrimento}
                  disabled={corrigindoRecobrimento}
                  className={SMALL_BTN}
                >
                  {corrigindoRecobrimento ? 'Corrigindo...' : 'Corrigir recobrimento automaticamente'}
                </button>
              )}
            </div>
          </div>
          {violacoesRecobrimento.length > 0 && (
            <ul className="list-inside list-disc space-y-0.5 text-xs text-accent-red">
              {violacoesRecobrimento.map((v) => (
                <li key={`${v.trechoId}-${v.extremidade}`}>
                  {v.nomeTrecho} ({v.extremidade} em {v.nomeCaixa}): recobrimento de {v.recobrimentoM.toFixed(2)} m
                  {v.recobrimentoM < 0 ? ' — tubo acima da cota de terreno (provável erro de importação do Civil 3D).' : ' — abaixo do mínimo configurado acima.'}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1 text-xs text-text-secondary">
            Padrão (0 m) só acusa o caso impossível: tubo acima da cota de terreno. Suba o valor pra também flagar cobertura positiva
            abaixo do mínimo de projeto da via/passeio. "Corrigir recobrimento automaticamente" ajusta a rede inteira numa passada só:
            empurra a cota nas cabeceiras, eleva toda declividade abaixo do mínimo cadastrado em Critérios de conformidade ({limites.declMinMM} m/m)
            e aumenta ainda mais onde precisar pra vencer o recobrimento -- inclusive nos trechos jusante, sem precisar rodar de novo.
            Confira depois os critérios de velocidade e y/D, já que declividades mais íngremes podem mudar esses resultados.
          </div>
        </div>
      )}

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
          <Field label="Diâm. mín rede tronco (m)">
            <input
              type="number"
              step="any"
              className={`${fieldInputClass} py-1.5`}
              value={limites.diametroMinTroncoM}
              onChange={(e) => setLimites({ ...limites, diametroMinTroncoM: Number(e.target.value) })}
            />
          </Field>
          <Field label="Diâm. mín ramal (m)">
            <input
              type="number"
              step="any"
              className={`${fieldInputClass} py-1.5`}
              value={limites.diametroMinRamalM}
              onChange={(e) => setLimites({ ...limites, diametroMinRamalM: Number(e.target.value) })}
            />
          </Field>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-text-secondary" title="Uma boca de lobo (ramal) menor entrando num PV maior da rede tronco não aciona o cálculo por linha de energia -- só continuação simples da cota (degrau zero). Só entra em jogo quando a troca de diâmetro é entre trechos da própria rede tronco.">
          <input
            type="checkbox"
            checked={limites.energiaSoTronco}
            onChange={(e) => setLimites({ ...limites, energiaSoTronco: e.target.checked })}
          />
          Linha de energia (EGL) só considera troca de diâmetro dentro da rede tronco
        </label>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={handleRodar} disabled={running || trechos.length === 0} className={PRIMARY_BTN}>
            {running ? <Loader2 size={16} className="animate-spin" /> : <Droplets size={16} />}
            Rodar cálculo da rede
          </button>
          <button
            onClick={handleAtualizar}
            disabled={atualizando || !revisaoAtiva}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-secondary shadow-sm transition hover:text-text-primary disabled:opacity-60"
            title="Rebusca caixas, trechos e resultados do banco -- útil se o cálculo rodou em outra aba/sessão ou se algo foi corrigido por fora enquanto esta tela ficou aberta."
          >
            {atualizando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Atualizar dados
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
          {caixas.length > 0 && trechos.length > 0 && (
            <button
              onClick={handleGerarRelatorioCompleto}
              disabled={gerandoRelatorioCompleto}
              className={PRIMARY_BTN}
              title="Um PDF só: diagramas da rede tronco e completa, memorial justificativo, nota de serviço, quantidade (com resumo por item), critérios adotados (equação IDF, materiais, biblioteca de peças, declividade/recobrimento mínimos) e a memória de cálculo de toda sarjeta crítica/sarjetão já salvo nesta revisão."
            >
              {gerandoRelatorioCompleto ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />}
              {gerandoRelatorioCompleto ? 'Gerando relatório...' : 'Relatório completo do projeto'}
            </button>
          )}
        </div>
      </div>

      {trechos.length > 0 && (
        <div className="mb-6 rounded-lg border border-border bg-surface p-4">
          <div className="mb-1 font-sans text-sm font-semibold text-text-primary">Recalcular perfil da rede</div>
          <p className="mb-3 text-xs text-text-secondary">
            Aplica uma declividade e um recobrimento únicos a partir de cada cabeceira, sobrepondo as cotas de fundo/topo que vieram do
            Civil 3D — útil pra testar rápido um perfil alternativo sem editar trecho a trecho nem voltar pro CAD.{' '}
            {redeSelecionada === 'todas' ? 'Escopo: rede inteira.' : `Escopo: só ${formatSistema(redeSelecionada)} (filtro atual).`}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Declividade uniforme (%)">
              <input
                type="number"
                step="any"
                className={`${fieldInputClass} py-1.5`}
                value={declividadePerfilPct}
                onChange={(e) => setDeclividadePerfilPct(e.target.value)}
              />
            </Field>
            <Field label="Recobrimento na cabeceira (m)">
              <input
                type="number"
                step="any"
                className={`${fieldInputClass} py-1.5`}
                value={recobrimentoPerfil}
                onChange={(e) => setRecobrimentoPerfil(e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-3">
            <button onClick={handleCalcularPerfil} className={SECONDARY_BTN}>
              Calcular
            </button>
          </div>

          {perfilPendente && (
            <div className="mt-3 rounded-md border border-accent-amber/40 bg-accent-amber/5 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-primary">
                <AlertTriangle size={16} className="text-accent-amber shrink-0" />
                Isso vai sobrescrever declividade e cotas de {perfilPendente.patches.length} trecho(s). Não tem desfazer automático —
                exportar/reimportar o LandXML original é o jeito de voltar atrás.
              </div>
              {perfilPendente.cabeceirasSemCotaTerreno.length > 0 && (
                <div className="mb-2 text-xs text-accent-amber">
                  {perfilPendente.cabeceirasSemCotaTerreno.length} cabeceira(s) sem cota de terreno cadastrada ficaram de fora (e tudo a
                  jusante delas também) — preencha a cota de terreno nelas em Rede Importada pra incluí-las.
                </div>
              )}
              <div className="flex items-center gap-2">
                <button onClick={handleAplicarPerfil} disabled={aplicandoPerfil} className={SMALL_BTN}>
                  {aplicandoPerfil && <Loader2 size={14} className="animate-spin" />}
                  Aplicar
                </button>
                <button onClick={() => setPerfilPendente(null)} className="text-xs text-text-secondary hover:text-text-primary">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {trechos.length > 0 && (
        <div className="mb-6 rounded-lg border border-border bg-surface p-4">
          <div className="mb-1 font-sans text-sm font-semibold text-text-primary">Renomear material em lote</div>
          <p className="mb-3 text-xs text-text-secondary">
            Troca o texto do material de vários trechos de uma vez -- útil pra unificar grafias diferentes vindas do Civil 3D (ex.:
            "CONCRETO" e "Reinforced Concrete" não batem com o mesmo item da biblioteca de peças nem da tabela de Manning, mesmo sendo o
            mesmo material) ou pra converter a rede inteira pra um estudo alternativo (ex.: refazer em PEAD). Também atualiza o Manning n
            dos trechos afetados que não foram editados manualmente, se o material novo já estiver cadastrado em Materiais e rugosidade.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={`Material atual (${qtdTrechosMaterialOrigem} trecho(s))`}>
              <select value={materialOrigem} onChange={(e) => setMaterialOrigem(e.target.value)} className={`${fieldInputClass} py-1.5`}>
                <option value="__todos__">(todos os trechos)</option>
                {materiaisDistintos.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Material novo">
              <input
                type="text"
                value={materialDestino}
                onChange={(e) => setMaterialDestino(e.target.value)}
                placeholder="ex.: CONCRETO"
                className={`${fieldInputClass} py-1.5`}
              />
            </Field>
            <div className="flex items-end">
              <button
                onClick={handleRenomearMaterial}
                disabled={renomeandoMaterial || !materialDestino.trim() || qtdTrechosMaterialOrigem === 0}
                className={SECONDARY_BTN}
              >
                {renomeandoMaterial && <Loader2 size={14} className="animate-spin" />}
                Aplicar a {qtdTrechosMaterialOrigem} trecho(s)
              </button>
            </div>
          </div>
        </div>
      )}

      {resultados.length > 0 && (balanceamento.saidasFinais.length > 0 || balanceamento.confluenciasSuspeitas.length > 0) && (
        <div className="mb-6 rounded-lg border border-border bg-surface p-4">
          <button onClick={() => setMostrarBalanceamento((v) => !v)} className="flex w-full items-center justify-between text-left">
            <div className="flex items-center gap-2">
              <Scale size={16} className="text-text-secondary" />
              <span className="font-sans text-sm font-semibold text-text-primary">Balanceamento entre sistemas</span>
              <span className="text-xs text-text-secondary">
                ({balanceamento.saidasFinais.length} saída(s) JUS, {balanceamento.confluenciasSuspeitas.length} confluência(s) com degrau
                relevante)
              </span>
            </div>
            <span className="text-xs text-text-secondary">{mostrarBalanceamento ? 'Ocultar' : 'Mostrar'}</span>
          </button>

          {mostrarBalanceamento && (
            <div className="mt-4">
              <p className="mb-3 text-xs leading-relaxed text-text-secondary">
                Sugestão heurística baseada em distância em linha reta e cota das caixas já cadastradas — não considera relevo real,
                interferências nem propriedade. Aponta onde vale a pena ESTUDAR uma religação manual, não confirma que é executável;
                confira sempre no Civil 3D antes de aplicar.
              </p>

              {balanceamento.saidasFinais.length > 1 && (
                <div className="mb-4 overflow-x-auto rounded-md border border-border/60">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/60 bg-elevated/50 text-left text-text-secondary">
                        <th className="px-3 py-1.5 font-medium">Saída (JUS)</th>
                        <th className="px-3 py-1.5 font-medium">Sistema</th>
                        <th className="px-3 py-1.5 font-medium">Vazão (L/s)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...balanceamento.saidasFinais]
                        .sort((a, b) => b.vazaoM3s - a.vazaoM3s)
                        .map((s) => {
                          const maiorVazao = Math.max(...balanceamento.saidasFinais.map((x) => x.vazaoM3s))
                          const pct = maiorVazao > 0 ? (s.vazaoM3s / maiorVazao) * 100 : 100
                          return (
                            <tr key={s.trechoId} className="border-b border-border/40 last:border-0">
                              <td className="px-3 py-1.5 text-text-primary">{s.nomeCaixaJus}</td>
                              <td className="px-3 py-1.5 text-text-secondary">{formatSistema(s.sistema)}</td>
                              <td className="px-3 py-1.5 text-text-secondary">
                                {(s.vazaoM3s * 1000).toFixed(2)}
                                {pct < 100 && <span className="ml-1 text-[10px] text-text-secondary/70">({pct.toFixed(0)}% da maior)</span>}
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              )}

              {balanceamento.confluenciasSuspeitas.length > 0 && (
                <ul className="space-y-2">
                  {balanceamento.confluenciasSuspeitas.map((c) => (
                    <li key={`${c.caixaId}-${c.sistemaTributario}`} className="rounded-md border border-border/60 p-2.5 text-xs">
                      <div className="text-text-primary">
                        <span className="font-medium">{c.nomeCaixa}</span>: {formatSistema(c.sistemaTributario)} deságua em{' '}
                        {formatSistema(c.sistemaPrincipal)} pelo trecho {c.nomeTrechoTributario} — degrau de {c.degrauM.toFixed(2)} m,{' '}
                        {(c.vazaoTributariaM3s * 1000).toFixed(2)} L/s.
                      </div>
                      {c.candidatos.length > 0 ? (
                        <ul className="mt-1.5 list-inside list-disc space-y-1 text-accent-blue">
                          {c.candidatos.map((cand) => (
                            <li key={cand.caixaDestinoId}>
                              Estudar religar em <span className="font-medium">{cand.nomeCaixaDestino}</span> (grupo{' '}
                              {cand.nomeGrupoDestino}), a {cand.distanciaM.toFixed(0)} m — declividade necessária{' '}
                              {cand.declividadeNecessariaMM.toFixed(4)} m/m. Desbalanceamento cairia de{' '}
                              {(cand.desbalanceamentoAtualM3s * 1000).toFixed(0)} pra {(cand.desbalanceamentoProjetadoM3s * 1000).toFixed(0)}{' '}
                              L/s.
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="mt-1 text-text-secondary">Nenhuma caixa de outro grupo por perto, morro abaixo, melhoraria isso.</div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {caixas.length > 0 && trechos.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
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
          {numerosRedeDisponiveis.length > 1 && (
            <label
              className="flex items-center gap-1.5 text-xs text-text-secondary"
              title="Sistema físico independente (a partir de cada PV de cabeceira), calculado pela topologia -- não confundir com texto tipo &quot;(REDE - 01)&quot; que às vezes já vem no nome das estruturas do Civil3D."
            >
              Sistema:
              <select
                value={redeSelecionada}
                onChange={(e) => setRedeSelecionada(e.target.value === 'todas' ? 'todas' : Number(e.target.value))}
                className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text-primary"
              >
                <option value="todas">Todos ({numerosRedeDisponiveis.length})</option>
                {numerosRedeDisponiveis.map((n) => (
                  <option key={n} value={n}>
                    Sistema {String(n).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </label>
          )}
          {visaoDiagrama === 'tronco' && (
            <div className="text-[11px] text-text-secondary">
              Mostra só a cadeia principal (maior diâmetro em cada confluência) — os ramais menores ficam ocultos na tabela e no diagrama.
            </div>
          )}
        </div>
      )}

      {sistemasForaDoTronco.length > 0 && (
        <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3">
          <div className="mb-1.5 text-sm font-medium text-accent-red">
            {sistemasForaDoTronco.length} sistema(s) inteiro(s) fora da rede tronco
          </div>
          <ul className="list-inside list-disc space-y-1 text-xs text-accent-red">
            {sistemasForaDoTronco.map((s) => (
              <li key={s.sistema}>
                Sistema {String(s.sistema).padStart(2, '0')}: nenhum dos seus {s.numTrechos} trecho(s) aparece na rede tronco (some inteiro
                do filtro "Só rede tronco"), mesmo acumulando até {s.maxCa.toFixed(2)} m² de ΣC×A — confira em Rede Importada se as caixas de
                cabeceira desse sistema não deveriam estar marcadas como rede tronco.
              </li>
            ))}
          </ul>
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

      {trechos.length > 0 && (
        <div className="mb-4 inline-flex rounded-lg border border-border bg-surface p-0.5 text-xs">
          {(
            [
              { key: 'memorial', label: 'Memorial Justificativo', Icon: ClipboardList },
              { key: 'notaServico', label: 'Nota de Serviço', Icon: NotebookText },
              { key: 'quantidade', label: 'Quantidade', Icon: Boxes },
            ] as const
          ).map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setAba(key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
                aba === key ? 'bg-brand text-white' : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      )}

      {trechos.length > 0 &&
        (() => {
          const restaurarInfo =
            aba === 'memorial'
              ? { size: colunasOcultas.size, limpar: () => setColunasOcultas(new Set()) }
              : aba === 'notaServico'
                ? { size: colunasOcultasNotaServico.size, limpar: () => setColunasOcultasNotaServico(new Set()) }
                : { size: colunasOcultasQuantidade.size, limpar: () => setColunasOcultasQuantidade(new Set()) }
          return (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Eye size={13} />
                Clique numa linha pra ver a memória de cálculo do trecho (e editar diâmetro/declividade).
              </div>
              <div className="flex items-center gap-3">
                {aba === 'memorial' && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
                    <input
                      type="checkbox"
                      checked={apenasNaoConformes}
                      onChange={(e) => setApenasNaoConformes(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    Só não conformes ({naoConformesCount})
                  </label>
                )}
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={fonteCompacta}
                    onChange={(e) => setFonteCompacta(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-border"
                  />
                  Fonte compacta (caber mais colunas na tela)
                </label>
                {restaurarInfo.size > 0 && (
                  <button onClick={restaurarInfo.limpar} className="flex items-center gap-1 text-xs text-brand hover:underline">
                    <RotateCcw size={12} />
                    Restaurar {restaurarInfo.size} coluna(s) oculta(s)
                  </button>
                )}
                <button
                  onClick={handleExportarPdf}
                  disabled={aba === 'memorial' ? resultadosOrdenados.length === 0 : trechosOrdenados.length === 0}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary shadow-sm transition hover:text-text-primary disabled:opacity-60"
                  title="Exporta em PDF a tabela desta aba, com as colunas visíveis e o filtro de sistema atuais."
                >
                  <FileDown size={13} />
                  Exportar PDF
                </button>
              </div>
            </div>
          )
        })()}

      {aba === 'memorial' && resultados.length > 0 && (
        <>
          <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-surface">
            <table className={`w-full whitespace-nowrap ${fonteCompacta ? 'text-xs' : 'text-sm'}`}>
              <thead>
                <tr className="border-b border-border bg-elevated text-left text-xs text-text-secondary">
                  {COLUNAS_MEMORIAL.filter((c) => !colunasOcultas.has(c.key)).map((c) => (
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
                {linhasExibicaoMemorial.map((linha) => {
                  const tdBase = fonteCompacta ? 'px-2 py-1' : 'px-4 py-2'

                  if (linha.tipo === 'interligacao') {
                    const valoresInterligacao = montarValoresInterligacao(linha)
                    return (
                      <tr key={linha.id} className="border-b border-border/60 bg-elevated/50 italic last:border-0" title="Vazão recebida de outro sistema, cujo trecho fica fora deste filtro">
                        {COLUNAS_MEMORIAL.filter((c) => !colunasOcultas.has(c.key)).map((c) => (
                          <td key={c.key} className={`${tdBase} text-text-secondary ${c.key === 'trecho' ? 'font-medium' : ''}`}>
                            {c.key === 'conformidade' ? '—' : valoresInterligacao[c.key]}
                          </td>
                        ))}
                        <td className={fonteCompacta ? 'px-2 py-1' : 'px-2 py-2'}></td>
                      </tr>
                    )
                  }

                  const r = linha.resultado
                  const corTexto = r.conforme ? 'text-accent-green' : 'text-accent-red'
                  const degrau = degrauEnergiaPorTrecho.get(r.trecho_id)
                  const valores = montarValoresMemorial(r)
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setTrechoModalId(r.trecho_id)}
                      className="group cursor-pointer border-b border-border/60 last:border-0 hover:bg-elevated/40"
                      title="Ver memória de cálculo"
                    >
                      {COLUNAS_MEMORIAL.filter((c) => !colunasOcultas.has(c.key)).map((c) => {
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
                              c.key === 'cotaEnergiaMontante' && degrau != null && degrau < 0
                                ? `A linha de energia pediria uma cota de fundo montante ${Math.abs(degrau).toFixed(3)}m mais alta aqui, mas isso não foi aplicado (deixaria água represada na caixa) — a cota mostrada já é a aplicada.`
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

      {aba === 'memorial' && resultados.length === 0 && trechos.length > 0 && (
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          Rode o cálculo da rede pra ver o memorial justificativo.
        </div>
      )}

      {aba === 'notaServico' &&
        (trechosOrdenados.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
            Nenhum trecho cadastrado ainda.
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-surface">
            <table className={`w-full whitespace-nowrap ${fonteCompacta ? 'text-xs' : 'text-sm'}`}>
              <thead>
                <tr className="border-b border-border bg-elevated text-left text-xs text-text-secondary">
                  {COLUNAS_NOTA_SERVICO.filter((c) => !colunasOcultasNotaServico.has(c.key)).map((c) => (
                    <th
                      key={c.key}
                      className={`group/th sticky top-0 z-10 bg-elevated align-bottom font-medium ${fonteCompacta ? 'px-2 py-1' : 'px-3 py-2'}`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="block max-w-[90px] whitespace-normal break-words leading-tight">{c.label}</span>
                        <button
                          onClick={() => setColunasOcultasNotaServico((prev) => new Set(prev).add(c.key))}
                          className="shrink-0 text-text-secondary/50 opacity-0 transition hover:text-accent-red group-hover/th:opacity-100"
                          title={`Ocultar coluna "${c.label}"`}
                        >
                          <EyeOff size={12} />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trechosOrdenados.map((t) => {
                  const tdBase = fonteCompacta ? 'px-2 py-1' : 'px-4 py-2'
                  const conforme = conformidadePorTrecho.get(t.id)
                  const corTexto = conforme === true ? 'text-accent-green' : conforme === false ? 'text-accent-red' : 'text-text-secondary'
                  const valores = montarValoresNotaServico(t)
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setTrechoModalId(t.id)}
                      className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-elevated/40"
                      title="Ver memória de cálculo"
                    >
                      {COLUNAS_NOTA_SERVICO.filter((c) => !colunasOcultasNotaServico.has(c.key)).map((c) => (
                        <td key={c.key} className={`${tdBase} ${corTexto} ${c.key === 'trecho' ? 'font-medium' : ''}`}>
                          {valores[c.key]}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}

      {aba === 'quantidade' && (
        <>
          {(() => {
            const semDados = trechosOrdenados.filter((t) => volumesPorTrecho.get(t.id) == null).length
            if (semDados === 0) return null
            return (
              <div className="mb-3 rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3 text-sm text-accent-amber">
                {semDados} trecho(s) sem largura/talude/altura de berço cadastrados na Biblioteca de Peças pro material+diâmetro — volume
                não calculado pra eles.
              </div>
            )
          })()}
          {trechosOrdenados.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
              Nenhum trecho cadastrado ainda.
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-surface">
              <table className={`w-full whitespace-nowrap ${fonteCompacta ? 'text-xs' : 'text-sm'}`}>
                <thead>
                  <tr className="border-b border-border bg-elevated text-left text-xs text-text-secondary">
                    {COLUNAS_QUANTIDADE.filter((c) => !colunasOcultasQuantidade.has(c.key)).map((c) => (
                      <th
                        key={c.key}
                        className={`group/th sticky top-0 z-10 bg-elevated align-bottom font-medium ${fonteCompacta ? 'px-2 py-1' : 'px-3 py-2'}`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="block max-w-[90px] whitespace-normal break-words leading-tight">{c.label}</span>
                          <button
                            onClick={() => setColunasOcultasQuantidade((prev) => new Set(prev).add(c.key))}
                            className="shrink-0 text-text-secondary/50 opacity-0 transition hover:text-accent-red group-hover/th:opacity-100"
                            title={`Ocultar coluna "${c.label}"`}
                          >
                            <EyeOff size={12} />
                          </button>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trechosOrdenados.map((t) => {
                    const tdBase = fonteCompacta ? 'px-2 py-1' : 'px-4 py-2'
                    const volumes = volumesPorTrecho.get(t.id)
                    const conforme = conformidadePorTrecho.get(t.id)
                    const corTexto = conforme === true ? 'text-accent-green' : conforme === false ? 'text-accent-red' : 'text-text-secondary'
                    const valores = montarValoresQuantidade(t)
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setTrechoModalId(t.id)}
                        className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-elevated/40"
                        title="Ver memória de cálculo"
                      >
                        {COLUNAS_QUANTIDADE.filter((c) => !colunasOcultasQuantidade.has(c.key)).map((c) => (
                          <td
                            key={c.key}
                            className={`${tdBase} ${corTexto} ${c.key === 'trecho' ? 'font-medium' : ''}`}
                            title={
                              c.key === 'volEscavacao' && !volumes
                                ? 'Cadastre largura de escavação, talude e altura de berço pra esse material+diâmetro na Biblioteca de Peças.'
                                : undefined
                            }
                          >
                            {valores[c.key]}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {trechoModal && (
        <MemoriaCalculoModal
          resultado={resultadoModal}
          trecho={trechoModal}
          trechos={trechos}
          biblioteca={biblioteca}
          caixas={caixas}
          redePorTrecho={redePorTrecho}
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
