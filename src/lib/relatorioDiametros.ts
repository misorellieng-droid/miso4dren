import { parseLandXml } from '../engine/landxml'
import { compararDiametros, gerarCsvDiferencasDiametro } from '../engine/relatorioDiametros'
import { baixarArquivoTexto } from './download'
import { getXmlOriginal, type TrechoRecord } from './redeStorage'

/**
 * Baixa um CSV com os trechos cujo diâmetro foi editado no app desde o último import/
 * reimport da rede (nome, diâmetro antigo, diâmetro novo) — guia pra aplicar em lote no
 * grid do Panorama (Pipe Network Vistas) do Civil 3D, já que diâmetro não aplica de volta
 * via reimportação de LandXML (limitação do Civil, ver landxmlPatch.ts).
 */
export async function baixarRelatorioDiametros(
  revisaoId: string,
  nomeArquivo: string,
  trechosAtuais: TrechoRecord[]
): Promise<{ modo: 'gerado' | 'sem-xml-original'; quantidade: number }> {
  let xmlOriginal: string | null = null
  try {
    xmlOriginal = await getXmlOriginal(revisaoId)
  } catch {
    // migração 019 ainda não aplicada, ou nada salvo pra essa revisão
  }
  if (!xmlOriginal) {
    return { modo: 'sem-xml-original', quantidade: 0 }
  }

  const { trechos: trechosOriginais } = parseLandXml(xmlOriginal, new Map())
  const diferencas = compararDiametros(
    trechosOriginais.map((t) => ({ nome: t.nome, diametroM: t.diametroM, material: t.material ?? null })),
    trechosAtuais.map((t) => ({ nome: t.nome, diametroM: t.diametro_m, material: t.material }))
  )

  baixarArquivoTexto(nomeArquivo, gerarCsvDiferencasDiametro(diferencas), 'text/csv;charset=utf-8')
  return { modo: 'gerado', quantidade: diferencas.length }
}
