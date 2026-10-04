import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { APP_SLUG, HUB_URL } from '../lib/hub'

// O acesso a este app é liberado só pelo MISO4Apps. O dren mora no mesmo
// endereço do hub, então a sessão do hub vale aqui; além dela, o usuário
// precisa ter o app liberado (public.tem_acesso_app, a mesma regra que o
// banco aplica nos dados via guarda_app). Sem isso, nada do app é renderizado.
type Estado = 'carregando' | 'sem-sessao' | 'sem-acesso' | 'erro' | 'liberado'

export function RequireHubLogin({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [estado, setEstado] = useState<Estado>('carregando')

  useEffect(() => {
    if (!supabase) { setSession(null); return }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  const verificarAcesso = useCallback(async () => {
    if (!supabase) return
    setEstado('carregando')
    const { data, error } = await supabase.schema('public').rpc('tem_acesso_app', { p_app_slug: APP_SLUG })
    if (error) setEstado('erro')
    else setEstado(data === true ? 'liberado' : 'sem-acesso')
  }, [])

  // Depende só de QUEM está logado: a renovação automática do token troca o
  // objeto session a cada hora, e reverificar ali desmontaria o app em uso.
  const sessaoLida = session !== undefined
  const userId = session?.user.id
  useEffect(() => {
    if (!sessaoLida) return
    if (!userId) { setEstado('sem-sessao'); return }
    verificarAcesso()
  }, [sessaoLida, userId, verificarAcesso])

  if (estado === 'liberado') return <>{children}</>

  if (estado === 'carregando') {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>Carregando...</div>
  }

  const telas = {
    'sem-sessao': {
      icone: '🔒',
      titulo: 'Acesso pelo MISO4Apps',
      texto: 'Entre pelo MISO4Apps e abra este aplicativo em "Meus Aplicativos".',
      botao: { texto: 'Entrar pelo MISO4Apps', href: `${HUB_URL}/dashboard` },
    },
    'sem-acesso': {
      icone: '🔒',
      titulo: 'Você não tem acesso a este aplicativo',
      texto: 'O miso4dren não está liberado para o seu usuário. Fale com o responsável pela sua conta ou conheça os planos.',
      botao: { texto: 'Ver planos', href: `${HUB_URL}/planos?app=${APP_SLUG}` },
    },
    erro: {
      icone: '⚠️',
      titulo: 'Não foi possível verificar o acesso',
      texto: 'Confira a sua conexão com a internet e tente de novo.',
      botao: null,
    },
  } as const
  const tela = telas[estado]

  const estiloBotao = { display: 'inline-block', background: '#f97316', color: '#fff', padding: '0.6rem 1.2rem', borderRadius: 8, fontWeight: 600, textDecoration: 'none', border: 'none', cursor: 'pointer' }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{tela.icone}</div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{tela.titulo}</h1>
        <p style={{ color: '#666', marginBottom: '1.5rem' }}>{tela.texto}</p>
        {tela.botao ? (
          <a href={tela.botao.href} style={estiloBotao}>{tela.botao.texto}</a>
        ) : (
          <button onClick={verificarAcesso} style={estiloBotao}>Tentar de novo</button>
        )}
        {estado !== 'sem-sessao' && (
          <p style={{ marginTop: '1rem' }}>
            <a href={`${HUB_URL}/dashboard`} style={{ color: '#f97316', fontSize: '0.875rem' }}>← Voltar para o MISO4Apps</a>
          </p>
        )}
      </div>
    </div>
  )
}
