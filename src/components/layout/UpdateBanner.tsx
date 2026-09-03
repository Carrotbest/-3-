import { Button } from "@/components/ui/button"
import { useUpdateAvailable } from "@/data/app-version"

export function UpdateBanner() {
  const { available, snooze } = useUpdateAvailable()

  if (!available) return null

  const handleReload = () => {
    snooze()
    window.location.reload()
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-[90] flex justify-center px-4" role="status">
      <div className="flex w-full max-w-2xl flex-col gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4 text-[var(--foreground)] shadow-xl sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">새 버전이 배포되었습니다</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">새로고침하면 최신 화면으로 바뀝니다</p>
        </div>
        <div className="flex shrink-0 justify-end gap-2">
          <Button type="button" variant="ghost" onClick={snooze}>나중에</Button>
          <Button type="button" onClick={handleReload}>새로고침</Button>
        </div>
      </div>
    </div>
  )
}
