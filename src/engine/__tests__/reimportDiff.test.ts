import { describe, expect, it } from 'vitest'
import { compararImportacao, resumoDiff, temMudancas } from '../reimportDiff'
import type { CaixaRecord, TrechoRecord } from '../../lib/redeStorage'
import type { ResultadoImportLandXml } from '../landxml'

function caixa(over: Partial<CaixaRecord> = {}): CaixaRecord {
  return {
    id: 'c1',
    revisao_id: 'r1',
    nome: 'PV-01',
    tipo: 'pv',
    x: 100,
    y: 200,
    cota_terreno: 10,
    cota_fundo: 8,
    origem: 'landxml',
    rede_nome: 'REDE-01',
    recebe_vazao: false,
    importacao_id: null,
    ...over,
  }
}

function trecho(over: Partial<TrechoRecord> = {}): TrechoRecord {
  return {
    id: 't1',
    revisao_id: 'r1',
    nome: 'TUBO-01',
    caixa_montante_id: 'c1',
    caixa_jusante_id: 'c2',
    comprimento_m: 20,
    diametro_m: 0.3,
    declividade_m_m: 0.01,
    material: 'PVC',
    manning_n: 0.01,
    manning_n_origem: 'landxml',
    cota_topo_montante: 10.3,
    cota_fundo_montante: 10,
    cota_topo_jusante: 9.8,
    cota_fundo_jusante: 9.5,
    rede_nome: 'REDE-01',
    importacao_id: null,
    ...over,
  }
}

describe('compararImportacao', () => {
  it('marca caixa e trecho como novos quando não existem no banco', () => {
    const resultado: ResultadoImportLandXml = {
      caixas: [{ nome: 'PV-99', tipo: 'pv', recebeVazao: false }],
      trechos: [],
    }
    const diff = compararImportacao(resultado, [], [])
    expect(diff.caixas[0].status).toBe('nova')
  })

  it('marca caixa como igual quando os campos batem dentro da tolerância', () => {
    const existente = caixa()
    const resultado: ResultadoImportLandXml = {
      caixas: [{ nome: 'PV-01', tipo: 'pv', x: 100.001, y: 200, cotaTerreno: 10, cotaFundo: 8, recebeVazao: false }],
      trechos: [],
    }
    const diff = compararImportacao(resultado, [existente], [])
    expect(diff.caixas[0].status).toBe('igual')
  })

  it('marca caixa como alterada quando a cota de fundo mudou', () => {
    const existente = caixa()
    const resultado: ResultadoImportLandXml = {
      caixas: [{ nome: 'PV-01', tipo: 'pv', x: 100, y: 200, cotaTerreno: 10, cotaFundo: 7.5, recebeVazao: false }],
      trechos: [],
    }
    const diff = compararImportacao(resultado, [existente], [])
    expect(diff.caixas[0].status).toBe('alterada')
    expect(diff.caixas[0].camposAlterados).toContain('cota de fundo')
  })

  it('detecta ligação alterada quando o trecho passa a apontar pra outra caixa jusante', () => {
    const c1 = caixa({ id: 'c1', nome: 'PV-01' })
    const c2 = caixa({ id: 'c2', nome: 'EndNullStruct0' })
    const t1 = trecho({ caixa_montante_id: 'c1', caixa_jusante_id: 'c2' })
    const resultado: ResultadoImportLandXml = {
      caixas: [
        { nome: 'PV-01', tipo: 'pv', recebeVazao: false },
        { nome: 'PV-02', tipo: 'pv', recebeVazao: false },
      ],
      trechos: [
        {
          nome: 'TUBO-01',
          caixaMontanteNome: 'PV-01',
          caixaJusanteNome: 'PV-02', // antes era EndNullStruct0
          comprimentoM: 20,
          diametroM: 0.3,
          declividadeMM: 0.01,
          manningN: 0.01,
          manningNOrigem: 'landxml',
        },
      ],
    }
    const diff = compararImportacao(resultado, [c1, c2], [t1])
    expect(diff.trechos[0].status).toBe('alterado')
    expect(diff.trechos[0].ligacaoAlterada).toBe(true)
    expect(diff.trechos[0].camposAlterados).toContain('ligação (caixa montante/jusante)')
  })

  it('preserva manning editado manualmente — não acusa diferença só por causa do manning', () => {
    const c1 = caixa({ id: 'c1', nome: 'PV-01' })
    const c2 = caixa({ id: 'c2', nome: 'PV-02' })
    const t1 = trecho({ caixa_montante_id: 'c1', caixa_jusante_id: 'c2', manning_n: 0.013, manning_n_origem: 'manual' })
    const resultado: ResultadoImportLandXml = {
      caixas: [
        { nome: 'PV-01', tipo: 'pv', recebeVazao: false },
        { nome: 'PV-02', tipo: 'pv', recebeVazao: false },
      ],
      trechos: [
        {
          nome: 'TUBO-01',
          caixaMontanteNome: 'PV-01',
          caixaJusanteNome: 'PV-02',
          comprimentoM: 20,
          diametroM: 0.3,
          declividadeMM: 0.01,
          material: 'PVC',
          manningN: 0.01, // diferente do manual (0.013), mas não deve contar
          manningNOrigem: 'landxml',
          cotaFundoMontante: 10,
          cotaFundoJusante: 9.5,
        },
      ],
    }
    const diff = compararImportacao(resultado, [c1, c2], [t1])
    expect(diff.trechos[0].status).toBe('igual')
  })

  it('resumoDiff conta corretamente e temMudancas reflete o resultado', () => {
    const resultado: ResultadoImportLandXml = {
      caixas: [{ nome: 'PV-99', tipo: 'pv', recebeVazao: false }],
      trechos: [],
    }
    const diff = compararImportacao(resultado, [], [])
    expect(resumoDiff(diff).caixasNovas).toBe(1)
    expect(temMudancas(diff)).toBe(true)
  })
})
