import { RATIONAL_METHOD_K } from '../constants'
import { calcularGeometria } from './geometria'
import { calcularDeclividadeParaVelocidade, calcularVazao, calcularVelocidade } from './hidraulica'
import { calcularComprimentoCritico } from './comprimentoCritico'
import type { ParametrosGeometriaSarjeta } from './types'

export * from './types'
export { calcularGeometria } from './geometria'
export { calcularGeometriaTriangular } from './geometrias/triangular'
export { calcularGeometriaTriangularSimetrica } from './geometrias/triangularSimetrica'
export { calcularVelocidade, calcularVazao, calcularDeclividadeParaVelocidade } from './hidraulica'
export { calcularComprimentoCritico } from './comprimentoCritico'

interface ParametrosSarjetaBase {
  geometria: ParametrosGeometriaSarjeta
  manningN: number // rugosidade de Manning da sarjeta (campo próprio, não compartilhado com o n de tubos)
  coefC: number
  intensidadeMmH: number
  larguraImpluvioM: number
}

/**
 * A declividade longitudinal pode ser informada diretamente (caso comum: a
 * via tem uma declividade real) ou calculada a partir de uma velocidade
 * mínima de autolimpeza desejada (caso do sarjetão entre galpões, onde a
 * via é plana e a queda é dada só ao longo da calha — ver
 * calcularDeclividadeParaVelocidade).
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
  declividadeCalculadaPorVelocidade: boolean
  velocidadeMs: number
  vazaoM3s: number
  numerador: number
  denominador: number
  comprimentoCriticoM: number
}

/**
 * Sequência completa do módulo de sarjeta crítica: geometria da seção →
 * declividade longitudinal (informada ou derivada de uma velocidade mínima)
 * → velocidade (Manning) → vazão → comprimento crítico. Substitui a antiga
 * fórmula fechada (válida só pra seção triangular ideal) por uma composição
 * de funções independentes e testáveis isoladamente.
 */
export function calcularSarjeta(params: ParametrosSarjeta): MemorialCalculoSarjeta {
  const { geometria, manningN, coefC, intensidadeMmH, larguraImpluvioM } = params

  const { areaMolhadaM2, perimetroMolhadoM, raioHidraulicoM } = calcularGeometria(geometria)
  const raioHidraulicoElevadoDoisTercos = Math.pow(raioHidraulicoM, 2 / 3)

  const declividadeCalculadaPorVelocidade = params.velocidadeMinimaMs != null
  const declividadeLongitudinalMM = declividadeCalculadaPorVelocidade
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
    declividadeCalculadaPorVelocidade,
    velocidadeMs,
    vazaoM3s,
    numerador: vazaoM3s,
    denominador: RATIONAL_METHOD_K * coefC * intensidadeMmH * larguraImpluvioM,
    comprimentoCriticoM,
  }
}
