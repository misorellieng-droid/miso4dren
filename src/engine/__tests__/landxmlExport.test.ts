/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { exportarRedeLandXml } from '../landxmlExport'
import { parseLandXml } from '../landxml'
import type { CaixaRecord, TrechoRecord } from '../../lib/redeStorage'

function caixa(over: Partial<CaixaRecord> = {}): CaixaRecord {
  return {
    id: 'c1',
    revisao_id: 'r1',
    nome: 'PV-01',
    tipo: 'pv',
    x: 100.5,
    y: 200.25,
    cota_terreno: 850.5,
    cota_fundo: 847.2,
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
    comprimento_m: 34.32,
    diametro_m: 0.6,
    declividade_m_m: 0.0064,
    material: 'CONCRETO',
    manning_n: 0.013,
    manning_n_origem: 'manual',
    cota_topo_montante: 847.8,
    cota_fundo_montante: 847.2,
    cota_topo_jusante: 846.9,
    cota_fundo_jusante: 846.3,
    rede_nome: 'REDE-01',
    importacao_id: null,
    ...over,
  }
}

describe('exportarRedeLandXml', () => {
  it('exporta e reimporta com parseLandXml preservando os valores editados', () => {
    const c1 = caixa({ id: 'c1', nome: 'BLCS-06', tipo: 'boca_de_lobo', x: 10, y: 20 })
    const c2 = caixa({ id: 'c2', nome: 'PV-01', tipo: 'pv', x: 30, y: 40 })
    const t1 = trecho({ id: 't1', nome: 'TUBO-5', caixa_montante_id: 'c1', caixa_jusante_id: 'c2', diametro_m: 0.4, declividade_m_m: 0.0103 })

    const xml = exportarRedeLandXml([c1, c2], [t1])
    const { caixas, trechos } = parseLandXml(xml, new Map())

    const blcs = caixas.find((c) => c.nome === 'BLCS-06')!
    expect(blcs.tipo).toBe('boca_de_lobo')
    expect(blcs.x).toBeCloseTo(10)
    expect(blcs.y).toBeCloseTo(20)

    const pv = caixas.find((c) => c.nome === 'PV-01')!
    expect(pv.tipo).toBe('pv')
    expect(pv.cotaTerreno).toBeCloseTo(850.5)
    expect(pv.cotaFundo).toBeCloseTo(847.2)

    const tubo = trechos.find((t) => t.nome === 'TUBO-5')!
    expect(tubo.caixaMontanteNome).toBe('BLCS-06')
    expect(tubo.caixaJusanteNome).toBe('PV-01')
    expect(tubo.diametroM).toBeCloseTo(0.4) // ida e volta mm -> m sem perder precisão
    expect(tubo.declividadeMM).toBeCloseTo(0.0103)
    expect(tubo.material).toBe('CONCRETO')
    expect(tubo.manningN).toBeCloseTo(0.013)
  })

  it('preserva as cotas de fundo (Invert) montante/jusante de cada trecho', () => {
    const c1 = caixa({ id: 'c1', nome: 'A' })
    const c2 = caixa({ id: 'c2', nome: 'B' })
    const t1 = trecho({ id: 't1', nome: 'T1', caixa_montante_id: 'c1', caixa_jusante_id: 'c2', cota_fundo_montante: 100.1, cota_fundo_jusante: 99.4 })

    const xml = exportarRedeLandXml([c1, c2], [t1])
    const { trechos } = parseLandXml(xml, new Map())
    const t = trechos.find((x) => x.nome === 'T1')!
    expect(t.cotaFundoMontante).toBeCloseTo(100.1)
    expect(t.cotaFundoJusante).toBeCloseTo(99.4)
  })

  it('agrupa por rede_nome em blocos <PipeNetwork> separados', () => {
    const c1 = caixa({ id: 'c1', nome: 'A', rede_nome: 'REDE-01' })
    const c2 = caixa({ id: 'c2', nome: 'B', rede_nome: 'REDE-02' })
    const xml = exportarRedeLandXml([c1, c2], [])
    const matches = xml.match(/<PipeNetwork name="/g) ?? []
    expect(matches.length).toBe(2)
    expect(xml).toContain('<PipeNetwork name="REDE-01">')
    expect(xml).toContain('<PipeNetwork name="REDE-02">')
  })

  it('caixas/trechos sem rede_nome caem numa única rede "REDE"', () => {
    const c1 = caixa({ id: 'c1', nome: 'A', rede_nome: null })
    const xml = exportarRedeLandXml([c1], [])
    expect(xml).toContain('<PipeNetwork name="REDE">')
  })

  it('escapa caracteres especiais nos nomes', () => {
    const c1 = caixa({ id: 'c1', nome: 'PV & <teste>' })
    const xml = exportarRedeLandXml([c1], [])
    expect(xml).not.toContain('PV & <teste>')
    expect(xml).toContain('PV &amp; &lt;teste&gt;')
  })
})
