# R258 FABRIC ANALYSIS A4 출력 (의뢰서 · 분석 리포트)

상태: 미착수. 추론 강도 **medium**(파일 2개 신규, 3개 수정. 데이터 계약은 안 바뀐다).

AX에서 분석 의뢰를 작성해 출력하고, 그 종이에 실물 swatch를 붙여 3팀에 전달하던 과정을 웹으로 옮긴다. 두 장을 만든다.

| 출력물 | 누가 언제 | 용도 |
|---|---|---|
| FABRIC ANALYSIS REQUEST | 의뢰자가 의뢰 등록 뒤 | 출력해서 실물 swatch를 붙여 3팀에 전달 |
| FABRIC ANALYSIS REPORT | 3팀이 완료 처리 뒤 | 분석 결과를 출력해 실물 swatch와 함께 반환 |

## 확정된 결정 (2026-09-30 박향근)

- 의뢰서 swatch 부착란은 **큰 1칸, 100mm × 100mm**. 점선 테두리에 라벨만 얹는다.
- 리포트는 **의뢰 요약 + 결과 + 사진**을 한 장에 넣는다. 수령 확인 서명란은 넣지 않는다.
- 분석 사진은 **지금처럼 라벨 없이 최대 4장**이다. `resultImages` 구조를 바꾸지 마라. 스키마 변경 없음.

## 하지 말 것

- **PDF 라이브러리를 새로 넣지 마라.** 브라우저 인쇄(`window.print()`)로 끝낸다. 이 저장소에 이미 RDDA 월간 리포트가 같은 방식으로 돌아간다.
- **`src/index.css` 819행의 `@media print` 블록(`rdda-print-*`)을 고치지 마라.** 그 블록의 `@page` 는 A4 **가로**다. 여기서 전역 `@page` 를 세로로 바꾸면 RDDA 리포트 인쇄가 깨진다. 이번 출력물의 `@page` 는 **인쇄 직전에 `<style>` 을 head에 붙여** 정한다(아래 D). CSS 파일에 세로 `@page` 를 새로 쓰지 마라.
- `AnalysisRequest` 스키마, `analysisRequests` 저장 키, 메일 초안 경로(`analysis-mail.ts`), 엑셀 일괄 의뢰(`analysis-import.ts`)는 건드리지 마라.
- 사진 업로드·삭제 로직과 `requests/analysis-{id}` 경로 규칙을 바꾸지 마라.
- 출력 버튼에 편집 권한을 걸지 마라. 읽기 권한자도 출력한다.

## A. 신규 파일 `src/data/analysis-print.ts`

통째로 새로 만든다.

```ts
import { analysisLeadDays } from "./fabric-analysis"
import type { AnalysisRequest } from "./schema"

export type AnalysisPrintMode = "request" | "report"

const text = (value: string | number | undefined | null): string => {
  const out = String(value ?? "").trim()
  return out || "-"
}

/** 의뢰 정보 칸. 라벨은 AX 리캡 열 이름을 그대로 쓴다. 의뢰서와 리포트가 같이 쓴다. */
export function analysisRequestFields(item: AnalysisRequest): [string, string][] {
  return [
    ["Requester", text(item.requester)],
    ["Department", text(item.department)],
    ["Customer", text(item.customer)],
    ["Brand", text(item.brand)],
    ["Season / Year", text(item.season)],
    ["Gender / Age", text(item.gender)],
    ["Objective", text(item.objective)],
    ["Original fabric source", text(item.source)],
    ["Source code", text(item.sourceCode)],
    ["Construction", text(item.construction)],
    ["Fabric content", text(item.contents)],
    ["Weight (gsm)", item.weight === "" ? "-" : String(item.weight)],
  ]
}

/** 분석 결과 칸. 의뢰 때 적힌 값과 RND 결과를 나란히 둬서 종이에서 바로 대조한다. */
export function analysisResultFields(item: AnalysisRequest): [string, string][] {
  return [
    ["In charge", text(item.inCharge)],
    ["Construction (RND)", text(item.constructionRnd)],
    ["Weight (RND, gsm)", item.weightRnd === "" ? "-" : String(item.weightRnd)],
    ["Objective", text(item.objective)],
    ["Construction (의뢰)", text(item.construction)],
    ["Weight (의뢰, gsm)", item.weight === "" ? "-" : String(item.weight)],
  ]
}

export function analysisLeadText(item: AnalysisRequest): string {
  const days = analysisLeadDays(item)
  return days == null ? "-" : `${days}일`
}

/** 꼬리말에 찍는 출력 시각. 언제 뽑은 종이인지 알아야 한다. */
export function analysisPrintStamp(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/**
 * 인쇄에 올릴 사진 경로. 의뢰서는 시료 사진 1장, 리포트는 시료 사진 + 분석 사진이다.
 * 썸네일(`imageThumbPath`)은 400px이라 인쇄에 쓰지 않는다.
 */
export function analysisPrintImages(item: AnalysisRequest, mode: AnalysisPrintMode): string[] {
  if (mode === "request") return item.imagePath ? [item.imagePath] : []
  return [item.imagePath, ...(item.resultImages ?? []).map((image) => image.imagePath)]
    .filter((path): path is string => Boolean(path))
}
```

