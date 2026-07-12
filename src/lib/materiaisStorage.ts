import { supabase } from './supabase'

export interface MaterialManningRecord {
  id: string
  material: string
  manning_n: number
  observacao: string | null
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export async function listMateriaisManning(): Promise<MaterialManningRecord[]> {
  const { data, error } = await requireSupabase().from('materiais_manning').select('*').order('material')
  if (error) throw error
  return data as MaterialManningRecord[]
}

export async function createMaterialManning(input: Omit<MaterialManningRecord, 'id'>): Promise<MaterialManningRecord> {
  const { data, error } = await requireSupabase().from('materiais_manning').insert(input).select().single()
  if (error) throw error
  return data as MaterialManningRecord
}

export async function deleteMaterialManning(id: string): Promise<void> {
  const { error } = await requireSupabase().from('materiais_manning').delete().eq('id', id)
  if (error) throw error
}

/** Mapa MATERIAL (maiúsculo) -> manning_n, no formato esperado por parseLandXml. */
export function toMateriaisManningMap(registros: MaterialManningRecord[]): Map<string, number> {
  return new Map(registros.map((r) => [r.material.toUpperCase(), r.manning_n]))
}
