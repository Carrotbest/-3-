import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

// 중앙에 뜨는 리얼 모달. Sheet 와 달리 배경색을 CSS 변수(var(--card))로 명시해
// Tailwind v4 @theme 에 매핑되지 않은 bg-background 로 인한 "투명 팝업" 문제를 피한다.
// React 18 환경이라 primitive 래퍼는 forwardRef 로 감싼다.

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
    className={cn(
      "fixed inset-0 z-50 bg-black/55 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
))
DialogOverlay.displayName = "DialogOverlay"

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { showCloseButton?: boolean }
>(({ className, children, showCloseButton = true, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      data-slot="dialog-content"
      className={cn(
        "fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-200",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close className="absolute right-3 top-3 rounded-sm p-1 text-[var(--muted-foreground)] opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]">
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
))
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
