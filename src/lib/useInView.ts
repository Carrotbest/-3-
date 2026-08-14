import { useEffect, useRef, useState } from "react"

interface UseInViewOptions {
  threshold?: number
  rootMargin?: string
  once?: boolean
}

export function useInView<T extends HTMLElement = HTMLDivElement>(options?: UseInViewOptions) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setInView(true)
      return
    }

    if (!("IntersectionObserver" in window)) {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true)
        if (options?.once ?? true) observer.disconnect()
      } else if (!(options?.once ?? true)) {
        setInView(false)
      }
    }, {
      threshold: options?.threshold ?? 0.35,
      rootMargin: options?.rootMargin,
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [options?.once, options?.rootMargin, options?.threshold])

  return { ref, inView }
}
