/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { parseLandXmlParcels } from '../landxml'

// Formato real validado contra um export de Parcels do Civil 3D 2027:
// <Parcels name="..."><Parcel name="..." area="..." desc=""><CoordGeom>
// <Line dir="..." length="..."><Start>N E</Start><End>N E</End></Line>...
// </CoordGeom></Parcel></Parcels> — repare que NÃO tem <Boundary> envolvendo
// o CoordGeom (diferente do que a doc do schema LandXML sugere).
const FIXTURE_XML_REAL = `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2">
  <Parcels name="DRENAGEM">
    <Parcel name="1" area="53598.544232090921" desc="">
      <CoordGeom>
        <Line dir="97.737080850212" length="450.900764834527">
          <Start>7437096.338916659355 426354.159036490601</Start>
          <End>7437543.13480655849 426293.4553916445</End>
        </Line>
        <Line dir="7.737080842482" length="118.869999555901">
          <Start>7437543.13480655849 426293.4553916445</Start>
          <End>7437559.137977968901 426411.243231845554</End>
        </Line>
        <Line dir="277.737080850325" length="450.70076371762">
          <Start>7437559.137977968901 426411.243231845554</Start>
          <End>7437112.540268432349 426471.919951041229</End>
        </Line>
        <Line dir="187.737449196255" length="118.949991204399">
          <Start>7437112.540268432349 426471.919951041229</Start>
          <End>7437096.338916659355 426354.159036490601</End>
        </Line>
      </CoordGeom>
    </Parcel>
    <Parcel name="2" area="36.052027739719" desc="">
      <CoordGeom>
        <Line dir="97.737080850325" length="450.70076371762">
          <Start>7437112.540268432349 426471.919951041229</Start>
          <End>7437559.137977968901 426411.243231845554</End>
        </Line>
        <Line dir="277.73708100126" length="450.700763204096">
          <Start>7437559.137977968901 426411.243231845554</Start>
          <End>7437112.551038017496 426471.999214394949</End>
        </Line>
        <Line dir="187.737449241653" length="0.079991644609">
          <Start>7437112.551038017496 426471.999214394949</Start>
          <End>7437112.540268432349 426471.919951041229</End>
        </Line>
      </CoordGeom>
    </Parcel>
  </Parcels>
</LandXML>`

// Formato alternativo (com <Boundary> envolvendo o CoordGeom) — aceito como
// fallback caso outra versão do Civil 3D exporte assim; também cobre <Curve>.
const FIXTURE_XML_COM_BOUNDARY = `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2">
  <Parcels>
    <Parcel name="BACIA-02" area="800.00">
      <Boundary>
        <CoordGeom>
          <Line>
            <Start>100.0 100.0</Start>
            <End>140.0 100.0</End>
          </Line>
          <Curve rot="cw" radius="20.0">
            <Start>140.0 100.0</Start>
            <Center>140.0 120.0</Center>
            <End>140.0 140.0</End>
          </Curve>
          <Line>
            <Start>140.0 140.0</Start>
            <End>100.0 100.0</End>
          </Line>
        </CoordGeom>
      </Boundary>
    </Parcel>
    <Parcel name="SEM-CONTORNO" area="10.0">
    </Parcel>
  </Parcels>
</LandXML>`

