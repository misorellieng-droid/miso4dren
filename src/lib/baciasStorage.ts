import type { BaciaImportada } from '../engine/csvBacias'
import type { BaciaImportadaLandXml } from '../engine/landxml'
import { centroidePoligono, pontoDentroAlgumPoligono } from '../engine/poligono'
import { vincularBaciasCaixas } from '../engine/vinculo'
import { upsertCaptacao } from './captacaoStorage'
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
export async function importarBaciasCsv(revisaoId: string, bacias: BaciaImportada[], toleranciaM = 5): Promise<void> {
  const client = requireSupabase()

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
  /** nome da bacia -> nomes das caixas candidatas encontradas dentro do polígono (0 ou 2+, sem vínculo automático). */
  pendentes: Map<string, string[]>
}

/**
 * Importa bacias a partir de Parcels do LandXML (engine/landxml.ts): área vem
 * pronta do Civil 3D, coef_c fica null (editável manualmente depois — Parcel
 * não traz esse dado). O vínculo com a rede é geométrico — ponto-em-polígono
 * contra as caixas aptas a receber vazão (recebe_vazao=true), em vez de
 * distância até um pour point único: só vincula automático (100%) quando há
 * exatamente 1 caixa dentro do polígono, senão fica pendente e a UI mostra as
 * candidatas achadas pra decidir o percentual manualmente.
 */
export async function importarBaciasLandXml(revisaoId: string, bacias: BaciaImportadaLandXml[]): Promise<ResumoImportacaoBaciasLandXml> {
  const client = requireSupabase()

  const existentes = await listBacias(revisaoId)
  const nomesExistentes = new Set(existentes.map((b) => b.nome))
  const novasBacias = bacias.filter((b) => !nomesExistentes.has(b.nome))

  const caixas = await listCaixas(revisaoId)
  const caixasElegiveis = caixas.filter((c): c is CaixaRecord & { x: number; y: number } => c.recebe_vazao && c.x != null && c.y != null)

  const pendentes = new Map<string, string[]>()
  let automaticas = 0

  if (novasBacias.length > 0) {
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
            coef_c: null,
            pour_point_x: centro?.x ?? 0,
            pour_point_y: centro?.y ?? 0,
            poligonos: b.poligonos,
            vinculo_status: 'pendente',
          }
        })
      )
      .select()
    if (error) throw error

    for (const row of inseridas as BaciaRecord[]) {
      const candidatas = caixasElegiveis.filter((c) => pontoDentroAlgumPoligono({ x: c.x, y: c.y }, row.poligonos ?? []))
      if (candidatas.length === 1) {
        await updateBaciaVinculo(row.id, candidatas[0].id, 'automatico')
        try {
          await upsertCaptacao(row.id, candidatas[0].id, 100, 'manual')
        } catch {
          // migração 009 ainda não aplicada
        }
        automaticas++
      } else {
        pendentes.set(row.nome, candidatas.map((c) => c.nome))
      }
    }
  }

  return { novas: novasBacias.length, jaExistentes: bacias.length - novasBacias.length, automaticas, pendentes }
}
