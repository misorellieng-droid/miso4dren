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
    const trechos = [{ id: 't1', montanteId: 'A', jusanteId: 'B', comprimentoM: 20, declividadeMM: 0.01, diametroM: 0.4 }]
    const cotaAtual = new Map([['t1', 850]])
    const lamina = new Map([['t1', 0.3]])
    const velocidade = new Map([['t1', 1.2]])
    const resultado = calcularCotasPorEnergia(['A', 'B'], trechos, cotaAtual, lamina, velocidade)
    expect(resultado.get('t1')!.cotaFundoMontante).toBe(850)
    expect(resultado.get('t1')!.cotaFundoJusante).toBeCloseTo(850 - 0.01 * 20)
  })

  it('sem mudança de diâmetro, ignora o cálculo de energia -- continuação simples (degrau zero), mesmo com lâmina/velocidade bem diferentes', () => {
    // T1 e T2 têm o MESMO diâmetro -- mesmo com lâmina/velocidade bem diferentes (o que geraria
    // um degrau e tanto se a energia fosse aplicada sempre), a cota de T2 deve só continuar
    // direto a cota de fundo jusante de T1, sem nenhum ajuste.
    const trechos = [
      { id: 't1', montanteId: 'A', jusanteId: 'B', comprimentoM: 20, declividadeMM: 0.01, diametroM: 0.4 },
      { id: 't2', montanteId: 'B', jusanteId: 'C', comprimentoM: 30, declividadeMM: 0.005, diametroM: 0.4 },
    ]
    const cotaAtual = new Map([['t1', 100]])
    const lamina = new Map([
      ['t1', 0.1],
      ['t2', 0.6],
    ])
    const velocidade = new Map([
      ['t1', 3.0],
      ['t2', 0.2],
    ])
    const resultado = calcularCotasPorEnergia(['A', 'B', 'C'], trechos, cotaAtual, lamina, velocidade)

    const t1 = resultado.get('t1')!
    const t2 = resultado.get('t2')!
    expect(t2.cotaFundoMontante).toBeCloseTo(t1.cotaFundoJusante, 6) // degrau zero -- sem ajuste por energia
  })

  it('propaga o degrau de energia pra rede linear COM mudança de diâmetro', () => {
    // T1 (cabeceira, pequeno/rápido) -> T2 (maior/mais lento) numa rede linear
    const trechos = [
      { id: 't1', montanteId: 'A', jusanteId: 'B', comprimentoM: 20, declividadeMM: 0.01, diametroM: 0.4 },
      { id: 't2', montanteId: 'B', jusanteId: 'C', comprimentoM: 30, declividadeMM: 0.005, diametroM: 0.6 },
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

  it('numa confluência SEM mudança de diâmetro, usa a cota mais restritiva (menor) entre as entradas -- sem cálculo de energia', () => {
    const trechos = [
      { id: 't1', montanteId: 'A', jusanteId: 'C', comprimentoM: 10, declividadeMM: 0.01, diametroM: 0.4 },
      { id: 't2', montanteId: 'B', jusanteId: 'C', comprimentoM: 10, declividadeMM: 0.01, diametroM: 0.4 },
      { id: 't3', montanteId: 'C', jusanteId: 'D', comprimentoM: 20, declividadeMM: 0.005, diametroM: 0.4 },
    ]
    const cotaAtual = new Map([
      ['t1', 100],
      ['t2', 100.5],
    ])
    const lamina = new Map([
      ['t1', 0.3],
      ['t2', 0.1], // lâmina/velocidade bem diferentes -- não deve importar, mesmo diâmetro em tudo
      ['t3', 0.3],
    ])
    const velocidade = new Map([
      ['t1', 1.5],
      ['t2', 5.0],
      ['t3', 1.5],
    ])
    const resultado = calcularCotasPorEnergia(['A', 'B', 'C', 'D'], trechos, cotaAtual, lamina, velocidade)

    const t1JusanteCota = 100 - 0.01 * 10 // 99.9
    const t2JusanteCota = 100.5 - 0.01 * 10 // 100.4
    const t3 = resultado.get('t3')!
    expect(t3.cotaFundoMontante).toBeCloseTo(Math.min(t1JusanteCota, t2JusanteCota), 6) // 99.9, a mais restritiva
  })

  it('numa confluência COM mudança de diâmetro, usa a entrada de MENOR ENERGIA (EGL) como referência -- não necessariamente a de menor cota', () => {
    // t1: cota de fundo mais baixa (mais restritiva), mas velocidade alta -> energia (EGL) MAIOR.
    // t2: cota de fundo mais alta, mas velocidade baixa -> energia (EGL) MENOR, apesar de "menos restritiva" em cota.
    // A referência pro cálculo da saída deve ser t2 (menor energia), não t1 (menor cota).
    const trechos = [
      { id: 't1', montanteId: 'A', jusanteId: 'C', comprimentoM: 10, declividadeMM: 0.01, diametroM: 0.4 },
      { id: 't2', montanteId: 'B', jusanteId: 'C', comprimentoM: 10, declividadeMM: 0.01, diametroM: 0.4 },
      { id: 't3', montanteId: 'C', jusanteId: 'D', comprimentoM: 20, declividadeMM: 0.005, diametroM: 0.6 },
    ]
    const cotaAtual = new Map([
      ['t1', 100],
      ['t2', 100.3],
    ])
    const lamina = new Map([
      ['t1', 0.2],
      ['t2', 0.2],
      ['t3', 0.25],
    ])
    const velocidade = new Map([
      ['t1', 4.0], // alta velocidade -> muita carga cinética -> EGL alta apesar da cota mais baixa
      ['t2', 0.5], // baixa velocidade -> pouca carga cinética -> EGL baixa apesar da cota mais alta
      ['t3', 1.0],
    ])
    const resultado = calcularCotasPorEnergia(['A', 'B', 'C', 'D'], trechos, cotaAtual, lamina, velocidade)

    const g = 9.81
    const t1JusanteCota = 100 - 0.01 * 10 // 99.9
    const t2JusanteCota = 100.3 - 0.01 * 10 // 100.2
    const eglT1 = t1JusanteCota + 0.2 + (4.0 * 4.0) / (2 * g)
    const eglT2 = t2JusanteCota + 0.2 + (0.5 * 0.5) / (2 * g)
    expect(eglT1).toBeGreaterThan(eglT2) // confirma que t1 tem MAIS energia, mesmo com cota mais baixa

    // referência = t2 (menor energia): candidato = EGL(t2) - laminaSaida - carga cinética da saída
    const candidatoEsperado = eglT2 - 0.25 - (1.0 * 1.0) / (2 * g)
    const t3 = resultado.get('t3')!
    expect(t3.cotaFundoMontante).toBeCloseTo(candidatoEsperado, 6)
    // e NÃO é o que se obteria usando t1 (a de menor cota) como referência
    const candidatoSeFosseT1 = eglT1 - 0.25 - (1.0 * 1.0) / (2 * g)
    expect(t3.cotaFundoMontante).not.toBeCloseTo(candidatoSeFosseT1, 3)
  })

  it('nunca deixa a cota subir acima da cota de fundo jusante de quem está entrando (evita água represada na caixa)', () => {
    // t1: cabeceira com lâmina pequena e velocidade alta (muita carga cinética).
    // t2: tubo maior/mais lento a jusante -- a conservação de energia "pediria" uma cota de
    // fundo montante em t2 ACIMA da cota de fundo jusante de t1 (a carga cinética que sobra
    // vira cota), o que deixaria água represada na caixa em vez de escoar. Deve ser limitado
    // à cota de fundo jusante de t1 (degrau zero), não à cota "ideal" pela energia.
    const trechos = [
      { id: 't1', montanteId: 'A', jusanteId: 'B', comprimentoM: 10, declividadeMM: 0.01, diametroM: 0.3 },
      { id: 't2', montanteId: 'B', jusanteId: 'C', comprimentoM: 10, declividadeMM: 0.005, diametroM: 0.8 },
    ]
    const cotaAtual = new Map([['t1', 100]])
    const lamina = new Map([
      ['t1', 0.1],
      ['t2', 0.5],
    ])
    const velocidade = new Map([
      ['t1', 3.0],
      ['t2', 0.2],
    ])
    const resultado = calcularCotasPorEnergia(['A', 'B', 'C'], trechos, cotaAtual, lamina, velocidade)

    const t1 = resultado.get('t1')!
    expect(t1.cotaFundoJusante).toBeCloseTo(99.9, 6)

    // confirma que a energia realmente "pediria" subir (sem o limite, ficaria > 99.9)
    const candidatoSemLimite = calcularCotaMontantePorEnergia(t1.cotaFundoJusante, 0.1, 3.0, 0.5, 0.2)
    expect(candidatoSemLimite).toBeGreaterThan(t1.cotaFundoJusante)

    const t2 = resultado.get('t2')!
    expect(t2.cotaFundoMontante).toBeCloseTo(t1.cotaFundoJusante, 6)
  })

  describe('opcoes.apenasTroncoParaEnergia', () => {
    it('ligado: ignora a troca de diâmetro quando a entrada é ramal (ex.: boca de lobo menor entrando num PV maior da rede tronco) -- degrau zero, mesmo com diâmetro diferente', () => {
      const trechos = [
        { id: 't1', montanteId: 'A', jusanteId: 'B', comprimentoM: 10, declividadeMM: 0.01, diametroM: 0.3, ehTronco: false }, // ramal (boca de lobo)
        { id: 't2', montanteId: 'B', jusanteId: 'C', comprimentoM: 30, declividadeMM: 0.005, diametroM: 0.6, ehTronco: true }, // tronco
      ]
      const cotaAtual = new Map([['t1', 100]])
      const lamina = new Map([
        ['t1', 0.1],
        ['t2', 0.4],
      ])
      const velocidade = new Map([
        ['t1', 3.0],
        ['t2', 1.0],
      ])
      const resultado = calcularCotasPorEnergia(['A', 'B', 'C'], trechos, cotaAtual, lamina, velocidade, {
        apenasTroncoParaEnergia: true,
      })
      const t1 = resultado.get('t1')!
      const t2 = resultado.get('t2')!
      // degrau zero -- a troca de diâmetro (ramal->tronco) foi ignorada
      expect(t2.cotaFundoMontante).toBeCloseTo(t1.cotaFundoJusante, 6)
    })

    it('ligado: continua acionando o EGL quando a troca de diâmetro é ENTRE trechos tronco', () => {
      const trechos = [
        { id: 't1', montanteId: 'A', jusanteId: 'B', comprimentoM: 20, declividadeMM: 0.01, diametroM: 0.4, ehTronco: true },
        { id: 't2', montanteId: 'B', jusanteId: 'C', comprimentoM: 30, declividadeMM: 0.005, diametroM: 0.6, ehTronco: true },
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
      const resultado = calcularCotasPorEnergia(['A', 'B', 'C'], trechos, cotaAtual, lamina, velocidade, {
        apenasTroncoParaEnergia: true,
      })
      const t1 = resultado.get('t1')!
      const t2 = resultado.get('t2')!
      // mesmo resultado do teste "propaga o degrau de energia" (sem a opção) -- tronco->tronco
      // continua acionando o EGL normalmente
      expect(t2.cotaFundoMontante).toBeCloseTo(99.8 - 0.0471, 3)
      expect(t2.cotaFundoMontante).not.toBeCloseTo(t1.cotaFundoJusante, 3)
    })

    it('desligado (padrão): aciona o EGL mesmo sem informação de ehTronco -- comportamento igual a antes da opção existir', () => {
      const trechos = [
        { id: 't1', montanteId: 'A', jusanteId: 'B', comprimentoM: 20, declividadeMM: 0.01, diametroM: 0.4 },
        { id: 't2', montanteId: 'B', jusanteId: 'C', comprimentoM: 30, declividadeMM: 0.005, diametroM: 0.6 },
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
      const t2 = resultado.get('t2')!
      expect(t2.cotaFundoMontante).not.toBeCloseTo(t1.cotaFundoJusante, 3) // EGL acionado, não é degrau zero
    })
  })
})
