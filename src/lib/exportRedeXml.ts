import { patchXmlOriginal } from '../engine/landxmlPatch'
import { exportarRedeLandXml } from '../engine/landxmlExport'
import { listBibliotecaPecas } from './bibliotecaStorage'
import { baixarArquivoTexto } from './download'
import { getXmlOriginal, type CaixaRecord, type TrechoRecord } from './redeStorage'

/**
 * Baixa o LandXML atualizado da rede. Preferência: editar o LandXML original
 * importado (patchXmlOriginal) — preserva a geometria da própria estrutura
 * (CircStruct/RectStruct) que o app nunca edita mas o Civil 3D exige pra
 * reimportar sem erro. Só cai no modo "gerado do zero" (exportarRedeLandXml)
 * quando não há XML original salvo pra essa revisão (ex.: rede importada
 * antes dessa funcionalidade existir) — nesse caso o reimport no Civil 3D
 * pode rejeitar as estruturas por falta da geometria física.
 */
export async function exportarRedeXmlAtualizado(
  revisaoId: string,
  nomeArquivo: string,
  caixas: CaixaRecord[],
  trechos: TrechoRecord[]
): Promise<{ modo: 'patch' | 'gerado' }> {
  let xmlOriginal: string | null = null
  try {
    xmlOriginal = await getXmlOriginal(revisaoId)
  } catch {
    // migração 019 ainda não aplicada, ou nada salvo pra essa revisão -- cai no fallback
  }

  if (xmlOriginal) {
    let biblioteca: Awaited<ReturnType<typeof listBibliotecaPecas>> = []
    try {
      biblioteca = await listBibliotecaPecas()
    } catch {
      // migração 021 ainda não aplicada -- segue sem a biblioteca (thickness só é removido)
    }
    baixarArquivoTexto(nomeArquivo, patchXmlOriginal(xmlOriginal, caixas, trechos, biblioteca))
    return { modo: 'patch' }
  }

  baixarArquivoTexto(nomeArquivo, exportarRedeLandXml(caixas, trechos))
  return { modo: 'gerado' }
}
