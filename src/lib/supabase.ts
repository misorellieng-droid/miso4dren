import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// O dren mora no banco do hub (MISO4Apps), no schema "dren". Todo
// .from() e .rpc() deste app vai para dren.*; o login é o do hub.
// Clientes e projetos são os do cadastro único do hub (views dren.clientes
// e dren.projetos). Storage não depende de schema (bucket "dren-assets").
//
// Sem as variáveis de ambiente configuradas, os módulos de cálculo continuam
// funcionando (funções puras, 100% client-side) — só a persistência em
// nuvem (obras, import de rede/bacias, resultados) fica indisponível.
export const supabase = url && anonKey
  ? createClient(url, anonKey, { db: { schema: 'dren' } })
  : null
