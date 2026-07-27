import { calcularGeometriaCompostaSarjetao } from './espraiamento'
import type { ResultadoCapacidade } from './types'

export interface ParametrosCapacidadeComposta {
  yMaxM: number
  larguraSarjetaoEfetivaM: number // W — largura de UMA face da calha (mesma usada no Δh)
  sxSarjetao: number // declividade transversal da calha nesse ponto (alto, baixo ou médio — ver faixaEspraiamento)
  sxPista: number // declividade transversal da via fora da calha
  manningN: number
  declividadeLongitudinalMM: number // SL, derivada de Δh/braço
  numeroFaces: 1 | 2 // 2 se tipoSecao='simetrico' (duas faces espelhadas somam a seção em V completa); 1 se 'um_lado'
}

/**
 * Geometria de UMA face (0→W na calha, W→T na via) dobrada pro número de
 * faces reais da seção: no tipo 'simetrico' a calha tem DUAS faces
 * espelhadas que se encontram no fundo do V — a área e o perímetro molhados
 * da seção completa são a SOMA das duas (idênticas por simetria), não os de
 * uma face só. Um V simétrico de largura total 2W escoa o dobro de uma
 * sarjeta de um lado só com a mesma largura de face W — desprezar a segunda
 * face subestima a capacidade pela metade.
 */
function geometriaTotal(params: ParametrosCapacidadeComposta) {
  const { yMaxM, larguraSarjetaoEfetivaM, sxSarjetao, sxPista, numeroFaces } = params
  const face = calcularGeometriaCompostaSarjetao({ yMaxM, larguraSarjetaoEfetivaM, sxSarjetao, sxPista })
  return {
    areaMolhadaM2: face.areaMolhadaM2 * numeroFaces,
    perimetroMolhadoM: face.perimetroMolhadoM * numeroFaces,
    larguraEspraiamentoM: face.larguraEspraiamentoM,
  }
}

/**
 * Método 1 — Manning genérico, "seção retangular equivalente": a ÁREA já é a
 * real, composta pelos dois triângulos (calha + via, ver
 * calcularGeometriaCompostaSarjetao), somada nas duas faces se simétrico —
 * não mais T·y_max de um plano só. A simplificação que sobra, e que dá nome
 * ao método, é tratar o perímetro como 2T (canal largo e raso, T ≫ y_max),
 * em vez do comprimento de arco real dos dois planos.
 *
 * O perímetro NÃO é multiplicado por numeroFaces: T já é medido a partir do
 * eixo/fundo do V (uma face), então 2T já corresponde à largura total do
 * "retângulo equivalente" (de -T a +T) quando simétrico — multiplicar de
 * novo pelas duas faces contaria a largura em dobro. Isso não é uma
 * superfície real (não é a pista nem a calha, é só a aproximação genérica
 * de largura do método) — só a ÁREA real (que É fisicamente a soma das
 * duas faces) precisa do fator numeroFaces.
 */
export function calcularCapacidadeManningGenerica(params: ParametrosCapacidadeComposta): ResultadoCapacidade {
  const { manningN, declividadeLongitudinalMM: SL } = params
  const { areaMolhadaM2, larguraEspraiamentoM: T } = geometriaTotal(params)
  const perimetroMolhadoM = 2 * T
  const raioHidraulicoM = areaMolhadaM2 / perimetroMolhadoM
  const vazaoCapacidadeM3s = (1 / manningN) * areaMolhadaM2 * Math.pow(raioHidraulicoM, 2 / 3) * Math.sqrt(SL)
  return { areaMolhadaM2, raioHidraulicoM, velocidadeMs: vazaoCapacidadeM3s / areaMolhadaM2, vazaoCapacidadeM3s }
}

/**
 * Método 2 — HEC-22/FHWA, "seção triangular integrada": geometria composta
 * completa — área E perímetro reais (comprimento de arco por segmento),
 * somada nas duas faces se simétrico, mesma precisão da Sarjeta Crítica.
 * Substitui a antiga fórmula fechada Qcap=(0,375/n)·Sx^(5/3)·SL^(1/2)·T^(8/3)
 * (que só é válida pra um único plano uniforme, derivada analiticamente sob
 * essa hipótese) por Manning aplicado direto sobre a geometria real de dois
 * planos — necessário porque a calha do sarjetão tem sua própria
 * declividade, geralmente bem diferente da via.
 */
export function calcularCapacidadeHec22(params: ParametrosCapacidadeComposta): ResultadoCapacidade {
  const { manningN, declividadeLongitudinalMM: SL } = params
  const { areaMolhadaM2, perimetroMolhadoM } = geometriaTotal(params)
  const raioHidraulicoM = areaMolhadaM2 / perimetroMolhadoM
  const vazaoCapacidadeM3s = (1 / manningN) * areaMolhadaM2 * Math.pow(raioHidraulicoM, 2 / 3) * Math.sqrt(SL)
  return { areaMolhadaM2, raioHidraulicoM, velocidadeMs: vazaoCapacidadeM3s / areaMolhadaM2, vazaoCapacidadeM3s }
}
