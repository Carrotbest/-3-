import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// React 18 환경이라 Radix 가 ref 를 넘기는 primitive 래퍼는 forwardRef 로 감싼다.
// (기본 shadcn v4 코드는 React 19 를 가정해 함수형으로 두어 "Function components cannot be given refs" 경고가 난다.)

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

const SheetTrigger = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Trigger>
>((props, ref) => (
  <SheetPrimitive.Trigger ref={ref} data-slot="sheet-trigger" {...props} />
))
SheetTrigger.displayName = "SheetTrigger"

const SheetClose = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Close>
>((props, ref) => (
  <SheetPrimitive.Close ref={ref} data-slot="sheet-close" {...props} />
))
SheetClose.displayName = "SheetClose"

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    ref={ref}
    data-slot="sheet-overlay"
    className={cn(
      // 닫힘 애니메이션(animate-out)을 넣으면 tw-animate-css 에서 animationend 가 안 와
      // Radix Presence 가 오버레이를 언마운트하지 못하고 화면을 덮은 채 남아 클릭을 막는다.
      // 열림 페이드만 유지하고 닫힘은 즉시 언마운트되게 한다.
      "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
SheetOverlay.displayName = "SheetOverlay"

/** 패널 최소 크기. 이보다 좁으면 입력칸 라벨이 겹친다. */
const SHEET_MIN = 280

/**
 * 붙어 있는 쪽 반대편 가장자리를 끌어 패널 크기를 바꾼다.
 *
 * 패널은 화면 가장자리에 붙는 것이 제 성질이라 자유롭게 옮기지 않는다. 옮기는 창은 Dialog 다.
 * 여기서는 폭(또는 높이)만 사용자 손에 넘긴다. 손대기 전에는 화면마다 준 클래스가 그대로 산다.
 */
function useSheetSize(side: "top" | "right" | "bottom" | "left", nodeRef: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = React.useState<number | null>(null)
  const drag = React.useRef<{ pointerId: number; start: number; origin: number } | null>(null)
  const vertical = side === "top" || side === "bottom"

  const begin = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const node = nodeRef.current
    if (!node) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = node.getBoundingClientRect()
    const origin = size ?? (vertical ? rect.height : rect.width)
    drag.current = { pointerId: event.pointerId, start: vertical ? event.clientY : event.clientX, origin }
    setSize(origin)
  }

  const move = (event: React.PointerEvent<HTMLElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const delta = (vertical ? event.clientY : event.clientX) - current.start
    // 붙은 방향에 따라 끌는 방향과 커지는 방향이 반대다.
    const grow = side === "right" || side === "bottom" ? -delta : delta
    const limit = vertical ? window.innerHeight : window.innerWidth
    setSize(Math.min(limit - 24, Math.max(SHEET_MIN, current.origin + grow)))
  }

  const end = (event: React.PointerEvent<HTMLElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    drag.current = null
  }

  return { size, reset: () => setSize(null), begin, move, end, vertical }
}

const SHEET_HANDLE: Record<"top" | "right" | "bottom" | "left", string> = {
  right: "inset-y-0 left-0 w-1.5 cursor-ew-resize",
  left: "inset-y-0 right-0 w-1.5 cursor-ew-resize",
  top: "inset-x-0 bottom-0 h-1.5 cursor-ns-resize",
  bottom: "inset-x-0 top-0 h-1.5 cursor-ns-resize",
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content> & {
    side?: "top" | "right" | "bottom" | "left"
    showCloseButton?: boolean
  }
>(({ className, children, side = "right", showCloseButton = true, ...props }, forwardedRef) => {
  const nodeRef = React.useRef<HTMLDivElement | null>(null)
  const { size, reset, begin, move, end, vertical } = useSheetSize(side, nodeRef)
  const setRefs = React.useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node
    if (typeof forwardedRef === "function") forwardedRef(node)
    else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node
  }, [forwardedRef])

  return (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={setRefs}
      data-slot="sheet-content"
      style={size === null ? undefined : vertical ? { height: size, maxHeight: "none" } : { width: size, maxWidth: "none" }}
      onCloseAutoFocus={(event) => { reset(); props.onCloseAutoFocus?.(event) }}
      className={cn(
        // 닫힘 애니메이션 제거(위 SheetOverlay 주석 참고): Presence 가 즉시 언마운트되게 한다.
        "fixed z-50 flex flex-col gap-4 bg-background shadow-lg data-[state=open]:animate-in data-[state=open]:duration-300",
        side === "right" &&
          "inset-y-0 right-0 h-full w-3/4 border-l data-[state=open]:slide-in-from-right sm:max-w-sm",
        side === "left" &&
          "inset-y-0 left-0 h-full w-3/4 border-r data-[state=open]:slide-in-from-left sm:max-w-sm",
        side === "top" &&
          "inset-x-0 top-0 h-auto border-b data-[state=open]:slide-in-from-top",
        side === "bottom" &&
          "inset-x-0 bottom-0 h-auto border-t data-[state=open]:slide-in-from-bottom",
        className
      )}
      {...props}
    >
      {/* 안쪽 가장자리 손잡이. 보이지 않고 커서로만 알린다. */}
      <div
        aria-hidden="true"
        className={cn("absolute z-10 select-none", SHEET_HANDLE[side])}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      {children}
      {showCloseButton && (
        <SheetPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-secondary">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      )}
    </SheetPrimitive.Content>
  </SheetPortal>
  )
})
SheetContent.displayName = "SheetContent"

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    data-slot="sheet-title"
    className={cn("font-semibold text-foreground", className)}
    {...props}
  />
))
SheetTitle.displayName = "SheetTitle"

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    data-slot="sheet-description"
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
SheetDescription.displayName = "SheetDescription"

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
