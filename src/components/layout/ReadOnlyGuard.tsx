import { useEffect, useRef, useState, type RefObject } from "react"
import { Eye } from "lucide-react"

import { useScreenAccess } from "@/data/auth"

const EDIT_KEYS = new Set(["Delete", "Backspace"])
const isTextField = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"))

/**
 * 읽기 권한 화면(R217). 편집 동작(셀 더블클릭, 붙여넣기, 지우기, 끌어놓기)을 화면 단계에서 막고 안내한다.
 * 버튼으로 바꾼 값은 firestore-sync가 중앙에 올리지 않고 되돌린다. 이 가드는 그 앞에서 헷갈림을 줄이는 역할이다.
 * 검색창 같은 입력칸은 막지 않는다.
 */
export function ReadOnlyGuard({ pathname, rootRef }: { pathname: string; rootRef: RefObject<HTMLElement | null> }) {
  const access = useScreenAccess(pathname)
  // HOME 읽기는 HomeGate 가 블러로 처리한다.
  const readOnly = access === "read" && pathname !== "/"
  const [notice, setNotice] = useState("")
  const timer = useRef<number | undefined>(undefined)

  const show = (text: string) => {
    setNotice(text)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNotice(""), 2600)
  }

  useEffect(() => {
    const onBlocked = () => show("읽기 권한 화면입니다. 변경 내용은 저장되지 않고 되돌렸습니다.")
    window.addEventListener("fabric:readonly-blocked", onBlocked)
    return () => window.removeEventListener("fabric:readonly-blocked", onBlocked)
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!readOnly || !root) return
    const block = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      show("읽기 권한 화면이라 수정할 수 없습니다.")
    }
    const onDoubleClick = (event: MouseEvent) => { if (!isTextField(event.target) && (event.target as HTMLElement).closest("td, [role='gridcell']")) block(event) }
    const onClipboard = (event: ClipboardEvent) => { if (event.type !== "copy" && !isTextField(event.target)) block(event) }
    const onDrop = (event: DragEvent) => { if (!isTextField(event.target)) block(event) }
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTextField(event.target)) return
      const key = event.key.toLowerCase()
      const combo = (event.ctrlKey || event.metaKey) && ["v", "x", "z", "y", "d"].includes(key)
      if (EDIT_KEYS.has(event.key) || combo) block(event)
    }
    // 표 단축키가 window 에서 받으므로 capture 로 먼저 잡는다.
    window.addEventListener("keydown", onKeyDown, true)
    root.addEventListener("dblclick", onDoubleClick, true)
    root.addEventListener("paste", onClipboard, true)
    root.addEventListener("cut", onClipboard, true)
    root.addEventListener("drop", onDrop, true)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
      root.removeEventListener("dblclick", onDoubleClick, true)
      root.removeEventListener("paste", onClipboard, true)
      root.removeEventListener("cut", onClipboard, true)
      root.removeEventListener("drop", onDrop, true)
    }
  }, [readOnly, rootRef])

  return <>
    {readOnly ? <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 -translate-x-1/2 lg:left-[calc(50%+9rem)]">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50/95 px-3 py-1 text-xs font-semibold text-sky-700 shadow-md backdrop-blur"><Eye className="size-3.5" aria-hidden="true" />읽기 권한 화면</span>
    </div> : null}
    {notice ? <div role="status" aria-live="polite" className="fixed bottom-14 left-1/2 z-50 -translate-x-1/2 rounded-[10px] bg-[var(--foreground)] px-4 py-2 text-sm text-[var(--background)] shadow-lg lg:left-[calc(50%+9rem)]">{notice}</div> : null}
  </>
}

/**
 * 팀 공유 저장이 서버에 닿지 않을 때의 경고(R240). 소유자를 포함해 모두에게 보인다.
 * 로컬 값은 남아 있고 firestore-sync가 다시 보낸다. 마지막 재시도까지 실패하면 새로 고치기 전에 알려야 한다.
 * 새로 고치면 첫 스냅샷이 로컬을 서버 값으로 바꾸므로 못 올린 저장은 그때 사라진다.
 */
export function SyncStatusNotice() {
  const [syncWarning, setSyncWarning] = useState("")
  const [recovered, setRecovered] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    const onFailed = (event: Event) => {
      const final = Boolean((event as CustomEvent<{ final?: boolean }>).detail?.final)
      setRecovered(false)
      setSyncWarning(final
        ? "저장이 서버에 반영되지 않았습니다. 새로 고치거나 창을 닫지 말고 연결을 확인한 뒤 같은 항목을 한 번 더 저장해 주세요."
        : "저장을 서버에 반영하는 중 문제가 생겨 다시 보내고 있습니다. 창을 닫지 마세요.")
    }
    const onRecovered = () => {
      setSyncWarning("")
      setRecovered(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setRecovered(false), 2600)
    }
    window.addEventListener("fabric:sync-failed", onFailed)
    window.addEventListener("fabric:sync-recovered", onRecovered)
    return () => {
      window.removeEventListener("fabric:sync-failed", onFailed)
      window.removeEventListener("fabric:sync-recovered", onRecovered)
      window.clearTimeout(timer.current)
    }
  }, [])
  if (syncWarning) return <div role="alert" className="fixed left-1/2 top-3 z-50 max-w-[min(92vw,640px)] -translate-x-1/2 rounded-[10px] border border-[var(--destructive)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--destructive)] shadow-lg lg:left-[calc(50%+9rem)]">{syncWarning}</div>
  if (recovered) return <div role="status" aria-live="polite" className="fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-[10px] bg-[var(--foreground)] px-4 py-2 text-sm text-[var(--background)] shadow-lg lg:left-[calc(50%+9rem)]">저장이 서버에 반영되었습니다.</div>
  return null
}
