import { describe, expect, it } from 'vitest'
import { recalcularCascataJusante, type TrechoCascata } from '../cascataJusante'

// Rede linear: A -T1-> B -T2-> C -T3-> D
const REDE_LINEAR: TrechoCascata[] = [
  { id: 'T1', caixaMontanteId: 'A', caixaJusanteId: 'B', comprimentoM: 20, diametroM: 0.3, declividadeMM: 0.01, cotaFundoMontante: 100 },
  { id: 'T2', caixaMontanteId: 'B', caixaJusanteId: 'C', comprimentoM: 10, diametroM: 0.3, declividadeMM: 0.02, cotaFundoMontante: 99.8 },
  { id: 'T3', caixaMontanteId: 'C', caixaJusanteId: 'D', comprimentoM: 15, diametroM: 0.4, declividadeMM: 0.005, cotaFundoMontante: 99.6 },
]

describe('recalcularCascataJusante', () => {
  it('recalcula a cota de fundo jusante do próprio trecho editado', () => {
    const patches = recalcularCascataJusante(REDE_LINEAR, 'T1', 0.3, 0.015)
    const p1 = patches.find((p) => p.id === 'T1')!
    expect(p1.cotaFundoMontante).toBe(100)
    expect(p1.cotaFundoJusante).toBeCloseTo(100 - 0.015 * 20)
  })

  it('propaga a cota pros trechos a jusante mantendo a declividade própria de cada um', () => {
    const patches = recalcularCascataJusante(REDE_LINEAR, 'T1', 0.3, 0.015)
    const p1 = patches.find((p) => p.id === 'T1')!
    const p2 = patches.find((p) => p.id === 'T2')!
    const p3 = patches.find((p) => p.id === 'T3')!

    expect(p2.cotaFundoMontante).toBeCloseTo(p1.cotaFundoJusante)
    expect(p2.declividadeMM).toBe(0.02) // mantém a declividade original de T2
    expect(p2.cotaFundoJusante).toBeCloseTo(p2.cotaFundoMontante - 0.02 * 10)

    expect(p3.cotaFundoMontante).toBeCloseTo(p2.cotaFundoJusante)
    expect(p3.declividadeMM).toBe(0.005)
  })

  it('sobe o diâmetro dos trechos a jusante quando o editado fica maior', () => {
    const patches = recalcularCascataJusante(REDE_LINEAR, 'T1', 0.5, 0.01)
    expect(patches.find((p) => p.id === 'T1')!.diametroM).toBe(0.5)
    expect(patches.find((p) => p.id === 'T2')!.diametroM).toBe(0.5) // era 0.3, sobe pra 0.5
    expect(patches.find((p) => p.id === 'T3')!.diametroM).toBe(0.5) // era 0.4, sobe pra 0.5
  })

  it('não reduz o diâmetro de um trecho a jusante que já era maior', () => {
    const patches = recalcularCascataJusante(REDE_LINEAR, 'T1', 0.35, 0.01)
    expect(patches.find((p) => p.id === 'T3')!.diametroM).toBe(0.4) // já era 0.4 > 0.35, mantém
  })

  it('recalcula só o próprio trecho quando não há nada a jusante', () => {
    const patches = recalcularCascataJusante(REDE_LINEAR, 'T3', 0.4, 0.008)
    expect(patches).toHaveLength(1)
    expect(patches[0].id).toBe('T3')
  })

  it('propaga corretamente em rede com bifurcação (confluência a jusante)', () => {
    const comBifurcacao: TrechoCascata[] = [
      ...REDE_LINEAR,
      { id: 'T4', caixaMontanteId: 'B', caixaJusanteId: 'E', comprimentoM: 8, diametroM: 0.3, declividadeMM: 0.01, cotaFundoMontante: 99.8 },
    ]
    const patches = recalcularCascataJusante(comBifurcacao, 'T1', 0.3, 0.02)
    const ids = patches.map((p) => p.id).sort()
    expect(ids).toEqual(['T1', 'T2', 'T3', 'T4'])
  })
})
