import { describe, expect, it } from 'vitest'
import { vincularBaciasCaixas } from '../vinculo'

describe('vincularBaciasCaixas', () => {
  it('vincula automaticamente quando exatamente uma caixa está dentro da tolerância', () => {
    const bacias = [{ id: 'B1', pourPointX: 100, pourPointY: 100 }]
    const caixas = [
      { id: 'C1', x: 102, y: 100 }, // 2m
      { id: 'C2', x: 200, y: 200 }, // longe
    ]
    const [r] = vincularBaciasCaixas(bacias, caixas, 5)
    expect(r.vinculoStatus).toBe('automatico')
    expect(r.caixaDestinoId).toBe('C1')
  })

  it('fica pendente quando nenhuma caixa está dentro da tolerância', () => {
    const bacias = [{ id: 'B1', pourPointX: 100, pourPointY: 100 }]
    const caixas = [{ id: 'C1', x: 200, y: 200 }]
    const [r] = vincularBaciasCaixas(bacias, caixas, 5)
    expect(r.vinculoStatus).toBe('pendente')
    expect(r.caixaDestinoId).toBeNull()
    expect(r.candidatas).toHaveLength(0)
  })

  it('fica pendente quando mais de uma caixa está dentro da tolerância (ambíguo)', () => {
    const bacias = [{ id: 'B1', pourPointX: 100, pourPointY: 100 }]
    const caixas = [
      { id: 'C1', x: 102, y: 100 }, // 2m
      { id: 'C2', x: 100, y: 103 }, // 3m
    ]
    const [r] = vincularBaciasCaixas(bacias, caixas, 5)
    expect(r.vinculoStatus).toBe('pendente')
    expect(r.caixaDestinoId).toBeNull()
    expect(r.candidatas.sort()).toEqual(['C1', 'C2'])
  })

  it('usa a tolerância configurável', () => {
    const bacias = [{ id: 'B1', pourPointX: 0, pourPointY: 0 }]
    const caixas = [{ id: 'C1', x: 8, y: 0 }]
    expect(vincularBaciasCaixas(bacias, caixas, 5)[0].vinculoStatus).toBe('pendente')
    expect(vincularBaciasCaixas(bacias, caixas, 10)[0].vinculoStatus).toBe('automatico')
  })
})
