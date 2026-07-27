import type { EquacaoIdf } from '../types'

/**
 * Entradas do módulo "sarjetão em dente de serra": via sem declividade
 * longitudinal (pátio nivelado entre galpões), onde o desnível entre caixas
 * vem exclusivamente da variação da declividade transversal do sarjetão
 * entre o ponto alto (divisor de águas) e o ponto baixo (caixa).
 *
 * `larguraEspraiamentoM` (T) é opcional — se omitido, é calculado
 * automaticamente como `yMaxM / sxPista` (o app faz isso na camada de UI e
 * passa o valor já resolvido pra cá, editável pelo engenheiro).
 */
/**
 * Tipo de seção do sarjetão:
 * - 'simetrico': V alimentado igualmente dos dois lados (ex.: pátio entre
 *   dois galpões) — `larguraSarjetaoM` é a largura TOTAL do trough, e só a
 *   metade dela (uma face) entra na fórmula de Δh.
 * - 'um_lado': sarjeta comum, de um lado só (via + calha, como no módulo de
 *   sarjeta crítica), mas também sem declividade longitudinal — o desnível
 *   vem da variação da declividade transversal da PRÓPRIA sarjeta ao longo
 *   do comprimento. Como não há face espelhada, `larguraSarjetaoM` entra
 *   INTEIRA na fórmula de Δh (é a única face que existe).
 *
 * A fórmula de capacidade (HEC-22, ver capacidade.ts) e o método racional
 * não mudam entre os dois tipos — são genéricos em relação à seção,
 * dirigidos só por T/y_max/Sx da pista. A única diferença física é o fator
 * de largura na fórmula de Δh.
 */
export type TipoSecaoSarjetao = 'simetrico' | 'um_lado'

/**
 * Qual declividade do sarjetão vira o Sx "adotado" pro resultado principal —
 * já que essa declividade varia de fato ao longo do braço (mais suave na
 * crista, mais íngreme na caixa):
 * - 'minimo': usa Sx_baixo (mais íngreme, junto à caixa) — mais conservador, T menor
 * - 'medio': usa a média entre Sx_alto e Sx_baixo (default)
 * - 'maximo': usa Sx_alto (mais suave, no divisor de águas) — T maior
 * Os três cenários são sempre calculados e expostos em `faixaEspraiamento`,
 * independente de qual for o adotado — só muda qual deles vira o resultado
 * principal (e o que é salvo/exportado como oficial).
 */
export type CenarioEspraiamento = 'minimo' | 'medio' | 'maximo'

export interface ParametrosSarjetao {
  tipoSecao: TipoSecaoSarjetao
  cenarioAdotado?: CenarioEspraiamento // default 'medio'
  larguraViaM: number // largura de pista contribuinte total (nos dois lados até os divisores de água, se simétrico; só do lado da sarjeta, se um_lado), usada no método racional
  coefC: number

  telhadoAtivo: boolean
  larguraTelhadoM?: number // largura de cobertura contribuinte (análoga à largura de pista), só usada se telhadoAtivo
  coefCTelhado?: number

  larguraSarjetaoM: number // largura do sarjetão — metade entra em Δh se simétrico, inteira se um_lado (ver TipoSecaoSarjetao)
  sxSarjetaoAlto: number // declividade transversal do sarjetão no ponto alto (m/m)
  sxSarjetaoBaixo: number // declividade transversal do sarjetão no ponto baixo, junto à caixa (m/m)

  yMaxM: number // lâmina d'água admissível (y_max), condição de projeto
  sxPista: number // declividade transversal da via FORA do sarjetão (m/m) — usada na fórmula HEC-22 e no T automático; nunca confundir com sxSarjetaoAlto/Baixo
  larguraEspraiamentoM: number // T — espraiamento correspondente a y_max
  manningN: number

  equacaoIdf: EquacaoIdf
  tempoRetornoAnos: number
  tcInicialMin: number // semente de iteração — arbitrada, refinada a cada passo pelo tempo de percurso no próprio sarjetão

  maxIteracoesTc?: number // default 10
  toleranciaRelativaL?: number // default 0.01 (1%)
}

/** Um passo do loop de convergência de Tc — pra reconstituir a memória de cálculo ponto a ponto. */
export interface IteracaoTc {
  numero: number
  tcMin: number // Tc usado nessa passada (entrada da equação IDF)
  intensidadeMmH: number // i resultante da equação IDF com esse Tc
  comprimentoM: number // L (distância cheia entre caixas) resolvido por bisseção nessa passada
  declividadeLongitudinalMM: number // SL no braço (L/2) para esse L
  vazaoM3s: number // vazão afluente no braço, para esse L e essa intensidade
  vazaoCapacidadeM3s: number // vazão de capacidade no braço, para essa SL
}

