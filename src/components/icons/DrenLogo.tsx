interface DrenLogoProps {
  size?: number
  className?: string
  light?: boolean // true = traço branco, para uso sobre o fundo laranja do menu lateral
}

/**
 * Ícone assinatura do app: tubo em corte com a lâmina d'água escoando —
 * referência direta ao dimensionamento hidráulico trecho a trecho.
 * Usado no menu lateral e favicon.
 */
export function DrenLogo({ size = 28, className, light }: DrenLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <circle
        cx="16"
        cy="16"
        r="12"
        stroke={light ? '#FFFFFF' : 'var(--color-text-primary, #1F2430)'}
        strokeWidth="2"
      />
      <path
        d="M5 18 A11 11 0 0 0 27 18"
        stroke={light ? 'rgba(255,255,255,0.7)' : 'var(--color-accent-blue, #3498DB)'}
        strokeWidth="2"
        fill="none"
      />
    </svg>
  )
}
