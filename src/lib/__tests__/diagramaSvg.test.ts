import { describe, expect, it } from 'vitest'
import { gerarSvgDiagrama } from '../diagramaSvg'

describe('gerarSvgDiagrama', () => {
  it('devolve null quando nenhuma caixa tem coordenada', () => {
    const caixas = [{ id: 'a', x: null, y: null }]
    expect(gerarSvgDiagrama(caixas, [], new Map())).toBeNull()
  })

  it('gera um <svg> com uma <line> por trecho e um <circle> por caixa com coordenada', () => {
    const caixas = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 100, y: 50 },
      { id: 'c', x: 200, y: 0 }, // sem coordenada seria ignorada, mas essa tem
    ]
    const trechos = [
      { id: 't1', caixa_montante_id: 'a', caixa_jusante_id: 'b' },
      { id: 't2', caixa_montante_id: 'b', caixa_jusante_id: 'c' },
    ]
    const svg = gerarSvgDiagrama(caixas, trechos, new Map([['t1', true], ['t2', false]]))
    expect(svg).not.toBeNull()
    expect(svg).toContain('<svg')
    expect((svg!.match(/<line/g) ?? []).length).toBe(2)
    expect((svg!.match(/<circle/g) ?? []).length).toBe(3)
  })

  it('colore o trecho conforme em verde e o não conforme em vermelho', () => {
    const caixas = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 100, y: 0 },
    ]
    const trechos = [{ id: 't1', caixa_montante_id: 'a', caixa_jusante_id: 'b' }]
    const svgConforme = gerarSvgDiagrama(caixas, trechos, new Map([['t1', true]]))
    const svgNaoConforme = gerarSvgDiagrama(caixas, trechos, new Map([['t1', false]]))
    expect(svgConforme).toContain('#16a34a')
    expect(svgNaoConforme).toContain('#dc2626')
  })

  it('ignora caixa sem coordenada ao desenhar, mas sem quebrar o trecho ligado a ela', () => {
    const caixas = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: null, y: null },
    ]
    const trechos = [{ id: 't1', caixa_montante_id: 'a', caixa_jusante_id: 'b' }]
    const svg = gerarSvgDiagrama(caixas, trechos, new Map())
    expect(svg).not.toBeNull()
    expect((svg!.match(/<circle/g) ?? []).length).toBe(1) // só 'a'
    expect((svg!.match(/<line/g) ?? []).length).toBe(0) // 'b' sem ponto -- trecho não desenhado
  })
})
