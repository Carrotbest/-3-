import { Component, type ErrorInfo, type ReactNode } from "react"

import { Button } from "@/components/ui/button"

/**
 * 화면 렌더 중 난 예외를 여기서 잡는다.
 *
 * 이게 없으면 React 18 이 루트를 통째로 언마운트해 화면 전체가 백지가 된다.
 * 사용자는 "아무것도 안 뜬다"만 볼 수 있고 원인을 알 방법이 없다.
 * 2026-09-10 창고 탭 전환 화이트아웃이 그 경우였다.
 *
 * 라우트마다 새로 만들어(key=pathname) 다른 화면으로 옮기면 저절로 풀린다.
 */
interface State {
  error: Error | null
  stack: string
}

export class RouteErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, stack: "" }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 콘솔에도 남긴다. 개발자 도구를 열어 둔 경우 여기가 더 자세하다.
    console.error("[화면 오류]", error, info.componentStack)
    this.setState({ stack: info.componentStack ?? "" })
  }

  private report(): string {
    const { error, stack } = this.state
    return [
      `메시지: ${error?.message ?? "(없음)"}`,
      `주소: ${window.location.hash || "/"}`,
      `시각: ${new Date().toISOString()}`,
      "",
      "스택:",
      error?.stack ?? "(없음)",
      "",
      "컴포넌트:",
      stack || "(없음)",
    ].join("\n")
  }

  render(): ReactNode {
    const { error, stack } = this.state
    if (!error) return this.props.children

    return (
      <section className="mx-auto max-w-3xl py-10">
        <div className="rounded-[var(--radius)] border border-[var(--destructive)] bg-[var(--card)] p-5">
          <h1 className="text-lg font-semibold text-[var(--destructive)]">화면을 그리다 멈췄습니다</h1>
          <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
            데이터는 그대로입니다. 아래 내용을 복사해 개발 담당자에게 보내 주시면 원인을 찾을 수 있습니다.
          </p>

          <p className="mt-4 break-all rounded border border-[var(--border)] bg-[var(--muted)] px-3 py-2 font-mono text-sm text-[var(--foreground)]">
            {error.message || error.name}
          </p>

          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-[var(--muted-foreground)]">자세한 내용 보기</summary>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded border border-[var(--border)] bg-[var(--muted)] p-3 text-[11px] leading-relaxed">
              {error.stack || "(스택 없음)"}
              {stack ? `\n\n컴포넌트:${stack}` : ""}
            </pre>
          </details>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => { void navigator.clipboard.writeText(this.report()) }}>내용 복사</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => this.setState({ error: null, stack: "" })}>다시 그리기</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => window.location.reload()}>새로고침</Button>
          </div>
        </div>
      </section>
    )
  }
}
