/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { parseLandXml } from '../landxml'

const FIXTURE_XML = `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2">
  <PipeNetworks>
    <PipeNetwork name="Rede-1">
      <Structures>
        <Structure name="PV-01" type="Junction">
          <Center><PipeNetPos>100.0 200.0</PipeNetPos></Center>
          <Rim elevation="850.500"/>
          <Sump elevation="847.200"/>
        </Structure>
        <Structure name="PV-02" type="Junction">
          <Center><PipeNetPos>150.0 210.0</PipeNetPos></Center>
          <Rim elevation="848.000"/>
          <Sump elevation="846.700"/>
        </Structure>
        <Structure name="BL-01" type="Inlet">
          <Center><PipeNetPos>90.0 195.0</PipeNetPos></Center>
          <Rim elevation="851.000"/>
          <Sump elevation="848.500"/>
        </Structure>
      </Structures>
      <Pipes>
        <Pipe name="TRECHO-1" refStart="PV-01" refEnd="PV-02" shape="circular">
          <Start><PipeNetPos>100.0 200.0</PipeNetPos></Start>
          <End><PipeNetPos>150.0 210.0</PipeNetPos></End>
          <CircularPipe diameter="0.500" material="CONCRETO"/>
          <Invert start="847.200" end="846.700"/>
          <Slope>0.0100</Slope>
          <Length>50.990</Length>
        </Pipe>
        <Pipe name="TRECHO-2" refStart="BL-01" refEnd="PV-01" shape="circular">
          <Start><PipeNetPos>90.0 195.0</PipeNetPos></Start>
          <End><PipeNetPos>100.0 200.0</PipeNetPos></End>
          <CircularPipe diameter="0.400" material="PVC-DESCONHECIDO"/>
          <Invert start="848.500" end="847.200"/>
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

  it('extrai os trechos com comprimento, diâmetro e declividade explícitos', () => {
    const { trechos } = parseLandXml(FIXTURE_XML, materiaisManning)
    const t1 = trechos.find((t) => t.nome === 'TRECHO-1')!

    expect(t1.caixaMontanteNome).toBe('PV-01')
    expect(t1.caixaJusanteNome).toBe('PV-02')
    expect(t1.diametroM).toBe(0.5)
    expect(t1.comprimentoM).toBe(50.99)
    expect(t1.declividadeMM).toBeCloseTo(0.01)
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

  it('calcula comprimento por distância euclidiana e declividade pelas cotas de fundo quando ausentes no XML', () => {
    const { trechos } = parseLandXml(FIXTURE_XML, materiaisManning)
    const t2 = trechos.find((t) => t.nome === 'TRECHO-2')!

    const distanciaEsperada = Math.hypot(100 - 90, 200 - 195)
    expect(t2.comprimentoM).toBeCloseTo(distanciaEsperada, 6)

    const declividadeEsperada = Math.abs(848.5 - 847.2) / distanciaEsperada
    expect(t2.declividadeMM).toBeCloseTo(declividadeEsperada, 6)
  })
})
