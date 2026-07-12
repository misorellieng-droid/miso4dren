import { supabase } from './supabase'

export interface ProjetoSummary {
  id: string
  nome: string
  descricao: string | null
  created_at: string
  cliente_id: string | null
  cliente_nome: string | null
  revisoesCount: number
}

export interface ProjetoDetail {
  id: string
  nome: string
  descricao: string | null
  cliente_id: string | null
  cliente_nome: string | null
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export async function listProjetos(): Promise<ProjetoSummary[]> {
  if (!supabase) return []

  const { data, error } = await supabase
    .from('projetos')
    .select('id, nome, descricao, created_at, cliente_id, clientes(nome), revisoes(count)')
    .order('created_at', { ascending: false })
  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((p: any) => ({
    id: p.id,
    nome: p.nome,
    descricao: p.descricao,
    created_at: p.created_at,
    cliente_id: p.cliente_id ?? null,
    cliente_nome: p.clientes?.nome ?? null,
    revisoesCount: p.revisoes?.[0]?.count ?? 0,
  }))
}

export async function getProjetoDetail(id: string): Promise<ProjetoDetail> {
  const { data, error } = await requireSupabase()
    .from('projetos')
    .select('id, nome, descricao, cliente_id, clientes(nome)')
    .eq('id', id)
    .single()
  if (error) throw error

  return {
    id: data.id,
    nome: data.nome,
    descricao: data.descricao,
    cliente_id: data.cliente_id ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cliente_nome: (data as any).clientes?.nome ?? null,
  }
}

export async function createProjeto(input: { nome: string; descricao?: string | null; clienteId?: string | null }): Promise<string> {
  const { data, error } = await requireSupabase()
    .from('projetos')
    .insert({ nome: input.nome, descricao: input.descricao || null, cliente_id: input.clienteId || null })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updateProjeto(
  id: string,
  patch: { nome?: string; descricao?: string | null; cliente_id?: string | null }
): Promise<void> {
  const { error } = await requireSupabase().from('projetos').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteProjeto(id: string): Promise<void> {
  const { error } = await requireSupabase().from('projetos').delete().eq('id', id)
  if (error) throw error
}
