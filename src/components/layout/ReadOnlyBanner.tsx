import { Lock } from "lucide-react"

/**
 * 보기 전용 화면임을 표 위에 상시로 알리는 띠(R295).
 *
 * 표를 가리거나 흐리게 하지 않는다. 읽기·복사·스크롤은 그대로 두고 안내로만 알린다.
 * `hint`에는 무엇을 해야 고칠 수 있는지를 적는다.
 */
export function ReadOnlyBanner({ reason, hint }: { reason: string; hint: string }) {
  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2 border-y border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] border-l-[3px] border-l-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_10%,var(--card))] px-3 py-1.5 text-xs"
    >
      <Lock className="size-3.5 shrink-0 text-[var(--warning)]" />
      <span className="font-semibold text-[var(--foreground)]">{reason}</span>
      <span className="truncate text-[var(--muted-foreground)]">{hint}</span>
    </div>
  )
}