/** Resultado hidráulico de capacidade (HEC-22, geometria composta calha+via). */
export interface ResultadoCapacidade {
  areaMolhadaM2: number // área real composta (triângulo/trapézio da calha do sarjetão + triângulo da via)
  raioHidraulicoM: number // Rh=A/P, perímetro real (comprimento de arco dos dois planos)
  velocidadeMs: number
  vazaoCapacidadeM3s: number
}

/**
 * Saída do método (HEC-22), já convergida em L e Tc.
 *
 * `comprimentoEquilibrioM` (L) é a distância CHEIA entre duas caixas
 * consecutivas. O ponto alto (divisor de águas) fica no meio desse
 * intervalo, então a verificação de capacidade (SL, vazão afluente,
 * velocidade, tempo de percurso) é feita sobre um braço só — L/2 —, já que a
 * água de um lado do divisor não se mistura com a do outro até chegar na
 * caixa. `velocidadeMs`, `vazaoM3s`, `vazaoCapacidadeM3s` e
 * `declividadeLongitudinalMM` abaixo são todos valores do braço (L/2), não
 * de L inteiro.
 */
export interface ResultadoMetodoSarjetao {
  comprimentoEquilibrioM: number
  iteracoes: number // iterações da bisseção na última passada de Tc
  convergiu: boolean // convergência da bisseção (em L)
  iteracoesTc: number
  convergiuTc: boolean
  laminaCriticaM: number // = yMaxM, verificação: é a lâmina de projeto atingida no ponto crítico
  areaMolhadaM2: number // no braço de equilíbrio — área real composta (calha + via)
  raioHidraulicoM: number // no braço de equilíbrio — Rh=A/P, perímetro real
  velocidadeMs: number // no braço (L/2)
  vazaoM3s: number // vazão afluente no braço (L/2) de equilíbrio
  vazaoCapacidadeM3s: number // vazão de capacidade no braço (L/2) de equilíbrio (≈ vazaoM3s, por definição de equilíbrio)
  declividadeLongitudinalMM: number // SL = Δh / (L/2), no L de equilíbrio
  tcConvergidoMin: number
  intensidadeConvergidaMmH: number
  historicoIteracoesTc: IteracaoTc[] // uma entrada por passada do loop de Tc, na ordem em que ocorreram — a memória de cálculo ponto a ponto
}

/** Resultado resumido do método, recalculado com um T alternativo — só pra faixa de avaliação, não é o resultado adotado. */
export interface ResultadoFaixaEspraiamento {
  larguraEspraiamentoM: number
  comprimentoEquilibrioM: number
  vazaoCapacidadeM3s: number
}

/** Um dos três cenários de declividade — mesma forma pra mínimo/médio/máximo, indexável por CenarioEspraiamento. */
export interface DetalheCenarioEspraiamento {
  sxSarjetaoMM: number
  resultado: ResultadoFaixaEspraiamento
}

/**
 * Faixa de avaliação do espraiamento: como a declividade do sarjetão varia
 * de fato ao longo do braço (mais suave na crista, mais íngreme na caixa),
 * T/área/perímetro também variam. Expõe os três cenários possíveis —
 * `parametros.cenarioAdotado` escolhe qual deles vira o resultado principal
 * (em MemorialSarjetaoDenteServa) —, pra o engenheiro comparar e decidir
 * qual usar.
 */
export interface FaixaEspraiamentoSarjetao {
  minimo: DetalheCenarioEspraiamento // Sx_baixo — mais íngreme, contém mais a lâmina, dá o menor T
  medio: DetalheCenarioEspraiamento // média entre Sx_alto e Sx_baixo
  maximo: DetalheCenarioEspraiamento // Sx_alto — mais suave, espraia mais pra pista, dá o maior T
}

/** Resultado do módulo — HEC-22/FHWA, único método mantido (Manning genérico foi removido). */
export interface MemorialSarjetaoDenteServa {
  deltaHM: number
  larguraEspraiamentoM: number
  cenarioAdotado: CenarioEspraiamento
  sxSarjetaoAdotadoMM: number // Sx que gerou o resultado principal (baixo/médio/alto, conforme cenarioAdotado)
  larguraSarjetaoEfetivaM: number // W — a mesma largura usada no Δh e na composição de T (metade se simétrico, inteira se um_lado)
  resultado: ResultadoMetodoSarjetao
  /**
   * Vazão TOTAL que chega na caixa — soma dos dois braços que a alimentam
   * (uma crista de cada lado), não a vazão de UM braço só (que é
   * `resultado.vazaoM3s`, usada pra checar a capacidade do CANAL). Como o
   * método racional é linear no comprimento, isso equivale a
   * `2 × resultado.vazaoM3s` — pra dimensionar a caixa/tubulação enterrada
   * a jusante, não o sarjetão em si.
   */
  vazaoTotalCaixaM3s: number
  faixaEspraiamento: FaixaEspraiamentoSarjetao
}
