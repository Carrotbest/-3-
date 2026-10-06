import { Fragment, useEffect, useMemo, useRef, useState } from "react"

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

/** 짝 배열을 2개씩 끊어 한 줄에 라벨·값 두 쌍을 앉힌다. */
function chunkPairs(items: [string, string][]): [string, string][][] {
  const rows: [string, string][][] = []
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
  return rows
}

function Head({ item, kind, sub, meta }: { item: AnalysisRequest; kind: string; sub: string; meta: [string, string][] }) {
  return <header className="an-head">
    <div className="an-head-top">
      <div>
        <p className="an-eyebrow">FABRIC ANALYSIS</p>
        <h1>{kind}</h1>
        <p className="an-sub">{sub}</p>
      </div>
      <div className="an-head-no">
        <strong>{item.anNo}</strong>
        {item.requestType === "Urgent" ? <em>URGENT</em> : null}
      </div>
    </div>
    <div className="an-meta">{meta.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
  </header>
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="an-block"><h2>{title}</h2>{children}</section>
}

/** 라벨·값 표. 짧은 항목은 2쌍씩, 긴 글은 전폭 한 줄이다. */
function Grid({ pairs, wide }: { pairs: [string, string][]; wide?: [string, string][] }) {
  return <table className="an-grid">
    <colgroup><col style={{ width: "22%" }} /><col style={{ width: "28%" }} /><col style={{ width: "22%" }} /><col style={{ width: "28%" }} /></colgroup>
    <tbody>
      {chunkPairs(pairs).map((row, index) => <tr key={index}>
        {row.map(([label, value]) => <Fragment key={label}><th>{label}</th><td>{value}</td></Fragment>)}
        {row.length === 1 ? <><th /><td /></> : null}
      </tr>)}
      {(wide ?? []).map(([label, value]) => <tr key={label}><th>{label}</th><td colSpan={3}>{value}</td></tr>)}
    </tbody>
  </table>
}

function Foot({ item, kind, stamp }: { item: AnalysisRequest; kind: string; stamp: string }) {
  return <footer className="an-foot"><span>{item.anNo} · {kind}</span><span>출력 {stamp}</span></footer>
}

function RequestPage({ item, urls, stamp, onImageSettled }: PageProps) {
  const photo = item.imagePath ? urls[item.imagePath] : undefined
  const meta: [string, string][] = [
    ["Requested", item.requestedAt || "-"],
    ["Type", item.requestType || "-"],
    ["Requester", item.requester || "-"],
    ["Department", item.department || "-"],
  ]
  return <section className="an-print-page">
    <Head item={item} kind="분석 의뢰서" sub="FABRIC ANALYSIS REQUEST" meta={meta} />
    <Block title="의뢰 정보 (Request)">
      <Grid pairs={analysisHeadFields(item)} wide={analysisNoteLines(item)} />
    </Block>
    <Block title="실물 SWATCH (Original Fabric Swatch)">
      <div className="an-swatch"><span>원단을 이 칸에 붙여 주세요</span></div>
    </Block>
    <Block title="분석 결과 (R&D 기입)">
      <table className="an-grid an-grid-write">
        <colgroup><col style={{ width: "22%" }} /><col style={{ width: "78%" }} /></colgroup>
        <tbody>{ANALYSIS_WRITE_LINES.map((label) => <tr key={label}><th>{label}</th><td /></tr>)}</tbody>
      </table>
      <div className="an-sign">
        <div><span>3팀 수령일</span><i /></div>
        <div><span>담당 (In charge)</span><i /></div>
        <div><span>swatch 반환일</span><i /></div>
      </div>
    </Block>
    {photo ? <Block title="참고 사진 (Reference)">
      <div className="an-shots"><div className="an-shot"><img src={photo} alt="" onLoad={onImageSettled} onError={onImageSettled} /></div></div>
    </Block> : null}
    <Foot item={item} kind="분석 의뢰서" stamp={stamp} />
  </section>
}

function ReportPage({ item, urls, stamp, onImageSettled }: PageProps) {
  const photos = analysisPrintImages(item, "report").map((path) => urls[path]).filter(Boolean)
  const meta: [string, string][] = [
    ["Requested", item.requestedAt || "-"],
    ["Finished", item.finishedAt || "-"],
    ["Lead time", analysisLeadText(item)],
    ["In charge", item.inCharge || "-"],
  ]
  return <section className="an-print-page">
    <Head item={item} kind="분석 리포트" sub="FABRIC ANALYSIS REPORT" meta={meta} />
    <Block title="의뢰 정보 (Request)">
      <Grid pairs={analysisHeadFields(item)} wide={analysisNoteLines(item)} />
    </Block>
    <Block title="분석 결과 (Result)">
      <Grid pairs={analysisResultFields(item)} wide={[["Yarn description", item.yarnDescription || "-"], ["Comment (RND)", item.commentRnd || "-"]]} />
    </Block>
    <Block title="사진 (Photo)">
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
