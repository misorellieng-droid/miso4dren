import { describe, expect, it } from 'vitest'
import { aplicarDiametroMinimo, type TrechoDiametroMinimo } from '../diametroMinimo'

function t(id: string, de: string, para: string, diametroM: number, fundoM = 100, fundoJ = 99, ehEscadaHidraulica = false): TrechoDiametroMinimo {
  return { id, caixaMontanteId: de, caixaJusanteId: para, diametroM, cotaFundoMontante: fundoM, cotaFundoJusante: fundoJ, ehEscadaHidraulica }
}

describe('aplicarDiametroMinimo', () => {
  it('sobe para o mínimo do tronco os trechos de tronco abaixo dele e deixa os que já passam', () => {
    const trechos = [t('a', 'A', 'B', 0.4), t('b', 'B', 'C', 0.8)]
    const r = aplicarDiametroMinimo(trechos, new Set(['a', 'b']), 0.6, 0.4)
    expect(r.patches.map((p) => [p.id, p.diametroM])).toEqual([['a', 0.6]])
    expect(r.subidosPeloMinimo).toBe(1)
    expect(r.subidosPorPropagacao).toBe(0)
  })

  it('ramal usa o mínimo de ramal, não o do tronco', () => {
    const trechos = [t('ramal', 'X', 'B', 0.3), t('tronco', 'B', 'C', 0.5)]
    const r = aplicarDiametroMinimo(trechos, new Set(['tronco']), 0.6, 0.4)
    expect(r.patches.find((p) => p.id === 'ramal')?.diametroM).toBe(0.4)
    expect(r.patches.find((p) => p.id === 'tronco')?.diametroM).toBe(0.6)
  })

  it('a subida se propaga para jusante: o diâmetro nunca diminui de montante para jusante', () => {
    // tronco 0,4 sobe para 0,6; o trecho a jusante, que é ramal de mínimo 0,3 e tem 0,3, tem que subir junto
    const trechos = [t('a', 'A', 'B', 0.4), t('b', 'B', 'C', 0.3), t('c', 'C', 'D', 0.5)]
    const r = aplicarDiametroMinimo(trechos, new Set(['a']), 0.6, 0.3)
    const por = (id: string) => r.patches.find((p) => p.id === id)
    expect(por('a')).toMatchObject({ diametroM: 0.6, motivo: 'minimo' })
    expect(por('b')).toMatchObject({ diametroM: 0.6, motivo: 'propagacao' })
    expect(por('c')).toMatchObject({ diametroM: 0.6, motivo: 'propagacao' })
    expect(r.subidosPorPropagacao).toBe(2)
  })

  it('recalcula o topo como fundo + diâmetro novo, sem mexer nas cotas de fundo', () => {
    const r = aplicarDiametroMinimo([t('a', 'A', 'B', 0.4, 100, 99)], new Set(['a']), 0.6, 0.4)
    expect(r.patches[0].cotaTopoMontante).toBeCloseTo(100.6, 6)
    expect(r.patches[0].cotaTopoJusante).toBeCloseTo(99.6, 6)
  })

  it('sem cota de fundo o topo fica nulo', () => {
    const r = aplicarDiametroMinimo([{ ...t('a', 'A', 'B', 0.4), cotaFundoMontante: null, cotaFundoJusante: null }], new Set(['a']), 0.6, 0.4)
    expect(r.patches[0].cotaTopoMontante).toBeNull()
    expect(r.patches[0].cotaTopoJusante).toBeNull()
  })

  it('escada hidráulica não é alterada e a propagação para nela', () => {
    const trechos = [t('a', 'A', 'B', 0.4), t('esc', 'B', 'C', 0.3, 100, 95, true), t('d', 'C', 'D', 0.3)]
    // d é ramal (mínimo 0,3) e vem depois da escada: a subida de a não passa pela escada, então d fica como está
    const r = aplicarDiametroMinimo(trechos, new Set(['a', 'esc']), 0.6, 0.3)
    expect(r.patches.map((p) => p.id)).toEqual(['a'])
  })

  it('nada a fazer quando todos já atendem', () => {
    const r = aplicarDiametroMinimo([t('a', 'A', 'B', 0.6), t('b', 'B', 'C', 0.8)], new Set(['a', 'b']), 0.6, 0.4)
    expect(r.patches).toEqual([])
  })

  it('rede com ciclo não trava', () => {
    const trechos = [t('a', 'A', 'B', 0.4), t('b', 'B', 'A', 0.3)]
    const r = aplicarDiametroMinimo(trechos, new Set(['a']), 0.6, 0.3)
    expect(r.patches.find((p) => p.id === 'a')?.diametroM).toBe(0.6)
    expect(r.patches.find((p) => p.id === 'b')?.diametroM).toBe(0.6)
  })
})
