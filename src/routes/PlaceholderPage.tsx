import { Clock3 } from "lucide-react"

import { PageHeader } from "@/components/layout/PageHeader"
import { Card, CardContent } from "@/components/ui/card"

interface PlaceholderPageProps {
  title: string
  subtitle: string
}

export function PlaceholderPage({ title, subtitle }: PlaceholderPageProps) {
  return (
    <section className="space-y-6">
      <PageHeader title={title} subtitle={subtitle} />
      <Card>
        <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
            <Clock3 aria-hidden="true" className="size-5" />
          </span>
          <div>
            <p className="font-medium text-[var(--foreground)]">준비 중</p>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">세부 화면은 다음 단계에서 구성합니다.</p>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
