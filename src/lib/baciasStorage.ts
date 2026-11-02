import type { BaciaImportada } from '../engine/csvBacias'
import type { BaciaImportadaLandXml } from '../engine/landxml'
import { dividirPercentualIgualmente } from '../engine/percentual'
import { centroidePoligono, pontoDentroAlgumPoligono } from '../engine/poligono'
import { vincularBaciasCaixas } from '../engine/vinculo'
import { replaceCaptacoesDaBacia, upsertCaptacao } from './captacaoStorage'
import { criarImportacao } from './importacoesStorage'
import { listCaixas, type CaixaRecord } from './redeStorage'
import { supabase } from './supabase'

export interface BaciaRecord {
  id: string
  revisao_id: string
  nome: string
  area_m2: number
  coef_c: number | null
  tc_min: number | null
  pour_point_x: number
  pour_point_y: number
  caixa_destino_id: string | null // legado — ver bacia_dispositivo (captacaoStorage.ts)
  vinculo_status: string
  destino_restante_nao_captado: string | null
  /** Anéis do Parcel (m) — null pra bacias importadas por CSV (só ponto de descarga); mais de
   * um anel quando o Parcel é composto (união de sub-parcels no Civil 3D). */
  poligonos: { x: number; y: number }[][] | null
  importacao_id: string | null
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export async function listBacias(revisaoId: string): Promise<BaciaRecord[]> {
  const { data, error } = await requireSupabase().from('bacias').select('*').eq('revisao_id', revisaoId).order('nome')
  if (error) throw error
  return data as BaciaRecord[]
}

export async function updateBaciaVinculo(id: string, caixaDestinoId: string | null, status: 'automatico' | 'manual' | 'pendente'): Promise<void> {
  const { error } = await requireSupabase()
    .from('bacias')
    .update({ caixa_destino_id: caixaDestinoId, vinculo_status: status })
    .eq('id', id)
  if (error) throw error
}

/** Declaração explícita do destino do percentual não captado por nenhum dispositivo (soma de captações < 100%). */
export async function updateDestinoRestante(id: string, destino: string | null): Promise<void> {
  const { error } = await requireSupabase().from('bacias').update({ destino_restante_nao_captado: destino }).eq('id', id)
  if (error) throw error
}

/** Coeficiente de escoamento (método racional) — não vem do Parcel do Civil 3D, precisa ser informado manualmente. */
export async function updateBaciaCoefC(id: string, coefC: number): Promise<void> {
  const { error } = await requireSupabase().from('bacias').update({ coef_c: coefC }).eq('id', id)
  if (error) throw error
}

/**
 * Importa as bacias do CSV e roda o vínculo automático bacia→caixa contra as
 * caixas já cadastradas na revisão (tolerância default 5 m).
 */
export async function importarBaciasCsv(
  revisaoId: string,
  bacias: BaciaImportada[],
  toleranciaM = 5,
  nomeArquivo: string | null = null
): Promise<void> {
  const client = requireSupabase()

  const importacaoId = await criarImportacao(revisaoId, 'bacias_csv', nomeArquivo, `${bacias.length} bacia(s)`)

  const { data: inseridas, error } = await client
    .from('bacias')
    .insert(
      bacias.map((b) => ({
        revisao_id: revisaoId,
        nome: b.nome,
        area_m2: b.areaM2,
        coef_c: b.coefC,
        tc_min: b.tcMin ?? null,
        pour_point_x: b.pourPointX,
        pour_point_y: b.pourPointY,
        vinculo_status: 'pendente',
        importacao_id: importacaoId,
      }))
    )
    .select()
  if (error) throw error

  const caixas = await listCaixas(revisaoId)
  const resultados = vincularBaciasCaixas(
    (inseridas as BaciaRecord[]).map((b) => ({ id: b.id, pourPointX: b.pour_point_x, pourPointY: b.pour_point_y })),
    caixas.filter((c) => c.x != null && c.y != null).map((c) => ({ id: c.id, x: c.x as number, y: c.y as number })),
    toleranciaM
  )

  for (const r of resultados) {
    if (r.vinculoStatus === 'automatico' && r.caixaDestinoId) {
      // grava o legado (visibilidade histórica) e já semeia a captação nova
      // com 100% — o engenheiro divide depois se a bacia alimentar mais de
      // um dispositivo. upsertCaptacao isolado: bacia_dispositivo é nova
      // (migração 009) e pode ainda não existir no banco.
      await updateBaciaVinculo(r.baciaId, r.caixaDestinoId, 'automatico')
      try {
        await upsertCaptacao(r.baciaId, r.caixaDestinoId, 100, 'manual')
      } catch {
        // migração 009 ainda não aplicada — vínculo legado já foi gravado acima
      }
    }
  }
}

export interface ResumoImportacaoBaciasLandXml {
  novas: number
  jaExistentes: number
  automaticas: number
  /** nome da bacia -> caixas onde a captação foi dividida igualmente entre elas (2+ candidatas). */
  divididas: Map<string, string[]>
  /** nome da bacia -> fica pendente pra vínculo manual (nenhuma caixa encontrada dentro do polígono). */
  pendentes: string[]
  /** Bacias novas cuja captação veio do vínculo feito no desenho (CAP= no Parcel), no lugar da proximidade. */
  vinculadasDoDesenho: string[]
  /** Bacias que já existiam e tiveram a captação substituída pelo vínculo do desenho. */
  atualizadasDoDesenho: string[]
  avisos: string[]
}

/**
 * Importa bacias a partir de Parcels do LandXML (engine/landxml.ts): área vem
 * pronta do Civil 3D. coef_c vem preenchido só quando o Parcel foi gerado pelo
 * plugin MISO4Dren pro Civil 3D (desc="MISO4Dren C=..."); um Parcel nativo do
 * Civil 3D não traz esse dado, fica null (editável manualmente depois). O
 * vínculo com a rede é geométrico — ponto-em-polígono
 * contra as caixas aptas a receber vazão (recebe_vazao=true), em vez de
 * distância até um pour point único:
 * - 1 caixa dentro do polígono → vincula 100% nela.
 * - 2+ caixas dentro → divide a captação igualmente entre todas (editável
 *   depois na tela de captação) — em projetos grandes (200+ caixas) exigir
 *   revisão manual pra cada bacia com mais de uma boca de lobo não escala.
 * - 0 caixas dentro → fica pendente pra vínculo manual (não tem o que dividir).
 */
export async function importarBaciasLandXml(
  revisaoId: string,
  bacias: BaciaImportadaLandXml[],
  nomeArquivo: string | null = null
): Promise<ResumoImportacaoBaciasLandXml> {
  const client = requireSupabase()

  const existentes = await listBacias(revisaoId)
  const nomesExistentes = new Set(existentes.map((b) => b.nome))
  const novasBacias = bacias.filter((b) => !nomesExistentes.has(b.nome))

  const caixas = await listCaixas(revisaoId)
  const caixasElegiveis = caixas.filter((c): c is CaixaRecord & { x: number; y: number } => c.recebe_vazao && c.x != null && c.y != null)

  const divididas = new Map<string, string[]>()
  const pendentes: string[] = []
  let automaticas = 0
  const vinculadasDoDesenho: string[] = []
  const atualizadasDoDesenho: string[] = []
  const avisos: string[] = []

  // vínculo feito no desenho: dispositivos pelo nome (só os que recebem vazão); percentuais como vieram, soma máxima 100%
  const caixaPorNome = new Map(caixas.filter((c) => c.recebe_vazao).map((c) => [c.nome, c]))
  const resolverCaptacao = (b: BaciaImportadaLandXml): { dispositivoId: string; percentual: number }[] => {
    if (!b.captacao) return []
    const entradas: { dispositivoId: string; percentual: number }[] = []
    for (const c of b.captacao) {
      const caixa = caixaPorNome.get(c.dispositivoNome)
      if (caixa) entradas.push({ dispositivoId: caixa.id, percentual: c.percentual })
      else avisos.push(`${b.nome}: dispositivo "${c.dispositivoNome}" do desenho não está entre as caixas que recebem vazão (importe a rede antes).`)
    }
    const soma = entradas.reduce((acc, e) => acc + e.percentual, 0)
    if (soma > 100.01) {
      avisos.push(`${b.nome}: vínculo do desenho soma ${soma.toFixed(1)}% (máximo 100); ignorado.`)
      return []
    }
    return entradas
  }

  if (novasBacias.length > 0) {
    const importacaoId = await criarImportacao(
      revisaoId,
      'bacias_parcel_landxml',
      nomeArquivo,
      `${novasBacias.length} bacia(s) nova(s)`
    )
    const { data: inseridas, error } = await client
      .from('bacias')
      .insert(
        novasBacias.map((b) => {
          // pour point de fallback: centroide do maior anel (o principal, quando composto)
          const anelPrincipal = [...b.poligonos].sort((x, y) => y.length - x.length)[0] ?? []
          const centro = centroidePoligono(anelPrincipal)
          return {
            revisao_id: revisaoId,
            nome: b.nome,
            area_m2: b.areaM2,
            coef_c: b.coefC ?? null,
            pour_point_x: centro?.x ?? 0,
            pour_point_y: centro?.y ?? 0,
            poligonos: b.poligonos,
            vinculo_status: 'pendente',
            importacao_id: importacaoId,
          }
        })
      )
      .select()
    if (error) throw error

    for (const row of inseridas as BaciaRecord[]) {
      const doDesenho = resolverCaptacao(novasBacias.find((b) => b.nome === row.nome) as BaciaImportadaLandXml)
      if (doDesenho.length > 0) {
        try {
          await replaceCaptacoesDaBacia(row.id, doDesenho)
          await updateBaciaVinculo(row.id, doDesenho.length === 1 ? doDesenho[0].dispositivoId : null, 'automatico')
          vinculadasDoDesenho.push(row.nome)
          automaticas++
          continue
        } catch {
          // migração 009 ainda não aplicada: cai na proximidade abaixo
        }
      }
      const candidatas = caixasElegiveis.filter((c) => pontoDentroAlgumPoligono({ x: c.x, y: c.y }, row.poligonos ?? []))

      if (candidatas.length === 0) {
        pendentes.push(row.nome)
        continue
      }

      const percentuais = dividirPercentualIgualmente(candidatas.length)
      for (let i = 0; i < candidatas.length; i++) {
        try {
          await upsertCaptacao(row.id, candidatas[i].id, percentuais[i], 'manual')
        } catch {
          // migração 009 ainda não aplicada
        }
      }
      // legado (caixa_destino_id) só comporta 1 id — com 2+ candidatas fica null, mas o
      // status 'automatico' já reflete que a captação real (bacia_dispositivo) foi resolvida
      await updateBaciaVinculo(row.id, candidatas.length === 1 ? candidatas[0].id : null, 'automatico')
      if (candidatas.length > 1) divididas.set(row.nome, candidatas.map((c) => c.nome))
      automaticas++
    }
  }

  // bacias que já existiam e vieram com vínculo do desenho: o desenho passa a valer (substitui os percentuais dessas bacias)
  for (const b of bacias.filter((x) => nomesExistentes.has(x.nome) && x.captacao)) {
    const existente = existentes.find((e) => e.nome === b.nome)
    const entradas = resolverCaptacao(b)
    if (!existente || entradas.length === 0) continue
    try {
      await replaceCaptacoesDaBacia(existente.id, entradas)
      await updateBaciaVinculo(existente.id, entradas.length === 1 ? entradas[0].dispositivoId : null, 'automatico')
      atualizadasDoDesenho.push(b.nome)
    } catch (err) {
      avisos.push(`${b.nome}: não foi possível atualizar o vínculo do desenho (${err instanceof Error ? err.message : 'erro'}).`)
    }
  }

  return { novas: novasBacias.length, jaExistentes: bacias.length - novasBacias.length, automaticas, divididas, pendentes, vinculadasDoDesenho, atualizadasDoDesenho, avisos }
}
