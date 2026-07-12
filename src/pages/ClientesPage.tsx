import { useEffect, useState } from 'react'
import { Building2, Loader2, Mail, Phone, Plus, Trash2, UserPlus } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Modal } from '../components/ui/Modal'
import { Field, fieldInputClass } from '../components/ui/Field'
import { createCliente, deleteCliente, listClientes, type Cliente } from '../lib/clientesStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'
const GHOST_BTN = 'rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-elevated'

export function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [nome, setNome] = useState('')
  const [documento, setDocumento] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setClientes(await listClientes())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar clientes.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setNome('')
    setDocumento('')
    setEmail('')
    setTelefone('')
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!nome.trim()) {
      setError('Informe o nome do cliente.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createCliente({
        nome: nome.trim(),
        documento: documento.trim() || null,
        email: email.trim() || null,
        telefone: telefone.trim() || null,
      })
      setFormOpen(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar cliente.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c: Cliente) => {
    if (!window.confirm(`Excluir o cliente "${c.nome}"? Projetos vinculados ficam sem cliente.`)) return
    setBusyId(c.id)
    try {
      await deleteCliente(c.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir cliente.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={['Cadastros', 'Clientes']} />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-xl font-bold text-text-primary">Clientes</h1>
          <p className="text-sm text-text-secondary">Vincule projetos a um cliente para organizar o histórico de obras.</p>
        </div>
        <button onClick={openCreate} disabled={!supabase} className={PRIMARY_BTN}>
          <Plus size={16} />
          Novo cliente
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
      ) : clientes.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          Nenhum cliente ainda. Clique em "Novo cliente" para começar.
        </div>
      ) : (
        <div className="space-y-2">
          {clientes.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <Building2 size={20} className="text-brand" />
                <div>
                  <div className="font-sans text-sm font-semibold text-text-primary">{c.nome}</div>
                  <div className="flex items-center gap-3 text-xs text-text-secondary">
                    {c.documento && <span>{c.documento}</span>}
                    {c.email && (
                      <span className="flex items-center gap-1">
                        <Mail size={11} /> {c.email}
                      </span>
                    )}
                    {c.telefone && (
                      <span className="flex items-center gap-1">
                        <Phone size={11} /> {c.telefone}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleDelete(c)}
                disabled={busyId === c.id}
                aria-label="Excluir cliente"
                className="rounded p-1.5 hover:bg-accent-red/10 hover:text-accent-red"
              >
                {busyId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Novo cliente"
        icon={<UserPlus size={20} />}
        footer={
          <>
            <button onClick={() => setFormOpen(false)} className={GHOST_BTN}>
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} className={PRIMARY_BTN}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              Criar cliente
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nome" required>
            <input autoFocus className={fieldInputClass} value={nome} onChange={(e) => setNome(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CPF / CNPJ">
              <input className={fieldInputClass} value={documento} onChange={(e) => setDocumento(e.target.value)} />
            </Field>
            <Field label="Telefone">
              <input className={fieldInputClass} value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </Field>
          </div>
          <Field label="E-mail">
            <input type="email" className={fieldInputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
