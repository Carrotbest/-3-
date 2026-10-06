# R282 — FABRIC ANALYSIS 출력 격자 복원 (시인성 개편)

추론 강도: **medium**. 파일 2개, 마크업 재구성 + CSS 전면 교체. 데이터 계약은 건드리지 않는다.

## 왜

2026-10-02에 박향근이 웹 출력지와 팀이 쓰던 하드카피 양식을 나란히 놓고 비교했다. 웹 출력지가 읽히지 않는다.

R265에서 격자를 일부러 걷어냈다(`src/index.css` 841행 주석 "격자를 걷고 제목줄 + 값만 남겼다"). 화면에서는 깔끔했지만 종이에서는 실패했다. 구체적 원인 네 가지다.

1. 라벨이 `#9ca3af`(gray-400) 6.5pt 대문자다. 레이저 출력에서 거의 안 보인다.
2. 구분선이 `0.2mm #e5e7eb`(gray-200)뿐이다. 칸 경계가 종이에 안 남아 값이 공중에 뜬다.
3. 본문이 9pt다. 하드카피는 10~11pt에 검은 글씨다.
4. 실물 SWATCH 자리가 테두리 없는 96mm 빈 공백이라 어디에 원단을 붙이는지 모른다.

목표는 하드카피 양식의 **검은 격자 + 라벨 셀 음영** 골격으로 바꾸고 웹이 가진 필드는 그대로 유지하는 것이다. **이번 변경은 R265 결정을 뒤집는 것이다. 되돌리지 말 것.**

## 건드리지 말 것

- `AnalysisPrintDeck.tsx`의 인쇄 흐름 전부. `PAGE_STYLE`, `IMAGE_WAIT_MS`, `useEffect` 두 개, `printedRef`, `afterprint` 이중 방어, `onDone`. 여기는 종이가 안 나오는 사고가 났던 자리다.
- `src/data/analysis-print.ts`. 필드 목록과 순서는 그대로 쓴다. 함수 시그니처를 바꾸지 않는다.
- `.an-print-root` 가시성 규칙(848~850행). RDDA 월간 리포트가 `body *`를 숨기기 때문에 필요하다.
- `src/index.css`의 `@media print` 블록 바깥. 911행 이후 `perf-row-*`는 무관하다.

## 작업 1. `src/index.css`

**841행** 주석 한 줄을 바꾼다.

현재:
```
 * 격자를 걷고 제목줄 + 값만 남겼다. 라벨은 작게 위, 값은 크게 아래다.
```
교체:
```
 * 하드카피 양식과 같은 검은 격자 표다(R282). 라벨 셀은 음영, 값은 흰 셀이다.
 * R265에서 격자를 걷었다가 종이에서 안 읽혀 되돌렸다. 다시 걷지 말 것.
```

**846행부터 909행까지**(`.an-print-deck { display: none; }` 부터 `@media print` 블록을 닫는 `}` 까지) 전체를 아래로 교체한다.

