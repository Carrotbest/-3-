import type { ReactNode } from "react"

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function PageHeader({ title, actions }: PageHeaderProps) {
  if (!actions) return null

  return (
    <header aria-label={title} className="mb-4 flex items-center justify-end gap-2">
      {actions}
    </header>
  )
}
