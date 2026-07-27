import { calcularIntensidadeIdf } from '../idf'
import { resolverPorBisseccao } from './bisseccao'
import { calcularCapacidadeHec22, calcularCapacidadeManningGenerica } from './capacidade'
import { calcularEspraiamentoComposto } from './espraiamento'
import { calcularVazaoAfluente } from './racional'
import type {
  CenarioEspraiamento,
  DetalheCenarioEspraiamento,
  FaixaEspraiamentoSarjetao,
  IteracaoTc,
  MemorialSarjetaoDenteServa,
  MetodoCapacidade,
  ParametrosSarjetao,
  ResultadoCapacidade,
  ResultadoMetodoSarjetao,
} from './types'

export * from './types'
export { resolverPorBisseccao } from './bisseccao'
export { calcularCapacidadeManningGenerica, calcularCapacidadeHec22 } from './capacidade'
export {
  calcularEspraiamentoComposto,
  calcularGeometriaCompostaSarjetao,
  calcularLaminaParaEspraiamentoComposto,
  pontosPerfilCompostoSarjetao,
  type PontoPerfil,
} from './espraiamento'
export { calcularVazaoAfluente } from './racional'

const MAX_ITERACOES_TC_PADRAO = 10
const TOLERANCIA_RELATIVA_L_PADRAO = 0.01 // 1%

interface ResolverMetodoParams {
  parametros: ParametrosSarjetao
  deltaHM: number
  calcularCapacidade: (declividadeLongitudinalMM: number) => ResultadoCapacidade
}

/**
 * Resolve um dos dois métodos até convergência dupla: bisseção em L (pra um
 * dado Tc/i) dentro de um loop externo que recalcula Tc a partir do tempo de
 * percurso no braço do sarjetão (L/2 / velocidade), até o L parar de variar
 * mais que `toleranciaRelativaL` de uma iteração pra outra (ou o limite de
 * iterações). O Tc inicial é só uma semente — cada método converge pro seu
 * próprio Tc/i, já que velocidade e L diferem entre os dois métodos mesmo
 * usando a mesma vazão afluente e a mesma regra de SL(L).
 *
 * L é a distância cheia entre caixas consecutivas — mas o ponto alto (divisor
 * de águas) fica no meio desse intervalo, então a água escoa em duas direções
 * a partir dele, cada braço com metade de L. A verificação de capacidade do
 * sarjetão (SL e a vazão acumulada) precisa ser feita sobre um braço só —
 * água de um lado não se mistura com a do outro até chegar na caixa —, daí
 * `bracoM = L/2` sendo o comprimento realmente usado tanto pra SL = Δh/braço
 * quanto pra vazão afluente Q(braço). L continua sendo o que é resolvido pela
 * bisseção e reportado ao final; braço é só um intermediário interno.
 */
