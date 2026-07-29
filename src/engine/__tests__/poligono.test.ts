import { describe, expect, it } from 'vitest'
import { centroidePoligono, pontoDentroAlgumPoligono, pontoDentroPoligono } from '../poligono'

describe('pontoDentroPoligono', () => {
  const quadrado = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]

  it('detecta ponto claramente dentro', () => {
    expect(pontoDentroPoligono({ x: 5, y: 5 }, quadrado)).toBe(true)
  })

  it('detecta ponto claramente fora', () => {
    expect(pontoDentroPoligono({ x: 20, y: 20 }, quadrado)).toBe(false)
  })

  it('funciona em polígono côncavo (formato de L)', () => {
    const formaL = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(pontoDentroPoligono({ x: 7, y: 7 }, formaL)).toBe(false) // no "recorte" do L
    expect(pontoDentroPoligono({ x: 2, y: 7 }, formaL)).toBe(true) // dentro da perna esquerda
  })

  it('retorna false pra polígono degenerado (menos de 3 vértices)', () => {
    expect(pontoDentroPoligono({ x: 1, y: 1 }, [{ x: 0, y: 0 }])).toBe(false)
  })
})

describe('pontoDentroAlgumPoligono', () => {
  const anel1 = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]
  const anel2 = [
    { x: 100, y: 100 },
    { x: 110, y: 100 },
    { x: 110, y: 110 },
    { x: 100, y: 110 },
  ]

  it('conta como dentro se o ponto cai em qualquer um dos anéis (parcel composto)', () => {
    expect(pontoDentroAlgumPoligono({ x: 5, y: 5 }, [anel1, anel2])).toBe(true)
    expect(pontoDentroAlgumPoligono({ x: 105, y: 105 }, [anel1, anel2])).toBe(true)
  })

  it('retorna false se não cair em nenhum anel', () => {
    expect(pontoDentroAlgumPoligono({ x: 50, y: 50 }, [anel1, anel2])).toBe(false)
  })
})

describe('centroidePoligono', () => {
  it('calcula a média dos vértices', () => {
    const quadrado = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(centroidePoligono(quadrado)).toEqual({ x: 5, y: 5 })
  })

  it('retorna null pra lista vazia', () => {
    expect(centroidePoligono([])).toBeNull()
  })
})
