import type { BaciaImportada } from '../engine/csvBacias'
import { vincularBaciasCaixas } from '../engine/vinculo'
import { listCaixas } from './redeStorage'
import { supabase } from './supabase'

export interface BaciaRecord {
  id: string
  obra_id: string
  nome: string
  area_m2: number
  coef_c: number
  tc_min: number | null
  pour_point_x: number
  pour_point_y: number
  caixa_destino_id: string | null
  vinculo_status: string
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export async function listBacias(obraId: string): Promise<BaciaRecord[]> {
  const { data, error } = await requireSupabase().from('bacias').select('*').eq('obra_id', obraId).order('nome')
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

/**
 * Importa as bacias do CSV e roda o vínculo automático bacia→caixa contra as
 * caixas já cadastradas na obra (tolerância default 5 m).
 */
export async function importarBaciasCsv(obraId: string, bacias: BaciaImportada[], toleranciaM = 5): Promise<void> {
  const client = requireSupabase()

  const { data: inseridas, error } = await client
    .from('bacias')
    .insert(
      bacias.map((b) => ({
        obra_id: obraId,
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

  const caixas = await listCaixas(obraId)
  const resultados = vincularBaciasCaixas(
    (inseridas as BaciaRecord[]).map((b) => ({ id: b.id, pourPointX: b.pour_point_x, pourPointY: b.pour_point_y })),
    caixas.filter((c) => c.x != null && c.y != null).map((c) => ({ id: c.id, x: c.x as number, y: c.y as number })),
    toleranciaM
  )

  for (const r of resultados) {
    if (r.vinculoStatus === 'automatico') {
      await updateBaciaVinculo(r.baciaId, r.caixaDestinoId, 'automatico')
    }
  }
}
