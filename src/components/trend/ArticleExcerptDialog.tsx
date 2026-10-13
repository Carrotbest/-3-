import { type ReactNode } from "react"
import { ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { CATEGORY_COLOR, type TrendArticle } from "@/data/trend"
import { cn } from "@/lib/utils"

export type ArticleExcerpt = Pick<TrendArticle, "t" | "u" | "d" | "c" | "m"> & { s?: string; x?: string; i?: string }

export function ArticleThumbnail({ article, className, showCategory = true }: { article: Pick<ArticleExcerpt, "i" | "c">; className?: string; showCategory?: boolean }) {
  return <div className={cn("relative overflow-hidden rounded-[var(--radius)] bg-[var(--muted)]", className)} style={{ background: `linear-gradient(135deg, color-mix(in oklab, ${CATEGORY_COLOR[article.c]} 25%, var(--card)), var(--muted))` }}>
    {article.i ? <img src={article.i} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110 motion-reduce:transition-none" onError={(event) => { event.currentTarget.style.display = "none" }} /> : null}
    {showCategory ? <span className="absolute bottom-2 left-2 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[9px] text-white">{article.c}</span> : null}
  </div>
}

function ExcerptBody({ article }: { article: ArticleExcerpt }) {
  return <>
    <DialogHeader><DialogTitle className="pr-8 text-lg leading-7">{article.t}</DialogTitle><DialogDescription>{article.m} · {article.d} · RSS 제공 내용 인용</DialogDescription></DialogHeader>
    <DialogBody className="space-y-4">
      <ArticleThumbnail article={article} className="h-56 w-full" />
      <blockquote className="border-l-4 border-[var(--border)] pl-4 text-sm leading-7 text-[var(--foreground)]">{article.x || article.s || "피드에 제공된 본문 내용이 없습니다."}</blockquote>
      <p className="text-xs leading-5 text-[var(--muted-foreground)]">저작권 보호를 위해 RSS 발행자가 제공한 본문 또는 요약 일부만 표시합니다. 전체 내용은 원문에서 확인하십시오.</p>
    </DialogBody>
    <DialogFooter><Button asChild><a href={article.u} target="_blank" rel="noreferrer noopener">원문 기사 열기<ExternalLink className="ml-1 size-4" /></a></Button></DialogFooter>
  </>
}

export function ExcerptDialog({ article, children }: { article: ArticleExcerpt; children: ReactNode }) {
  return <Dialog><DialogTrigger asChild>{children}</DialogTrigger><DialogContent><ExcerptBody article={article} /></DialogContent></Dialog>
}

export function ArticleExcerptModal({ article, onOpenChange }: { article: ArticleExcerpt | null; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={Boolean(article)} onOpenChange={onOpenChange}>
    <DialogContent>
      {article ? <ExcerptBody article={article} /> : null}
    </DialogContent>
  </Dialog>
}
