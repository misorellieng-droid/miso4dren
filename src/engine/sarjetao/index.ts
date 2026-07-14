import { calcularIntensidadeIdf } from '../idf'
import { resolverPorBisseccao } from './bisseccao'
import { calcularCapacidadeHec22, calcularCapacidadeManningGenerica } from './capacidade'
import { calcularVazaoAfluente } from './racional'
import type { MemorialSarjetaoDenteServa, MetodoCapacidade, ParametrosSarjetao, ResultadoCapacidade, ResultadoMetodoSarjetao } from './types'

export * from './types'
export { resolverPorBisseccao } from './bisseccao'
export { calcularCapacidadeManningGenerica, calcularCapacidadeHec22 } from './capacidade'
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
  let capacidade: ResultadoCapacidade = { areaMolhadaM2: 0, raioHidraulicoM: null, velocidadeMs: 0, vazaoCapacidadeM3s: 0 }
  let vazaoM3s = 0
  let iteracoesTc = 0
  let convergiuTc = false

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
    velocidadeMs: capacidade.velocidadeMs,
    vazaoM3s,
    vazaoCapacidadeM3s: capacidade.vazaoCapacidadeM3s,
    declividadeLongitudinalMM: deltaHM / (comprimentoAnteriorM / 2),
    tcConvergidoMin: tc,
    intensidadeConvergidaMmH: intensidadeMmH,
  }
}

/**
 * Sequência completa do módulo "sarjetão em dente de serra": Δh derivado da
 * geometria (meia-largura do sarjetão × variação de Sx entre ponto alto e
 * baixo) → dois métodos de capacidade resolvidos independentemente por
 * bisseção com convergência de Tc → comparação lado a lado, sem descartar
 * nenhum dos dois (são premissas geométricas diferentes — retangular
 * equivalente vs. triangular integrada — e podem divergir bastante).
 */
export function calcularSarjetaoDenteServa(parametros: ParametrosSarjetao): MemorialSarjetaoDenteServa {
  const meiaLarguraSarjetaoM = parametros.larguraSarjetaoM / 2
  const deltaHM = meiaLarguraSarjetaoM * (parametros.sxSarjetaoBaixo - parametros.sxSarjetaoAlto)

  if (deltaHM <= 0) {
    throw new Error('A declividade transversal do ponto baixo deve ser maior que a do ponto alto do sarjetão.')
  }

  const metodo1 = resolverMetodo({
    parametros,
    deltaHM,
    calcularCapacidade: (SL) =>
      calcularCapacidadeManningGenerica({
        larguraEspraiamentoM: parametros.larguraEspraiamentoM,
        laminaMaxM: parametros.yMaxM,
        manningN: parametros.manningN,
        declividadeLongitudinalMM: SL,
      }),
  })

  const metodo2 = resolverMetodo({
    parametros,
    deltaHM,
    calcularCapacidade: (SL) =>
      calcularCapacidadeHec22({
        sxPista: parametros.sxPista,
        larguraEspraiamentoM: parametros.larguraEspraiamentoM,
        laminaMaxM: parametros.yMaxM,
        manningN: parametros.manningN,
        declividadeLongitudinalMM: SL,
      }),
  })

  const maiorL = Math.max(metodo1.comprimentoEquilibrioM, metodo2.comprimentoEquilibrioM)
  const diferencaPercentual = (Math.abs(metodo1.comprimentoEquilibrioM - metodo2.comprimentoEquilibrioM) / maiorL) * 100
  const metodoRecomendado: MetodoCapacidade = metodo1.comprimentoEquilibrioM <= metodo2.comprimentoEquilibrioM ? 'manning_generico' : 'hec22'
  const comprimentoRecomendadoM = Math.min(metodo1.comprimentoEquilibrioM, metodo2.comprimentoEquilibrioM)

  return {
    deltaHM,
    larguraEspraiamentoM: parametros.larguraEspraiamentoM,
    metodo1,
    metodo2,
    diferencaPercentual,
    comprimentoRecomendadoM,
    metodoRecomendado,
  }
}
