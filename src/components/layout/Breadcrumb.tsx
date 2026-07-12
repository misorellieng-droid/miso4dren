import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

interface BreadcrumbProps {
  items: string[] // ex.: ['Cadastros', 'Obras']
}

/** Início > [Seção] > [Subseção] */
export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="mb-4 flex items-center gap-1.5 text-xs text-text-secondary">
      <Link to="/" className="hover:text-brand">
        Início
      </Link>
      {items.map((item, i) => (
        <span key={item} className="flex items-center gap-1.5">
          <ChevronRight size={12} />
          <span className={i === items.length - 1 ? 'font-medium text-text-primary' : ''}>{item}</span>
        </span>
      ))}
    </nav>
  )
}