```css
.an-print-deck { display: none; }

@media print {
  .an-print-root, .an-print-root * { visibility: visible !important; }
  .an-print-root { position: fixed !important; inset: 0 !important; width: auto !important; height: auto !important; max-width: none !important; max-height: none !important; translate: none !important; transform: none !important; border: 0 !important; box-shadow: none !important; overflow: visible !important; }
  .an-print-deck { display: block !important; background: white; color: #000; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .an-print-page { box-sizing: border-box; width: 186mm; font-size: 10pt; line-height: 1.35; color: #000; page-break-after: always; break-after: page; }
  .an-print-page:last-child { page-break-after: auto; break-after: auto; }

  /* 머리말: 가운데 제목 + 번호/일자/구분/의뢰자 2줄 표 */
  .an-head { margin-bottom: 4mm; }
  .an-head h1 { margin: 0 0 3mm; font-size: 17pt; font-weight: 700; text-align: center; letter-spacing: -0.01em; }
  .an-head h1 span { display: block; margin-top: 1mm; font-size: 9pt; font-weight: 600; letter-spacing: 0.08em; }

  /* 공통 격자표 */
  .an-grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .an-grid th, .an-grid td { border: 0.3mm solid #000; padding: 1.6mm 2mm; vertical-align: top; word-break: break-word; }
  .an-grid th { background: #dce6f1; font-size: 9pt; font-weight: 600; text-align: left; }
  .an-grid td { font-size: 10pt; font-weight: 400; }
  .an-grid td:empty::after { content: ""; display: block; min-height: 5mm; }
  .an-urgent { color: #b91c1c; font-weight: 700; }

  /* 기입란: 손으로 적는 빈 칸은 더 높다 */
  .an-grid-write td { height: 9mm; }

  /* 구역 제목 바 */
  .an-block { margin-top: 5mm; break-inside: avoid; }
  .an-block > h2 { margin: 0; padding: 1.6mm 2mm; border: 0.3mm solid #000; border-bottom: 0; background: #dce6f1; font-size: 10pt; font-weight: 700; text-align: center; }

  /* 실물 SWATCH 붙이는 자리 */
  .an-swatch { box-sizing: border-box; height: 78mm; border: 0.3mm solid #000; }

  /* 사진 */
  .an-shots { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4mm; }
  .an-shot { box-sizing: border-box; height: 52mm; border: 0.3mm solid #000; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .an-shot img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .an-photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
  .an-photos div { break-inside: avoid; }
  .an-photos img { display: block; width: 100%; height: 42mm; object-fit: contain; border: 0.3mm solid #000; }
  .an-photos span { display: block; margin-top: 1mm; font-size: 8pt; }
  .an-empty { margin: 0; padding: 3mm 2mm; border: 0.3mm solid #000; border-top: 0; font-size: 9pt; text-align: center; }

  .an-foot { display: flex; justify-content: space-between; margin-top: 5mm; padding-top: 1.5mm; border-top: 0.3mm solid #000; font-size: 8pt; }
}
```

없어진 클래스는 `.an-doc`, `.an-head-no`, `.an-fields`, `.an-field`, `.an-notes`, `.an-note`, `.an-blank`, `.an-write`, `.an-write-row`, `.an-hand`, `.an-texts`다. 작업 2에서 마크업도 같이 지우므로 남겨 두지 말 것.

## 작업 2. `src/components/analysis/AnalysisPrintDeck.tsx`

1~16행(import, 타입, `PAGE_STYLE`, `IMAGE_WAIT_MS`)과 104~158행(`AnalysisPrintDeck` 본체)은 그대로 둔다. **18행 `Head` 부터 102행 `ReportPage` 끝까지**를 아래로 교체한다.

