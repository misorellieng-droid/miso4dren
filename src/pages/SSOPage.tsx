import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// SSO v2 (slope no banco do hub): o hub gera um código de acesso de uso
// único do próprio Supabase Auth e abre /sso#th=<código>. Aqui o navegador
// troca o código pela sessão direto com o Supabase (verifyOtp). Sem
// servidor, sem chave e sem tabela anti-replay: o Supabase já garante que
// o código só vale uma vez.
//
// O código vem no fragmento (#), que o navegador nunca envia a servidor
// nenhum. Capturado em escopo de módulo, antes do router mexer na URL.
const initialTokenHash = (() => {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
  return new URLSearchParams(hash).get('th')
})()

// Uso único: a promise fica em escopo de módulo para o verifyOtp rodar uma
// vez só, mesmo com StrictMode/remontagem do componente.
type SSOOutcome = { success: true } | { success: false; error: string }
let ssoFlowPromise: Promise<SSOOutcome> | null = null

function runSSOFlow(tokenHash: string): Promise<SSOOutcome> {
  if (!ssoFlowPromise) {
    ssoFlowPromise = (async (): Promise<SSOOutcome> => {
      if (!supabase) return { success: false, error: 'Supabase não configurado neste app.' }

      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
      if (error) return { success: false, error: 'Acesso expirado ou já utilizado. Abra o app de novo pelo MISO4Apps.' }

      return { success: true }
    })()
  }
  return ssoFlowPromise
}

export function SSOPage() {
  const [status, setStatus] = useState('Validando acesso...')
  const [error, setError] = useState('')

  useEffect(() => {
    // Limpa o fragmento da URL antes de qualquer outra coisa
    window.history.replaceState(null, '', window.location.pathname)

    if (!initialTokenHash) { setError('Acesso não informado. Abra o app pelo MISO4Apps.'); return }

    runSSOFlow(initialTokenHash)
      .then((outcome) => {
        if (!outcome.success) { setError(outcome.error); return }
        setStatus('Redirecionando...')
        window.location.href = import.meta.env.BASE_URL
      })
      .catch(() => setError('Erro inesperado. Tente novamente.'))
  }, [])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        {error ? (
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>Falha na autenticação</h1>
            <p style={{ color: '#666', marginBottom: '1rem' }}>{error}</p>
            <a href="https://miso4apps.com.br/dashboard" style={{ color: '#f97316' }}>Voltar para MISO4Apps</a>
          </div>
        ) : (
          <div>
            <div style={{ width: 32, height: 32, border: '3px solid #e5e7eb', borderTopColor: '#f97316', borderRadius: '50%', margin: '0 auto 1rem', animation: 'spin 1s linear infinite' }} />
            <p style={{ color: '#666' }}>{status}</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}
      </div>
    </div>
  )
}
