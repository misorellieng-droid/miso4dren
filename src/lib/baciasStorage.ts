import type { BaciaImportada } from '../engine/csvBacias'
import { vincularBaciasCaixas } from '../engine/vinculo'
import { upsertCaptacao } from './captacaoStorage'
import { listCaixas } from './redeStorage'
import { supabase } from './supabase'

export interface BaciaRecord {
  id: string
  revisao_id: string
  nome: string
  area_m2: number
  coef_c: number
  tc_min: number | null
  pour_point_x: number
  pour_point_y: number
  caixa_destino_id: string | null // legado — ver bacia_dispositivo (captacaoStorage.ts)
  vinculo_status: string
  destino_restante_nao_captado: string | null
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
