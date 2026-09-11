import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// 중앙에 뜨는 리얼 모달. Sheet 와 달리 배경색을 CSS 변수(var(--card))로 명시해
// Tailwind v4 @theme 에 매핑되지 않은 bg-background 로 인한 "투명 팝업" 문제를 피한다.
// React 18 환경이라 primitive 래퍼는 forwardRef 로 감싼다.
//
// **창 조작은 여기 한 곳에만 둔다.** 머리말을 끌어 옮기고 가장자리를 끌어 크기를 바꾼다.
// 화면마다 따로 붙이면 팝업 스무 개가 각자 다르게 움직인다. 이 파일을 거치는 모든 Dialog 가
// 같은 방식으로 움직여야 한다.

/** 창 최소 크기. 이보다 작아지면 머리말과 바닥 버튼이 겹친다. */
const MIN_WIDTH = 320
const MIN_HEIGHT = 180
/** 화면 밖으로 끌고 나가도 이만큼은 남긴다. 완전히 내보내면 되돌릴 방법이 없다. */
const KEEP_VISIBLE = 96

interface WindowBox {
  x: number
  y: number
  w: number
  h: number
}

type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"

/** 가장자리 손잡이. 6px 폭으로 얇게 깔고 커서로만 알린다. */
const RESIZE_HANDLES: Array<{ dir: ResizeDir; className: string }> = [
  { dir: "n", className: "left-2 right-2 top-0 h-1.5 cursor-ns-resize" },
  { dir: "s", className: "left-2 right-2 bottom-0 h-1.5 cursor-ns-resize" },
  { dir: "w", className: "top-2 bottom-2 left-0 w-1.5 cursor-ew-resize" },
  { dir: "e", className: "top-2 bottom-2 right-0 w-1.5 cursor-ew-resize" },
  { dir: "nw", className: "left-0 top-0 size-2.5 cursor-nwse-resize" },
  { dir: "ne", className: "right-0 top-0 size-2.5 cursor-nesw-resize" },
  { dir: "sw", className: "left-0 bottom-0 size-3 cursor-nesw-resize" },
  { dir: "se", className: "right-0 bottom-0 size-3 cursor-nwse-resize" },
]

/** 끌기를 시작하면 안 되는 자리. 머리말 안의 버튼과 입력칸은 제 동작을 해야 한다. */
const NO_DRAG = "button, a, input, textarea, select, [role='button'], [role='menuitem'], [data-no-drag]"

/**
 * 창 위치와 크기를 사용자 손에 넘긴다.
 *
 * **처음에는 `null`이다.** 그래야 화면마다 다르게 준 `max-w-lg`, `w-[97vw]` 같은 기본 크기가
 * 그대로 살아 있는다. 사용자가 끌기 시작한 순간에 실제 위치와 크기를 재서 숫자로 고정한다.
 * 처음부터 숫자를 넣으면 모든 팝업이 같은 크기로 뜬다.
 */
