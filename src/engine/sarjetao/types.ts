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
export interface ParametrosSarjetao {
  larguraViaM: number // largura de pista contribuinte total (os dois lados até os divisores de água), usada no método racional
  coefC: number

  telhadoAtivo: boolean
  larguraTelhadoM?: number // largura de cobertura contribuinte (análoga à largura de pista), só usada se telhadoAtivo
  coefCTelhado?: number

  larguraSarjetaoM: number // largura total do sarjetão — a metade entra na fórmula de Δh
  sxSarjetaoAlto: number // declividade transversal do sarjetão no ponto alto (m/m)
  sxSarjetaoBaixo: number // declividade transversal do sarjetão no ponto baixo, junto à caixa (m/m)

  yMaxM: number // lâmina d'água admissível (y_max), condição de projeto em ambos os métodos
  sxPista: number // declividade transversal da via FORA do sarjetão (m/m) — usada só no Método 2 (HEC-22) e no T automático; nunca confundir com sxSarjetaoAlto/Baixo
  larguraEspraiamentoM: number // T — espraiamento correspondente a y_max
  manningN: number

  equacaoIdf: EquacaoIdf
  tempoRetornoAnos: number
  tcInicialMin: number // semente de iteração — arbitrada, refinada a cada passo pelo tempo de percurso no próprio sarjetão

  maxIteracoesTc?: number // default 10
  toleranciaRelativaL?: number // default 0.01 (1%)
}

export type MetodoCapacidade = 'manning_generico' | 'hec22'

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

/** Resultado hidráulico de capacidade — comum aos dois métodos, pra alimentar o loop de Tc de forma uniforme. */
export interface ResultadoCapacidade {
  areaMolhadaM2: number // Método 1: retangular T×y_max. Método 2: triangular equivalente T×y_max/2, só pra estimar velocidade — não faz parte da fórmula integrada
  raioHidraulicoM: number | null // só existe no Método 1 (Rh=A/P); no Método 2 a fórmula é integrada, não decompõe em Rh
  velocidadeMs: number
  vazaoCapacidadeM3s: number
}

/**
 * Saída de um dos dois métodos, já convergida em L e Tc.
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
  areaMolhadaM2: number // no braço de equilíbrio — Método 1: T×y_max; Método 2: T×y_max/2 (triangular equivalente, só pra reportar)
  raioHidraulicoM: number | null // só existe no Método 1 (Rh=A/P); Método 2 usa fórmula integrada, não decompõe em Rh
  velocidadeMs: number // no braço (L/2)
  vazaoM3s: number // vazão afluente no braço (L/2) de equilíbrio
  vazaoCapacidadeM3s: number // vazão de capacidade no braço (L/2) de equilíbrio (≈ vazaoM3s, por definição de equilíbrio)
  declividadeLongitudinalMM: number // SL = Δh / (L/2), no L de equilíbrio
  tcConvergidoMin: number
  intensidadeConvergidaMmH: number
  historicoIteracoesTc: IteracaoTc[] // uma entrada por passada do loop de Tc, na ordem em que ocorreram — a memória de cálculo ponto a ponto
}

/** Comparação lado a lado dos dois métodos — nenhum é descartado. */
export interface MemorialSarjetaoDenteServa {
  deltaHM: number
  larguraEspraiamentoM: number
  metodo1: ResultadoMetodoSarjetao // Manning genérico, seção retangular equivalente
  metodo2: ResultadoMetodoSarjetao // HEC-22/FHWA, seção triangular integrada
  diferencaPercentual: number
  comprimentoRecomendadoM: number // o menor dos dois, lado da segurança
  metodoRecomendado: MetodoCapacidade
}
