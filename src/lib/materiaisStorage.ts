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

export async function updateMaterialManning(
  id: string,
  patch: Partial<Omit<MaterialManningRecord, 'id'>>
): Promise<MaterialManningRecord> {
  const { data, error } = await requireSupabase().from('materiais_manning').update(patch).eq('id', id).select().single()
  if (error) throw error
  return data as MaterialManningRecord
}

/**
 * Propaga um novo Manning n para todo trecho (de qualquer projeto/revisão)
 * que usa esse material E cujo manning_n ainda vem do fallback dessa
 * tabela ('tabela_interna') — trechos com manning_n explícito no LandXML
 * ou já editados manualmente pelo engenheiro não são tocados. Casamento
 * por `material` é case-insensitive, igual ao usado na importação
 * (ver parseLandXml / toMateriaisManningMap).
 *
 * Retorna a quantidade de trechos atualizados. Não recalcula
 * `resultados_rede` — é preciso rodar o cálculo de novo na revisão.
 */
export async function propagarManningParaTrechos(materialNome: string, manningN: number): Promise<number> {
  const { data, error } = await requireSupabase()
    .from('trechos')
    .update({ manning_n: manningN })
    .ilike('material', materialNome)
    .eq('manning_n_origem', 'tabela_interna')
    .select('id')
  if (error) throw error
  return (data ?? []).length
}

/** Mapa MATERIAL (maiúsculo) -> manning_n, no formato esperado por parseLandXml. */
export function toMateriaisManningMap(registros: MaterialManningRecord[]): Map<string, number> {
  return new Map(registros.map((r) => [r.material.toUpperCase(), r.manning_n]))
}
