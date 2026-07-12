interface PlaceholderPageProps {
  title: string
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-3xl text-center text-text-secondary">
      <h1 className="mb-2 font-sans text-xl font-bold text-text-primary">{title}</h1>
      <p className="text-sm">Em construção.</p>
    </div>
  )
}
