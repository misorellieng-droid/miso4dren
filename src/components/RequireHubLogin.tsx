import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// O acesso a este app é liberado só pelo MISO4Apps (SSO). Sem sessão,
// nada do app é renderizado — o usuário é mandado de volta para o hub.
export function RequireHubLogin({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    if (!supabase) { setSession(null); return }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  if (session === undefined) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>Carregando...</div>
  }

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔒</div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Acesso pelo MISO4Apps</h1>
          <p style={{ color: '#666', marginBottom: '1.5rem' }}>
            Entre pelo MISO4Apps e abra este aplicativo em "Meus Aplicativos".
          </p>
          <a
            href="https://miso4apps.com.br/dashboard"
            style={{ display: 'inline-block', background: '#f97316', color: '#fff', padding: '0.6rem 1.2rem', borderRadius: 8, fontWeight: 600, textDecoration: 'none' }}
          >
            Entrar pelo MISO4Apps
          </a>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
