import { RATIONAL_METHOD_K } from '../constants'
import { calcularGeometria } from './geometria'
import { calcularDeclividadeParaVelocidade, calcularVazao, calcularVelocidade } from './hidraulica'
import { calcularComprimentoCritico } from './comprimentoCritico'
import type { ParametrosGeometriaSarjeta } from './types'

export * from './types'
export { calcularGeometria } from './geometria'
export { calcularGeometriaTriangular } from './geometrias/triangular'
export { calcularVelocidade, calcularVazao, calcularDeclividadeParaVelocidade } from './hidraulica'
export { calcularComprimentoCritico } from './comprimentoCritico'

interface ParametrosSarjetaBase {
  geometria: ParametrosGeometriaSarjeta
  manningN: number // rugosidade de Manning da sarjeta (campo próprio, não compartilhado com o n de tubos)
  coefC: number
  intensidadeMmH: number
  larguraImpluvioM: number
}

export type ModoDeclividade = 'informada' | 'velocidade_minima'

/**
 * A declividade longitudinal pode ser informada diretamente (a via tem uma
 * declividade real) ou calculada a partir de uma velocidade mínima de
 * autolimpeza desejada. O caso de via sem declividade longitudinal
 * nenhuma (sarjetão em dente de serra, desnível dado pela variação da
 * declividade transversal) é tratado pelo módulo dedicado
 * src/engine/sarjetao/ — mais completo (compara dois métodos de
 * capacidade e itera Tc), não por uma variante aqui.
 */
export type ParametrosSarjeta = ParametrosSarjetaBase &
  ({ declividadeLongitudinalMM: number; velocidadeMinimaMs?: never } | { velocidadeMinimaMs: number; declividadeLongitudinalMM?: never })

/** Valores intermediários completos, pro painel "Memorial de Cálculo" — conferência direta com planilhas/memoriais externos. */
export interface MemorialCalculoSarjeta {
  areaMolhadaM2: number
  perimetroMolhadoM: number
  raioHidraulicoM: number
  raioHidraulicoElevadoDoisTercos: number
  declividadeLongitudinalMM: number // informada ou calculada, conforme o modo usado
  modoDeclividade: ModoDeclividade
  velocidadeMs: number
  vazaoM3s: number
  numerador: number
  denominador: number
  comprimentoCriticoM: number
}

/**
 * Sequência completa do módulo de sarjeta crítica: geometria da seção →
 * declividade longitudinal (informada ou derivada de uma velocidade mínima)
 * → velocidade (Manning) → vazão → comprimento crítico. Composição de
 * funções independentes e testáveis isoladamente.
 */
export function calcularSarjeta(params: ParametrosSarjeta): MemorialCalculoSarjeta {
  const { geometria, manningN, coefC, intensidadeMmH, larguraImpluvioM } = params

  const { areaMolhadaM2, perimetroMolhadoM, raioHidraulicoM } = calcularGeometria(geometria)
  const raioHidraulicoElevadoDoisTercos = Math.pow(raioHidraulicoM, 2 / 3)

  const modoDeclividade: ModoDeclividade = params.velocidadeMinimaMs != null ? 'velocidade_minima' : 'informada'
  const declividadeLongitudinalMM =
    modoDeclividade === 'velocidade_minima'
      ? calcularDeclividadeParaVelocidade(params.velocidadeMinimaMs!, raioHidraulicoM, manningN)
      : params.declividadeLongitudinalMM!

  const velocidadeMs = calcularVelocidade(raioHidraulicoM, manningN, declividadeLongitudinalMM)
  const vazaoM3s = calcularVazao(areaMolhadaM2, velocidadeMs)
  const comprimentoCriticoM = calcularComprimentoCritico(vazaoM3s, coefC, intensidadeMmH, larguraImpluvioM)

  return {
    areaMolhadaM2,
    perimetroMolhadoM,
    raioHidraulicoM,
    raioHidraulicoElevadoDoisTercos,
    declividadeLongitudinalMM,
    modoDeclividade,
    velocidadeMs,
    vazaoM3s,
    numerador: vazaoM3s,
    denominador: RATIONAL_METHOD_K * coefC * intensidadeMmH * larguraImpluvioM,
    comprimentoCriticoM,
  }
}
