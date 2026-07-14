import type { GeometriaSarjetaResultado, ParametrosGeometriaTriangular } from '../types'

/**
 * Geometria da sarjeta triangular composta (via + calha da sarjeta), padrão
 * HEC-22/FHWA: dois planos de declividade transversal — o da via (Sx, mais
 * suave) e o da própria calha da sarjeta (Sw, geralmente mais íngreme, a
 * "depressão"). Quando Sw = Sx a seção degenera exatamente na sarjeta
 * triangular simples de um único plano — por isso uma função só cobre os
 * dois casos citados no enunciado, sem precisar de implementações separadas.
 *
 * Referencial: x=0 na face do meio-fio, onde a lâmina vale y0 (o limite
 * admitido); a profundidade decresce linearmente até 0 na borda do
 * espraiamento (T). Dois casos:
 *
 * - Caso B: o espraiamento fica inteiro dentro da largura da sarjeta
 *   (T ≤ W) — triângulo simples de declividade Sw.
 * - Caso A: o espraiamento avança sobre a via, além da sarjeta — a área é a
 *   soma do trapézio da calha (0..W, declividade Sw) com o triângulo
 *   remanescente sobre a via (W..T, declividade Sx).
 *
 * O perímetro molhado usa o comprimento de arco real (√(1+declividade²) por
 * segmento) em vez da aproximação usual em espraiamento (P≈T) — mais preciso
 * e a diferença é desprezível para declividades típicas de via/sarjeta.
 */
export function calcularGeometriaTriangular(params: ParametrosGeometriaTriangular): GeometriaSarjetaResultado {
  const { y0M, larguraSarjetaM: w, declividadeTransversalViaMM: sx, declividadeTransversalSarjetaMM: sw } = params

  if (y0M <= 0 || w < 0 || sx <= 0 || sw <= 0) {
    throw new Error('Geometria da sarjeta triangular inválida: Y0, declividade da via e declividade da sarjeta devem ser positivos, e a largura não pode ser negativa.')
  }

  const profundidadeNaBordaDaSarjeta = y0M - sw * w // y_W

  if (profundidadeNaBordaDaSarjeta <= 0) {
    // Caso B — espraiamento contido na largura da sarjeta
    const espraiamento = y0M / sw
    const areaMolhadaM2 = (y0M * espraiamento) / 2
    const perimetroMolhadoM = Math.sqrt(1 + sw * sw) * espraiamento
    return { areaMolhadaM2, perimetroMolhadoM, raioHidraulicoM: areaMolhadaM2 / perimetroMolhadoM }
  }

  // Caso A — espraiamento avança sobre a via
  const larguraAdicionalNaVia = profundidadeNaBordaDaSarjeta / sx // T - W
  const areaMolhadaM2 =
    y0M * w - (sw * w * w) / 2 + (profundidadeNaBordaDaSarjeta * profundidadeNaBordaDaSarjeta) / (2 * sx)
  const perimetroMolhadoM = Math.sqrt(1 + sw * sw) * w + Math.sqrt(1 + sx * sx) * larguraAdicionalNaVia

  return { areaMolhadaM2, perimetroMolhadoM, raioHidraulicoM: areaMolhadaM2 / perimetroMolhadoM }
}

export interface PontoPerfil {
  x: number // distância horizontal a partir do meio-fio (m)
  y: number // profundidade da lâmina nesse ponto (m) — 0 na borda do espraiamento
}

/**
 * Pontos do perfil do fundo da seção (meio-fio → sarjeta → via), pra desenho
 * da área molhada — mesma lógica de casos de `calcularGeometriaTriangular`,
 * só que devolvendo a polilinha em vez da área/perímetro integrados.
 */
export function pontosPerfilTriangular(params: ParametrosGeometriaTriangular): PontoPerfil[] {
  const { y0M, larguraSarjetaM: w, declividadeTransversalViaMM: sx, declividadeTransversalSarjetaMM: sw } = params
  const profundidadeNaBordaDaSarjeta = y0M - sw * w

  if (profundidadeNaBordaDaSarjeta <= 0) {
    const espraiamento = y0M / sw
    return [
      { x: 0, y: y0M },
      { x: espraiamento, y: 0 },
    ]
  }

  const larguraAdicionalNaVia = profundidadeNaBordaDaSarjeta / sx
  return [
    { x: 0, y: y0M },
    { x: w, y: profundidadeNaBordaDaSarjeta },
    { x: w + larguraAdicionalNaVia, y: 0 },
  ]
}