// Parcel composto (união de dois desenhos separados no Civil 3D): o Parcel
// raiz não tem CoordGeom próprio, e sim um <Parcels> ANINHADO com um
// sub-Parcel por pedaço — sem atributo `area` nos sub-Parcels.
const FIXTURE_XML_COMPOSTO = `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2">
  <Parcels name="DRENAGEM">
    <Parcel name="6" area="53598.544232135268" desc="">
      <Parcels>
        <Parcel name="6_union_1">
          <CoordGeom>
            <Line dir="97.737080858671" length="0.200001117032">
              <Start>7437591.540681511164 426646.765060946811</Start>
              <End>7437591.738861873746 426646.738135295454</End>
            </Line>
            <Line dir="7.73708084287" length="118.949990013223">
              <Start>7437591.738861873746 426646.738135295454</Start>
              <End>7437607.752802200615 426764.605237742886</End>
            </Line>
            <Line dir="187.737449196255" length="118.869999559329">
              <Start>7437607.752802200615 426764.605237742886</Start>
              <End>7437591.540681511164 426646.765060946811</End>
            </Line>
          </CoordGeom>
        </Parcel>
        <Parcel name="6_union_2">
          <CoordGeom>
            <Line dir="277.737080854563" length="405.000000002417">
              <Start>7437577.412011191249 426711.758853459731</Start>
              <End>7437176.099018353969 426766.282992902212</End>
            </Line>
            <Line dir="97.737080854563" length="405.000000002417">
              <Start>7437176.099018353969 426766.282992902212</Start>
              <End>7437577.412011191249 426711.758853459731</End>
            </Line>
          </CoordGeom>
        </Parcel>
      </Parcels>
    </Parcel>
  </Parcels>
</LandXML>`

describe('parseLandXmlParcels', () => {
  it('extrai nome, área e contorno de cada Parcel (formato real, sem <Boundary>)', () => {
    const { bacias } = parseLandXmlParcels(FIXTURE_XML_REAL)
    const b1 = bacias.find((b) => b.nome === '1')!
    expect(b1.areaM2).toBeCloseTo(53598.544232090921)
    expect(b1.poligonos).toHaveLength(1)
    expect(b1.poligonos[0]).toHaveLength(4)
    // "Start>N E</Start>" -- x (Easting) é o 2º número, y (Northing) o 1º
    expect(b1.poligonos[0][0]).toEqual({ x: 426354.159036490601, y: 7437096.338916659355 })
  })

  it('extrai as duas bacias do arquivo real', () => {
    const { bacias } = parseLandXmlParcels(FIXTURE_XML_REAL)
    expect(bacias.map((b) => b.nome).sort()).toEqual(['1', '2'])
  })

  it('aproxima Curve pela corda (Start/End) e fecha o polígono (formato com Boundary)', () => {
    const { bacias } = parseLandXmlParcels(FIXTURE_XML_COM_BOUNDARY)
    const b2 = bacias.find((b) => b.nome === 'BACIA-02')!
    expect(b2.poligonos).toEqual([
      [
        { x: 100, y: 100 },
        { x: 100, y: 140 },
        { x: 140, y: 140 },
      ],
    ])
  })

  it('ignora Parcel sem contorno utilizável (menos de 3 vértices)', () => {
    const { bacias } = parseLandXmlParcels(FIXTURE_XML_COM_BOUNDARY)
    expect(bacias.find((b) => b.nome === 'SEM-CONTORNO')).toBeUndefined()
  })

  it('trata Parcel composto (união de sub-parcels, <Parcels> aninhado) sem virar bacias separadas', () => {
    const { bacias } = parseLandXmlParcels(FIXTURE_XML_COMPOSTO)
    expect(bacias.map((b) => b.nome).sort()).toEqual(['6']) // sub-parcels "6_union_1"/"6_union_2" não viram bacias
    const b6 = bacias.find((b) => b.nome === '6')!
    // "6_union_2" no arquivo real é degenerado (só 2 segmentos, ida-e-volta na mesma linha,
    // resíduo da união) — vira um anel de 2 pontos e é descartado (< 3 vértices); só o anel
    // real ("6_union_1") sobra, e sozinho já bate com a área do Parcel (~53598 m², igual às
    // outras bacias do mesmo tamanho no arquivo).
    expect(b6.poligonos).toHaveLength(1)
    expect(b6.poligonos[0].length).toBeGreaterThanOrEqual(3)
  })

  it('lança erro para XML inválido', () => {
    expect(() => parseLandXmlParcels('<not-xml')).toThrow()
  })
})
