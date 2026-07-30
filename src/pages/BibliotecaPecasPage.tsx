import { useEffect, useState } from 'react'
import { Loader2, Package, Plus, Trash2 } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Modal } from '../components/ui/Modal'
import { Field, fieldInputClass } from '../components/ui/Field'
import { criarItemBiblioteca, excluirItemBiblioteca, listBibliotecaPecas, type ItemBiblioteca } from '../lib/bibliotecaStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'
const GHOST_BTN = 'rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-elevated'

export function BibliotecaPecasPage() {
  const [itens, setItens] = useState<ItemBiblioteca[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [material, setMaterial] = useState('')
  const [diametroM, setDiametroM] = useState('')
  const [espessuraM, setEspessuraM] = useState('')
  const [nomePeca, setNomePeca] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setItens(await listBibliotecaPecas())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar a biblioteca de peças.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSave = async () => {
    const diametro = Number(diametroM.replace(',', '.'))
    if (!material.trim() || !Number.isFinite(diametro) || diametro <= 0) {
      setError('Informe o material e um diâmetro válido.')
      return
    }
    const espessura = espessuraM.trim() ? Number(espessuraM.replace(',', '.')) : null
    setSaving(true)
    setError(null)
    try {
      await criarItemBiblioteca(material.trim().toUpperCase(), diametro, espessura, nomePeca.trim() || null)
      setFormOpen(false)
      setMaterial('')
      setDiametroM('')
      setEspessuraM('')
      setNomePeca('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar item — confira se esse material+diâmetro já não existe.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este item da biblioteca?')) return
    setBusyId(id)
    try {
      await excluirItemBiblioteca(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir item.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={['Administração', 'Biblioteca de Peças']} />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-xl font-bold text-text-primary">Biblioteca de Peças</h1>
          <p className="text-sm text-text-secondary">
            Catálogo material + diâmetro → espessura de parede, espelhando o Parts List do Civil 3D. Usado pra editar diâmetro só com
            tamanhos reais (dropdown) e pra escrever a espessura certa no XML exportado — sem isso o Civil recusa a troca de diâmetro
            na reimportação.
          </p>
        </div>
        <button onClick={() => setFormOpen(true)} disabled={!supabase} className={PRIMARY_BTN}>
          <Plus size={16} />
          Novo item
        </button>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 size={16} className="animate-spin" /> Carregando...
        </div>
      ) : itens.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          Nenhum item cadastrado ainda.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50 text-left text-xs text-text-secondary">
                <th className="px-4 py-2 font-medium">Material</th>
                <th className="px-4 py-2 font-medium">Diâmetro (m)</th>
                <th className="px-4 py-2 font-medium">Espessura de parede (m)</th>
                <th className="px-4 py-2 font-medium">Nome da peça</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 font-medium text-text-primary">{i.material}</td>
                  <td className="px-4 py-2 text-text-secondary">{i.diametro_m}</td>
                  <td className="px-4 py-2 text-text-secondary">{i.espessura_parede_m ?? '—'}</td>
                  <td className="px-4 py-2 text-text-secondary">{i.nome_peca ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleDelete(i.id)}
                      disabled={busyId === i.id}
                      className="rounded p-1 hover:bg-accent-red/10 hover:text-accent-red"
                    >
                      {busyId === i.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
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
        title="Novo item da biblioteca"
        icon={<Package size={20} />}
        footer={
          <>
            <button onClick={() => setFormOpen(false)} className={GHOST_BTN}>
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} className={PRIMARY_BTN}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Material" required hint="Deve bater com o texto do material no LandXML (ex.: CONCRETO, PVC)">
            <input className={fieldInputClass} value={material} onChange={(e) => setMaterial(e.target.value)} />
          </Field>
          <Field label="Diâmetro (m)" required>
            <input type="number" step="any" className={fieldInputClass} value={diametroM} onChange={(e) => setDiametroM(e.target.value)} />
          </Field>
          <Field label="Espessura de parede (m)" hint="Property 'Wall Thickness' do Civil 3D, convertida de mm pra m (ex.: 175mm = 0,175)">
            <input type="number" step="any" className={fieldInputClass} value={espessuraM} onChange={(e) => setEspessuraM(e.target.value)} />
          </Field>
          <Field label="Nome da peça" hint="Property 'Part Size Name' do Civil 3D (ex.: BSTC DN 0,80 m) — só informativo">
            <input className={fieldInputClass} value={nomePeca} onChange={(e) => setNomePeca(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
