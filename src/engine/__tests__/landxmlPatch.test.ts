/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { patchXmlOriginal } from '../landxmlPatch'
import { parseLandXml } from '../landxml'
import type { CaixaRecord, TrechoRecord } from '../../lib/redeStorage'

// Mesmo formato real validado em landxml.test.ts (Civil 3D 2027): atributos
// diretos (elevRim/elevSump/length/slope/diameter), CircStruct com material —
// dado que o app NUNCA edita (tamanho físico da estrutura), tem que sobreviver
// intacto ao patch.
const FIXTURE_XML = `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2">
  <Units>
    <Metric areaUnit="squareMeter" linearUnit="meter" diameterUnit="millimeter"></Metric>
  </Units>
  <PipeNetworks>
    <PipeNetwork name="Rede-1">
      <Structs>
        <Struct name="PV-01" desc="PV TIPO B" elevRim="850.500" elevSump="847.200">
          <Center>100.0 200.0</Center>
          <CircStruct diameter="1500." material="CONCRETO"></CircStruct>
          <Invert elev="847.200" flowDir="out" refPipe="TRECHO-1"></Invert>
        </Struct>
        <Struct name="PV-02" desc="PV TIPO B" elevRim="848.000" elevSump="846.700">
          <Center>150.0 210.0</Center>
          <CircStruct diameter="1500." material="CONCRETO"></CircStruct>
          <Invert elev="846.700" flowDir="in" refPipe="TRECHO-1"></Invert>
        </Struct>
      </Structs>
      <Pipes>
        <Pipe name="TRECHO-1" refStart="PV-01" refEnd="PV-02" desc="BSTC DN 0,50 m" length="50.990" slope="0.0100">
          <CircPipe diameter="500." material="CONCRETO"></CircPipe>
        </Pipe>
      </Pipes>
    </PipeNetwork>
  </PipeNetworks>
</LandXML>`

function caixa(over: Partial<CaixaRecord> = {}): CaixaRecord {
  return {
    id: 'c1',
    revisao_id: 'r1',
    nome: 'PV-01',
    tipo: 'pv',
    x: 100,
    y: 200,
    cota_terreno: 850.5,
    cota_fundo: 847.2,
    origem: 'landxml',
    rede_nome: 'Rede-1',
    recebe_vazao: false,
    importacao_id: null,
    ...over,
  }
}

function trecho(over: Partial<TrechoRecord> = {}): TrechoRecord {
  return {
    id: 't1',
    revisao_id: 'r1',
    nome: 'TRECHO-1',
    caixa_montante_id: 'c1',
    caixa_jusante_id: 'c2',
    comprimento_m: 50.99,
    diametro_m: 0.5,
    declividade_m_m: 0.01,
    material: 'CONCRETO',
    manning_n: 0.013,
    manning_n_origem: 'tabela_interna',
    cota_topo_montante: 847.7,
    cota_fundo_montante: 847.2,
    cota_topo_jusante: 847.2,
    cota_fundo_jusante: 846.7,
    rede_nome: 'Rede-1',
    importacao_id: null,
    ...over,
  }
}

describe('patchXmlOriginal', () => {
  it('atualiza diâmetro, declividade e cotas editados, preservando CircStruct e desc intactos', () => {
    const c1 = caixa({ id: 'c1', nome: 'PV-01', cota_fundo: 846.9 }) // cota de fundo editada no app
    const c2 = caixa({ id: 'c2', nome: 'PV-02', x: 150, y: 210, cota_terreno: 848, cota_fundo: 846.7 })
    const t1 = trecho({ diametro_m: 0.6, declividade_m_m: 0.02, cota_fundo_montante: 846.9, cota_fundo_jusante: 845.5 }) // editados

    const xmlPatched = patchXmlOriginal(FIXTURE_XML, [c1, c2], [t1])

    // campos editados -> atualizados no XML (diâmetro convertido de volta pra mm)
    expect(xmlPatched).toContain('elevSump="846.9"')
    expect(xmlPatched).toContain('<CircPipe diameter="600" material="CONCRETO"')
    expect(xmlPatched).toContain('slope="0.02"')
    // CircStruct (geometria da estrutura, nunca editada) continua com o valor original
    expect(xmlPatched).toContain('<CircStruct diameter="1500." material="CONCRETO"')
  })

  it('reimporta o XML corrigido com parseLandXml e confere os valores novos', () => {
    const c1 = caixa({ id: 'c1', nome: 'PV-01', cota_fundo: 846.9 })
    const c2 = caixa({ id: 'c2', nome: 'PV-02', x: 150, y: 210, cota_terreno: 848, cota_fundo: 846.7 })
    const t1 = trecho({ diametro_m: 0.6, declividade_m_m: 0.02, cota_fundo_montante: 846.9, cota_fundo_jusante: 845.5 })

    const xmlPatched = patchXmlOriginal(FIXTURE_XML, [c1, c2], [t1])
    const { caixas, trechos } = parseLandXml(xmlPatched, new Map())

    const pv01 = caixas.find((c) => c.nome === 'PV-01')!
    expect(pv01.cotaFundo).toBeCloseTo(846.9)
    expect(pv01.cotaTerreno).toBeCloseTo(850.5) // não editado -- continua igual

    const t = trechos.find((x) => x.nome === 'TRECHO-1')!
    expect(t.diametroM).toBeCloseTo(0.6)
    expect(t.declividadeMM).toBeCloseTo(0.02)
    expect(t.cotaFundoMontante).toBeCloseTo(846.9)
    expect(t.cotaFundoJusante).toBeCloseTo(845.5)
  })

  it('preserva a geometria da estrutura (CircStruct) e o desc intactos -- nunca editados pelo app', () => {
    const c1 = caixa({ id: 'c1', nome: 'PV-01' })
    const c2 = caixa({ id: 'c2', nome: 'PV-02', x: 150, y: 210, cota_terreno: 848, cota_fundo: 846.7 })
    const t1 = trecho()
    const xmlPatched = patchXmlOriginal(FIXTURE_XML, [c1, c2], [t1])

    expect(xmlPatched).toContain('<CircStruct diameter="1500." material="CONCRETO"')
    expect(xmlPatched).toContain('desc="PV TIPO B"')
  })

  it('não mexe em Struct/Pipe cujo nome não bate com nenhuma caixa/trecho do app', () => {
    const c1 = caixa({ id: 'c1', nome: 'NOME-DIFERENTE' })
    const xmlPatched = patchXmlOriginal(FIXTURE_XML, [c1], [])
    // PV-01/PV-02/TRECHO-1 do XML original não têm correspondente -- ficam como estavam
    expect(xmlPatched).toContain('elevRim="850.500"')
    expect(xmlPatched).toContain('length="50.990"')
  })

  it('lança erro para XML inválido', () => {
    expect(() => patchXmlOriginal('<not-xml', [], [])).toThrow()
  })
})
