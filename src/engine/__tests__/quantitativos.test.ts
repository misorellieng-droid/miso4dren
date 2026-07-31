import { describe, expect, it } from 'vitest'
import {
  areaSecaoValaM2,
  calcularVolumeBercoM3,
  calcularVolumeEscavacaoM3,
  calcularVolumeReaterroM3,
  calcularVolumeTuboM3,
  calcularVolumesTrecho,
} from '../quantitativos'

describe('areaSecaoValaM2', () => {
  it('sem talude (0), a seção é um retângulo simples: largura × profundidade', () => {
    expect(areaSecaoValaM2(3, 1.2, 0)).toBeCloseTo(1.2 * 3, 6)
  })

  it('com talude, soma a área dos dois triângulos laterais (talude × H²)', () => {
    // largura 1.2, profundidade 4, talude 0.5 -> 1.2*4 + 0.5*16 = 4.8 + 8 = 12.8
    expect(areaSecaoValaM2(4, 1.2, 0.5)).toBeCloseTo(12.8, 6)
  })

  it('profundidade negativa (cota de terreno abaixo do fundo do berço) é tratada como zero', () => {
    expect(areaSecaoValaM2(-1, 1.2, 0.5)).toBe(0)
  })
})

describe('calcularVolumeEscavacaoM3', () => {
  it('seção constante (mesma profundidade nas duas pontas) = área × comprimento', () => {
    // terreno 105, fundo do tubo 100.6, berço 0.1 -> profundidade até o fundo do berço = 105-(100.6-0.1) = 4.5
    const params = { larguraFundoM: 1.2, taludeHv: 0.5, alturaBercoM: 0.1 }
    const volume = calcularVolumeEscavacaoM3(10, 105, 100.6, 105, 100.6, params)
    const area = areaSecaoValaM2(4.5, 1.2, 0.5)
    expect(volume).toBeCloseTo(area * 10, 6)
  })

  it('seções diferentes usa a média das duas áreas (método da área média)', () => {
    const params = { larguraFundoM: 1.2, taludeHv: 0.5, alturaBercoM: 0.1 }
    const volume = calcularVolumeEscavacaoM3(10, 105, 100.6, 103.8, 99.3, params)
    const areaMontante = areaSecaoValaM2(105 - (100.6 - 0.1), 1.2, 0.5)
    const areaJusante = areaSecaoValaM2(103.8 - (99.3 - 0.1), 1.2, 0.5)
    expect(volume).toBeCloseTo(((areaMontante + areaJusante) / 2) * 10, 6)
  })
})

describe('calcularVolumeBercoM3', () => {
  it('prisma retangular: largura × altura do berço × comprimento', () => {
    const params = { larguraFundoM: 1.2, taludeHv: 0.5, alturaBercoM: 0.15 }
    expect(calcularVolumeBercoM3(20, params)).toBeCloseTo(1.2 * 0.15 * 20, 6)
  })
})

describe('calcularVolumeTuboM3', () => {
  it('área do círculo × comprimento', () => {
    expect(calcularVolumeTuboM3(10, 1)).toBeCloseTo((Math.PI / 4) * 1 * 1 * 10, 6)
  })
})

describe('calcularVolumeReaterroM3', () => {
  it('escavação menos berço menos tubo', () => {
    expect(calcularVolumeReaterroM3(100, 10, 20)).toBeCloseTo(70, 6)
  })

  it('nunca fica negativo (clampa em zero) se tubo+berço excederem a escavação', () => {
    expect(calcularVolumeReaterroM3(10, 8, 8)).toBe(0)
  })
})

describe('calcularVolumesTrecho', () => {
  it('os três volumes são consistentes entre si: reaterro = escavação - berço - tubo', () => {
    const params = { larguraFundoM: 1.2, taludeHv: 0.5, alturaBercoM: 0.1 }
    const r = calcularVolumesTrecho(10, 105, 100.6, 103.8, 99.3, 0.85, params)
    const volumeTuboM3 = calcularVolumeTuboM3(10, 0.85)
    expect(r.volumeReaterroM3).toBeCloseTo(r.volumeEscavacaoM3 - r.volumeBercoM3 - volumeTuboM3, 6)
    expect(r.volumeEscavacaoM3).toBeGreaterThan(0)
    expect(r.volumeBercoM3).toBeGreaterThan(0)
  })
})
