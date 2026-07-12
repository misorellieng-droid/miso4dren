import { useEffect, useState } from 'react'
import { Building2, ChevronDown, Loader2, Plus, Trash2 } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Modal } from '../components/ui/Modal'
import { Field, fieldInputClass } from '../components/ui/Field'
import { useObraContext } from '../lib/ObraContext'
import { createObra, deleteObra, type ObraRecord } from '../lib/obrasStorage'
import { listEquacoesIdf, type EquacaoIdfRecord } from '../lib/idfStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'
const GHOST_BTN = 'rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-elevated'

export function ObrasPage() {
  const { obras, obraAtivaId, setObraAtivaId, loading, error: contextError, reload } = useObraContext()
  const [equacoes, setEquacoes] = useState<EquacaoIdfRecord[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (supabase) listEquacoesIdf().then(setEquacoes).catch((e) => setError(e.message))
  }, [])

  const [formOpen, setFormOpen] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [equacaoIdfId, setEquacaoIdfId] = useState('')
  const [tempoRetorno, setTempoRetorno] = useState(10)
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setNome('')
    setDescricao('')
    setEquacaoIdfId(equacoes[0]?.id ?? '')
    setTempoRetorno(10)
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!nome.trim()) {
      setError('Informe o nome da obra.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await createObra({
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        equacaoIdfId: equacaoIdfId || null,
        tempoRetornoAnos: tempoRetorno,
      })
      setFormOpen(false)
      await reload()
      setObraAtivaId(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar obra.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (o: ObraRecord) => {
    if (!window.confirm(`Isso apaga a obra "${o.nome}" e todos os dados vinculados (caixas, trechos, bacias, resultados). Continuar?`)) {
      return
    }
    setBusyId(o.id)
    try {
      await deleteObra(o.id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir obra.')
    } finally {
      setBusyId(null)
    }
  }

  const nomeEquacao = (id: string | null) => equacoes.find((e) => e.id === id)?.nome ?? '—'

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={['Cadastros', 'Obras']} />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-xl font-bold text-text-primary">Obras</h1>
          <p className="text-sm text-text-secondary">Cada obra tem sua equação IDF, tempo de retorno, rede e bacias próprias.</p>
        </div>
        <button
          onClick={openCreate}
          disabled={!supabase}
          className={PRIMARY_BTN}
          title={!supabase ? 'Configure VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY para habilitar' : undefined}
        >
          <Plus size={16} />
          Nova obra
        </button>
      </div>

      {(error || contextError) && (
        <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">
          {error ?? contextError}
        </div>
      )}

      {!supabase && (
        <div className="mb-4 rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3 text-sm text-accent-amber">
          Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para usar obras.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 size={16} className="animate-spin" /> Carregando...
        </div>
      ) : obras.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          Nenhuma obra ainda. Clique em "Nova obra" para começar.
        </div>
      ) : (
        <div className="space-y-2">
          {obras.map((o) => (
            <button
              key={o.id}
              onClick={() => setObraAtivaId(o.id)}
              className={`flex w-full items-center justify-between rounded-lg border p-4 text-left transition ${
                o.id === obraAtivaId ? 'border-brand bg-brand/5' : 'border-border bg-surface hover:border-brand/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Building2 size={20} className="text-brand" />
                <div>
                  <div className="font-sans text-sm font-semibold text-text-primary">{o.nome}</div>
                  {o.descricao && <div className="text-xs text-text-secondary">{o.descricao}</div>}
                  <div className="text-xs text-text-secondary">
                    IDF: {nomeEquacao(o.equacao_idf_id)} · TR: {o.tempo_retorno_anos} anos
                  </div>
                </div>
              </div>
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(o)
                }}
                role="button"
                aria-label="Excluir obra"
                className="rounded p-1.5 hover:bg-accent-red/10 hover:text-accent-red"
              >
                {busyId === o.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </span>
            </button>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Nova obra"
        description="Escolha a equação IDF e o tempo de retorno de projeto — a rede e as bacias são importadas depois."
        icon={<Building2 size={20} />}
        footer={
          <>
            <button onClick={() => setFormOpen(false)} className={GHOST_BTN}>
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} className={PRIMARY_BTN}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              Criar obra
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nome da obra" required>
            <input autoFocus className={fieldInputClass} value={nome} onChange={(e) => setNome(e.target.value)} />
          </Field>
          <Field label="Descrição" hint="Opcional">
            <textarea className={`${fieldInputClass} resize-none`} rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </Field>
          <Field label="Equação IDF">
            <div className="relative">
              <select
                className={`${fieldInputClass} appearance-none pr-8`}
                value={equacaoIdfId}
                onChange={(e) => setEquacaoIdfId(e.target.value)}
              >
                <option value="">Nenhuma selecionada</option>
                {equacoes.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.nome} {eq.localidade ? `(${eq.localidade})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
            </div>
          </Field>
          <Field label="Tempo de retorno (anos)" required>
            <input
              type="number"
              min={1}
              className={fieldInputClass}
              value={tempoRetorno}
              onChange={(e) => setTempoRetorno(Number(e.target.value))}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
