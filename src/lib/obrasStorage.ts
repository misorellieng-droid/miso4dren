import { supabase } from './supabase'

export interface ObraRecord {
  id: string
  nome: string
  descricao: string | null
  equacao_idf_id: string | null
  tempo_retorno_anos: number | null
  created_at: string
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export async function listObras(): Promise<ObraRecord[]> {
  const { data, error } = await requireSupabase().from('obras').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as ObraRecord[]
}

export async function getObra(id: string): Promise<ObraRecord> {
  const { data, error } = await requireSupabase().from('obras').select('*').eq('id', id).single()
  if (error) throw error
  return data as ObraRecord
}

export async function createObra(input: {
  nome: string
  descricao?: string | null
  equacaoIdfId?: string | null
  tempoRetornoAnos?: number
}): Promise<ObraRecord> {
  const client = requireSupabase()
  // user_id fica nulo enquanto não há tela de login — ver
  // supabase/002_modo_sem_login.sql. Reintroduzir client.auth.getUser()
  // aqui quando o login for implementado.
  const { data, error } = await client
    .from('obras')
    .insert({
      nome: input.nome,
      descricao: input.descricao ?? null,
      equacao_idf_id: input.equacaoIdfId ?? null,
      tempo_retorno_anos: input.tempoRetornoAnos ?? 10,
    })
    .select()
    .single()
  if (error) throw error
  return data as ObraRecord
}

export async function updateObra(
  id: string,
  input: Partial<{ nome: string; descricao: string | null; equacaoIdfId: string | null; tempoRetornoAnos: number }>
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (input.nome !== undefined) patch.nome = input.nome
  if (input.descricao !== undefined) patch.descricao = input.descricao
  if (input.equacaoIdfId !== undefined) patch.equacao_idf_id = input.equacaoIdfId
  if (input.tempoRetornoAnos !== undefined) patch.tempo_retorno_anos = input.tempoRetornoAnos

  const { error } = await requireSupabase().from('obras').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteObra(id: string): Promise<void> {
  const { error } = await requireSupabase().from('obras').delete().eq('id', id)
  if (error) throw error
}
