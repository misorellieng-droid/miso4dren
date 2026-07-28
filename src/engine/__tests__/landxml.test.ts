/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { parseLandXml } from '../landxml'

// Formato validado contra um export real do Civil 3D 2027: <Structs>/<Struct>
// com atributos elevRim/elevSump e <Center>X Y</Center> como texto direto,
// sem atributo `type` (o tipo é inferido do `desc`); <Pipes>/<Pipe> com
// length/slope como atributos e <CircPipe diameter="mm"/>; cotas de fundo
// vêm dos <Invert> de cada estrutura, casados por refPipe + flowDir.
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
          <Invert elev="848.500" flowDir="in" refPipe="TRECHO-2"></Invert>
        </Struct>
        <Struct name="PV-02" desc="PV TIPO B" elevRim="848.000" elevSump="846.700">
          <Center>150.0 210.0</Center>
          <CircStruct diameter="1500." material="CONCRETO"></CircStruct>
          <Invert elev="846.700" flowDir="in" refPipe="TRECHO-1"></Invert>
        </Struct>
        <Struct name="BL-01" desc="BLCS" elevRim="851.000" elevSump="848.500">
          <Center>90.0 195.0</Center>
          <RectStruct length="0.75" width="2."></RectStruct>
          <Invert elev="848.500" flowDir="out" refPipe="TRECHO-2"></Invert>
        </Struct>
      </Structs>
      <Pipes>
        <Pipe name="TRECHO-1" refStart="PV-01" refEnd="PV-02" desc="BSTC DN 0,50 m" length="50.990" slope="0.0100">
          <CircPipe diameter="500." material="CONCRETO"></CircPipe>
        </Pipe>
        <Pipe name="TRECHO-2" refStart="BL-01" refEnd="PV-01" desc="BSTC DN 0,40 m" length="12.910199" slope="0.1006">
          <CircPipe diameter="400." material="PVC-DESCONHECIDO"></CircPipe>
        </Pipe>
      </Pipes>
    </PipeNetwork>
  </PipeNetworks>
</LandXML>`

describe('parseLandXml', () => {
  const materiaisManning = new Map([
    ['CONCRETO', 0.013],
    ['PEAD', 0.01],
  ])

  it('extrai as caixas com nome, tipo, posição e cotas', () => {
    const { caixas } = parseLandXml(FIXTURE_XML, materiaisManning)
    expect(caixas).toHaveLength(3)

    const pv01 = caixas.find((c) => c.nome === 'PV-01')
    expect(pv01).toMatchObject({ tipo: 'pv', x: 100, y: 200, cotaTerreno: 850.5, cotaFundo: 847.2 })

    const bl01 = caixas.find((c) => c.nome === 'BL-01')
    expect(bl01?.tipo).toBe('boca_de_lobo')
  })

  it('marca boca de lobo como recebendo vazão por padrão, e PV como não recebendo', () => {
    const { caixas } = parseLandXml(FIXTURE_XML, materiaisManning)
    expect(caixas.find((c) => c.nome === 'BL-01')?.recebeVazao).toBe(true)
    expect(caixas.find((c) => c.nome === 'PV-01')?.recebeVazao).toBe(false)
  })

  it('extrai os trechos com comprimento, diâmetro (convertido de mm) e declividade explícitos', () => {
    const { trechos } = parseLandXml(FIXTURE_XML, materiaisManning)
    const t1 = trechos.find((t) => t.nome === 'TRECHO-1')!

    expect(t1.caixaMontanteNome).toBe('PV-01')
    expect(t1.caixaJusanteNome).toBe('PV-02')
    expect(t1.diametroM).toBe(0.5)
    expect(t1.comprimentoM).toBe(50.99)
    expect(t1.declividadeMM).toBeCloseTo(0.01)
  })

  it('resolve as cotas de fundo a partir dos <Invert> das estruturas (refPipe + flowDir)', () => {
    const { trechos } = parseLandXml(FIXTURE_XML, materiaisManning)
    const t1 = trechos.find((t) => t.nome === 'TRECHO-1')!
    expect(t1.cotaFundoMontante).toBeCloseTo(847.2)
    expect(t1.cotaFundoJusante).toBeCloseTo(846.7)
    expect(t1.cotaTopoMontante).toBeCloseTo(847.7)
  })

  it('resolve manning_n pela tabela interna quando o material é conhecido e não há rugosidade explícita', () => {
    const { trechos } = parseLandXml(FIXTURE_XML, materiaisManning)
    const t1 = trechos.find((t) => t.nome === 'TRECHO-1')!
    expect(t1.manningN).toBeCloseTo(0.013)
    expect(t1.manningNOrigem).toBe('tabela_interna')
  })

  it('deixa manning_n nulo e sinaliza revisão manual quando o material não está na tabela interna', () => {
    const { trechos } = parseLandXml(FIXTURE_XML, materiaisManning)
    const t2 = trechos.find((t) => t.nome === 'TRECHO-2')!
    expect(t2.manningN).toBeNull()
    expect(t2.manningNOrigem).toBe('manual')
  })

  it('calcula comprimento por distância euclidiana quando ausente no XML', () => {
    const semLength = FIXTURE_XML.replace(' length="50.990"', '')
    const { trechos } = parseLandXml(semLength, materiaisManning)
    const t1 = trechos.find((t) => t.nome === 'TRECHO-1')!
    const distanciaEsperada = Math.hypot(150 - 100, 210 - 200)
    expect(t1.comprimentoM).toBeCloseTo(distanciaEsperada, 6)
  })

  it('marca caixas e trechos com o nome do <PipeNetwork> a que pertencem', () => {
    const { caixas, trechos } = parseLandXml(FIXTURE_XML, materiaisManning)
    expect(caixas.every((c) => c.redeNome === 'Rede-1')).toBe(true)
    expect(trechos.every((t) => t.redeNome === 'Rede-1')).toBe(true)
  })

  it('mantém o trecho separado por rede quando o LandXML tem mais de um <PipeNetwork>', () => {
    const comSegundaRede = FIXTURE_XML.replace(
      '</PipeNetworks>',
      `<PipeNetwork name="Rede-2">
        <Structs>
          <Struct name="PV-03" desc="PV TIPO B" elevRim="845.000" elevSump="843.700">
            <Center>200.0 220.0</Center>
            <CircStruct diameter="1500." material="CONCRETO"></CircStruct>
            <Invert elev="843.700" flowDir="in" refPipe="TRECHO-3"></Invert>
          </Struct>
        </Structs>
        <Pipes>
          <Pipe name="TRECHO-3" refStart="PV-02" refEnd="PV-03" desc="BSTC DN 0,50 m" length="30.0" slope="0.0100">
            <CircPipe diameter="500." material="CONCRETO"></CircPipe>
          </Pipe>
        </Pipes>
      </PipeNetwork></PipeNetworks>`,
    )
    const { caixas, trechos } = parseLandXml(comSegundaRede, materiaisManning)
    expect(caixas.find((c) => c.nome === 'PV-03')?.redeNome).toBe('Rede-2')
    // TRECHO-3 conecta PV-02 (Rede-1) a PV-03 (Rede-2), mas pertence à Rede-2
    // no XML (é onde o <Pipe> foi declarado) — é o "trecho de conexão" entre redes.
    expect(trechos.find((t) => t.nome === 'TRECHO-3')?.redeNome).toBe('Rede-2')
    expect(trechos.filter((t) => t.redeNome === 'Rede-1')).toHaveLength(2)
  })
})
