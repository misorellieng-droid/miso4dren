import { describe, expect, it } from 'vitest'
import { caixasParaHabilitar, vincularBaciasCaixas } from '../vinculo'

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

describe('caixasParaHabilitar', () => {
  const caixas = [
    { id: '1', nome: 'BS-01', recebe_vazao: true },
    { id: '2', nome: 'CT-05', recebe_vazao: false },
    { id: '3', nome: 'CT-06', recebe_vazao: false },
    { id: '4', nome: 'PV-01', recebe_vazao: false },
  ]

  it('habilita só as caixas vinculadas no desenho que ainda não recebiam vazão, sem repetir', () => {
    const r = caixasParaHabilitar(
      [{ captacao: [{ dispositivoNome: 'BS-01' }, { dispositivoNome: 'CT-05' }] }, { captacao: [{ dispositivoNome: 'CT-05' }, { dispositivoNome: 'CT-06' }] }],
      caixas
    )
    expect(r.map((c) => c.nome).sort()).toEqual(['CT-05', 'CT-06'])
  })

  it('nome que não existe na rede não entra; bacia sem vínculo do desenho também não', () => {
    expect(caixasParaHabilitar([{ captacao: [{ dispositivoNome: 'CT-99' }] }, {}], caixas)).toEqual([])
  })
})
