/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { parseLandXmlParcels } from '../landxml'

// Formato real de export de Parcels do Civil 3D: <Parcels><Parcel name="..."
// area="..."><Boundary><CoordGeom><Line><Start>X Y</Start><End>X Y</End>
// </Line>...</CoordGeom></Boundary></Parcel></Parcels>.
const FIXTURE_XML = `<?xml version="1.0"?>
<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2">
  <Parcels>
    <Parcel name="BACIA-01" area="1250.75">
      <Boundary>
        <CoordGeom>
          <Line>
            <Start>0.0 0.0</Start>
            <End>50.0 0.0</End>
          </Line>
          <Line>
            <Start>50.0 0.0</Start>
            <End>50.0 25.0</End>
          </Line>
          <Line>
            <Start>50.0 25.0</Start>
            <End>0.0 25.0</End>
          </Line>
          <Line>
            <Start>0.0 25.0</Start>
            <End>0.0 0.0</End>
          </Line>
        </CoordGeom>
      </Boundary>
    </Parcel>
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

describe('parseLandXmlParcels', () => {
  it('extrai nome, área e contorno de cada Parcel', () => {
    const { bacias } = parseLandXmlParcels(FIXTURE_XML)
    const b1 = bacias.find((b) => b.nome === 'BACIA-01')!
    expect(b1.areaM2).toBe(1250.75)
    expect(b1.poligono).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 25 },
      { x: 0, y: 25 },
    ])
  })

  it('aproxima Curve pela corda (Start/End) e fecha o polígono', () => {
    const { bacias } = parseLandXmlParcels(FIXTURE_XML)
    const b2 = bacias.find((b) => b.nome === 'BACIA-02')!
    expect(b2.poligono).toEqual([
      { x: 100, y: 100 },
      { x: 140, y: 100 },
      { x: 140, y: 140 },
    ])
  })

  it('ignora Parcel sem contorno utilizável (menos de 3 vértices)', () => {
    const { bacias } = parseLandXmlParcels(FIXTURE_XML)
    expect(bacias.find((b) => b.nome === 'SEM-CONTORNO')).toBeUndefined()
  })

  it('lança erro para XML inválido', () => {
    expect(() => parseLandXmlParcels('<not-xml')).toThrow()
  })
})
