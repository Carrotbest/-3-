import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

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
      {/*
        Source code 가 AN 번호보다 실무에서 자주 찾는 값이라 큰 자리를 준다(2026-10-21 박향근 지시).
        Source code 가 비어 있으면 AN 번호가 다시 큰 자리로 올라오고 작은 줄은 만들지 않는다.
      */}
      <div className="an-head-no">
        <strong>{item.sourceCode || item.anNo}</strong>
        {item.sourceCode ? <span className="an-head-code">{item.anNo}</span> : null}
        {item.requestType === "Urgent" ? <em>URGENT</em> : null}
      </div>
    </div>
    <div className="an-meta">{meta.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
  </header>
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="an-block"><h2>{title}</h2>{children}</section>
}

/**
 * 의뢰 항목을 단어별 알약으로 끊어 보인다(2026-10-21 박향근 지시).
 * 쉼표로 적힌 값을 그대로 끊는다. 쉼표가 없으면 알약 하나다. 빈 값은 평범한 글자로 둔다.
 */
function ItemChips({ value }: { value: string }) {
  const items = value.split(",").map((part) => part.trim()).filter(Boolean)
  if (!items.length || (items.length === 1 && items[0] === "-")) return <>{value}</>
  return <span className="an-chips">{items.map((item, index) => <em key={`${item}-${index}`}>{item}</em>)}</span>
}

/** 긴 글 줄 중 의뢰 항목만 알약으로 그린다. */
const WIDE_CHIP_LABELS = new Set(["Request item"])

/**
 * 라벨·값 표. 짧은 항목은 2쌍씩, 긴 글은 전폭 한 줄이다.
 *
 * 열을 다섯으로 잡은 이유는 Fabric content 한 줄 때문이다(2026-10-21).
 * 혼용율은 길고 중량은 세 자리라, 28%씩 반씩 나눠 주면 혼용율만 두 줄로 접힌다.
 * 그 줄만 값 칸을 8:2로 쓰려고 열을 쪼개 두고 colspan 으로 다시 붙인다.
 * `table-layout: fixed` 라 colgroup 폭이 곧 실제 폭이다. 합이 100%가 아니면 어긋난다.
 */
const WIDE_PAIR = ["Fabric content", "Weight (gsm)"]

function Grid({ pairs, wide }: { pairs: [string, string][]; wide?: [string, string][] }) {
  return <table className="an-grid">
    <colgroup>
      <col style={{ width: "22%" }} /><col style={{ width: "28%" }} />
      <col style={{ width: "22%" }} /><col style={{ width: "15%" }} /><col style={{ width: "13%" }} />
    </colgroup>
    <tbody>
      {chunkPairs(pairs).map((row, index) => {
        // 혼용율과 중량 줄만 8:2로 쓴다. 50% 대 13% 다.
        if (row.length === 2 && row[0][0] === WIDE_PAIR[0] && row[1][0] === WIDE_PAIR[1]) {
          return <tr key={index}>
            <th>{row[0][0]}</th><td colSpan={2}>{row[0][1]}</td>
            <th>{row[1][0]}</th><td>{row[1][1]}</td>
          </tr>
        }
        return <tr key={index}>
          {row.map(([label, value], cell) => <Fragment key={label}>
            <th>{label}</th><td colSpan={cell === 1 ? 2 : undefined}>{value}</td>
          </Fragment>)}
          {row.length === 1 ? <><th /><td colSpan={2} /></> : null}
        </tr>
      })}
      {(wide ?? []).map(([label, value]) => <tr key={label}>
        <th>{label}</th>
        <td colSpan={4}>{WIDE_CHIP_LABELS.has(label) ? <ItemChips value={value} /> : value}</td>
      </tr>)}
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
  // 1건이 반드시 한 장이다(R344). 참고 사진과 실물 SWATCH 가 한 칸 안에서 1:4 로 갈라져
  // 머리말·의뢰 정보·분석 결과·꼬리말을 뺀 남은 높이를 전부 먹는다.
  // 사진을 왼쪽에 둔 이유는 2026-10-21 박향근 지시이기도 하고, 원단이 칸보다 클 때
  // 오른쪽 바깥으로 넘치게 두는 편이 사진과 다른 칸을 안 덮기 때문이다.
  return <section className="an-print-page an-sheet-fixed">
    <Head item={item} kind="분석 의뢰서" sub="FABRIC ANALYSIS REQUEST" meta={meta} />
    <Block title="의뢰 정보 (Request)">
      <Grid pairs={analysisHeadFields(item)} wide={analysisNoteLines(item)} />
    </Block>
    <section className="an-block an-media">
      <h2>참고 사진 &amp; 실물 SWATCH</h2>
      <div className="an-media-box">
        {/* 라벨은 점선 안에 둔다. 사진이 없으면 그쪽 라벨을 빼고 SWATCH 가 혼자 쓴다. */}
        <div className="an-media-tags">
          {photo ? <span>참고 사진 (Reference)</span> : null}
          <span>실물 SWATCH (Original Fabric Swatch)</span>
        </div>
        {photo ? <div className="an-media-shot"><img src={photo} alt="" onLoad={onImageSettled} onError={onImageSettled} /></div> : null}
        <span className="an-media-hint">원단을 이 칸에 붙여 주세요</span>
      </div>
    </section>
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

  // 이 덱이 떠 있는 동안에만 인쇄 CSS 가 앱 본문을 치운다. RDDA·COST SHEET 출력은 건드리지 않는다.
  useEffect(() => {
    document.body.classList.add("an-printing")
    return () => document.body.classList.remove("an-printing")
  }, [])

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
  // 인쇄 뿌리를 body 바로 밑에 둔다(R343). 화면 레이아웃 안에 있으면 조상의 overflow·transform 때문에
  // 일반 흐름으로는 잘려서, 예전에는 position:fixed 로 피했다. 고정 요소는 쪽 나눔을 못 타서
  // 여러 장이 한 자리에 겹쳐 찍힌다. 인쇄 CSS 는 body.an-printing 으로 형제들을 치운다.
  return createPortal(
    <div className="an-print-deck an-print-root" aria-hidden>
      {records.map((item) => analysisSheetMode(item) === "request"
        ? <RequestPage key={item.id} item={item} urls={urls} stamp={stamp} onImageSettled={onImageSettled} />
        : <ReportPage key={item.id} item={item} urls={urls} stamp={stamp} onImageSettled={onImageSettled} />)}
    </div>,
    document.body,
  )
}
