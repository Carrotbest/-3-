/**
 * 작업 이력 조회와 선택적 되돌리기.
 *
 * 일자 통째로 되돌리는 방식은 실무에서 못 쓴다. 한 사람의 잘못된 붙여넣기를 고치려다
 * 같은 날 다른 사람이 정상으로 한 작업까지 날아가기 때문이다. 그래서 **사람·기간·작업 단위**로 고른다.
 *
 * 되돌리기는 관리자만 쓴다. 팀원이 남의 작업을 되돌릴 수 있으면 사고가 커진다.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, RotateCcw, Undo2 } from "lucide-react"

import { SectionCard } from "@/components/dashboard/SectionCard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AUDIT_RETENTION_DAYS,
  auditKindLabel,
  auditScreenLabel,
  listActions,
  planRevert,
  type AuditAction,
  type AuditScreen,
} from "@/data/audit"
import { useAuthStore } from "@/data/auth"
import { fmtDateFull, fmtTime } from "@/data/format"
import { applyAuditRevert } from "@/store/useAppStore"

const ALL = "__all"
const SCREENS: AuditScreen[] = ["dd", "ts", "request", "warehouse"]

const isoDay = (offset = 0): string => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)

export function AuditLogPanel() {
  const isOwner = useAuthStore((state) => state.isOwner)
  const [from, setFrom] = useState(() => isoDay(-6))
  const [to, setTo] = useState(() => isoDay())
  const [who, setWho] = useState(ALL)
  const [screen, setScreen] = useState(ALL)
  const [actions, setActions] = useState<AuditAction[]>([])
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(() => new Set())
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const rows = await listActions({ from, to, max: 400 })
      setActions(rows)
      setPicked(new Set())
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { void load() }, [load])

  const people = useMemo(
    () => [...new Set(actions.map((action) => action.by))].sort((a, b) => a.localeCompare(b)),
    [actions],
  )
  const visible = useMemo(
    () => actions.filter((action) => (who === ALL || action.by === who) && (screen === ALL || action.screen === screen)),
    [actions, who, screen],
  )
  const chosen = useMemo(() => visible.filter((action) => picked.has(action.id)), [visible, picked])
  const cellCount = chosen.reduce((sum, action) => sum + action.ch.length, 0)

  const toggle = (id: string) => setPicked((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const revert = async () => {
    if (!chosen.length) return
    const plan = planRevert(chosen, () => null)
    void plan
    if (!window.confirm(`선택한 작업 ${chosen.length}건(셀 ${cellCount}개)을 되돌립니다.\n이후 다른 사람이 고친 칸은 건너뜁니다. 진행할까요?`)) return
    setBusy(true)
    setMessage(null)
    try {
      const result = await applyAuditRevert(chosen)
      setMessage(result.conflicted
        ? `${result.applied}개 칸을 되돌렸습니다. ${result.conflicted}개는 이후 다른 사람이 고쳐서 건너뛰었습니다.`
        : `${result.applied}개 칸을 되돌렸습니다.`)
      setPicked(new Set())
      await load()
    } catch {
      setMessage("되돌리기에 실패했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard
      title="작업 이력"
      subtitle={`최근 ${AUDIT_RETENTION_DAYS}일까지 남습니다. 되돌리기는 관리자만 쓸 수 있습니다.`}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--muted-foreground)]">시작</span>
          <Input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className="h-8 w-36 text-xs" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--muted-foreground)]">끝</span>
          <Input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="h-8 w-36 text-xs" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--muted-foreground)]">작업자</span>
          <Select value={who} onValueChange={setWho}>
            <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체</SelectItem>
              {people.map((email) => <SelectItem key={email} value={email}>{email}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--muted-foreground)]">화면</span>
          <Select value={screen} onValueChange={setScreen}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체</SelectItem>
              {SCREENS.map((key) => <SelectItem key={key} value={key}>{auditScreenLabel(key)}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}새로 읽기
        </Button>
        {isOwner ? (
          <Button type="button" size="sm" onClick={() => void revert()} disabled={!chosen.length || busy} className="ml-auto">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
            선택 {chosen.length}건 되돌리기
          </Button>
        ) : null}
      </div>

      {message ? <p role="status" className="mt-3 text-sm font-medium text-[var(--foreground)]">{message}</p> : null}

      <div className="mt-4 overflow-x-auto">
        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">
            {loading ? "읽는 중입니다." : "이 조건에 남은 작업이 없습니다."}
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-[var(--muted)] text-left text-[var(--muted-foreground)]">
              <tr>
                {isOwner ? <th className="w-8 px-2 py-2" /> : null}
                <th className="whitespace-nowrap px-3 py-2">시각</th>
                <th className="whitespace-nowrap px-3 py-2">작업자</th>
                <th className="whitespace-nowrap px-3 py-2">작업</th>
                <th className="whitespace-nowrap px-3 py-2">화면</th>
                <th className="whitespace-nowrap px-3 py-2 text-right">변경</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((action) => (
                <tr key={action.id} className="border-t border-[var(--border)]">
                  {isOwner ? (
                    <td className="px-2 py-2">
                      <Checkbox checked={picked.has(action.id)} onCheckedChange={() => toggle(action.id)} aria-label={`${action.name} 작업 선택`} />
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{fmtDateFull(action.at)} {fmtTime(action.at)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{action.name}</td>
                  <td className="whitespace-nowrap px-3 py-2"><Badge variant="outline">{auditKindLabel(action.kind)}</Badge></td>
                  <td className="whitespace-nowrap px-3 py-2 text-[var(--muted-foreground)]">{auditScreenLabel(action.screen)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{action.ch.length.toLocaleString("ko-KR")}칸</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </SectionCard>
  )
}
