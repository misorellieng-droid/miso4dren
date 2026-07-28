// Recálculo em cascata: quando um trecho não conforme é redimensionado
// (diâmetro/declividade), os trechos a jusante precisam refletir a nova cota
// de saída dele. Regra adotada (definida com o engenheiro responsável):
// - cada trecho a jusante MANTÉM sua própria declividade — só a cota de
//   fundo montante dele é deslocada pra casar com a nova cota de fundo
//   jusante do trecho anterior;
// - o diâmetro nunca diminui de montante pra jusante: se o trecho editado
//   ficou com diâmetro maior que algum trecho a jusante, esse trecho (e os
//   que vêm depois dele) sobem pro mesmo diâmetro.

export interface TrechoCascata {
  id: string
  caixaMontanteId: string
  caixaJusanteId: string
  comprimentoM: number
  diametroM: number
  declividadeMM: number
  cotaFundoMontante: number | null
}

export interface PatchCascata {
  id: string
  diametroM: number
  declividadeMM: number
  cotaFundoMontante: number
  cotaFundoJusante: number
  cotaTopoMontante: number
  cotaTopoJusante: number
}

export function recalcularCascataJusante(
  trechos: TrechoCascata[],
  trechoEditadoId: string,
  novoDiametroM: number,
  novaDeclividadeMM: number,
): PatchCascata[] {
  const porId = new Map(trechos.map((t) => [t.id, t]))
  const porCaixaMontante = new Map<string, TrechoCascata[]>()
  for (const t of trechos) {
    if (!porCaixaMontante.has(t.caixaMontanteId)) porCaixaMontante.set(t.caixaMontanteId, [])
    porCaixaMontante.get(t.caixaMontanteId)!.push(t)
  }

  const editado = porId.get(trechoEditadoId)
  if (!editado) return []

  const patches: PatchCascata[] = []
  const visitado = new Set<string>()

  const aplicar = (t: TrechoCascata, diametroM: number, declividadeMM: number, cotaFundoMontante: number): PatchCascata => {
    const cotaFundoJusante = cotaFundoMontante - declividadeMM * t.comprimentoM
    const patch: PatchCascata = {
      id: t.id,
      diametroM,
      declividadeMM,
      cotaFundoMontante,
      cotaFundoJusante,
      cotaTopoMontante: cotaFundoMontante + diametroM,
      cotaTopoJusante: cotaFundoJusante + diametroM,
    }
    patches.push(patch)
    return patch
  }

  const cotaInicial = editado.cotaFundoMontante ?? 0
  const primeiro = aplicar(editado, novoDiametroM, novaDeclividadeMM, cotaInicial)
  visitado.add(editado.id)

  const fila: Array<{ caixaId: string; cotaFundoMontante: number; diametroMinimo: number }> = [
    { caixaId: editado.caixaJusanteId, cotaFundoMontante: primeiro.cotaFundoJusante, diametroMinimo: novoDiametroM },
  ]

  while (fila.length > 0) {
    const { caixaId, cotaFundoMontante, diametroMinimo } = fila.shift()!
    for (const proximo of porCaixaMontante.get(caixaId) ?? []) {
      if (visitado.has(proximo.id)) continue
      visitado.add(proximo.id)
      const diametroFinal = Math.max(proximo.diametroM, diametroMinimo)
      const patch = aplicar(proximo, diametroFinal, proximo.declividadeMM, cotaFundoMontante)
      fila.push({ caixaId: proximo.caixaJusanteId, cotaFundoMontante: patch.cotaFundoJusante, diametroMinimo: diametroFinal })
    }
  }

  return patches
}
