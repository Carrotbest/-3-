# R146 FABRIC REQUEST 옵션 줄에 DD 진행·완료 상태와 FL# 링크 표시

상태: 미착수. R144(REQ 표시·수동 연결), R145(연결 도우미) 뒤에 한다.

## 요구 (사용자)
DD에서 샘플이 진행되거나 완료되면 FABRIC REQUEST에 그 상태를 FL no.와 함께 보여 준다. FL no.는 링크로 연다.

## 전제
- 연결은 DD 행 `tech.requestLink { reqId, lineId }`에만 있다. **요청 쪽에는 아무것도 저장하지 않는다.** 상태는 화면에서 `records`를 읽어 계산한다.
- 완료 판정 기준 (CLAUDE.md 규칙과 같다)
  - 화면 완료 = 유효 FL#(`isCompletedFlNo`, `@/data/dd-workflow`)
  - 실물 도착 = `receivedDate`
  - 두 기준을 합치지 않고 **둘 다** 보여 준다.
- 원단 상세 링크는 DD MASTER와 같은 규칙이다. `src/routes/DevelopmentMasterSheet.tsx` 937행이 `/fabric/${encodeURIComponent(ledger.key)}`를 쓰고, `ledger`는 그 파일의 `ledgerByRecord`(= `buildFabricLedger` 결과를 DD 행 identity로 묶은 Map)에서 온다. **같은 구성으로 키를 만든다.**
- DD MASTER 경로는 `/development/workspace`다.

## 파일별 조치
### 1. `src/data/request-link.ts`
```ts
export type RequestDdTone = "none" | "progress" | "late" | "received" | "done" | "hold" | "drop"
export interface RequestDdStatus {
  tone: RequestDdTone
  label: string            // 화면 문구
  record?: DevRecord       // 대표 DD 행
  rowId?: string           // `${_src.sheet}::${_src.row}`
  flNo?: string            // 유효 FL#일 때만
  extra: number            // 같은 lineId에 연결된 DD 행이 2개 이상일 때 나머지 수
}
export function ddRecordsByLineId(records: readonly DevRecord[]): Map<string, DevRecord[]>
export function requestDdStatus(byLine: Map<string, DevRecord[]>, option: RequestOption, today = new Date()): RequestDdStatus
```
- `lineId`가 없거나 연결 행이 없으면 `{ tone: "none", label: "미연결", extra: 0 }`이다.
- 대표 행은 연결 행 중 유효 FL#이 있는 행이다. 없으면 `receivedDate`가 있는 행, 그것도 없으면 첫 행이다. `extra = rows.length - 1`이다.
- 판정은 위에서부터 첫 번째로 맞는 것을 쓴다.

| 순서 | 조건 | tone | label |
|---|---|---|---|
| 1 | Status(공백 제거·대문자)가 DROP 또는 REJECT | `drop` | 그 Status 문자 |
| 2 | Status가 HOLD 또는 보류 | `hold` | `HOLD` |
| 3 | `isCompletedFlNo(flNo)` | `done` | `완료` (flNo 채움) |
| 4 | `receivedDate` 있음 | `received` | `원단 수취 {M/D}` |
| 5 | `daysLeft(dueDate, today) < 0` | `late` | `지연 D+{n} · {stage}` |
| 6 | 나머지 | `progress` | `진행 · {stage \|\| "접수"}` |

- 3번(완료)이어도 `receivedDate`가 있으면 label 뒤에 ` · 수취 {M/D}`를 붙인다(두 기준 모두 표시).

### 2. `src/routes/FabricRequest.tsx`
- `COLUMN_GROUPS`의 옵션 그룹(75~81행) 끝에 `{ id: "ddStatus", label: "DD 상태", width: 170, scope: "option" }`을 더한다.
  - **편집 불가다.** `editKindOf("ddStatus")`는 null이다. 붙여넣기·지우기·채우기 대상에서 빠지는지 R141 `editableCell`로 확인한다.
  - 복사(TSV)에는 `label`과 FL#을 공백으로 이은 텍스트가 나간다.
  - **양식·업로드(`request-template.ts`의 `TEMPLATE_COLUMNS`)는 바꾸지 않는다.** `downloadTemplate`, `ingest`가 화면 열 정의(`COLUMN_GROUPS`)를 쓰지 않는지 확인하고, 쓰면 `ddStatus`를 거기서 제외한다.
- 계산
  - `const byLine = useMemo(() => ddRecordsByLineId(records), [records])`(스토어 `records` 셀렉터 추가)
  - 원단 원장은 DD MASTER와 같은 인자로 `buildFabricLedger(records, completed, fabricOverrides, fabricEvents)`를 만들고 DD 행 identity → 원장 항목 key Map을 만든다(DD MASTER `ledgerByRecord` 구성을 따라 한다).
