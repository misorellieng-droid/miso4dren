import { supabase } from './supabase'

export interface EquacaoIdfRecord {
  id: string
  nome: string
  localidade: string | null
  k: number
  a: number
  b: number
  c: number
  fonte: string | null
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export async function listEquacoesIdf(): Promise<EquacaoIdfRecord[]> {
  const { data, error } = await requireSupabase().from('equacoes_idf').select('*').order('nome')
  if (error) throw error
  return data as EquacaoIdfRecord[]
}

export async function createEquacaoIdf(input: Omit<EquacaoIdfRecord, 'id'>): Promise<EquacaoIdfRecord> {
  const { data, error } = await requireSupabase().from('equacoes_idf').insert(input).select().single()
  if (error) throw error
  return data as EquacaoIdfRecord
}

export async function updateEquacaoIdf(id: string, input: Partial<Omit<EquacaoIdfRecord, 'id'>>): Promise<void> {
  const { error } = await requireSupabase().from('equacoes_idf').update(input).eq('id', id)
  if (error) throw error
}

export async function deleteEquacaoIdf(id: string): Promise<void> {
  const { error } = await requireSupabase().from('equacoes_idf').delete().eq('id', id)
  if (error) throw error
}