## B. 신규 파일 `src/components/analysis/AnalysisPrintDeck.tsx`

통째로 새로 만든다. 마운트되면 사진 URL을 받아 이미지가 다 뜬 뒤 인쇄 창을 열고, 인쇄가 끝나면 `onDone`으로 자기를 지운다.

```tsx
import { useEffect, useMemo, useRef, useState } from "react"

import {
  analysisLeadText, analysisPrintImages, analysisPrintStamp,
  analysisRequestFields, analysisResultFields, type AnalysisPrintMode,
} from "@/data/analysis-print"
import { requestImageUrl } from "@/data/request-image"
import type { AnalysisRequest } from "@/data/schema"

type Props = { mode: AnalysisPrintMode; records: readonly AnalysisRequest[]; onDone: () => void }
type PageProps = { item: AnalysisRequest; urls: Record<string, string>; stamp: string; onImageSettled: () => void }

/** RDDA 월간 리포트가 전역 @page 를 A4 가로로 쓴다. 이 출력만 세로로 바꾸려고 인쇄 직전에 붙인다. */
const PAGE_STYLE = "@page { size: A4 portrait; margin: 12mm; }"
/** 사진이 안 뜨면 이만큼만 기다리고 그냥 인쇄한다. 종이가 안 나오는 것이 더 나쁘다. */
const IMAGE_WAIT_MS = 4000

function Field({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return <div className={wide ? "an-field an-field-wide" : "an-field"}><span>{label}</span><strong>{value}</strong></div>
}

function RequestPage({ item, urls, stamp, onImageSettled }: PageProps) {
  const photo = item.imagePath ? urls[item.imagePath] : undefined
  return <section className="an-print-page">
    <header className="an-print-head">
      <div><h1>FABRIC ANALYSIS REQUEST</h1><p>{item.customer || "-"} · {item.department || "-"}</p></div>
      <div className="an-print-no"><strong>{item.anNo}</strong><p>의뢰일 {item.requestedAt || "-"}{item.requestType === "Urgent" ? <em>URGENT</em> : null}</p></div>
    </header>
    <div className="an-print-grid">
      {analysisRequestFields(item).map(([label, value]) => <Field key={label} label={label} value={value} />)}
      <Field label="Request item" value={item.description || "-"} wide />
      <Field label="Comment (Requester)" value={item.requesterComment || "-"} wide />
    </div>
    <div className="an-print-photo-row">
      <div className="an-print-photo">{photo ? <img src={photo} alt="" onLoad={onImageSettled} onError={onImageSettled} /> : <span>시료 사진 없음</span>}</div>
      <ol className="an-print-notice">
        <li>아래 칸에 실물 swatch를 붙여 통합원단부 3팀(원단 R&amp;D팀)에 전달합니다.</li>
        <li>분석이 끝나면 실물 swatch와 분석 리포트를 함께 반환합니다.</li>
        <li>진행 현황은 FABRIC ANALYSIS 화면에서 AN No. {item.anNo} 기준으로 확인합니다.</li>
      </ol>
    </div>
    <div className="an-print-swatch"><span>실물 SWATCH 부착란</span></div>
    <div className="an-print-receipt">
      <div><span>3팀 수령일</span><i /></div>
      <div><span>담당 (In charge)</span><i /></div>
      <div><span>swatch 반환일</span><i /></div>
    </div>
    <footer className="an-print-foot"><span>{item.anNo} · FABRIC ANALYSIS REQUEST</span><span>출력 {stamp}</span></footer>
  </section>
}

function ReportPage({ item, urls, stamp, onImageSettled }: PageProps) {
  const photos = analysisPrintImages(item, "report").map((path) => urls[path]).filter(Boolean)
  return <section className="an-print-page">
    <header className="an-print-head">
      <div><h1>FABRIC ANALYSIS REPORT</h1><p>{item.customer || "-"} · 통합원단부 3팀(원단 R&amp;D팀)</p></div>
      <div className="an-print-no"><strong>{item.anNo}</strong><p>의뢰 {item.requestedAt || "-"} · 완료 {item.finishedAt || "-"} · 소요 {analysisLeadText(item)}</p></div>
    </header>
    <h2 className="an-print-band">의뢰 내용</h2>
    <div className="an-print-grid an-print-grid-tight">
      {analysisRequestFields(item).map(([label, value]) => <Field key={label} label={label} value={value} />)}
      <Field label="Request item" value={item.description || "-"} wide />
      <Field label="Comment (Requester)" value={item.requesterComment || "-"} wide />
    </div>
    <h2 className="an-print-band">분석 결과</h2>
    <div className="an-print-grid an-print-grid-tight">
      {analysisResultFields(item).map(([label, value]) => <Field key={label} label={label} value={value} />)}
      <Field label="Fabric content (의뢰)" value={item.contents || "-"} wide />
    </div>
    <div className="an-print-result-text">
      <div><span>Yarn description</span><p>{item.yarnDescription || "-"}</p></div>
      <div><span>Comment (RND)</span><p>{item.commentRnd || "-"}</p></div>
    </div>
    <h2 className="an-print-band">사진</h2>
    <div className="an-print-photos">
      {photos.length
        ? photos.map((url, index) => <div key={url}><img src={url} alt="" onLoad={onImageSettled} onError={onImageSettled} /><span>사진 {index + 1}</span></div>)
        : <p className="an-print-empty">등록된 사진이 없습니다.</p>}
    </div>
    <footer className="an-print-foot"><span>{item.anNo} · FABRIC ANALYSIS REPORT · In charge {item.inCharge || "-"}</span><span>출력 {stamp}</span></footer>
  </section>
}

export function AnalysisPrintDeck({ mode, records, onDone }: Props) {
  const paths = useMemo(() => [...new Set(records.flatMap((item) => analysisPrintImages(item, mode)))], [records, mode])
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
    // 사진이 다 뜨면 바로, 아니면 기다렸다가 인쇄한다.
    const delay = loaded >= expected ? 120 : IMAGE_WAIT_MS
    const id = window.setTimeout(run, delay)
    return () => window.clearTimeout(id)
  }, [resolved, loaded, expected, onDone])

  const onImageSettled = () => setLoaded((value) => value + 1)
  return <div className="an-print-deck an-print-root" aria-hidden>
    {records.map((item) => mode === "request"
      ? <RequestPage key={item.id} item={item} urls={urls} stamp={stamp} onImageSettled={onImageSettled} />
      : <ReportPage key={item.id} item={item} urls={urls} stamp={stamp} onImageSettled={onImageSettled} />)}
  </div>
}
```

