import type { ReactNode } from 'react'

// classe compartilhada por todo input/select/textarea de formulário em modal,
// pra manter o mesmo tratamento visual (borda, foco, radius) em todo o app
export const fieldInputClass =
  'w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-text-primary transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20'

interface FieldProps {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
}

/** Rótulo + campo + dica opcional, com o mesmo espaçamento/tipografia em qualquer formulário. */
export function Field({ label, required, hint, children }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-text-secondary">
        {label}
        {required && <span className="ml-0.5 text-accent-red">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-text-secondary">{hint}</span>}
    </label>
  )
}
