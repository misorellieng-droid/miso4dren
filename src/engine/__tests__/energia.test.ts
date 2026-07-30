import { describe, expect, it } from 'vitest'
import { calcularCotaMontantePorEnergia, calcularCotasPorEnergia, calcularLinhaEnergia } from '../energia'

describe('calcularLinhaEnergia', () => {
  it('soma cota de fundo + lâmina + carga cinética V²/2g', () => {
    const egl = calcularLinhaEnergia(100, 0.3, 2.0)
    expect(egl).toBeCloseTo(100 + 0.3 + (2.0 * 2.0) / (2 * 9.81), 6)
  })

  it('degrau zero implica EGL jusante == EGL montante (consistência com calcularCotaMontantePorEnergia)', () => {
    const cotaJusante = calcularCotaMontantePorEnergia(100, 0.2, 2.0, 0.4, 1.0)
    const eglMontante = calcularLinhaEnergia(100, 0.2, 2.0)
    const eglJusante = calcularLinhaEnergia(cotaJusante, 0.4, 1.0)
    expect(eglJusante).toBeCloseTo(eglMontante, 6)
  })
})

describe('calcularCotaMontantePorEnergia', () => {
  it('degrau zero quando lâmina e velocidade são iguais dos dois lados', () => {
    const cota = calcularCotaMontantePorEnergia(100, 0.3, 1.5, 0.3, 1.5)
    expect(cota).toBeCloseTo(100, 6)
  })

  it('exige um degrau (cota mais baixa) quando o jusante tem mais energia específica que o montante', () => {
    // montante: lâmina 0.2m, V=2.0 m/s -> carga cinética 4/19.62=0.20387
    // jusante: lâmina 0.4m, V=1.0 m/s -> carga cinética 1/19.62=0.05097
    // energia específica jusante (0.45097) > montante (0.40387) -> precisa de degrau negativo
    const cota = calcularCotaMontantePorEnergia(100, 0.2, 2.0, 0.4, 1.0)
    expect(cota).toBeLessThan(100)
    expect(cota).toBeCloseTo(99.9529, 3)
  })

  it('permite cota mais alta (\"sobra\" de energia) quando o jusante tem menos energia específica', () => {
    const cota = calcularCotaMontantePorEnergia(100, 0.4, 1.0, 0.2, 2.0)
    expect(cota).toBeGreaterThan(100)
  })
})

describe('calcularCotasPorEnergia', () => {
  it('preserva a cota de fundo montante da cabeceira (âncora) sem alterar', () => {
    const trechos = [{ id: 't1', montanteId: 'A', jusanteId: 'B', comprimentoM: 20, declividadeMM: 0.01 }]
    const cotaAtual = new Map([['t1', 850]])
    const lamina = new Map([['t1', 0.3]])
    const velocidade = new Map([['t1', 1.2]])
    const resultado = calcularCotasPorEnergia(['A', 'B'], trechos, cotaAtual, lamina, velocidade)
    expect(resultado.get('t1')!.cotaFundoMontante).toBe(850)
    expect(resultado.get('t1')!.cotaFundoJusante).toBeCloseTo(850 - 0.01 * 20)
  })

  it('propaga o degrau de energia pra rede linear com mudança de diâmetro', () => {
    // T1 (cabeceira, pequeno/rápido) -> T2 (maior/mais lento) numa rede linear
    const trechos = [
      { id: 't1', montanteId: 'A', jusanteId: 'B', comprimentoM: 20, declividadeMM: 0.01 },
      { id: 't2', montanteId: 'B', jusanteId: 'C', comprimentoM: 30, declividadeMM: 0.005 },
    ]
    const cotaAtual = new Map([['t1', 100]])
    const lamina = new Map([
      ['t1', 0.2],
      ['t2', 0.4],
    ])
    const velocidade = new Map([
      ['t1', 2.0],
      ['t2', 1.0],
    ])
    const resultado = calcularCotasPorEnergia(['A', 'B', 'C'], trechos, cotaAtual, lamina, velocidade)

    const t1 = resultado.get('t1')!
    expect(t1.cotaFundoMontante).toBe(100)
    expect(t1.cotaFundoJusante).toBeCloseTo(100 - 0.01 * 20) // 99.8

    const t2 = resultado.get('t2')!
    // cota de fundo montante de T2 = pela energia, não pela continuação direta de t1.cotaFundoJusante (99.8)
    expect(t2.cotaFundoMontante).toBeCloseTo(99.8 - 0.0471, 3)
    expect(t2.cotaFundoJusante).toBeCloseTo(t2.cotaFundoMontante - 0.005 * 30)
  })

  it('numa confluência, usa a cota mais restritiva (menor) entre os ramos que chegam', () => {
    const trechos = [
      { id: 't1', montanteId: 'A', jusanteId: 'C', comprimentoM: 10, declividadeMM: 0.01 },
      { id: 't2', montanteId: 'B', jusanteId: 'C', comprimentoM: 10, declividadeMM: 0.01 },
      { id: 't3', montanteId: 'C', jusanteId: 'D', comprimentoM: 20, declividadeMM: 0.005 },
    ]
    const cotaAtual = new Map([
      ['t1', 100],
      ['t2', 100.5], // ramo B chega "mais alto"
    ])
    const lamina = new Map([
      ['t1', 0.3],
      ['t2', 0.3],
      ['t3', 0.3],
    ])
    const velocidade = new Map([
      ['t1', 1.5],
      ['t2', 1.0], // ramo B mais lento -> menos energia cinética -> exige cota de C mais baixa
      ['t3', 1.5],
    ])
    const resultado = calcularCotasPorEnergia(['A', 'B', 'C', 'D'], trechos, cotaAtual, lamina, velocidade)

    // cota de fundo jusante de cada ramo de entrada
    const t1JusanteCota = 100 - 0.01 * 10 // 99.9
    const t2JusanteCota = 100.5 - 0.01 * 10 // 100.4

    const g = 9.81
    const eglT1 = t1JusanteCota + 0.3 + (1.5 * 1.5) / (2 * g)
    const eglT2 = t2JusanteCota + 0.3 + (1.0 * 1.0) / (2 * g)
    const candidatoT1 = eglT1 - 0.3 - (1.5 * 1.5) / (2 * g)
    const candidatoT2 = eglT2 - 0.3 - (1.5 * 1.5) / (2 * g)

    const t3 = resultado.get('t3')!
    expect(t3.cotaFundoMontante).toBeCloseTo(Math.min(candidatoT1, candidatoT2), 6)
  })
})
