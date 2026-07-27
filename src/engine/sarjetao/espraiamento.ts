/**
 * Espraiamento (T) composto por dois planos — a própria calha do sarjetão
 * (declividade transversal própria, tipicamente mais íngreme) e a pista fora
 * dela (mais suave). Mesma lógica de dois planos já usada na Sarjeta Crítica
 * (ver src/engine/sarjeta/geometrias/triangular.ts, casos A/B), reaproveitada
 * aqui porque o sarjetão em dente de serra tem exatamente o mesmo problema:
 * usar só a declividade da pista pro espraiamento (T = y_max / Sx_pista)
 * ignora a calha, que costuma ser bem mais estreita e íngreme — em calhas
 * estreitas isso pode superestimar MUITO o T real (a lâmina fica contida
 * dentro da própria calha antes de sequer alcançar a pista).
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
