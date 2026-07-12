// Tipos do motor de sarjeta crítica. A arquitetura separa a GEOMETRIA da
// seção (que depende do tipo de sarjeta) do restante do pipeline hidráulico
// (Manning → vazão → comprimento crítico, que é o mesmo pra qualquer seção).
// Novas geometrias entram apenas como um novo membro de TipoSecaoSarjeta +
// uma interface de parâmetros + uma função calcularGeometriaXxx — sem tocar
// em hidraulica.ts nem comprimentoCritico.ts.

export type TipoSecaoSarjeta =
  | 'triangular'
  // ainda não implementadas — ver seção "Próximas geometrias" no README do motor:
  | 'trapezoidal'
  | 'retangular'
  | 'extrusada'
  | 'personalizada'

export interface GeometriaSarjetaResultado {
  areaMolhadaM2: number
  perimetroMolhadoM: number
  raioHidraulicoM: number
}

/**
 * Sarjeta triangular composta (via + calha da sarjeta), padrão HEC-22/FHWA.
 * Cobre tanto a "sarjeta triangular simples" (declividadeTransversalSarjetaMM
 * = declividadeTransversalViaMM, um único plano) quanto a "sarjeta com
 * depressão" (declividade da sarjeta mais íngreme que a da via) — ver
 * geometrias/triangular.ts para a derivação.
 */
export interface ParametrosGeometriaTriangular {
  tipo: 'triangular'
  y0M: number // altura limite da lâmina d'água na face do meio-fio (m)
  larguraSarjetaM: number // largura da calha da sarjeta (m)
  declividadeTransversalViaMM: number // declividade transversal da via, Sx (m/m)
  declividadeTransversalSarjetaMM: number // declividade transversal da própria sarjeta, Sw (m/m)
}

// União das geometrias implementadas. Ao adicionar uma nova (ex.:
// trapezoidal), criar sua interface de parâmetros e incluí-la aqui.
export type ParametrosGeometriaSarjeta = ParametrosGeometriaTriangular
