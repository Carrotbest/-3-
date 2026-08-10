import { useEffect, useRef } from "react"
import { Menu, Moon, Search, Sun } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface TopbarProps {
  dark: boolean
  onToggleSidebar: () => void
  onToggleTheme: () => void
}

export function Topbar({ dark, onToggleSidebar, onToggleTheme }: TopbarProps) {
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }

    window.addEventListener("keydown", handleShortcut)
    return () => window.removeEventListener("keydown", handleShortcut)
  }, [])

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_94%,transparent)] px-4 backdrop-blur-sm sm:px-6">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="사이드바 전환"
        aria-controls="app-sidebar"
        onClick={onToggleSidebar}
      >
        <Menu aria-hidden="true" />
      </Button>

      <div className="group relative max-w-md flex-1">
        <Search
          aria-hidden="true"
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)] transition-colors duration-[var(--t-fast)] group-focus-within:text-[var(--foreground)] motion-reduce:transition-none"
        />
        <Input
          ref={searchRef}
          type="search"
          aria-label="검색"
          aria-keyshortcuts="Meta+K Control+K"
          placeholder="검색"
          className="bg-[var(--muted)] pl-9 pr-14 transition-[background-color,box-shadow] duration-[var(--t-fast)] focus-visible:bg-[var(--background)] motion-reduce:transition-none"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 font-mono text-xs text-[var(--muted-foreground)]">
          ⌘K
        </kbd>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={dark ? "라이트 테마로 전환" : "다크 테마로 전환"}
        aria-pressed={dark}
        onClick={onToggleTheme}
      >
        {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      </Button>
    </header>
  )
}
