import { describe, expect, it } from 'vitest'
import { sugerirDeclividade, sugerirDiametro, type LimitesConformidade } from '../sugestao'

const limites: LimitesConformidade = {
  limiteYD: 0.85,
  velMinMs: 0.75,
  velMaxMs: 5,
  declMinMM: 0.004,
  declMaxMM: 0.15,
}

describe('sugerirDiametro', () => {
  it('sugere um diâmetro comercial que suporta a vazão dentro da faixa de declividade', () => {
    const d = sugerirDiametro(0.15, 0.01, 0.013, limites)
    expect(d).not.toBeNull()
    expect(d!).toBeGreaterThan(0.15)
  })

  it('retorna null quando a declividade atual já está fora da faixa configurada (nenhum diâmetro resolve sozinho)', () => {
    // declividade 0.0027 < declMinMM 0.004 -- nenhum diâmetro corrige isso sozinho
    const d = sugerirDiametro(0.2788, 0.0027, 0.01, limites)
    expect(d).toBeNull()
  })

  it('retorna null quando nenhum diâmetro comercial resolve', () => {
    const d = sugerirDiametro(1000, 0.004, 0.01, limites)
    expect(d).toBeNull()
  })
})

describe('sugerirDeclividade', () => {
  it('sugere uma declividade maior quando a atual não é suficiente', () => {
    const s = sugerirDeclividade(0.2788, 0.4, 0.01, limites, 0.0027)
    expect(s).not.toBeNull()
    expect(s!).toBeGreaterThan(0.0027)
    expect(s!).toBeLessThanOrEqual(limites.declMaxMM)
  })

  it('retorna null quando nenhuma declividade dentro da faixa resolve', () => {
    const s = sugerirDeclividade(1000, 0.4, 0.01, limites, 0.005)
    expect(s).toBeNull()
  })
})
