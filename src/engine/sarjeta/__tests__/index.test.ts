import { describe, expect, it } from 'vitest'
import { calcularSarjeta } from '../index'

describe('calcularSarjeta (pipeline completo)', () => {
  it('encadeia geometria → velocidade → vazão → comprimento crítico e bate com o cálculo manual', () => {
    const resultado = calcularSarjeta({
      geometria: {
        tipo: 'triangular',
        y0M: 0.13,
        larguraSarjetaM: 0.5,
        declividadeTransversalViaMM: 0.02,
        declividadeTransversalSarjetaMM: 0.06,
      },
      declividadeLongitudinalMM: 0.02,
      manningN: 0.016,
      coefC: 0.9,
      intensidadeMmH: 80,
      larguraImpluvioM: 10,
    })

    expect(resultado.areaMolhadaM2).toBeCloseTo(0.30750000000000005, 9)
    expect(resultado.perimetroMolhadoM).toBeCloseTo(5.501899091474723, 9)
    expect(resultado.raioHidraulicoM).toBeCloseTo(0.05588979275837248, 9)
    expect(resultado.velocidadeMs).toBeCloseTo(1.2920619824024049, 9)
    expect(resultado.vazaoM3s).toBeCloseTo(0.3973090595887396, 9)
    expect(resultado.comprimentoCriticoM).toBeCloseTo(1984.9573320780353, 6)
    expect(resultado.numerador).toBe(resultado.vazaoM3s)
    expect(resultado.raioHidraulicoElevadoDoisTercos).toBeCloseTo(Math.pow(resultado.raioHidraulicoM, 2 / 3), 12)
  })

  it('sarjetão em V simétrico com declividade calculada a partir da velocidade mínima', () => {
    const resultado = calcularSarjeta({
      geometria: { tipo: 'triangular_simetrica', y0M: 0.15, declividadeTransversalMM: 0.02 },
      velocidadeMinimaMs: 0.5,
      manningN: 0.02,
      coefC: 0.9,
      intensidadeMmH: 100,
      larguraImpluvioM: 20, // soma dos dois lados (ex.: 10 m de cada galpão)
    })

    expect(resultado.areaMolhadaM2).toBeCloseTo(1.125, 9)
    expect(resultado.raioHidraulicoM).toBeCloseTo(0.07498500449850053, 9)
    expect(resultado.modoDeclividade).toBe('velocidade_minima')
    expect(resultado.declividadeLongitudinalMM).toBeCloseTo(0.0031625259965767463, 9)
    expect(resultado.velocidadeMs).toBeCloseTo(0.5, 9)
    expect(resultado.vazaoM3s).toBeCloseTo(0.5625, 9)
    expect(resultado.comprimentoCriticoM).toBeCloseTo(1124.1007194244603, 6)
  })

  it('com declividade informada diretamente, modoDeclividade fica "informada"', () => {
    const resultado = calcularSarjeta({
      geometria: { tipo: 'triangular_simetrica', y0M: 0.15, declividadeTransversalMM: 0.02 },
      declividadeLongitudinalMM: 0.003,
      manningN: 0.02,
      coefC: 0.9,
      intensidadeMmH: 100,
      larguraImpluvioM: 20,
    })
    expect(resultado.modoDeclividade).toBe('informada')
    expect(resultado.declividadeLongitudinalMM).toBe(0.003)
  })

  it('sarjetão dente de serra: declividade transversal variando de 2% a 10%, largura 0,90m', () => {
    // condição crítica (ponto baixo): y0 = (largura/2) × declMax = 0,45×0,10 = 0,045m
    // ponto alto: y0 = 0,45×0,02 = 0,009m → desnível = 0,036m
    const resultado = calcularSarjeta({
      geometria: { tipo: 'triangular_simetrica', y0M: 0.045, declividadeTransversalMM: 0.1 },
      desnivelFixoM: 0.036,
      manningN: 0.02,
      coefC: 0.9,
      intensidadeMmH: 140,
      larguraImpluvioM: 20,
    })

    expect(resultado.areaMolhadaM2).toBeCloseTo(0.020250000000000004, 9)
    expect(resultado.raioHidraulicoM).toBeCloseTo(0.022388336779724762, 9)
    expect(resultado.modoDeclividade).toBe('desnivel_fixo')
    expect(resultado.comprimentoCriticoM).toBeCloseTo(7.7996838558205965, 6)
    expect(resultado.declividadeLongitudinalMM).toBeCloseTo(0.004615571690528793, 9)
    expect(resultado.velocidadeMs).toBeCloseTo(0.2698343961498112, 6)
    expect(resultado.vazaoM3s).toBeCloseTo(0.005464146522033678, 9)
  })

  it('lança erro para geometria ainda não implementada', () => {
    expect(() =>
      calcularSarjeta({
        // @ts-expect-error tipo não implementado, testando o fallback do dispatcher
        geometria: { tipo: 'trapezoidal' },
        declividadeLongitudinalMM: 0.02,
        manningN: 0.016,
        coefC: 0.9,
        intensidadeMmH: 80,
        larguraImpluvioM: 10,
      })
    ).toThrow(/não implementada/)
  })
})
