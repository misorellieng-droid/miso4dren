import { useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { APP_SLUG, HUB_URL } from '../lib/hub'
import { AlertasApp, type ClienteDb } from '../components/AlertasApp'

// Os alertas ficam no banco do hub (schema public): as mesmas preferências
// da página Notificações do MISO4Apps.
const dbPublic = supabase ? (supabase.schema('public') as unknown as ClienteDb) : null

export function NotificacoesPage() {
  const [userId, setUserId] = useState<string>()

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => setUserId(data.session?.user.id))
  }, [])

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Notificações</h1>
        <p className="text-sm text-text-secondary">
          Avisos para a equipe do projeto. Você não é avisado do que você mesmo fez, a não ser que ligue a última opção.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-elevated text-brand">
          <Smartphone size={20} />
        </div>
        <p className="text-sm text-text-secondary">
          Para receber os alertas, ative as notificações no aparelho em{' '}
          <a href={`${HUB_URL}/notificacoes`} className="font-medium text-brand hover:underline">
            MISO4Apps → Notificações
          </a>
          . Vale para todos os aplicativos MISO4.
        </p>
      </div>

      {dbPublic && userId && <AlertasApp db={dbPublic} userId={userId} appSlug={APP_SLUG} />}
    </div>
  )
}
