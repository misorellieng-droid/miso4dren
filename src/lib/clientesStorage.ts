import { supabase } from './supabase'

export interface Cliente {
  id: string
  nome: string
  documento: string | null
  email: string | null
  telefone: string | null
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export async function listClientes(): Promise<Cliente[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('clientes').select('id, nome, documento, email, telefone').order('nome')
  if (error) throw error
  return data ?? []
}

export async function createCliente(input: {
  nome: string
  documento?: string | null
  email?: string | null
  telefone?: string | null
}): Promise<Cliente> {
  const { data, error } = await requireSupabase()
    .from('clientes')
    .insert({
      nome: input.nome,
      documento: input.documento || null,
      email: input.email || null,
      telefone: input.telefone || null,
    })
    .select('id, nome, documento, email, telefone')
    .single()
  if (error) throw error
  return data
}

export async function updateCliente(
  id: string,
  patch: { nome?: string; documento?: string | null; email?: string | null; telefone?: string | null }
): Promise<void> {
  const { error } = await requireSupabase().from('clientes').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteCliente(id: string): Promise<void> {
  const { error } = await requireSupabase().from('clientes').delete().eq('id', id)
  if (error) throw error
}
