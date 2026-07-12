import { RATIONAL_METHOD_K } from '../constants'
import { calcularGeometria } from './geometria'
import { calcularVazao, calcularVelocidade } from './hidraulica'
import { calcularComprimentoCritico } from './comprimentoCritico'
import type { ParametrosGeometriaSarjeta } from './types'

export * from './types'
export { calcularGeometria } from './geometria'
export { calcularGeometriaTriangular } from './geometrias/triangular'
export { calcularVelocidade, calcularVazao } from './hidraulica'
export { calcularComprimentoCritico } from './comprimentoCritico'

export interface ParametrosSarjeta {
  geometria: ParametrosGeometriaSarjeta
  declividadeLongitudinalMM: number
  manningN: number // rugosidade de Manning da sarjeta (campo próprio, não compartilhado com o n de tubos)
  coefC: number
  intensidadeMmH: number
  larguraImpluvioM: number
}

/** Valores intermediários completos, pro painel "Memorial de Cálculo" — conferência direta com planilhas/memoriais externos. */
export interface MemorialCalculoSarjeta {
  areaMolhadaM2: number
  perimetroMolhadoM: number
  raioHidraulicoM: number
  raioHidraulicoElevadoDoisTercos: number
  velocidadeMs: number
  vazaoM3s: number
  numerador: number
  denominador: number
  comprimentoCriticoM: number
}

/**
 * Sequência completa do módulo de sarjeta crítica: geometria da seção →
 * velocidade (Manning) → vazão → comprimento crítico. Substitui a antiga
 * fórmula fechada (válida só pra seção triangular ideal) por uma composição
 * de funções independentes e testáveis isoladamente.
 */
export function calcularSarjeta(params: ParametrosSarjeta): MemorialCalculoSarjeta {
  const { geometria, declividadeLongitudinalMM, manningN, coefC, intensidadeMmH, larguraImpluvioM } = params

  const { areaMolhadaM2, perimetroMolhadoM, raioHidraulicoM } = calcularGeometria(geometria)
  const raioHidraulicoElevadoDoisTercos = Math.pow(raioHidraulicoM, 2 / 3)
  const velocidadeMs = calcularVelocidade(raioHidraulicoM, manningN, declividadeLongitudinalMM)
  const vazaoM3s = calcularVazao(areaMolhadaM2, velocidadeMs)
  const comprimentoCriticoM = calcularComprimentoCritico(vazaoM3s, coefC, intensidadeMmH, larguraImpluvioM)

  return {
    areaMolhadaM2,
    perimetroMolhadoM,
    raioHidraulicoM,
    raioHidraulicoElevadoDoisTercos,
    velocidadeMs,
    vazaoM3s,
    numerador: vazaoM3s,
    denominador: RATIONAL_METHOD_K * coefC * intensidadeMmH * larguraImpluvioM,
    comprimentoCriticoM,
  }
}
