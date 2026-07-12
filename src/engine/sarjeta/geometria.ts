import { calcularGeometriaTriangular } from './geometrias/triangular'
import type { GeometriaSarjetaResultado, ParametrosGeometriaSarjeta } from './types'

/**
 * Dispatcher por tipo de seção. Novas geometrias (trapezoidal, retangular,
 * extrusada, personalizada) entram aqui como mais um `case`, delegando pra
 * sua própria função calcularGeometriaXxx em geometrias/ — o restante do
 * pipeline (velocidade, vazão, comprimento crítico) não muda.
 */
export function calcularGeometria(params: ParametrosGeometriaSarjeta): GeometriaSarjetaResultado {
  switch (params.tipo) {
    case 'triangular':
      return calcularGeometriaTriangular(params)
    default: {
      const tipo: string = params.tipo
      throw new Error(`Geometria de sarjeta "${tipo}" ainda não implementada.`)
    }
  }
}
