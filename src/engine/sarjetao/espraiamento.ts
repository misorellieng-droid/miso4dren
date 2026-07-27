import { calcularGeometriaTriangular, pontosPerfilTriangular, type PontoPerfil } from '../sarjeta/geometrias/triangular'

export type { PontoPerfil }

/**
 * Geometria composta por dois planos — a própria calha do sarjetão
 * (declividade transversal própria, tipicamente mais íngreme) e a pista fora
 * dela (mais suave), tratadas como dois triângulos distintos (não um único
 * plano homogêneo médio). Mesma lógica de dois planos já usada na Sarjeta
 * Crítica (ver src/engine/sarjeta/geometrias/triangular.ts, casos A/B),
 * reaproveitada aqui porque o sarjetão em dente de serra tem exatamente o
 * mesmo problema: usar só a declividade da pista pro espraiamento (T = y_max
 * / Sx_pista) ignora a calha, que costuma ser bem mais estreita e íngreme —
 * em calhas estreitas isso pode superestimar MUITO o T real (a lâmina fica
 * contida dentro da própria calha antes de sequer alcançar a pista), e
 * tratar a área/perímetro como se fossem de um único plano superestima
 * também a capacidade.
 *
 * Referencial: x=0 no fundo/eixo da calha, onde a lâmina vale y_max; a
 * profundidade decresce linearmente até 0 na borda do espraiamento (T).
 * `larguraSarjetaoEfetivaM` é a mesma largura usada no cálculo de Δh — a
 * metade do trough se `simetrico`, inteira se `um_lado` (ver
 * calcularSarjetaoDenteServa) — porque T também é medido por face, a partir
 * do eixo/meio-fio da calha.
 */
export interface ParametrosEspraiamentoComposto {
  yMaxM: number
  larguraSarjetaoEfetivaM: number
  sxSarjetao: number
  sxPista: number
}

/** T dado y_max — Caso B (contido na calha) se y_max ≤ Sx_sarjetão × largura; Caso A (avança pra pista) caso contrário. */
export function calcularEspraiamentoComposto(params: ParametrosEspraiamentoComposto): number {
  const { yMaxM, larguraSarjetaoEfetivaM: w, sxSarjetao, sxPista } = params
  const profundidadeNaBordaDaCalha = yMaxM - sxSarjetao * w
  if (profundidadeNaBordaDaCalha <= 0) {
    return yMaxM / sxSarjetao
  }
  return w + profundidadeNaBordaDaCalha / sxPista
}

export interface ParametrosLaminaParaEspraiamento {
  larguraEspraiamentoM: number
  larguraSarjetaoEfetivaM: number
  sxSarjetao: number
  sxPista: number
}

/** Inversa de calcularEspraiamentoComposto — y_max dado T, pro campo controlador "T" da UI. */
export function calcularLaminaParaEspraiamentoComposto(params: ParametrosLaminaParaEspraiamento): number {
  const { larguraEspraiamentoM: T, larguraSarjetaoEfetivaM: w, sxSarjetao, sxPista } = params
  if (T <= w) {
    return T * sxSarjetao
  }
  return sxSarjetao * w + (T - w) * sxPista
}

export interface GeometriaCompostaSarjetao {
  larguraEspraiamentoM: number
  areaMolhadaM2: number
  perimetroMolhadoM: number
  raioHidraulicoM: number
}

/**
 * Área/perímetro/Rh REAIS da seção composta — o triângulo da via (Sx_pista) e
 * o triângulo/trapézio da calha do sarjetão (Sx do sarjetão) somados como
 * duas peças distintas, não um único plano homogêneo. Reaproveita
 * integralmente a mesma composição de dois planos já usada e validada na
 * Sarjeta Crítica (`calcularGeometriaTriangular`, casos A/B) — o problema é
 * fisicamente idêntico, só muda o nome dos parâmetros.
 */
export function calcularGeometriaCompostaSarjetao(params: ParametrosEspraiamentoComposto): GeometriaCompostaSarjetao {
  const { yMaxM, larguraSarjetaoEfetivaM: w, sxSarjetao, sxPista } = params
  const { areaMolhadaM2, perimetroMolhadoM, raioHidraulicoM } = calcularGeometriaTriangular({
    tipo: 'triangular',
    y0M: yMaxM,
    larguraSarjetaM: w,
    declividadeTransversalSarjetaMM: sxSarjetao,
    declividadeTransversalViaMM: sxPista,
  })
  const larguraEspraiamentoM = calcularEspraiamentoComposto(params)
  return { larguraEspraiamentoM, areaMolhadaM2, perimetroMolhadoM, raioHidraulicoM }
}

/**
 * Pontos do perfil REAL da seção composta — dois segmentos com declividades
 * diferentes (o "kink" na borda da calha, em x=W): 0→W na declividade da
 * própria calha (mais íngreme), W→T na declividade da pista (mais suave) —
 * ou só um segmento se o espraiamento nem sai da calha (Caso B, T≤W). Pra
 * desenhar o croqui real (tela e PDF), em vez de um único triângulo de
 * declividade média. Mesmo `x=0` no fundo/eixo da calha usado em toda a
 * composição — ver ParametrosEspraiamentoComposto.
 */
export function pontosPerfilCompostoSarjetao(params: ParametrosEspraiamentoComposto): PontoPerfil[] {
  const { yMaxM, larguraSarjetaoEfetivaM: w, sxSarjetao, sxPista } = params
  return pontosPerfilTriangular({
    tipo: 'triangular',
    y0M: yMaxM,
    larguraSarjetaM: w,
    declividadeTransversalSarjetaMM: sxSarjetao,
    declividadeTransversalViaMM: sxPista,
  })
}
