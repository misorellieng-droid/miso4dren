import { useEffect, useState } from 'react'
import { Calculator, Loader2, Plus, Trash2 } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Modal } from '../components/ui/Modal'
import { Field, fieldInputClass } from '../components/ui/Field'
import { createEquacaoIdf, deleteEquacaoIdf, listEquacoesIdf, type EquacaoIdfRecord } from '../lib/idfStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'
const GHOST_BTN = 'rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-elevated'

const EMPTY_FORM = { nome: '', localidade: '', k: '', a: '', b: '', c: '', fonte: '' }

export function EquacoesIdfPage() {
  const [equacoes, setEquacoes] = useState<EquacaoIdfRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setEquacoes(await listEquacoesIdf())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar equações.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSave = async () => {
    const { nome, k, a, b, c } = form
    if (!nome.trim() || [k, a, b, c].some((v) => v === '' || !Number.isFinite(Number(v)))) {
      setError('Informe nome e os 4 coeficientes (k, a, b, c).')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createEquacaoIdf({
        nome: nome.trim(),
        localidade: form.localidade.trim() || null,
        k: Number(k),
        a: Number(a),
        b: Number(b),
        c: Number(c),
        fonte: form.fonte.trim() || null,
      })
      setFormOpen(false)
      setForm(EMPTY_FORM)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar equação.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir esta equação IDF? Obras que a usam ficarão sem equação vinculada.')) return
    setBusyId(id)
    try {
      await deleteEquacaoIdf(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir equação.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={['Administração', 'Equações IDF']} />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-xl font-bold text-text-primary">Equações IDF</h1>
          <p className="text-sm text-text-secondary">i = k × Tr^a / (b + Tc)^c — biblioteca compartilhada entre obras.</p>
        </div>
        <button onClick={() => setFormOpen(true)} disabled={!supabase} className={PRIMARY_BTN}>
          <Plus size={16} />
          Nova equação
        </button>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}
      {!supabase && (
        <div className="mb-4 rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3 text-sm text-accent-amber">
          Supabase não configurado.
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 size={16} className="animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50 text-left text-xs text-text-secondary">
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">Localidade</th>
                <th className="px-4 py-2 font-medium">k</th>
                <th className="px-4 py-2 font-medium">a</th>
                <th className="px-4 py-2 font-medium">b</th>
                <th className="px-4 py-2 font-medium">c</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {equacoes.map((eq) => (
                <tr key={eq.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 font-medium text-text-primary">{eq.nome}</td>
                  <td className="px-4 py-2 text-text-secondary">{eq.localidade ?? '—'}</td>
                  <td className="px-4 py-2 text-text-secondary">{eq.k}</td>
                  <td className="px-4 py-2 text-text-secondary">{eq.a}</td>
                  <td className="px-4 py-2 text-text-secondary">{eq.b}</td>
                  <td className="px-4 py-2 text-text-secondary">{eq.c}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => handleDelete(eq.id)} disabled={busyId === eq.id} className="rounded p-1 hover:bg-accent-red/10 hover:text-accent-red">
                      {busyId === eq.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Nova equação IDF"
        icon={<Calculator size={20} />}
        footer={
          <>
            <button onClick={() => setFormOpen(false)} className={GHOST_BTN}>Cancelar</button>
            <button onClick={handleSave} disabled={saving} className={PRIMARY_BTN}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome" required>
              <input className={fieldInputClass} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </Field>
            <Field label="Localidade">
              <input className={fieldInputClass} value={form.localidade} onChange={(e) => setForm({ ...form, localidade: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {(['k', 'a', 'b', 'c'] as const).map((coef) => (
              <Field key={coef} label={coef} required>
                <input type="number" step="any" className={fieldInputClass} value={form[coef]} onChange={(e) => setForm({ ...form, [coef]: e.target.value })} />
              </Field>
            ))}
          </div>
          <Field label="Fonte" hint="Referência de origem do dado">
            <input className={fieldInputClass} value={form.fonte} onChange={(e) => setForm({ ...form, fonte: e.target.value })} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
