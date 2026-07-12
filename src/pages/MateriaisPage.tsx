import { useEffect, useState } from 'react'
import { Beaker, Loader2, Plus, Trash2 } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Modal } from '../components/ui/Modal'
import { Field, fieldInputClass } from '../components/ui/Field'
import { createMaterialManning, deleteMaterialManning, listMateriaisManning, type MaterialManningRecord } from '../lib/materiaisStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'
const GHOST_BTN = 'rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-elevated'

export function MateriaisPage() {
  const [materiais, setMateriais] = useState<MaterialManningRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [material, setMaterial] = useState('')
  const [manningN, setManningN] = useState('')
  const [observacao, setObservacao] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setMateriais(await listMateriaisManning())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar materiais.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSave = async () => {
    if (!material.trim() || !Number.isFinite(Number(manningN)) || Number(manningN) <= 0) {
      setError('Informe o material e um Manning n válido.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createMaterialManning({ material: material.trim().toUpperCase(), manning_n: Number(manningN), observacao: observacao.trim() || null })
      setFormOpen(false)
      setMaterial('')
      setManningN('')
      setObservacao('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar material.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este material?')) return
    setBusyId(id)
    try {
      await deleteMaterialManning(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir material.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={['Administração', 'Materiais e rugosidade']} />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-xl font-bold text-text-primary">Materiais e rugosidade</h1>
          <p className="text-sm text-text-secondary">Fallback de Manning n quando o LandXML não traz a rugosidade do trecho.</p>
        </div>
        <button onClick={() => setFormOpen(true)} disabled={!supabase} className={PRIMARY_BTN}>
          <Plus size={16} />
          Novo material
        </button>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 size={16} className="animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50 text-left text-xs text-text-secondary">
                <th className="px-4 py-2 font-medium">Material</th>
                <th className="px-4 py-2 font-medium">Manning n</th>
                <th className="px-4 py-2 font-medium">Observação</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {materiais.map((m) => (
                <tr key={m.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 font-medium text-text-primary">{m.material}</td>
                  <td className="px-4 py-2 text-text-secondary">{m.manning_n}</td>
                  <td className="px-4 py-2 text-text-secondary">{m.observacao ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => handleDelete(m.id)} disabled={busyId === m.id} className="rounded p-1 hover:bg-accent-red/10 hover:text-accent-red">
                      {busyId === m.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
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
        title="Novo material"
        icon={<Beaker size={20} />}
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
          <Field label="Material" required hint="Deve bater com o texto do material no LandXML (ex.: CONCRETO, PEAD)">
            <input className={fieldInputClass} value={material} onChange={(e) => setMaterial(e.target.value)} />
          </Field>
          <Field label="Manning n" required>
            <input type="number" step="any" className={fieldInputClass} value={manningN} onChange={(e) => setManningN(e.target.value)} />
          </Field>
          <Field label="Observação">
            <input className={fieldInputClass} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