```tsx
/** 짝 배열을 2개씩 끊어 한 줄에 라벨·값 두 쌍을 앉힌다. */
function chunkPairs(items: [string, string][]): [string, string][][] {
  const rows: [string, string][][] = []
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2))
  return rows
}

function Head({ item, kind, sub }: { item: AnalysisRequest; kind: string; sub: string }) {
  return <header className="an-head">
    <h1>{kind}<span>{sub}</span></h1>
    <table className="an-grid">
      <colgroup><col style={{ width: "24%" }} /><col style={{ width: "26%" }} /><col style={{ width: "24%" }} /><col style={{ width: "26%" }} /></colgroup>
      <tbody>
        <tr>
          <th>Analysis Request Number</th><td>{item.anNo}</td>
          <th>Requested Date</th><td>{item.requestedAt || "-"}</td>
        </tr>
        <tr>
          <th>Request Type</th>
          <td className={item.requestType === "Urgent" ? "an-urgent" : undefined}>{item.requestType || "-"}</td>
          <th>Requester</th><td>{item.requester || "-"}</td>
        </tr>
      </tbody>
    </table>
  </header>
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="an-block"><h2>{title}</h2>{children}</section>
}

/** 라벨·값 표. 짧은 항목은 2쌍씩, 긴 글은 전폭 한 줄이다. */
function Grid({ pairs, wide, write }: { pairs: [string, string][]; wide?: [string, string][]; write?: boolean }) {
  return <table className={write ? "an-grid an-grid-write" : "an-grid"}>
    <colgroup><col style={{ width: "24%" }} /><col style={{ width: "26%" }} /><col style={{ width: "24%" }} /><col style={{ width: "26%" }} /></colgroup>
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
  return <section className="an-print-page">
    <Head item={item} kind="분석 의뢰서" sub="FABRIC ANALYSIS REQUEST" />
    <Block title="의뢰 정보 (Request)">
      <Grid pairs={analysisHeadFields(item)} wide={analysisNoteLines(item)} />
    </Block>
    <Block title="실물 SWATCH (Original Fabric Swatch)">
      <div className="an-swatch" />
    </Block>
    <Block title="분석 결과 (R&D 기입)">
      <table className="an-grid an-grid-write">
        <colgroup><col style={{ width: "24%" }} /><col style={{ width: "76%" }} /></colgroup>
        <tbody>
          {ANALYSIS_WRITE_LINES.map((label) => <tr key={label}><th>{label}</th><td /></tr>)}
          <tr><th>3팀 수령일</th><td /></tr>
          <tr><th>담당 (In charge)</th><td /></tr>
          <tr><th>swatch 반환일</th><td /></tr>
        </tbody>
      </table>
    </Block>
    {photo ? <Block title="참고 사진">
      <div className="an-shots">
        <div className="an-shot"><img src={photo} alt="" onLoad={onImageSettled} onError={onImageSettled} /></div>
      </div>
    </Block> : null}
    <Foot item={item} kind="분석 의뢰서" stamp={stamp} />
  </section>
}

function ReportPage({ item, urls, stamp, onImageSettled }: PageProps) {
  const photos = analysisPrintImages(item, "report").map((path) => urls[path]).filter(Boolean)
  return <section className="an-print-page">
    <Head item={item} kind="분석 리포트" sub="FABRIC ANALYSIS REPORT" />
    <Block title="의뢰 정보 (Request)">
      <Grid pairs={analysisHeadFields(item)} wide={analysisNoteLines(item)} />
    </Block>
    <Block title="분석 결과 (Result)">
      <Grid
        pairs={analysisResultFields(item)}
        wide={[
          ["Yarn description", item.yarnDescription || "-"],
          ["Comment (RND)", item.commentRnd || "-"],
          ["완료일 / 소요", `${item.finishedAt || "-"} · ${analysisLeadText(item)}`],
        ]}
      />
    </Block>
    <Block title="사진 (Photo)">
      {photos.length
        ? <div className="an-photos">{photos.map((url, index) => <div key={url}><img src={url} alt="" onLoad={onImageSettled} onError={onImageSettled} /><span>사진 {index + 1}</span></div>)}</div>
        : <p className="an-empty">등록된 사진이 없습니다.</p>}
    </Block>
    <Foot item={item} kind="분석 리포트" stamp={stamp} />
  </section>
}
```

따라오는 import 수정 두 가지다.

- 1행을 `import { Fragment, useEffect, useMemo, useRef, useState } from "react"` 로 바꾼다. `Grid`가 `Fragment`를 쓴다.
- `analysisLeadText`는 이미 3~6행 import 목록에 있다. 그대로 둔다.
- `analysisPrintImages`, `analysisPrintStamp`, `analysisSheetMode`, `ANALYSIS_WRITE_LINES`, `analysisHeadFields`, `analysisNoteLines`, `analysisResultFields` 전부 계속 쓴다. **import 목록에서 지우지 말 것.**

## 주의

- `analysisHeadFields`는 12개를 돌려주므로 `chunkPairs`가 6줄을 만든다. 홀수가 될 일은 지금 없지만 `row.length === 1` 분기를 지우지 말 것. 나중에 필드가 하나 늘면 표가 깨진다.
- `.an-grid td:empty::after`가 손으로 적는 빈 칸의 최소 높이를 만든다. 지우면 빈 셀이 납작해진다.
- 라벨 셀 음영은 `print-color-adjust: exact` 가 있어야 인쇄된다. 이미 `.an-print-deck`에 있다. 빼지 말 것.
- 사진이 없는 의뢰서는 참고 사진 구역을 통째로 안 그린다. 빈 상자 두 개가 종이만 먹던 것을 없앴다.

## 검증

1. `npm run build` 한 번. **실패하면 고치고 다시 돌려라.** 통과할 때까지다.
2. `git status --short` 로 바뀐 파일이 `src/index.css` 와 `src/components/analysis/AnalysisPrintDeck.tsx` 둘뿐인지 확인한다.

끝. 화면 실물 확인은 박향근이 한다.
