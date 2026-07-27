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
 * da seção completa são a SOMA das duas (idênticas por simetria, superfícies
 * reais), não os de uma face só. Um V simétrico de largura total 2W escoa o
 * dobro de uma sarjeta de um lado só com a mesma largura de face W —
 * desprezar a segunda face subestima a capacidade pela metade.
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
 * HEC-22/FHWA, "seção triangular integrada": geometria composta completa —
 * área E perímetro reais (comprimento de arco por segmento), somada nas
 * duas faces se simétrico, mesma precisão da Sarjeta Crítica. Manning
 * aplicado direto sobre a geometria real de dois planos (calha do sarjetão +
 * via) — necessário porque a calha tem sua própria declividade, geralmente
 * bem diferente da via.
 *
 * Único método mantido no módulo — o "Método 1" (Manning genérico, seção
 * retangular equivalente) foi removido por decisão do usuário: a
 * aproximação genérica não trazia benefício sobre a geometria real já
 * calculada aqui, só uma segunda estimativa mais grosseira pra comparar.
 */
export function calcularCapacidadeHec22(params: ParametrosCapacidadeComposta): ResultadoCapacidade {
  const { manningN, declividadeLongitudinalMM: SL } = params
  const { areaMolhadaM2, perimetroMolhadoM } = geometriaTotal(params)
  const raioHidraulicoM = areaMolhadaM2 / perimetroMolhadoM
  const vazaoCapacidadeM3s = (1 / manningN) * areaMolhadaM2 * Math.pow(raioHidraulicoM, 2 / 3) * Math.sqrt(SL)
  return { areaMolhadaM2, raioHidraulicoM, velocidadeMs: vazaoCapacidadeM3s / areaMolhadaM2, vazaoCapacidadeM3s }
}