## C. `src/index.css` — 출력 스타일 추가

819~838행의 `@media print { ... }` 블록(RDDA)은 **그대로 두고**, 그 닫는 `}` 바로 다음 줄에 아래를 통째로 넣는다. 파일 다른 곳은 손대지 않는다.

```css
/* ------------------------------------------------------------------
 * FABRIC ANALYSIS A4 출력(R258). 의뢰서와 분석 리포트 두 종류.
 * 화면에서는 숨고 인쇄에서만 보인다. 세로 @page 는 CSS 가 아니라
 * AnalysisPrintDeck 이 인쇄 직전에 붙이는 <style> 이 정한다.
 * 위 RDDA 블록이 body * 를 숨기므로 여기서는 우리 뿌리만 다시 보이게 한다.
 * 인쇄 길이 기준: A4 세로 여백 12mm → 가로 186mm, 세로 273mm.
 * ------------------------------------------------------------------ */
.an-print-deck { display: none; }

@media print {
  .an-print-root, .an-print-root * { visibility: visible !important; }
  .an-print-root { position: fixed !important; inset: 0 !important; width: auto !important; height: auto !important; max-width: none !important; max-height: none !important; translate: none !important; transform: none !important; border: 0 !important; box-shadow: none !important; overflow: visible !important; }
  .an-print-deck { display: block !important; background: white; color: #111827; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .an-print-page { box-sizing: border-box; width: 186mm; font-size: 9.5pt; line-height: 1.45; page-break-after: always; break-after: page; }
  .an-print-page:last-child { page-break-after: auto; break-after: auto; }
  .an-print-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8mm; padding-bottom: 3mm; border-bottom: 0.6mm solid #111827; }
  .an-print-head h1 { margin: 0; font-size: 15pt; letter-spacing: 0.02em; }
  .an-print-head p { margin: 1.5mm 0 0; font-size: 9pt; color: #374151; }
  .an-print-no { text-align: right; white-space: nowrap; }
  .an-print-no strong { font-size: 14pt; letter-spacing: 0.04em; }
  .an-print-no p { margin: 1.5mm 0 0; font-size: 8.5pt; color: #374151; }
  .an-print-no em { margin-left: 2mm; padding: 0 1.5mm; border: 0.3mm solid #b91c1c; color: #b91c1c; font-style: normal; font-weight: 600; }
  .an-print-band { margin: 5mm 0 2mm; padding-bottom: 1mm; border-bottom: 0.3mm solid #9ca3af; font-size: 10pt; font-weight: 600; }
  .an-print-grid { display: grid; grid-template-columns: repeat(3, 1fr); margin-top: 4mm; border: 0.3mm solid #9ca3af; }
  .an-field { box-sizing: border-box; padding: 2mm 2.5mm; border-right: 0.3mm solid #d1d5db; border-bottom: 0.3mm solid #d1d5db; break-inside: avoid; }
  .an-field:nth-child(3n) { border-right: 0; }
  .an-field-wide { grid-column: 1 / -1; border-right: 0; }
  .an-field span { display: block; font-size: 7.5pt; letter-spacing: 0.04em; text-transform: uppercase; color: #6b7280; }
  .an-field strong { display: block; margin-top: 0.8mm; font-size: 9.5pt; font-weight: 500; white-space: pre-wrap; }
  .an-print-grid-tight { margin-top: 0; }
  .an-print-grid-tight .an-field { padding: 1.5mm 2.5mm; }
  .an-print-photo-row { display: grid; grid-template-columns: 62mm 1fr; gap: 6mm; margin-top: 5mm; }
  .an-print-photo { box-sizing: border-box; display: flex; align-items: center; justify-content: center; height: 46mm; overflow: hidden; border: 0.3mm solid #9ca3af; }
  .an-print-photo img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .an-print-photo span { font-size: 8pt; color: #9ca3af; }
  .an-print-notice { margin: 0; padding-left: 5mm; font-size: 8.5pt; color: #374151; }
  .an-print-notice li { margin-bottom: 1.5mm; }
  .an-print-swatch { position: relative; box-sizing: border-box; width: 100mm; height: 100mm; margin: 6mm auto 0; border: 0.5mm dashed #6b7280; break-inside: avoid; }
  .an-print-swatch span { position: absolute; left: 3mm; top: 2.5mm; font-size: 8.5pt; letter-spacing: 0.08em; color: #6b7280; }
  .an-print-receipt { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-top: 6mm; }
  .an-print-receipt div { padding-top: 1.5mm; border-top: 0.3mm solid #9ca3af; }
  .an-print-receipt span { font-size: 8pt; color: #6b7280; }
  .an-print-receipt i { display: block; height: 8mm; }
  .an-print-result-text { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; margin-top: 3mm; }
  .an-print-result-text div { box-sizing: border-box; min-height: 26mm; padding: 2mm 2.5mm; border: 0.3mm solid #9ca3af; break-inside: avoid; }
  .an-print-result-text span { display: block; font-size: 7.5pt; letter-spacing: 0.04em; text-transform: uppercase; color: #6b7280; }
  .an-print-result-text p { margin: 1mm 0 0; white-space: pre-wrap; }
  .an-print-photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-top: 2mm; }
  .an-print-photos div { break-inside: avoid; }
  .an-print-photos img { display: block; width: 100%; height: 38mm; object-fit: contain; border: 0.3mm solid #d1d5db; }
  .an-print-photos span { display: block; margin-top: 1mm; font-size: 8pt; color: #6b7280; }
  .an-print-empty { margin: 0; font-size: 8.5pt; color: #6b7280; }
  .an-print-foot { display: flex; justify-content: space-between; margin-top: 6mm; padding-top: 2mm; border-top: 0.3mm solid #d1d5db; font-size: 8pt; color: #6b7280; }
}
```

