import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Sem as variáveis de ambiente configuradas, os módulos de cálculo continuam
// funcionando (funções puras, 100% client-side) — só a persistência em
// nuvem (obras, import de rede/bacias, resultados) fica indisponível.
export const supabase = url && anonKey ? createClient(url, anonKey) : null
