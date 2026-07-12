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
