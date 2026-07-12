import { describe, expect, it } from 'vitest'
import { estadoHidraulico, resolverLamina } from '../bissecao'

describe('resolverLamina', () => {
  it('retorna lâmina zero para Q_projeto igual a zero', () => {
    const r = resolverLamina({ qProjetoM3s: 0, diametroM: 0.5, declividadeMM: 0.01, manningN: 0.013 })
    expect(r.lamina).toBe(0)
    expect(r.vazaoCalculada).toBe(0)
    expect(r.convergiu).toBe(true)
  })

  it('converge para a lâmina correta dentro da tolerância de 0.1%', () => {
    const d = 0.5
    const declividade = 0.01
    const n = 0.013
    const full = estadoHidraulico(0.93 * d, d, declividade, n)
    const qProjeto = full.vazaoCalculada * 0.5

    const r = resolverLamina({ qProjetoM3s: qProjeto, diametroM: d, declividadeMM: declividade, manningN: n })

    expect(r.convergiu).toBe(true)
    expect(r.iteracoes).toBeLessThanOrEqual(50)
    expect(r.vazaoCalculada).toBeCloseTo(qProjeto, 3)
    expect(r.lamina).toBeCloseTo(0.26110839887597664, 4)
    expect(r.theta).toBeCloseTo(3.2304891130157, 3)
    expect(r.raioHidraulico).toBeCloseTo(0.12843521589677825, 4)
    expect(r.velocidade).toBeCloseTo(1.958150469473488, 3)
  })

  it('não ultrapassa o cap de 0.93×D mesmo quando o tubo está subdimensionado', () => {
    const d = 0.3
    const declividade = 0.005
    const n = 0.013
    const full = estadoHidraulico(0.93 * d, d, declividade, n)
    // pede uma vazão maior do que a seção consegue escoar até o cap
    const r = resolverLamina({ qProjetoM3s: full.vazaoCalculada * 5, diametroM: d, declividadeMM: declividade, manningN: n })

    expect(r.lamina).toBeLessThanOrEqual(0.93 * d + 1e-9)
    expect(r.convergiu).toBe(false)
  })
})

describe('estadoHidraulico', () => {
  it('produz área e vazão nulas para lâmina zero', () => {
    const e = estadoHidraulico(0, 0.5, 0.01, 0.013)
    expect(e.theta).toBe(0)
    expect(e.areaMolhada).toBeCloseTo(0, 9)
    expect(e.vazaoCalculada).toBeCloseTo(0, 9)
  })
})
