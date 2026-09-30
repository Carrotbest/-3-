import { useEffect, useMemo, useRef, useState } from "react"

import {
  ANALYSIS_WRITE_LINES, analysisHeadFields, analysisLeadText, analysisNoteLines,
  analysisPrintImages, analysisPrintStamp, analysisResultFields, analysisSheetMode,
} from "@/data/analysis-print"
import { requestImageUrl } from "@/data/request-image"
import type { AnalysisRequest } from "@/data/schema"

type Props = { records: readonly AnalysisRequest[]; onDone: () => void }
type PageProps = { item: AnalysisRequest; urls: Record<string, string>; stamp: string; onImageSettled: () => void }

/** RDDA 월간 리포트가 전역 @page 를 A4 가로로 쓴다. 이 출력만 세로로 바꾸려고 인쇄 직전에 붙인다. */
const PAGE_STYLE = "@page { size: A4 portrait; margin: 12mm; }"
/** 사진이 안 뜨면 이만큼만 기다리고 그냥 인쇄한다. 종이가 안 나오는 것이 더 나쁘다. */
const IMAGE_WAIT_MS = 4000

function Head({ item, kind, meta }: { item: AnalysisRequest; kind: string; meta: string }) {
  return <header className="an-head">
    <div>
      <p className="an-doc">FABRIC ANALYSIS</p>
      <h1>{kind}</h1>
    </div>
    <div className="an-head-no">
      <strong>{item.anNo}</strong>
      <p>{meta}{item.requestType === "Urgent" ? <em>URGENT</em> : null}</p>
    </div>
  </header>
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="an-block"><h2>{title}</h2>{children}</section>
}

function Fields({ items }: { items: [string, string][] }) {
  return <div className="an-fields">{items.map(([label, value]) => <div key={label} className="an-field"><span>{label}</span><b>{value}</b></div>)}</div>
}

function NoteLines({ items }: { items: [string, string][] }) {
  return <div className="an-notes">{items.map(([label, value]) => <div key={label} className="an-note"><span>{label}</span><b>{value}</b></div>)}</div>
}

function Foot({ item, kind, stamp }: { item: AnalysisRequest; kind: string; stamp: string }) {
  return <footer className="an-foot"><span>{item.anNo} · {kind}</span><span>출력 {stamp}</span></footer>
}

function RequestPage({ item, urls, stamp, onImageSettled }: PageProps) {
  const photo = item.imagePath ? urls[item.imagePath] : undefined
  const meta = `의뢰일 ${item.requestedAt || "-"} · ${item.requester || "의뢰자 미기재"}`
  return <section className="an-print-page">
    <Head item={item} kind="분석 의뢰서" meta={meta} />
    <Block title="의뢰 정보">
      <Fields items={analysisHeadFields(item)} />
      <NoteLines items={analysisNoteLines(item)} />
    </Block>
    <Block title="실물 SWATCH">
      <div className="an-blank" />
    </Block>
    <Block title="분석 결과 (R&D 기입)">
      <div className="an-write">
        {ANALYSIS_WRITE_LINES.map((label) => <div key={label} className="an-write-row"><span>{label}</span><i /></div>)}
      </div>
      <div className="an-hand">
        <div><span>3팀 수령일</span><i /></div>
        <div><span>담당 (In charge)</span><i /></div>
        <div><span>swatch 반환일</span><i /></div>
      </div>
    </Block>
    <Block title="참고 사진">
      <div className="an-shots">
        <div className="an-shot">{photo ? <img src={photo} alt="" onLoad={onImageSettled} onError={onImageSettled} /> : null}</div>
        <div className="an-shot" />
      </div>
    </Block>
    <Foot item={item} kind="분석 의뢰서" stamp={stamp} />
  </section>
}

function ReportPage({ item, urls, stamp, onImageSettled }: PageProps) {
  const photos = analysisPrintImages(item, "report").map((path) => urls[path]).filter(Boolean)
  const meta = `의뢰 ${item.requestedAt || "-"} · 완료 ${item.finishedAt || "-"} · 소요 ${analysisLeadText(item)}`
  return <section className="an-print-page">
    <Head item={item} kind="분석 리포트" meta={meta} />
    <Block title="의뢰 정보">
      <Fields items={analysisHeadFields(item)} />
      <NoteLines items={analysisNoteLines(item)} />
    </Block>
    <Block title="분석 결과">
      <Fields items={analysisResultFields(item)} />
      <div className="an-texts">
        <div><span>Yarn description</span><p>{item.yarnDescription || "-"}</p></div>
        <div><span>Comment (RND)</span><p>{item.commentRnd || "-"}</p></div>
      </div>
    </Block>
    <Block title="사진">
      {photos.length
        ? <div className="an-photos">{photos.map((url, index) => <div key={url}><img src={url} alt="" onLoad={onImageSettled} onError={onImageSettled} /><span>사진 {index + 1}</span></div>)}</div>
        : <p className="an-empty">등록된 사진이 없습니다.</p>}
    </Block>
    <Foot item={item} kind="분석 리포트" stamp={stamp} />
  </section>
}

export function AnalysisPrintDeck({ records, onDone }: Props) {
  const paths = useMemo(() => [...new Set(records.flatMap((item) => analysisPrintImages(item, analysisSheetMode(item))))], [records])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [resolved, setResolved] = useState(false)
  const [loaded, setLoaded] = useState(0)
  const printedRef = useRef(false)
  const stamp = useMemo(() => analysisPrintStamp(), [])
  const expected = paths.filter((path) => urls[path]).length

  useEffect(() => {
    if (!paths.length) { setResolved(true); return }
    let live = true
    void Promise.all(paths.map(async (path) => [path, await requestImageUrl(path)] as const)).then((pairs) => {
      if (!live) return
      const next: Record<string, string> = {}
      for (const [path, url] of pairs) if (url) next[path] = url
      setUrls(next)
      setResolved(true)
    })
    return () => { live = false }
  }, [paths])

  useEffect(() => {
    if (!resolved || printedRef.current) return
    const run = () => {
      if (printedRef.current) return
      printedRef.current = true
      const style = document.createElement("style")
      style.textContent = PAGE_STYLE
      document.head.append(style)
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        style.remove()
        window.removeEventListener("afterprint", finish)
        onDone()
      }
      window.addEventListener("afterprint", finish)
      window.print()
      // afterprint 를 안 부르는 브라우저가 있어 한 번 더 건다. finished 로 두 번 실행을 막는다.
      window.setTimeout(finish, 800)
    }
    const delay = loaded >= expected ? 120 : IMAGE_WAIT_MS
    const id = window.setTimeout(run, delay)
    return () => window.clearTimeout(id)
  }, [resolved, loaded, expected, onDone])

  const onImageSettled = () => setLoaded((value) => value + 1)
  return <div className="an-print-deck an-print-root" aria-hidden>
    {records.map((item) => analysisSheetMode(item) === "request"
      ? <RequestPage key={item.id} item={item} urls={urls} stamp={stamp} onImageSettled={onImageSettled} />
      : <ReportPage key={item.id} item={item} urls={urls} stamp={stamp} onImageSettled={onImageSettled} />)}
  </div>
}