## D. `src/routes/FabricAnalysis.tsx` — 출력 버튼과 인쇄 덱

### D-1. import 두 줄

2행

```tsx
import { FileDown, ImageOff, Mail, Plus, Trash2 } from "lucide-react"
```

으로 바꾼다.

```tsx
import { FileDown, ImageOff, Mail, Plus, Printer, Trash2 } from "lucide-react"
```

4행 `import { AnalysisDetailDialog } ...` 다음 줄에 더한다.

```tsx
import { AnalysisPrintDeck } from "@/components/analysis/AnalysisPrintDeck"
```

18행 `import { analysisLeadDays, ... } from "@/data/fabric-analysis"` 앞에 더한다.

```tsx
import type { AnalysisPrintMode } from "@/data/analysis-print"
```

### D-2. 상태와 헬퍼

60행

```tsx
  const [notice, setNotice] = useState("")
```

다음 줄에 더한다.

```tsx
  const [printJob, setPrintJob] = useState<{ mode: AnalysisPrintMode; records: AnalysisRequest[] } | null>(null)
```

`const finishedSelected = ...`(74행) 다음 줄에 더한다.

```tsx
  // 취소 건은 종이로 내보내지 않는다. 작성 중 건은 의뢰일이 비어 나가지만 미리 뽑는 경우가 있어 허용한다.
  const printableSelected = selectedRows.filter((item) => item.state !== "취소")
```

