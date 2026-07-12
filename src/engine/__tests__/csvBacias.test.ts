import { describe, expect, it } from 'vitest'
import { parseBaciasCsv } from '../csvBacias'

describe('parseBaciasCsv', () => {
  it('parseia CSV separado por vírgula com todas as colunas', () => {
    const csv = [
      'nome_bacia,area_m2,coef_c,tc_min,pour_point_x,pour_point_y',
      'Bacia-01,1200.5,0.85,12,100.0,200.0',
      'Bacia-02,850,0.7,,110.0,205.0',
    ].join('\n')

    const bacias = parseBaciasCsv(csv)
    expect(bacias).toHaveLength(2)
    expect(bacias[0]).toEqual({ nome: 'Bacia-01', areaM2: 1200.5, coefC: 0.85, tcMin: 12, pourPointX: 100, pourPointY: 200 })
    expect(bacias[1].tcMin).toBeUndefined()
  })

  it('parseia CSV separado por ponto-e-vírgula com decimal em vírgula (export pt-BR)', () => {
    const csv = [
      'nome_bacia;area_m2;coef_c;tc_min;pour_point_x;pour_point_y',
      'Bacia-01;1200,5;0,85;12;100,0;200,0',
    ].join('\n')

    const bacias = parseBaciasCsv(csv)
    expect(bacias[0]).toEqual({ nome: 'Bacia-01', areaM2: 1200.5, coefC: 0.85, tcMin: 12, pourPointX: 100, pourPointY: 200 })
  })

  it('lança erro quando falta uma coluna obrigatória', () => {
    const csv = ['nome_bacia,area_m2,coef_c,pour_point_x', 'Bacia-01,1200,0.85,100'].join('\n')
    expect(() => parseBaciasCsv(csv)).toThrow(/pour_point_y/)
  })

  it('lança erro quando uma linha tem valor numérico malformado', () => {
    const csv = [
      'nome_bacia,area_m2,coef_c,pour_point_x,pour_point_y',
      'Bacia-01,abc,0.85,100,200',
    ].join('\n')
    expect(() => parseBaciasCsv(csv)).toThrow(/linha 2/)
  })

  it('ignora linhas em branco', () => {
    const csv = [
      'nome_bacia,area_m2,coef_c,pour_point_x,pour_point_y',
      'Bacia-01,1200,0.85,100,200',
      '',
      '',
    ].join('\n')
    expect(parseBaciasCsv(csv)).toHaveLength(1)
  })
})
