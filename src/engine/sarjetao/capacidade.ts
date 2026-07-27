import { calcularGeometriaCompostaSarjetao } from './espraiamento'
import type { ResultadoCapacidade } from './types'

export interface ParametrosCapacidadeComposta {
  yMaxM: number
  larguraSarjetaoEfetivaM: number // W — largura da calha do sarjetão (mesma usada no Δh)
  sxSarjetao: number // declividade transversal da calha nesse ponto (alto, baixo ou médio — ver faixaEspraiamento)
  sxPista: number // declividade transversal da via fora da calha
  manningN: number
  declividadeLongitudinalMM: number // SL, derivada de Δh/braço
}

/**
 * Método 1 — Manning genérico, "seção retangular equivalente": a ÁREA já é a
 * real, composta pelos dois triângulos (calha + via, ver
 * calcularGeometriaCompostaSarjetao) — não mais T·y_max de um plano só. A
 * simplificação que sobra, e que dá nome ao método, é tratar o perímetro
 * como 2T (canal largo e raso, T ≫ y_max), em vez do comprimento de arco real
 * dos dois planos — por isso o Rh (e a capacidade) diverge do Método 2, pra
 * mais ou pra menos dependendo da geometria.
 */
export function calcularCapacidadeManningGenerica(params: ParametrosCapacidadeComposta): ResultadoCapacidade {
  const { yMaxM, larguraSarjetaoEfetivaM, sxSarjetao, sxPista, manningN, declividadeLongitudinalMM: SL } = params
  const { areaMolhadaM2, larguraEspraiamentoM: T } = calcularGeometriaCompostaSarjetao({
    yMaxM,
    larguraSarjetaoEfetivaM,
    sxSarjetao,
    sxPista,
  })
  const perimetroMolhadoM = 2 * T
  const raioHidraulicoM = areaMolhadaM2 / perimetroMolhadoM
  const vazaoCapacidadeM3s = (1 / manningN) * areaMolhadaM2 * Math.pow(raioHidraulicoM, 2 / 3) * Math.sqrt(SL)
  return { areaMolhadaM2, raioHidraulicoM, velocidadeMs: vazaoCapacidadeM3s / areaMolhadaM2, vazaoCapacidadeM3s }
}

/**
 * Método 2 — HEC-22/FHWA, "seção triangular integrada": geometria composta
 * completa — área E perímetro reais (comprimento de arco por segmento),
 * mesma precisão da Sarjeta Crítica. Substitui a antiga fórmula fechada
 * Qcap=(0,375/n)·Sx^(5/3)·SL^(1/2)·T^(8/3) (que só é válida pra um único
 * plano uniforme, derivada analiticamente sob essa hipótese) por Manning
 * aplicado direto sobre a geometria real de dois planos — necessário porque
 * a calha do sarjetão tem sua própria declividade, geralmente bem diferente
 * da via.
 */
export function calcularCapacidadeHec22(params: ParametrosCapacidadeComposta): ResultadoCapacidade {
  const { yMaxM, larguraSarjetaoEfetivaM, sxSarjetao, sxPista, manningN, declividadeLongitudinalMM: SL } = params
  const { areaMolhadaM2, raioHidraulicoM } = calcularGeometriaCompostaSarjetao({
    yMaxM,
    larguraSarjetaoEfetivaM,
    sxSarjetao,
    sxPista,
  })
  const vazaoCapacidadeM3s = (1 / manningN) * areaMolhadaM2 * Math.pow(raioHidraulicoM, 2 / 3) * Math.sqrt(SL)
  return { areaMolhadaM2, raioHidraulicoM, velocidadeMs: vazaoCapacidadeM3s / areaMolhadaM2, vazaoCapacidadeM3s }
}