`const saveOne = (record: AnalysisRequest) => {`(88행) 바로 앞에 함수를 더한다.

```tsx
  // 팝업이 열려 있으면 먼저 닫는다. 팝업 오버레이가 인쇄 화면에 겹치는 것을 막는다.
  const startPrint = (mode: AnalysisPrintMode, targets: AnalysisRequest[]) => {
    if (!targets.length) return
    setDetail(null)
    setPrintJob({ mode, records: targets })
  }
```

### D-3. 선택 액션 바에 버튼 두 개

선택 액션 바 줄에서 아래 조각을 찾는다.

```tsx
<Button size="sm" variant="ghost" disabled={!draftSelected.length && !finishedSelected.length} onClick={downloadSelectedEml}><FileDown />.eml로 받기</Button>
```

그 **앞에** 두 버튼을 끼운다(같은 줄, 다른 것은 바꾸지 않는다).

```tsx
<Button size="sm" variant="outline" disabled={!printableSelected.length} onClick={() => startPrint("request", printableSelected)}><Printer />의뢰서 출력</Button><Button size="sm" variant="outline" disabled={!finishedSelected.length} onClick={() => startPrint("report", finishedSelected)}><Printer />리포트 출력</Button>
```

### D-4. 팝업에 출력 콜백 넘기기

`<AnalysisDetailDialog` 태그의 `onEditRequest={...}` 앞에 더한다.

```tsx
onPrint={(mode, record) => startPrint(mode, [record])}
```

### D-5. 인쇄 덱 렌더

`</section>` 닫기 바로 앞, `<AnalysisDetailDialog ... />` 다음 줄에 더한다.

```tsx
    {printJob ? <AnalysisPrintDeck mode={printJob.mode} records={printJob.records} onDone={() => setPrintJob(null)} /> : null}
```

## E. `src/components/analysis/AnalysisDetailDialog.tsx` — 출력 버튼

### E-1. import

