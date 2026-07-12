import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { listTodasRevisoes, type RevisaoComProjeto } from './revisoesStorage'
import { supabase } from './supabase'

const STORAGE_KEY = 'miso4dren:revisaoAtivaId'

interface RevisaoContextValue {
  revisoes: RevisaoComProjeto[]
  revisaoAtivaId: string | null
  revisaoAtiva: RevisaoComProjeto | null
  setRevisaoAtivaId: (id: string | null) => void
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

const RevisaoContext = createContext<RevisaoContextValue | null>(null)

export function RevisaoProvider({ children }: { children: ReactNode }) {
  const [revisoes, setRevisoes] = useState<RevisaoComProjeto[]>([])
  const [revisaoAtivaId, setRevisaoAtivaIdState] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await listTodasRevisoes()
      setRevisoes(data)
      setRevisaoAtivaIdState((current) => {
        if (current && data.some((r) => r.id === current)) return current
        return data[0]?.id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar revisões.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setRevisaoAtivaId = (id: string | null) => {
    setRevisaoAtivaIdState(id)
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  }

  const revisaoAtiva = revisoes.find((r) => r.id === revisaoAtivaId) ?? null

  return (
    <RevisaoContext.Provider value={{ revisoes, revisaoAtivaId, revisaoAtiva, setRevisaoAtivaId, loading, error, reload }}>
      {children}
    </RevisaoContext.Provider>
  )
}

export function useRevisaoContext(): RevisaoContextValue {
  const ctx = useContext(RevisaoContext)
  if (!ctx) throw new Error('useRevisaoContext deve ser usado dentro de <RevisaoProvider>')
  return ctx
}