- `cellValue` 옵션 분기에 `case "ddStatus"`를 더한다. 렌더는 한 줄 `flex items-center gap-1`이다.
  - **상태 칩**
    - 모양: `rounded-full px-1.5 py-0.5 text-[10px] font-medium`
    - 색: none=muted 글자·배경 muted, progress=`--chart-1`, late=`--destructive`, received=`--chart-2` 옅게, done=`--chart-2` 진하게, hold=`--warning`, drop=muted 취소선
    - 배경은 해당 색 12~18% `color-mix`
    - `tone !== "none"`이면 `button`이다. `onClick`은 `navigate(`/development/workspace?focus=${encodeURIComponent(rowId)}`)`, `title`은 `DD MASTER에서 열기`다. `onMouseDown`과 `onDoubleClick`에서 `stopPropagation`(셀 선택·편집 방지)을 부른다.
  - **FL#**: `flNo`가 있으면 칩 뒤에 `font-mono text-[11px] text-[var(--primary)] underline-offset-2 hover:underline` 링크 버튼을 둔다. 원장 key가 있으면 `navigate(`/fabric/${encodeURIComponent(key)}`)`, 없으면 DD MASTER focus로 간다. `title`은 `원단 상세 열기`다. 이벤트 전파는 칩과 같이 막는다.
  - `extra > 0`이면 `+{extra}` muted 작은 글자와 `title="같은 옵션에 연결된 DD 행이 {extra}개 더 있습니다"`를 붙인다.
- **스타일 요약**: 행 머리(`#`) 셀의 번호 아래에 `DD {연결된 옵션 수}/{옵션 수}`를 `text-[9px] text-[var(--muted-foreground)] tabular-nums`로 둔다. 옵션 0개면 숨긴다. 모두 완료(done)면 글자색을 `--chart-2`로 한다.

### 3. `src/routes/DevelopmentMasterSheet.tsx` — `focus` 파라미터
- `useSearchParams`로 `focus`(행 identity)를 읽는다. 값이 있으면 네 단계로 처리한다.
  1. 그 행이 `scoped`에 없으면 알림 `연결된 DD 행을 찾을 수 없습니다.`를 띄우고 파라미터를 지운다.
  2. 있으면 필터를 풀어 보이게 한다. `search=""`, `owner=ALL`, `status=ALL`, `hideClosed=false`, `columnFilters={}`. 완료 행도 보여야 하므로 "전체 탭은 진행 중만" 규칙에 걸리면 담당 탭을 그 행의 `owner`로 바꾸고 `hideClosed=false`로 둔다. `ordered`의 필터 조건을 확인해 행이 보이는 조합으로 맞춘다.
  3. 두 번 rAF 뒤 `tr[data-row-id]` 중 값이 같은 행을 찾는다(`CSS.escape` 또는 dataset 비교). `setCellAnchor(rowId, "styleNo")`로 선택하고 `scrollIntoView({ block: "center" })`한다. 1.2초 강조는 R144 FABRIC REQUEST 방식과 같다.
  4. `setSearchParams`로 `focus`를 지운다(`replace: true`).

## CLAUDE.md
- "## FABRIC REQUEST" 절에 한 줄을 더한다. "DD 상태" 열은 `records`의 `tech.requestLink`를 읽어 계산하는 보기 전용 열이고, 요청 쪽에 저장하지 않는다. FL#(화면 완료)와 원단 수취(실물)를 합치지 않고 둘 다 보인다. FL#은 `/fabric/:key`로, 칩은 DD MASTER `?focus=`로 간다. 양식 열(`TEMPLATE_COLUMNS`)에는 없다.
- "## DD MASTER" 절에 `?focus=rowId` 한 줄을 더한다(필터를 풀고 행 선택·스크롤).

## 하지 말 것
- 요청 데이터에 DD 상태·FL#을 저장하지 않는다.
- `TEMPLATE_COLUMNS`, 업로드, 양식 내려받기를 바꾸지 않는다.
- 완료 판정을 하나로 합치지 않는다(FL# 기준과 Received date 기준을 둘 다 유지).
- `buildFabricLedger`, `isCompletedFlNo`, `statusOf`를 고치지 않는다.
- R144·R145 코드를 되돌리지 않는다.

## 검증
- `npm run build` 성공.
- `git status --short`에 이번 변경은 `request-link.ts`, `FabricRequest.tsx`, `DevelopmentMasterSheet.tsx`, `CLAUDE.md`, 이 문서만 더해진다.