2행을 바꾼다.

```tsx
import { Check, ImagePlus, Loader2, Mail, Printer, Trash2, Upload } from "lucide-react"
```

11행 `import { analysisLeadDays, analysisTodayValue } from "@/data/fabric-analysis"` 앞에 더한다.

```tsx
import type { AnalysisPrintMode } from "@/data/analysis-print"
```

### E-2. Props와 구조 분해

16행 `type Props = { ... }` 의 `onEditRequest` 뒤에 필드를 더한다.

```ts
type Props = { record: AnalysisRequest | null; canEdit: boolean; defaultInCharge: string; recipients: readonly MailAddress[]; onOpenChange: (open: boolean) => void; onSave: (record: AnalysisRequest) => void; onEditRequest: (record: AnalysisRequest) => void; onPrint: (mode: AnalysisPrintMode, record: AnalysisRequest) => void }
```

39행 함수 시그니처의 구조 분해에 `onPrint` 를 더한다.

```tsx
export function AnalysisDetailDialog({ record, canEdit, defaultInCharge, recipients, onOpenChange, onSave, onEditRequest, onPrint }: Props) {
```

### E-3. 푸터 왼쪽

178행에서 아래 조각을 찾는다.

```tsx
<DialogFooter className="justify-between"><div>{record.state === "완료" ? <Button type="button" variant="outline" disabled={completionPending} className="border-teal-600/40 text-teal-700 hover:bg-teal-500/10 dark:text-teal-300" onClick={finishedMail}><Mail />완료 메일</Button> : null}</div>
```

아래로 바꾼다. 같은 줄의 오른쪽 `<div className="flex flex-wrap gap-2">` 이후는 손대지 않는다.

```tsx
<DialogFooter className="justify-between"><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={completionPending} onClick={() => onPrint("request", record)}><Printer />의뢰서 출력</Button>{record.state === "완료" ? <Button type="button" variant="outline" disabled={completionPending} onClick={() => onPrint("report", record)}><Printer />리포트 출력</Button> : null}{record.state === "완료" ? <Button type="button" variant="outline" disabled={completionPending} className="border-teal-600/40 text-teal-700 hover:bg-teal-500/10 dark:text-teal-300" onClick={finishedMail}><Mail />완료 메일</Button> : null}</div>
```

## 지면 계산 (레이아웃을 임의로 바꾸지 말 것)

A4 세로 12mm 여백이면 쓸 수 있는 크기가 186mm × 273mm다. 아래 높이로 한 장에 들어가게 맞췄다.

| 의뢰서 | 높이 |
|---|---|
| 머리말 | 14mm |
| 의뢰 정보 3열 4줄 + 넓은 칸 2줄 | 62mm |
| 시료 사진과 안내 | 46mm |
| swatch 부착란 | 106mm |
| 수령·반환란 | 16mm |
| 꼬리말 | 8mm |
| 합계 | 약 252mm |

리포트는 머리말 14, 의뢰 요약 56, 결과 칸 28, 결과 서술 29, 사진 2줄 86, 밴드 21, 꼬리말 8로 약 242mm다. 사진이 5장(시료 1 + 분석 4)일 때가 가장 길다.

**칸 높이나 폰트를 올리지 마라.** 넘치면 빈 둘째 장이 붙는다.

## 고칠 파일

| 파일 | 조치 |
|---|---|
| `src/data/analysis-print.ts` | 신규 (A) |
| `src/components/analysis/AnalysisPrintDeck.tsx` | 신규 (B) |
| `src/index.css` | RDDA 인쇄 블록 다음에 추가 (C) |
| `src/routes/FabricAnalysis.tsx` | D-1~D-5 |
| `src/components/analysis/AnalysisDetailDialog.tsx` | E-1~E-3 |

다른 파일은 열지 않는다.

## 검증

```
npm run build
```

빌드 오류 0이면 통과다. `git status --short`에 위 다섯 파일과 이 문서만 나와야 한다.

인쇄 모양 확인은 사용자가 한다. FABRIC ANALYSIS에서 건을 하나 골라 `의뢰서 출력`을 누르고 인쇄 미리보기에서 A4 세로 한 장인지, swatch 부착란이 정사각형인지 본다.
