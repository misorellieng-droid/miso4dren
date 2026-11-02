// Aplicar o diâmetro mínimo (rede tronco e ramal) à rede inteira de uma vez.
// O cálculo da rede só CONFERE o diâmetro mínimo (marca "não conforme"); não troca diâmetro. Esta função monta a troca, para o
// engenheiro conferir e confirmar: todo trecho abaixo do mínimo da sua categoria sobe para o mínimo e a subida se propaga para
// jusante, porque o diâmetro nunca diminui de montante para jusante (mesma regra de engine/cascataJusante.ts).
// As cotas de fundo não mudam aqui (só o topo, que é fundo + diâmetro): rodar o cálculo da rede em seguida refaz a linha de energia.
// Escada hidráulica não é tubo circular: fica de fora e a propagação para nela.

export interface TrechoDiametroMinimo {
  id: string
  caixaMontanteId: string
  caixaJusanteId: string
  diametroM: number
  cotaFundoMontante: number | null
  cotaFundoJusante: number | null
  ehEscadaHidraulica: boolean
}

export interface PatchDiametroMinimo {
  id: string
  diametroAnteriorM: number
  diametroM: number
  cotaTopoMontante: number | null
  cotaTopoJusante: number | null
  /** 'minimo': estava abaixo do mínimo da categoria; 'propagacao': subiu porque um trecho a montante subiu e o diâmetro não diminui para jusante. */
  motivo: 'minimo' | 'propagacao'
}

export interface ResultadoDiametroMinimo {
  patches: PatchDiametroMinimo[]
  subidosPeloMinimo: number
  subidosPorPropagacao: number
}

const TOL = 1e-9

export function aplicarDiametroMinimo(
  trechos: TrechoDiametroMinimo[],
  troncoIds: ReadonlySet<string>,
  diametroMinTroncoM: number,
  diametroMinRamalM: number
): ResultadoDiametroMinimo {
  const novo = new Map(trechos.map((t) => [t.id, t.diametroM]))
  const motivo = new Map<string, 'minimo' | 'propagacao'>()
  const porMontante = new Map<string, TrechoDiametroMinimo[]>()
  for (const t of trechos) {
    if (!porMontante.has(t.caixaMontanteId)) porMontante.set(t.caixaMontanteId, [])
    porMontante.get(t.caixaMontanteId)!.push(t)
  }

  const fila: TrechoDiametroMinimo[] = []
  for (const t of trechos) {
    if (t.ehEscadaHidraulica) continue
    const minimo = troncoIds.has(t.id) ? diametroMinTroncoM : diametroMinRamalM
    if (t.diametroM < minimo - TOL) {
      novo.set(t.id, minimo)
      motivo.set(t.id, 'minimo')
      fila.push(t)
    }
  }

  // propaga a subida para jusante; o diâmetro só aumenta, então termina
  while (fila.length > 0) {
    const t = fila.shift()!
    const d = novo.get(t.id)!
    for (const proximo of porMontante.get(t.caixaJusanteId) ?? []) {
      if (proximo.ehEscadaHidraulica) continue
      if ((novo.get(proximo.id) ?? proximo.diametroM) < d - TOL) {
        novo.set(proximo.id, d)
        if (!motivo.has(proximo.id)) motivo.set(proximo.id, 'propagacao')
        fila.push(proximo)
      }
    }
  }

  const patches: PatchDiametroMinimo[] = []
  for (const t of trechos) {
    const d = novo.get(t.id)!
    if (Math.abs(d - t.diametroM) <= TOL) continue
    patches.push({
      id: t.id,
      diametroAnteriorM: t.diametroM,
      diametroM: d,
      cotaTopoMontante: t.cotaFundoMontante != null ? t.cotaFundoMontante + d : null,
      cotaTopoJusante: t.cotaFundoJusante != null ? t.cotaFundoJusante + d : null,
      motivo: motivo.get(t.id) ?? 'propagacao',
    })
  }
  return {
    patches,
    subidosPeloMinimo: patches.filter((p) => p.motivo === 'minimo').length,
    subidosPorPropagacao: patches.filter((p) => p.motivo === 'propagacao').length,
  }
}
