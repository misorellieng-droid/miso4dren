import { supabase } from './supabase'

export interface ItemBiblioteca {
  id: string
  material: string
  diametro_m: number
  espessura_parede_m: number | null
  nome_peca: string | null
  largura_escavacao_m: number | null
  talude_escavacao_hv: number | null
  altura_berco_m: number | null
  created_at: string
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export async function listBibliotecaPecas(): Promise<ItemBiblioteca[]> {
  const { data, error } = await requireSupabase().from('biblioteca_pecas').select('*').order('material').order('diametro_m')
  if (error) throw error
  return data as ItemBiblioteca[]
}

export async function criarItemBiblioteca(
  material: string,
  diametroM: number,
  espessuraParedeM: number | null,
  nomePeca: string | null,
  larguraEscavacaoM: number | null = null,
  taludeEscavacaoHv: number | null = null,
  alturaBercoM: number | null = null
): Promise<void> {
  const { error } = await requireSupabase().from('biblioteca_pecas').insert({
    material,
    diametro_m: diametroM,
    espessura_parede_m: espessuraParedeM,
    nome_peca: nomePeca,
    largura_escavacao_m: larguraEscavacaoM,
    talude_escavacao_hv: taludeEscavacaoHv,
    altura_berco_m: alturaBercoM,
  })
  if (error) throw error
}

export async function atualizarItemBiblioteca(
  id: string,
  patch: {
    espessura_parede_m?: number | null
    nome_peca?: string | null
    largura_escavacao_m?: number | null
    talude_escavacao_hv?: number | null
    altura_berco_m?: number | null
  }
): Promise<void> {
  const { error } = await requireSupabase().from('biblioteca_pecas').update(patch).eq('id', id)
  if (error) throw error
}

export async function excluirItemBiblioteca(id: string): Promise<void> {
  const { error } = await requireSupabase().from('biblioteca_pecas').delete().eq('id', id)
  if (error) throw error
}