function resolverMetodo({ parametros, deltaHM, calcularCapacidade }: ResolverMetodoParams): ResultadoMetodoSarjetao {
  const {
    larguraViaM,
    coefC,
    telhadoAtivo,
    larguraTelhadoM,
    coefCTelhado,
    equacaoIdf,
    tempoRetornoAnos,
    tcInicialMin,
    maxIteracoesTc = MAX_ITERACOES_TC_PADRAO,
    toleranciaRelativaL = TOLERANCIA_RELATIVA_L_PADRAO,
  } = parametros

  let tc = tcInicialMin
  let comprimentoAnteriorM = NaN
  let bisseccao = { valor: NaN, iteracoes: 0, convergiu: false }
  let intensidadeMmH = 0
  let capacidade: ResultadoCapacidade = { areaMolhadaM2: 0, raioHidraulicoM: 0, velocidadeMs: 0, vazaoCapacidadeM3s: 0 }
  let vazaoM3s = 0
  let iteracoesTc = 0
  let convergiuTc = false
  const historicoIteracoesTc: IteracaoTc[] = []

  for (iteracoesTc = 1; iteracoesTc <= maxIteracoesTc; iteracoesTc++) {
    intensidadeMmH = calcularIntensidadeIdf(equacaoIdf, tempoRetornoAnos, tc)

    const f = (L: number) => {
      const bracoM = L / 2
      const SL = deltaHM / bracoM
      const { vazaoCapacidadeM3s } = calcularCapacidade(SL)
      const { vazaoM3s: q } = calcularVazaoAfluente({
        larguraViaM,
        coefC,
        larguraTelhadoM: telhadoAtivo ? larguraTelhadoM : undefined,
        coefCTelhado: telhadoAtivo ? coefCTelhado : undefined,
        intensidadeMmH,
        comprimentoM: bracoM,
      })
      return q - vazaoCapacidadeM3s
    }

    bisseccao = resolverPorBisseccao({ f })
    const L = bisseccao.valor
    const bracoM = L / 2
    const SL = deltaHM / bracoM
    capacidade = calcularCapacidade(SL)
    vazaoM3s = calcularVazaoAfluente({
      larguraViaM,
      coefC,
      larguraTelhadoM: telhadoAtivo ? larguraTelhadoM : undefined,
      coefCTelhado: telhadoAtivo ? coefCTelhado : undefined,
      intensidadeMmH,
      comprimentoM: bracoM,
    }).vazaoM3s

    const tempoPercursoMin = bracoM / (capacidade.velocidadeMs * 60)
    const variacaoRelativaL = Number.isFinite(comprimentoAnteriorM) ? Math.abs(L - comprimentoAnteriorM) / comprimentoAnteriorM : Infinity
    comprimentoAnteriorM = L

    historicoIteracoesTc.push({
      numero: iteracoesTc,
      tcMin: tc,
      intensidadeMmH,
      comprimentoM: L,
      declividadeLongitudinalMM: SL,
      vazaoM3s,
      vazaoCapacidadeM3s: capacidade.vazaoCapacidadeM3s,
    })

    if (variacaoRelativaL < toleranciaRelativaL) {
      convergiuTc = true
      break
    }
    tc = tempoPercursoMin
  }

  return {
    comprimentoEquilibrioM: comprimentoAnteriorM,
    iteracoes: bisseccao.iteracoes,
    convergiu: bisseccao.convergiu,
    iteracoesTc,
    convergiuTc,
    laminaCriticaM: parametros.yMaxM,
    areaMolhadaM2: capacidade.areaMolhadaM2,
    raioHidraulicoM: capacidade.raioHidraulicoM,
    velocidadeMs: capacidade.velocidadeMs,
    vazaoM3s,
    vazaoCapacidadeM3s: capacidade.vazaoCapacidadeM3s,
    declividadeLongitudinalMM: deltaHM / (comprimentoAnteriorM / 2),
    tcConvergidoMin: tc,
    intensidadeConvergidaMmH: intensidadeMmH,
    historicoIteracoesTc,
  }
}

/**
 * Resolve os dois métodos com um Sx do sarjetão explícito (o que muda entre o
 * resultado principal — Sx médio — e a faixa mín/máx — Sx_baixo/Sx_alto). T,
 * área e perímetro são todos derivados internamente da composição de dois
 * planos (ver calcularGeometriaCompostaSarjetao) — não recebidos prontos.
 */
function resolverAmbosMetodos(parametros: ParametrosSarjetao, deltaHM: number, larguraEfetivaM: number, sxSarjetaoParaGeometria: number) {
  const baseGeometria = {
    yMaxM: parametros.yMaxM,
    larguraSarjetaoEfetivaM: larguraEfetivaM,
    sxSarjetao: sxSarjetaoParaGeometria,
    sxPista: parametros.sxPista,
    manningN: parametros.manningN,
    numeroFaces: (parametros.tipoSecao === 'simetrico' ? 2 : 1) as 1 | 2,
  }

  const metodo1 = resolverMetodo({
    parametros,
    deltaHM,
    calcularCapacidade: (SL) => calcularCapacidadeManningGenerica({ ...baseGeometria, declividadeLongitudinalMM: SL }),
  })

  const metodo2 = resolverMetodo({
    parametros,
    deltaHM,
    calcularCapacidade: (SL) => calcularCapacidadeHec22({ ...baseGeometria, declividadeLongitudinalMM: SL }),
  })

  return { metodo1, metodo2 }
}

/**
 * Sequência completa do módulo "sarjetão em dente de serra": Δh derivado da
 * geometria → dois métodos de capacidade resolvidos independentemente por
 * bisseção com convergência de Tc → comparação lado a lado, sem descartar
 * nenhum dos dois (são premissas geométricas diferentes — retangular
 * equivalente vs. triangular integrada — e podem divergir bastante).
 *
 * Δh = largura_efetiva × (Sx_baixo − Sx_alto), onde largura_efetiva é a
 * meia-largura do sarjetão se `tipoSecao === 'simetrico'` (duas faces
 * espelhadas, cada uma com metade da largura total) ou a largura inteira se
 * `tipoSecao === 'um_lado'` (uma sarjeta comum, de um lado só — não há face
 * espelhada pra justificar dividir por dois).
 *
 * Sempre são calculados os TRÊS cenários de Sx do sarjetão — mínimo
 * (Sx_baixo), médio (default) e máximo (Sx_alto) —, já que essa declividade
 * varia de fato ao longo do braço (mais suave na crista, mais íngreme na
 * caixa). `parametros.cenarioAdotado` (default 'medio') escolhe qual deles
 * vira o resultado principal (metodo1/metodo2, o que é salvo/exportado como
 * oficial); os três ficam expostos em `faixaEspraiamento` pra comparação,
 * independente de qual foi escolhido.
 */
