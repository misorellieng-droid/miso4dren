import { calcularIntensidadeIdf } from '../idf'
import { resolverPorBisseccao } from './bisseccao'
import { calcularCapacidadeHec22 } from './capacidade'
import { calcularEspraiamentoComposto } from './espraiamento'
import { calcularVazaoAfluente } from './racional'
import type {
  CenarioEspraiamento,
  DetalheCenarioEspraiamento,
  FaixaEspraiamentoSarjetao,
  IteracaoTc,
  MemorialSarjetaoDenteServa,
  ParametrosSarjetao,
  ResultadoCapacidade,
  ResultadoMetodoSarjetao,
} from './types'

export * from './types'
export { resolverPorBisseccao } from './bisseccao'
export { calcularCapacidadeHec22 } from './capacidade'
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
 * Resolve por bisseção em L (pra um dado Tc/i) dentro de um loop externo que
 * recalcula Tc a partir do tempo de percurso no braço do sarjetão (L/2 /
 * velocidade), até o L parar de variar mais que `toleranciaRelativaL` de uma
 * iteração pra outra (ou o limite de iterações). O Tc inicial é só uma
 * semente, refinada a cada passada.
 *
 * TOPOLOGIA (importante pra não confundir L com braço): o perfil em dente de
 * serra alterna caixa – crista – caixa – crista – caixa ao longo da via.
 * `L` (comprimentoEquilibrioM, retornado ao final) é a distância CHEIA entre
 * duas caixas CONSECUTIVAS — os dois extremos do intervalo são caixas, e o
 * ponto alto (crista, divisor de águas) fica exatamente no meio. A água
 * escoa em duas direções a partir da crista, cada braço com metade de L, e
 * não se mistura com a do lado oposto até chegar na caixa — por isso a
 * verificação de capacidade (SL, vazão acumulada, velocidade, tempo de
 * percurso) é feita sobre um braço só, `bracoM = L/2`. `bracoM` é só um
 * intermediário interno; o que é resolvido pela bisseção e reportado ao
 * final é sempre L (caixa a caixa).
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

/** Resolve o método (HEC-22) com um Sx do sarjetão explícito — o que muda entre o resultado principal e cada cenário da faixa de avaliação. */
function resolver(parametros: ParametrosSarjetao, deltaHM: number, larguraEfetivaM: number, sxSarjetaoParaGeometria: number): ResultadoMetodoSarjetao {
  const baseGeometria = {
    yMaxM: parametros.yMaxM,
    larguraSarjetaoEfetivaM: larguraEfetivaM,
    sxSarjetao: sxSarjetaoParaGeometria,
    sxPista: parametros.sxPista,
    manningN: parametros.manningN,
    numeroFaces: (parametros.tipoSecao === 'simetrico' ? 2 : 1) as 1 | 2,
  }

  return resolverMetodo({
    parametros,
    deltaHM,
    calcularCapacidade: (SL) => calcularCapacidadeHec22({ ...baseGeometria, declividadeLongitudinalMM: SL }),
  })
}

/**
 * Sequência completa do módulo "sarjetão em dente de serra": Δh derivado da
 * geometria → capacidade resolvida por bisseção com convergência de Tc
 * (HEC-22/FHWA, geometria composta real calha+via — único método mantido).
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
 * vira o resultado principal (o que é salvo/exportado como oficial); os três
 * ficam expostos em `faixaEspraiamento` pra comparação, independente de qual
 * foi escolhido.
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
  const resolvidosPorCenario = {} as Record<CenarioEspraiamento, ResultadoMetodoSarjetao>
  for (const cenario of ['minimo', 'medio', 'maximo'] as const) {
    const sxSarjetao = sxPorCenario[cenario]
    const resolvido = resolver(parametros, deltaHM, larguraEfetivaM, sxSarjetao)
    const T = calcularEspraiamentoComposto({ yMaxM: parametros.yMaxM, larguraSarjetaoEfetivaM: larguraEfetivaM, sxSarjetao, sxPista: parametros.sxPista })
    resolvidosPorCenario[cenario] = resolvido
    detalhesPorCenario[cenario] = {
      sxSarjetaoMM: sxSarjetao,
      resultado: { larguraEspraiamentoM: T, comprimentoEquilibrioM: resolvido.comprimentoEquilibrioM, vazaoCapacidadeM3s: resolvido.vazaoCapacidadeM3s },
    }
  }

  const resultado = resolvidosPorCenario[cenarioAdotado]
  const sxSarjetaoAdotadoMM = sxPorCenario[cenarioAdotado]
  const larguraEspraiamentoAdotadoM = detalhesPorCenario[cenarioAdotado].resultado.larguraEspraiamentoM

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
    resultado,
    faixaEspraiamento,
  }
}
