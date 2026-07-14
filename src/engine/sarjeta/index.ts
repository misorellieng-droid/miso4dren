import { RATIONAL_METHOD_K } from '../constants'
import { calcularGeometria } from './geometria'
import { calcularDeclividadeParaVelocidade, calcularVazao, calcularVelocidade } from './hidraulica'
import { calcularComprimentoCritico, calcularComprimentoCriticoComDesnivelFixo } from './comprimentoCritico'
import type { ParametrosGeometriaSarjeta } from './types'

export * from './types'
export { calcularGeometria } from './geometria'
export { calcularGeometriaTriangular } from './geometrias/triangular'
export { calcularGeometriaTriangularSimetrica } from './geometrias/triangularSimetrica'
export { calcularVelocidade, calcularVazao, calcularDeclividadeParaVelocidade } from './hidraulica'
export { calcularComprimentoCritico, calcularComprimentoCriticoComDesnivelFixo } from './comprimentoCritico'

interface ParametrosSarjetaBase {
  geometria: ParametrosGeometriaSarjeta
  manningN: number // rugosidade de Manning da sarjeta (campo próprio, não compartilhado com o n de tubos)
  coefC: number
  intensidadeMmH: number
  larguraImpluvioM: number
}

export type ModoDeclividade = 'informada' | 'velocidade_minima' | 'desnivel_fixo'

/**
 * A declividade longitudinal pode ser:
 * - informada diretamente (a via tem uma declividade real);
 * - calculada a partir de uma velocidade mínima de autolimpeza desejada
 *   (via plana, mas o fundo da calha é inclinado longitudinalmente); ou
 * - calculada a partir de um desnível fixo dividido pelo próprio
 *   comprimento (via plana E a calha também não é inclinada no fundo — o
 *   desnível vem de variar a declividade transversal ao longo do
 *   comprimento, "dente de serra" — ver calcularComprimentoCriticoComDesnivelFixo).
 */
export type ParametrosSarjeta = ParametrosSarjetaBase &
  (
    | { declividadeLongitudinalMM: number; velocidadeMinimaMs?: never; desnivelFixoM?: never }
    | { velocidadeMinimaMs: number; declividadeLongitudinalMM?: never; desnivelFixoM?: never }
    | { desnivelFixoM: number; declividadeLongitudinalMM?: never; velocidadeMinimaMs?: never }
  )

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
 * declividade longitudinal (informada, ou derivada de uma velocidade mínima,
 * ou derivada de um desnível fixo) → velocidade (Manning) → vazão →
 * comprimento crítico. Substitui a antiga fórmula fechada (válida só pra
 * seção triangular ideal) por uma composição de funções independentes e
 * testáveis isoladamente.
 */
export function calcularSarjeta(params: ParametrosSarjeta): MemorialCalculoSarjeta {
  const { geometria, manningN, coefC, intensidadeMmH, larguraImpluvioM } = params

  const { areaMolhadaM2, perimetroMolhadoM, raioHidraulicoM } = calcularGeometria(geometria)
  const raioHidraulicoElevadoDoisTercos = Math.pow(raioHidraulicoM, 2 / 3)

  if (params.desnivelFixoM != null) {
    const comprimentoCriticoM = calcularComprimentoCriticoComDesnivelFixo(
      areaMolhadaM2,
      raioHidraulicoM,
      manningN,
      params.desnivelFixoM,
      coefC,
      intensidadeMmH,
      larguraImpluvioM
    )
    const declividadeLongitudinalMM = params.desnivelFixoM / comprimentoCriticoM
    const velocidadeMs = calcularVelocidade(raioHidraulicoM, manningN, declividadeLongitudinalMM)
    const vazaoM3s = calcularVazao(areaMolhadaM2, velocidadeMs)

    return {
      areaMolhadaM2,
      perimetroMolhadoM,
      raioHidraulicoM,
      raioHidraulicoElevadoDoisTercos,
      declividadeLongitudinalMM,
      modoDeclividade: 'desnivel_fixo',
      velocidadeMs,
      vazaoM3s,
      numerador: vazaoM3s,
      denominador: RATIONAL_METHOD_K * coefC * intensidadeMmH * larguraImpluvioM,
      comprimentoCriticoM,
    }
  }

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
