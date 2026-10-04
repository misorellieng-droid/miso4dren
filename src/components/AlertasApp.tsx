import { useCallback, useEffect, useState } from 'react'

// Alertas de um app (catálogo public.alertas_tipos + preferências do usuário
// em public.alertas_preferencias, no banco do hub). Mesma lógica do
// AlertasApp do MISO4Apps, com elementos nativos (sem shadcn). O MESMO
// arquivo é usado no slope e no dren: as preferências ficam num lugar só.
//
// `db` = cliente do Supabase já apontando para o schema public.

interface AlertaTipo {
  codigo: string
  nome: string
  descricao: string | null
  antecedencia_tipo: 'nenhuma' | 'minutos' | 'dias' | 'horario'
  antecedencia_padrao: number | null
  horario_padrao: string | null
  ativo_padrao: boolean
}

interface Preferencia {
  codigo: string
  ativo: boolean
  antecedencia: number | null
  horario: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClienteDb = { from: (tabela: string) => any }

const MINUTOS = [5, 10, 15, 30, 60, 120]
const DIAS = [0, 1, 2, 3, 5, 7]
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')

export function AlertasApp({ db, userId, appSlug }: { db: ClienteDb; userId: string; appSlug: string }) {
  const [tipos, setTipos] = useState<AlertaTipo[]>([])
  const [prefs, setPrefs] = useState<Record<string, Preferencia>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true
    ;(async () => {
      setCarregando(true)
      const [{ data: t }, { data: p }] = await Promise.all([
        db.from('alertas_tipos').select('*').eq('disponivel', true).eq('app_slug', appSlug).order('ordem'),
        db.from('alertas_preferencias').select('codigo, ativo, antecedencia, horario').eq('user_id', userId),
      ])
      if (!ativo) return
      setTipos((t ?? []) as AlertaTipo[])
      setPrefs(Object.fromEntries(((p ?? []) as Preferencia[]).map((x) => [x.codigo, x])))
      setCarregando(false)
    })()
    return () => {
      ativo = false
    }
  }, [db, userId, appSlug])

  const efetivo = useCallback(
    (t: AlertaTipo): Preferencia => {
      const p = prefs[t.codigo]
      return {
        codigo: t.codigo,
        ativo: p ? p.ativo : t.ativo_padrao,
        antecedencia: p?.antecedencia ?? t.antecedencia_padrao,
        horario: p?.horario ?? t.horario_padrao,
      }
    },
    [prefs],
  )

  const salvar = async (t: AlertaTipo, mudanca: Partial<Preferencia>) => {
    const novo = { ...efetivo(t), ...mudanca }
    const anterior = prefs[t.codigo]
    setErro('')
    setPrefs((atual) => ({ ...atual, [t.codigo]: novo }))
    const { error } = await db.from('alertas_preferencias').upsert(
      { user_id: userId, codigo: t.codigo, ativo: novo.ativo, antecedencia: novo.antecedencia, horario: novo.horario, atualizado_em: new Date().toISOString() },
      { onConflict: 'user_id,codigo' },
    )
    if (error) {
      setPrefs((atual) => {
        const copia = { ...atual }
        if (anterior) copia[t.codigo] = anterior
        else delete copia[t.codigo]
        return copia
      })
      setErro(`Não foi possível salvar: ${error.message}`)
    }
  }

  if (carregando) return <div className="h-40 animate-pulse rounded-xl bg-elevated" />
  if (tipos.length === 0) return <p className="text-sm text-text-secondary">Este aplicativo ainda não tem alertas configuráveis.</p>

  const campo = 'h-9 rounded-lg border border-border bg-surface px-2 text-sm text-text-primary'

  return (
    <div className="space-y-2">
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div className="divide-y divide-border rounded-xl border border-border bg-surface">
        {tipos.map((t) => {
          const p = efetivo(t)
          return (
            <div key={t.codigo} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <label className="flex flex-1 cursor-pointer items-start gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={p.ativo}
                  aria-label={t.nome}
                  onClick={() => salvar(t, { ativo: !p.ativo })}
                  className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${p.ativo ? 'bg-brand' : 'bg-border'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${p.ativo ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
                <span>
                  <span className="block text-sm font-semibold text-text-primary">{t.nome}</span>
                  {t.descricao && <span className="block text-xs text-text-secondary">{t.descricao}</span>}
                </span>
              </label>

              {p.ativo && t.antecedencia_tipo !== 'nenhuma' && (
                <div className="flex items-center gap-2 pl-12 text-sm text-text-secondary sm:pl-0">
                  {t.antecedencia_tipo === 'minutos' && (
                    <>
                      <select className={campo} value={p.antecedencia ?? 15} onChange={(e) => salvar(t, { antecedencia: Number(e.target.value) })}>
                        {MINUTOS.map((m) => (
                          <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>
                        ))}
                      </select>
                      <span>antes</span>
                    </>
                  )}
                  {t.antecedencia_tipo === 'dias' && (
                    <>
                      <select className={campo} value={p.antecedencia ?? 1} onChange={(e) => salvar(t, { antecedencia: Number(e.target.value) })}>
                        {DIAS.map((d) => (
                          <option key={d} value={d}>{d === 0 ? 'no dia' : d === 1 ? '1 dia antes' : `${d} dias antes`}</option>
                        ))}
                      </select>
                      <span>às</span>
                    </>
                  )}
                  {(t.antecedencia_tipo === 'horario' || t.antecedencia_tipo === 'dias') && (
                    <input type="time" className={campo} value={hhmm(p.horario)} onChange={(e) => e.target.value && salvar(t, { horario: e.target.value })} />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
