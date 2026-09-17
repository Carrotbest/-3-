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
