import { describe, expect, it } from 'vitest'
import {
  agruparQuantidadesPorItem,
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
  it('sem talude (0), é o prisma retangular simples: largura × altura do berço × comprimento', () => {
    const params = { larguraFundoM: 1.2, taludeHv: 0, alturaBercoM: 0.15 }
    expect(calcularVolumeBercoM3(20, params)).toBeCloseTo(1.2 * 0.15 * 20, 6)
  })

  it('com talude, considera o alargamento da vala na faixa de altura do berço (mesma fórmula trapezoidal da escavação)', () => {
    // largura 1.2, altura berço 0.15, talude 0.5 -> área = 1.2*0.15 + 0.5*0.15² = 0.18 + 0.01125 = 0.19125
    const params = { larguraFundoM: 1.2, taludeHv: 0.5, alturaBercoM: 0.15 }
    const volume = calcularVolumeBercoM3(20, params)
    expect(volume).toBeCloseTo(areaSecaoValaM2(0.15, 1.2, 0.5) * 20, 6)
    expect(volume).toBeGreaterThan(1.2 * 0.15 * 20) // maior que o retângulo simples, por causa do talude
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

describe('agruparQuantidadesPorItem', () => {
  const item = (over: Partial<Parameters<typeof agruparQuantidadesPorItem>[0][number]>) => ({
    material: 'CONCRETO',
    diametroM: 0.6,
    comprimentoM: 10,
    volumeEscavacaoM3: 5,
    volumeBercoM3: 1,
    volumeReaterroM3: 3,
    ...over,
  })

  it('soma as quantidades de trechos com o mesmo material e diâmetro num único item', () => {
    const resumo = agruparQuantidadesPorItem([item({}), item({ comprimentoM: 20, volumeEscavacaoM3: 8 })])
    expect(resumo).toHaveLength(1)
    expect(resumo[0]).toMatchObject({ material: 'CONCRETO', diametroM: 0.6, quantidade: 2, comprimentoTotalM: 30 })
    expect(resumo[0].volumeEscavacaoTotalM3).toBeCloseTo(13)
  })

  it('separa itens com material ou diâmetro diferentes em grupos distintos', () => {
    const resumo = agruparQuantidadesPorItem([item({}), item({ diametroM: 0.8 }), item({ material: 'PEAD' })])
    expect(resumo).toHaveLength(3)
  })

  it('não abre grupo novo por ruído de ponto flutuante no diâmetro', () => {
    const resumo = agruparQuantidadesPorItem([item({ diametroM: 0.6 }), item({ diametroM: 0.6 + 1e-10 })])
    expect(resumo).toHaveLength(1)
    expect(resumo[0].quantidade).toBe(2)
  })

  it('agrupa material vazio/nulo como "SEM MATERIAL", e é case-insensitive no material', () => {
    const resumo = agruparQuantidadesPorItem([item({ material: null }), item({ material: '' }), item({ material: 'concreto' })])
    expect(resumo.find((r) => r.material === 'SEM MATERIAL')?.quantidade).toBe(2)
    expect(resumo.find((r) => r.material === 'concreto')?.quantidade).toBe(1)
  })

  it('ordena por material, depois por diâmetro', () => {
    const resumo = agruparQuantidadesPorItem([
      item({ material: 'PEAD', diametroM: 0.4 }),
      item({ material: 'CONCRETO', diametroM: 0.8 }),
      item({ material: 'CONCRETO', diametroM: 0.6 }),
    ])
    expect(resumo.map((r) => `${r.material}-${r.diametroM}`)).toEqual(['CONCRETO-0.6', 'CONCRETO-0.8', 'PEAD-0.4'])
  })

  it('lista vazia devolve resumo vazio', () => {
    expect(agruparQuantidadesPorItem([])).toEqual([])
  })
})
