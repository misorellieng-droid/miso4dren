import type { GeometriaSarjetaResultado, ParametrosGeometriaTriangularSimetrica } from '../types'

/**
 * Sarjetão em V simétrico: duas faces planas de mesma declividade
 * transversal (S), convergindo no ponto mais baixo, alimentadas igualmente
 * dos dois lados. Geometricamente é o dobro de uma sarjeta triangular de um
 * lado só com o mesmo Y0 e a mesma declividade — a área e o perímetro
 * molhado dobram, mas o raio hidráulico (Rh = A/P) fica idêntico ao de um
 * lado só, já que os dois dobram na mesma proporção.
 */
export function calcularGeometriaTriangularSimetrica(params: ParametrosGeometriaTriangularSimetrica): GeometriaSarjetaResultado {
  const { y0M, declividadeTransversalMM: s } = params

  if (y0M <= 0 || s <= 0) {
    throw new Error('Geometria do sarjetão em V simétrico inválida: Y0 e declividade transversal devem ser positivos.')
  }

  const espraiamentoPorLado = y0M / s
  const areaMolhadaM2 = y0M * espraiamentoPorLado // = 2 × (y0 × espraiamento / 2), já somando os dois lados
  const perimetroMolhadoM = 2 * Math.sqrt(1 + s * s) * espraiamentoPorLado

  return { areaMolhadaM2, perimetroMolhadoM, raioHidraulicoM: areaMolhadaM2 / perimetroMolhadoM }
}
