export interface DiferencaDiametro {
  trecho: string
  material: string | null
  diametroAntigoM: number
  diametroNovoM: number
}

const TOLERANCIA_M = 0.001

/**
 * Compara o diâmetro original (do LandXML importado) com o atual (editado no app) trecho
 * por trecho — usado pra gerar um relatório dos que mudaram, já que diâmetro não aplica de
 * volta no Civil 3D via reimportação de LandXML (limitação do Civil: troca de peça exige
 * "optional parameters" que não existem em nenhum formato do LandXML — ver landxmlPatch.ts).
 * Só entram trechos que existem nos dois lados e cujo diâmetro realmente mudou (>1mm).
 */
export function compararDiametros(
  originais: { nome: string; diametroM: number; material?: string | null }[],
  atuais: { nome: string; diametroM: number; material: string | null }[]
): DiferencaDiametro[] {
  const originalPorNome = new Map(originais.map((o) => [o.nome, o]))
  const diferencas: DiferencaDiametro[] = []

  for (const atual of atuais) {
    const original = originalPorNome.get(atual.nome)
    if (!original) continue
    if (Math.abs(original.diametroM - atual.diametroM) < TOLERANCIA_M) continue
    diferencas.push({
      trecho: atual.nome,
      material: atual.material ?? original.material ?? null,
      diametroAntigoM: original.diametroM,
      diametroNovoM: atual.diametroM,
    })
  }

  return diferencas
}

/** CSV (separador ";", padrão Excel pt-BR) pronto pra guiar edição em lote no Panorama do Civil 3D. */
export function gerarCsvDiferencasDiametro(diferencas: DiferencaDiametro[]): string {
  const linhas = ['Trecho;Material;Diametro atual no Civil (mm);Diametro novo (mm)']
  for (const d of diferencas) {
    const antigoMm = Math.round(d.diametroAntigoM * 1000)
    const novoMm = Math.round(d.diametroNovoM * 1000)
    linhas.push(`${d.trecho};${d.material ?? ''};${antigoMm};${novoMm}`)
  }
  return linhas.join('\r\n') + '\r\n'
}
