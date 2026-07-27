import { calcularIntensidadeIdf } from '../idf'
import { resolverPorBisseccao } from './bisseccao'
import { calcularCapacidadeHec22, calcularCapacidadeManningGenerica } from './capacidade'
import { calcularEspraiamentoComposto } from './espraiamento'
import { calcularVazaoAfluente } from './racional'
import type {
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
export { calcularEspraiamentoComposto, calcularLaminaParaEspraiamentoComposto } from './espraiamento'
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

/** Resolve os dois métodos com um T (espraiamento) explícito — reaproveitado pro resultado principal e pra faixa mín/máx. */
function resolverAmbosMetodos(parametros: ParametrosSarjetao, deltaHM: number, larguraEspraiamentoM: number) {
  const metodo1 = resolverMetodo({
    parametros,
    deltaHM,
    calcularCapacidade: (SL) =>
      calcularCapacidadeManningGenerica({
        larguraEspraiamentoM,
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
        larguraEspraiamentoM,
        laminaMaxM: parametros.yMaxM,
        manningN: parametros.manningN,
        declividadeLongitudinalMM: SL,
      }),
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
 * O resultado principal (metodo1/metodo2) usa `parametros.larguraEspraiamentoM`
 * tal como recebido (T adotado pela UI, tipicamente calculado com a
 * declividade MÉDIA da calha — ver calcularEspraiamentoComposto). Como essa
 * declividade varia de fato ao longo do braço (mais suave na crista, mais
 * íngreme na caixa), `faixaEspraiamento` recalcula T e o comprimento de
 * equilíbrio nos dois extremos (Sx_alto e Sx_baixo) só pra dar uma faixa de
 * avaliação — não substitui nem altera o resultado principal adotado.
 */
export function calcularSarjetaoDenteServa(parametros: ParametrosSarjetao): MemorialSarjetaoDenteServa {
  const larguraEfetivaM = parametros.tipoSecao === 'simetrico' ? parametros.larguraSarjetaoM / 2 : parametros.larguraSarjetaoM
  const deltaHM = larguraEfetivaM * (parametros.sxSarjetaoBaixo - parametros.sxSarjetaoAlto)

  if (deltaHM <= 0) {
    throw new Error('A declividade transversal do ponto baixo deve ser maior que a do ponto alto do sarjetão.')
  }

  const { metodo1, metodo2 } = resolverAmbosMetodos(parametros, deltaHM, parametros.larguraEspraiamentoM)

  const maiorL = Math.max(metodo1.comprimentoEquilibrioM, metodo2.comprimentoEquilibrioM)
  const diferencaPercentual = (Math.abs(metodo1.comprimentoEquilibrioM - metodo2.comprimentoEquilibrioM) / maiorL) * 100
  const metodoRecomendado: MetodoCapacidade = metodo1.comprimentoEquilibrioM <= metodo2.comprimentoEquilibrioM ? 'manning_generico' : 'hec22'
  const comprimentoRecomendadoM = Math.min(metodo1.comprimentoEquilibrioM, metodo2.comprimentoEquilibrioM)

  const sxSarjetaoMedioMM = (parametros.sxSarjetaoAlto + parametros.sxSarjetaoBaixo) / 2
  const tMinimo = calcularEspraiamentoComposto({
    yMaxM: parametros.yMaxM,
    larguraSarjetaoEfetivaM: larguraEfetivaM,
    sxSarjetao: parametros.sxSarjetaoBaixo,
    sxPista: parametros.sxPista,
  })
  const tMaximo = calcularEspraiamentoComposto({
    yMaxM: parametros.yMaxM,
    larguraSarjetaoEfetivaM: larguraEfetivaM,
    sxSarjetao: parametros.sxSarjetaoAlto,
    sxPista: parametros.sxPista,
  })
  const resolvidoMinimo = resolverAmbosMetodos(parametros, deltaHM, tMinimo)
  const resolvidoMaximo = resolverAmbosMetodos(parametros, deltaHM, tMaximo)

  const faixaEspraiamento: FaixaEspraiamentoSarjetao = {
    sxSarjetaoMedioMM,
    larguraEspraiamentoAdotadoM: parametros.larguraEspraiamentoM,
    minimo: {
      sxSarjetaoMM: parametros.sxSarjetaoBaixo,
      metodo1: {
        larguraEspraiamentoM: tMinimo,
        comprimentoEquilibrioM: resolvidoMinimo.metodo1.comprimentoEquilibrioM,
        vazaoCapacidadeM3s: resolvidoMinimo.metodo1.vazaoCapacidadeM3s,
      },
      metodo2: {
        larguraEspraiamentoM: tMinimo,
        comprimentoEquilibrioM: resolvidoMinimo.metodo2.comprimentoEquilibrioM,
        vazaoCapacidadeM3s: resolvidoMinimo.metodo2.vazaoCapacidadeM3s,
      },
    },
    maximo: {
      sxSarjetaoMM: parametros.sxSarjetaoAlto,
      metodo1: {
        larguraEspraiamentoM: tMaximo,
        comprimentoEquilibrioM: resolvidoMaximo.metodo1.comprimentoEquilibrioM,
        vazaoCapacidadeM3s: resolvidoMaximo.metodo1.vazaoCapacidadeM3s,
      },
      metodo2: {
        larguraEspraiamentoM: tMaximo,
        comprimentoEquilibrioM: resolvidoMaximo.metodo2.comprimentoEquilibrioM,
        vazaoCapacidadeM3s: resolvidoMaximo.metodo2.vazaoCapacidadeM3s,
      },
    },
  }

  return {
    deltaHM,
    larguraEspraiamentoM: parametros.larguraEspraiamentoM,
    metodo1,
    metodo2,
    diferencaPercentual,
    comprimentoRecomendadoM,
    metodoRecomendado,
    faixaEspraiamento,
  }
}
