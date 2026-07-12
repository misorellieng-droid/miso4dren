import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, FolderOpen, FolderPlus, Layers, Loader2, Plus, UserPlus, Users } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Modal } from '../components/ui/Modal'
import { Field, fieldInputClass } from '../components/ui/Field'
import { createCliente, listClientes, type Cliente } from '../lib/clientesStorage'
import { createProjeto, listProjetos, type ProjetoSummary } from '../lib/projetosStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'
const GHOST_BTN = 'rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-elevated'

export function ProjetosPage() {
  const [projetos, setProjetos] = useState<ProjetoSummary[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [p, c] = await Promise.all([listProjetos(), listClientes()])
      setProjetos(p)
      setClientes(c)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar projetos.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  // ── Modal: Novo projeto ─────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setNome('')
    setDescricao('')
    setClienteId('')
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!nome.trim()) {
      setError('Informe o nome do projeto.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createProjeto({ nome: nome.trim(), descricao: descricao.trim() || null, clienteId: clienteId || null })
      setFormOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar projeto.')
    } finally {
      setSaving(false)
    }
  }

  // ── Modal: Novo cliente (a partir do modal de projeto) ────────────────────
  const [clienteFormOpen, setClienteFormOpen] = useState(false)
  const [clienteNome, setClienteNome] = useState('')
  const [clienteSaving, setClienteSaving] = useState(false)

  const handleSaveCliente = async () => {
    if (!clienteNome.trim()) {
      setError('Informe o nome do cliente.')
      return
    }
    setClienteSaving(true)
    setError(null)
    try {
      const created = await createCliente({ nome: clienteNome.trim() })
      setClientes((prev) => [...prev, created].sort((a, b) => a.nome.localeCompare(b.nome)))
      setClienteId(created.id)
      setClienteFormOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar cliente.')
    } finally {
      setClienteSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={['Cadastros', 'Projetos']} />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-xl font-bold text-text-primary">Projetos</h1>
          <p className="text-sm text-text-secondary">Cada projeto pode ter várias revisões (ex.: tubo concreto vs. tubo PEAD).</p>
        </div>
        <button onClick={openCreate} disabled={!supabase} className={PRIMARY_BTN}>
          <Plus size={16} />
          Novo projeto
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
      ) : projetos.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          Nenhum projeto ainda. Clique em "Novo projeto" para começar.
        </div>
      ) : (
        <div className="space-y-2">
          {projetos.map((p) => (
            <Link
              key={p.id}
              to={`/projetos/${p.id}`}
              className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 hover:border-brand"
            >
              <div className="flex items-center gap-3">
                <FolderOpen size={20} className="text-brand" />
                <div>
                  <div className="font-sans text-sm font-semibold text-text-primary">{p.nome}</div>
                  {p.cliente_nome && <div className="text-xs text-text-secondary">Cliente: {p.cliente_nome}</div>}
                  {p.descricao && <div className="text-xs text-text-secondary">{p.descricao}</div>}
                </div>
              </div>
              <span className="flex items-center gap-1 text-xs text-text-secondary">
                <Layers size={14} /> {p.revisoesCount} revisão{p.revisoesCount === 1 ? '' : 'ões'}
              </span>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Novo projeto"
        description="Cadastre o projeto e, se já tiver, vincule o cliente responsável. Depois é só criar as revisões dentro dele."
        icon={<FolderPlus size={20} />}
        footer={
          <>
            <button onClick={() => setFormOpen(false)} className={GHOST_BTN}>
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} className={PRIMARY_BTN}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              Criar projeto
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nome do projeto" required>
            <input autoFocus className={fieldInputClass} placeholder="Ex: Loteamento Jardim das Flores" value={nome} onChange={(e) => setNome(e.target.value)} />
          </Field>

          <Field label="Cliente" hint="Vincule um cliente já cadastrado ou crie um novo sem sair daqui.">
            <div className="flex items-stretch gap-2">
              <div className="relative flex-1">
                <select className={`${fieldInputClass} appearance-none pr-8`} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">Nenhum cliente vinculado</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
              </div>
              <button
                type="button"
                onClick={() => {
                  setClienteNome('')
                  setClienteFormOpen(true)
                }}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-border px-3 text-xs font-medium text-text-secondary transition hover:border-brand hover:text-brand"
              >
                <UserPlus size={14} /> Novo
              </button>
            </div>
          </Field>

          <Field label="Descrição" hint="Opcional — local, referência interna, etc.">
            <textarea className={`${fieldInputClass} resize-none`} rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={clienteFormOpen}
        onClose={() => setClienteFormOpen(false)}
        title="Novo cliente"
        icon={<Users size={20} />}
        footer={
          <>
            <button onClick={() => setClienteFormOpen(false)} className={GHOST_BTN}>
              Cancelar
            </button>
            <button onClick={handleSaveCliente} disabled={clienteSaving} className={PRIMARY_BTN}>
              {clienteSaving && <Loader2 size={14} className="animate-spin" />}
              Criar cliente
            </button>
          </>
        }
      >
        <Field label="Nome" required>
          <input autoFocus className={fieldInputClass} value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} />
        </Field>
      </Modal>
    </div>
  )
}