export function calcularSarjetaoDenteServa(parametros: ParametrosSarjetao): MemorialSarjetaoDenteServa {
  const larguraEfetivaM = parametros.tipoSecao === 'simetrico' ? parametros.larguraSarjetaoM / 2 : parametros.larguraSarjetaoM
  const deltaHM = larguraEfetivaM * (parametros.sxSarjetaoBaixo - parametros.sxSarjetaoAlto)

  if (deltaHM <= 0) {
    throw new Error('A declividade transversal do ponto baixo deve ser maior que a do ponto alto do sarjetão.')
  }

  const sxSarjetaoMedioMM = (parametros.sxSarjetaoAlto + parametros.sxSarjetaoBaixo) / 2
  const cenarioAdotado: CenarioEspraiamento = parametros.cenarioAdotado ?? 'medio'
  const sxPorCenario: Record<CenarioEspraiamento, number> = {
    minimo: parametros.sxSarjetaoBaixo,
    medio: sxSarjetaoMedioMM,
    maximo: parametros.sxSarjetaoAlto,
  }

  const detalhesPorCenario = {} as Record<CenarioEspraiamento, DetalheCenarioEspraiamento>
  const resolvidosPorCenario = {} as Record<CenarioEspraiamento, { metodo1: ResultadoMetodoSarjetao; metodo2: ResultadoMetodoSarjetao }>
  for (const cenario of ['minimo', 'medio', 'maximo'] as const) {
    const sxSarjetao = sxPorCenario[cenario]
    const resolvido = resolverAmbosMetodos(parametros, deltaHM, larguraEfetivaM, sxSarjetao)
    const T = calcularEspraiamentoComposto({ yMaxM: parametros.yMaxM, larguraSarjetaoEfetivaM: larguraEfetivaM, sxSarjetao, sxPista: parametros.sxPista })
    resolvidosPorCenario[cenario] = resolvido
    detalhesPorCenario[cenario] = {
      sxSarjetaoMM: sxSarjetao,
      metodo1: { larguraEspraiamentoM: T, comprimentoEquilibrioM: resolvido.metodo1.comprimentoEquilibrioM, vazaoCapacidadeM3s: resolvido.metodo1.vazaoCapacidadeM3s },
      metodo2: { larguraEspraiamentoM: T, comprimentoEquilibrioM: resolvido.metodo2.comprimentoEquilibrioM, vazaoCapacidadeM3s: resolvido.metodo2.vazaoCapacidadeM3s },
    }
  }

  const { metodo1, metodo2 } = resolvidosPorCenario[cenarioAdotado]

  const maiorL = Math.max(metodo1.comprimentoEquilibrioM, metodo2.comprimentoEquilibrioM)
  const diferencaPercentual = (Math.abs(metodo1.comprimentoEquilibrioM - metodo2.comprimentoEquilibrioM) / maiorL) * 100
  const metodoRecomendado: MetodoCapacidade = metodo1.comprimentoEquilibrioM <= metodo2.comprimentoEquilibrioM ? 'manning_generico' : 'hec22'
  const comprimentoRecomendadoM = Math.min(metodo1.comprimentoEquilibrioM, metodo2.comprimentoEquilibrioM)

  const sxSarjetaoAdotadoMM = sxPorCenario[cenarioAdotado]
  const larguraEspraiamentoAdotadoM = detalhesPorCenario[cenarioAdotado].metodo1.larguraEspraiamentoM

  const faixaEspraiamento: FaixaEspraiamentoSarjetao = {
    minimo: detalhesPorCenario.minimo,
    medio: detalhesPorCenario.medio,
    maximo: detalhesPorCenario.maximo,
  }

  return {
    deltaHM,
    larguraEspraiamentoM: larguraEspraiamentoAdotadoM,
    cenarioAdotado,
    sxSarjetaoAdotadoMM,
    larguraSarjetaoEfetivaM: larguraEfetivaM,
    metodo1,
    metodo2,
    diferencaPercentual,
    comprimentoRecomendadoM,
    metodoRecomendado,
    faixaEspraiamento,
  }
}
