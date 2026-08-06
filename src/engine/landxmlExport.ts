import type { CaixaRecord, TrechoRecord } from '../lib/redeStorage'

// "Structure" de propósito pra caixa_passagem: inferirTipoCaixa (landxml.ts) só reconhece
// inlet/catchbasin/boca -> boca_de_lobo e junction/manhole/pv -> pv: não existe uma palavra-
// chave própria pra caixa_passagem, então evita usar qualquer termo reconhecido e deixa cair
// no fallback por desc (que usa o próprio nome da caixa) se alguém reimportar esse XML aqui.
const TIPO_PARA_TYPE: Record<string, string> = {
  boca_de_lobo: 'Inlet',
  pv: 'Junction',
  caixa_passagem: 'Structure',
}

function escapeXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmt(n: number): string {
  // evita notação científica e corta zeros supérfluos, mas preserva precisão suficiente
  return Number(n.toFixed(6)).toString()
}

/**
 * Gera o LandXML de volta a partir do estado atual da rede no app — a mesma
 * estrutura que parseLandXml (engine/landxml.ts) lê na importação, com as
 * cotas/diâmetro/declividade/material já com as correções feitas no
 * miso4dren (edição direta, cascata jusante, memória de cálculo). Serve pra
 * reimportar no Civil 3D e atualizar o desenho a partir do que foi corrigido
 * aqui, em vez de refazer manualmente lá.
 *
 * Agrupa por rede_nome (mesmo agrupamento usado na importação de redes que
 * se conectam entre si) — caixas/trechos sem rede_nome caem numa rede única
 * chamada "REDE".
 */
export function exportarRedeLandXml(caixas: CaixaRecord[], trechos: TrechoRecord[]): string {
  const redes = new Map<string, { caixas: CaixaRecord[]; trechos: TrechoRecord[] }>()
  const chaveRede = (nome: string | null) => nome ?? 'REDE'
  for (const c of caixas) {
    const chave = chaveRede(c.rede_nome)
    if (!redes.has(chave)) redes.set(chave, { caixas: [], trechos: [] })
    redes.get(chave)!.caixas.push(c)
  }
  for (const t of trechos) {
    const chave = chaveRede(t.rede_nome)
    if (!redes.has(chave)) redes.set(chave, { caixas: [], trechos: [] })
    redes.get(chave)!.trechos.push(t)
  }

  const nomeCaixaPorId = new Map(caixas.map((c) => [c.id, c.nome]))

  const blocosRede = [...redes.entries()]
    .map(([nomeRede, { caixas: caixasRede, trechos: trechosRede }]) => {
      const invertsPorCaixa = new Map<string, string[]>()
      const adicionarInvert = (caixaId: string, xml: string) => {
        if (!invertsPorCaixa.has(caixaId)) invertsPorCaixa.set(caixaId, [])
        invertsPorCaixa.get(caixaId)!.push(xml)
      }
      for (const t of trechosRede) {
        if (t.cota_fundo_montante != null) {
          adicionarInvert(
            t.caixa_montante_id,
            `          <Invert elev="${fmt(t.cota_fundo_montante)}" flowDir="out" refPipe="${escapeXml(t.nome)}"></Invert>`
          )
        }
        if (t.cota_fundo_jusante != null) {
          adicionarInvert(
            t.caixa_jusante_id,
            `          <Invert elev="${fmt(t.cota_fundo_jusante)}" flowDir="in" refPipe="${escapeXml(t.nome)}"></Invert>`
          )
        }
      }

      const structs = caixasRede
        .map((c) => {
          const type = TIPO_PARA_TYPE[c.tipo] ?? 'Junction'
          const elevRim = c.cota_terreno != null ? ` elevRim="${fmt(c.cota_terreno)}"` : ''
          const elevSump = c.cota_fundo != null ? ` elevSump="${fmt(c.cota_fundo)}"` : ''
          // "N E" (Northing Easting), mesma ordem que parseLandXml espera de volta (ver
          // comentário de parsePos em landxml.ts) -- y (Northing) primeiro, x (Easting) depois.
          const center = c.x != null && c.y != null ? `\n          <Center>${fmt(c.y)} ${fmt(c.x)}</Center>` : ''
          const inverts = invertsPorCaixa.get(c.id) ?? []
          return (
            `        <Struct name="${escapeXml(c.nome)}" type="${type}" desc="${escapeXml(c.nome)}"${elevRim}${elevSump}>${center}\n` +
            (inverts.length > 0 ? inverts.join('\n') + '\n' : '') +
            `        </Struct>`
          )
        })
        .join('\n')

      const pipes = trechosRede
        .map((t) => {
          const nomeMontante = nomeCaixaPorId.get(t.caixa_montante_id) ?? ''
          const nomeJusante = nomeCaixaPorId.get(t.caixa_jusante_id) ?? ''
          const material = t.material ? ` material="${escapeXml(t.material)}"` : ''
          const manning = t.manning_n != null ? ` roughness="${fmt(t.manning_n)}"` : ''
          return (
            `        <Pipe name="${escapeXml(t.nome)}" refStart="${escapeXml(nomeMontante)}" refEnd="${escapeXml(nomeJusante)}" ` +
            `desc="${escapeXml(t.nome)}" length="${fmt(t.comprimento_m)}" slope="${fmt(t.declividade_m_m)}">\n` +
            `          <CircPipe diameter="${fmt(t.diametro_m * 1000)}"${material}${manning}></CircPipe>\n` +
            `        </Pipe>`
          )
        })
        .join('\n')

      return (
        `    <PipeNetwork name="${escapeXml(nomeRede)}">\n` +
        `      <Structs>\n${structs}\n      </Structs>\n` +
        `      <Pipes>\n${pipes}\n      </Pipes>\n` +
        `    </PipeNetwork>`
      )
    })
    .join('\n')

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2" version="1.2">\n` +
    `  <Units>\n` +
    `    <Metric areaUnit="squareMeter" linearUnit="meter" diameterUnit="millimeter"></Metric>\n` +
    `  </Units>\n` +
    `  <PipeNetworks>\n${blocosRede}\n  </PipeNetworks>\n` +
    `</LandXML>\n`
  )
}
