import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { listObras, type ObraRecord } from './obrasStorage'
import { supabase } from './supabase'

const STORAGE_KEY = 'miso4dren:obraAtivaId'

interface ObraContextValue {
  obras: ObraRecord[]
  obraAtivaId: string | null
  obraAtiva: ObraRecord | null
  setObraAtivaId: (id: string | null) => void
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

const ObraContext = createContext<ObraContextValue | null>(null)

export function ObraProvider({ children }: { children: ReactNode }) {
  const [obras, setObras] = useState<ObraRecord[]>([])
  const [obraAtivaId, setObraAtivaIdState] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY))
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
      const data = await listObras()
      setObras(data)
      setObraAtivaIdState((current) => {
        if (current && data.some((o) => o.id === current)) return current
        return data[0]?.id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar obras.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setObraAtivaId = (id: string | null) => {
    setObraAtivaIdState(id)
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  }

  const obraAtiva = obras.find((o) => o.id === obraAtivaId) ?? null

  return (
    <ObraContext.Provider value={{ obras, obraAtivaId, obraAtiva, setObraAtivaId, loading, error, reload }}>
      {children}
    </ObraContext.Provider>
  )
}

export function useObraContext(): ObraContextValue {
  const ctx = useContext(ObraContext)
  if (!ctx) throw new Error('useObraContext deve ser usado dentro de <ObraProvider>')
  return ctx
}
