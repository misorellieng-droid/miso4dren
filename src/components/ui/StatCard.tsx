import type { LucideIcon } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  tone?: 'brand' | 'green' | 'amber' | 'red'
}

const TONE_CLASSES: Record<NonNullable<StatCardProps['tone']>, string> = {
  brand: 'bg-brand/10 text-brand',
  green: 'bg-accent-green/10 text-accent-green',
  amber: 'bg-accent-amber/10 text-accent-amber',
  red: 'bg-accent-red/10 text-accent-red',
}

/** Card de resumo do dashboard: label em maiúsculas pequeno acima, número grande, ícone colorido à direita. */
export function StatCard({ label, value, icon: Icon, tone = 'brand' }: StatCardProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-5">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">{label}</div>
        <div className="mt-1 font-sans text-2xl font-bold text-text-primary">{value}</div>
      </div>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${TONE_CLASSES[tone]}`}>
        <Icon size={20} />
      </div>
    </div>
  )
}
