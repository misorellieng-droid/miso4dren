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

export interface TrechoSemCota {
  id: string
  diametroM: number
  declividadeMM: number
}

export interface ResultadoCascataEmLote {
  /** Trechos (os selecionados e os a jusante que se deslocam) com cotas novas; cada trecho aparece uma vez. */
  patches: PatchCascata[]
  /** Selecionados sem cota de fundo conhecida: só diâmetro/declividade mudam, sem cascata. */
  semCota: TrechoSemCota[]
}

/**
 * Mesma regra de recalcularCascataJusante, aplicada a vários trechos de uma vez (diâmetro e/ou declividade iguais para todos).
 * Os selecionados são processados de montante para jusante (ordemCaixas = caixas em ordem de fluxo), cada um já sobre as cotas
 * deixadas pelos anteriores; assim um selecionado que está a jusante de outro parte da cota deslocada, não da original.
 * novoDiametroM / novaDeclividadeMM nulos mantêm o valor atual de cada trecho.
 */
export function recalcularCascataEmLote(
  trechos: TrechoCascata[],
  selecionadosIds: string[],
  novoDiametroM: number | null,
  novaDeclividadeMM: number | null,
  ordemCaixas: string[]
): ResultadoCascataEmLote {
  const atual = new Map(trechos.map((t) => [t.id, { ...t }]))
  const posicao = new Map(ordemCaixas.map((id, i) => [id, i]))
  const pos = (id: string) => posicao.get(atual.get(id)!.caixaMontanteId) ?? 0
  const ordenados = selecionadosIds.filter((id) => atual.has(id)).sort((a, b) => pos(a) - pos(b))

  const acumulado = new Map<string, PatchCascata>()
  const semCota: TrechoSemCota[] = []
  for (const id of ordenados) {
    const t = atual.get(id)!
    const diametroM = novoDiametroM ?? t.diametroM
    const declividadeMM = novaDeclividadeMM ?? t.declividadeMM
    if (t.cotaFundoMontante == null) {
      semCota.push({ id, diametroM, declividadeMM })
      t.diametroM = diametroM
      t.declividadeMM = declividadeMM
      continue
    }
    for (const p of recalcularCascataJusante([...atual.values()], id, diametroM, declividadeMM)) {
      const alvo = atual.get(p.id)!
      alvo.diametroM = p.diametroM
      alvo.declividadeMM = p.declividadeMM
      alvo.cotaFundoMontante = p.cotaFundoMontante
      acumulado.set(p.id, p)
    }
  }
  return { patches: [...acumulado.values()], semCota }
}