function useWindowBox(elementRef: React.RefObject<HTMLDivElement | null>) {
  const [box, setBox] = React.useState<WindowBox | null>(null)
  const gesture = React.useRef<{
    pointerId: number
    dir: ResizeDir | "move"
    startX: number
    startY: number
    origin: WindowBox
  } | null>(null)

  // 창이 닫히면 다음에 열 때 기본 위치·크기로 돌아온다. 지난번 자리에 그대로 뜨면
  // 화면을 옮겨 놓고 잊은 사람이 팝업을 못 찾는다.
  const reset = React.useCallback(() => setBox(null), [])

  const measure = React.useCallback((): WindowBox | null => {
    const node = elementRef.current
    if (!node) return null
    const rect = node.getBoundingClientRect()
    return { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
  }, [elementRef])

  const begin = (event: React.PointerEvent<HTMLElement>, dir: ResizeDir | "move") => {
    if (event.button !== 0) return
    const origin = box ?? measure()
    if (!origin) return
    // 브라우저 기본 선택이 같이 시작되면 화면 전체가 반투명 사본으로 끌려다닌다.
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget
    target.setPointerCapture(event.pointerId)
    gesture.current = { pointerId: event.pointerId, dir, startX: event.clientX, startY: event.clientY, origin }
    setBox(origin)
  }

  const move = (event: React.PointerEvent<HTMLElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    const { x, y, w, h } = current.origin

    if (current.dir === "move") {
      setBox({
        x: Math.min(window.innerWidth - KEEP_VISIBLE, Math.max(KEEP_VISIBLE - w, x + dx)),
        y: Math.min(window.innerHeight - KEEP_VISIBLE, Math.max(0, y + dy)),
        w,
        h,
      })
      return
    }

    const next = { x, y, w, h }
    if (current.dir.includes("e")) next.w = Math.max(MIN_WIDTH, w + dx)
    if (current.dir.includes("s")) next.h = Math.max(MIN_HEIGHT, h + dy)
    if (current.dir.includes("w")) {
      next.w = Math.max(MIN_WIDTH, w - dx)
      next.x = x + (w - next.w)
    }
    if (current.dir.includes("n")) {
      next.h = Math.max(MIN_HEIGHT, h - dy)
      next.y = y + (h - next.h)
    }
    setBox(next)
  }

  const end = (event: React.PointerEvent<HTMLElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    gesture.current = null
  }

  return { box, reset, begin, move, end }
}

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

const DialogTrigger = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>
>((props, ref) => <DialogPrimitive.Trigger ref={ref} data-slot="dialog-trigger" {...props} />)
DialogTrigger.displayName = "DialogTrigger"

const DialogClose = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>((props, ref) => <DialogPrimitive.Close ref={ref} data-slot="dialog-close" {...props} />)
DialogClose.displayName = "DialogClose"

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    data-slot="dialog-overlay"
    className={cn("win11-overlay fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px]", className)}
    {...props}
  />
))
DialogOverlay.displayName = "DialogOverlay"

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }
>(({ className, children, showCloseButton = true, onPointerDown, ...props }, forwardedRef) => {
  const nodeRef = React.useRef<HTMLDivElement | null>(null)
  const { box, reset, begin, move, end } = useWindowBox(nodeRef)

  const setRefs = React.useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node
    if (typeof forwardedRef === "function") forwardedRef(node)
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node
  }, [forwardedRef])

  /**
   * 머리말을 잡으면 창이 끌린다.
   *
   * 별도 손잡이를 얹지 않고 `data-slot="dialog-header"` 안을 눌렀는지로 판정한다. 화면마다
   * 손잡이를 따로 붙이면 빠뜨리는 팝업이 생긴다. 머리말 안의 버튼과 입력칸은 제 동작을 해야 하니
   * 그 위에서는 끌기를 시작하지 않는다.
   */
  const startMove = (event: React.PointerEvent<HTMLDivElement>) => {
    onPointerDown?.(event)
    if (event.defaultPrevented) return
    const target = event.target as HTMLElement | null
    if (!target?.closest("[data-slot='dialog-header']") || target.closest(NO_DRAG)) return
    begin(event, "move")
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={setRefs}
        data-slot="dialog-content"
        data-windowed={box ? "" : undefined}
        className={cn(
          "win11-window fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-2xl [&_[data-slot=dialog-header]]:cursor-move",
          className,
        )}
        // 숫자가 들어오면 인라인 값이 클래스의 left-1/2·max-w-2xl 을 덮는다.
        // 그래서 기본 크기는 화면마다 준 클래스를 그대로 쓰고, 손을 댄 뒤에만 숫자로 산다.
        // 정렬을 푸는 것은 `translate: none` 이다. Tailwind v4 의 `-translate-x-1/2` 가
        // transform 이 아니라 translate 속성으로 나가기 때문이다. transform 을 지워도 안 풀린다.
        style={box
          ? { left: box.x, top: box.y, width: box.w, height: box.h, maxWidth: "none", maxHeight: "none", translate: "none" }
          : undefined}
        onPointerDown={startMove}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onCloseAutoFocus={(event) => { reset(); props.onCloseAutoFocus?.(event) }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close className="absolute right-3 top-3 rounded-sm p-1 text-[var(--muted-foreground)] opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
        {/*
          가장자리 손잡이.
          **한 겹으로 덮고 손잡이에만 클릭을 허용한다.** 팝업 안쪽 내용이 자기 z-index 를 갖는
          경우가 있어(로그인 창이 그렇다) 손잡이를 형제로 두면 내용에 가려 안 잡힌다.
          가운데는 `pointer-events-none` 이라 본문 조작을 막지 않는다.
        */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[60]">
          {RESIZE_HANDLES.map((handle) => (
            <div
              key={handle.dir}
              className={cn("pointer-events-auto absolute select-none", handle.className)}
              onPointerDown={(event) => begin(event, handle.dir)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            />
          ))}
          <span className="win11-resize-grip absolute bottom-[3px] right-[3px] size-2.5" />
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = "DialogContent"

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-1 border-b border-[var(--border)] px-5 py-4", className)} {...props} />
}

function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-body" className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-4", className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] bg-[var(--card)] px-5 py-3.5", className)} {...props} />
}

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} data-slot="dialog-title" className={cn("text-base font-semibold text-[var(--foreground)]", className)} {...props} />
))
DialogTitle.displayName = "DialogTitle"

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} data-slot="dialog-description" className={cn("text-sm text-[var(--muted-foreground)]", className)} {...props} />
))
DialogDescription.displayName = "DialogDescription"

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
