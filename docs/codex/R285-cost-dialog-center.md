# R285 — 원가계산 팝업 가운데 정렬과 공정 순번

추론 강도: **low**. 파일 1개. 클래스 치환과 한 줄 계산식 수정이다.

## 상태

R283으로 열 폭은 맞췄다. 2026-10-02에 박향근이 화면을 보고 두 가지를 더 요청했다.

1. 좁은 열의 머리와 값을 가운데로 맞춘다. 지금은 머리가 오른쪽, 입력값도 오른쪽이라 선택 상자와 어긋나 보인다.
2. **공정 표 순번이 전부 1이다.** 그룹 안에서만 세고 있다. 표 전체에서 1, 2, 3, 4로 이어 붙인다.

## 범위

가운데로 맞출 열은 **좁은 열뿐이다.**

| 표 | 가운데 | 왼쪽 유지 |
|---|---|---|
| 원사 | #, 투입 %, 단가, 단위, 선염 | 원사 표기 |
| 공정 | #, 그룹, 공정명, 업체, 단가, 단위, LOSS % | REMARK |
| FULL DETAIL 줄 | 완성 폭, 완성 중량, gr/yd, 환율 | FULL DETAIL 칸 |

**`원사 표기`, `REMARK`, `FULL DETAIL` 세 칸은 긴 글이 들어간다. 가운데로 돌리지 말 것.** 글이 길어지면 읽는 시작점이 줄마다 달라진다.

## 건드리지 말 것

- 계산식, `computeFabricCost`, `yarn-blend.ts`.
- R283에서 맞춘 `colgroup` 폭과 `table-fixed`. 폭을 다시 바꾸지 말 것.
- `LOSS %` 머리와 칸의 `border-l border-[var(--border)]`. 공정료와 로스를 가르는 선이다.
- 공정 표의 그룹 머리줄(`fee.group !== input.fees[index - 1]?.group` 분기)과 `colSpan={9}`.
- `src/data/cost-sheets.ts`. 이번에는 안 건드린다.

## 작업. `src/components/dd/CostSheetDialog.tsx`

### 1. 공정 순번 (295행)

현재:
```ts
            const seq = input.fees.slice(0, index).filter((item) => item.group === fee.group).length + 1
```
교체:
```ts
            // 그룹 안에서 세면 그룹마다 1로 돌아간다. 표 전체에서 이어 센다.
            const seq = index + 1
```

### 2. FULL DETAIL 줄 (266~269행)

네 칸 모두 `Label`에 `block text-center`를 더하고 입력값을 가운데로 돌린다.

- **266행**: `<Label className="text-[11px]">완성 폭 (inch)</Label>` 를 `<Label className="block text-center text-[11px]">완성 폭 (inch)</Label>` 로, 같은 줄 `Input`의 `className={`${field} text-right tabular-nums`}` 를 `className={`${field} text-center tabular-nums`}` 로.
- **267행**: `완성 중량 (g/㎡)` 라벨과 `Input`을 266행과 같은 방식으로.
- **268행**: `<Label className="text-[11px]">gr/yd</Label>` 를 `<Label className="block text-center text-[11px]">gr/yd</Label>` 로. 읽기 전용 div 의 `justify-end` 를 `justify-center` 로.
- **269행**: `환율 (KRW/USD)` 라벨과 `Input`을 266행과 같은 방식으로.

**265행 `FULL DETAIL` 칸은 그대로 둔다.**

### 3. 원사 표 머리 (276행)

세 곳만 바꾼다.

- `<th className="px-1.5 py-1 text-right">투입 %</th>` → `<th className="px-1.5 py-1 text-center">투입 %</th>`
- `<th className="px-1.5 py-1 text-right">단가</th>` → `<th className="px-1.5 py-1 text-center">단가</th>`
- `<th className="px-1.5 py-1 text-left">단위</th>` → `<th className="px-1.5 py-1 text-center">단위</th>`

`#`(이미 center), `원사 표기`(left 유지), `선염`(이미 center)은 그대로다.

### 4. 원사 표 값 (281~283행)

- **281행** 투입 비율 `Input`: `${field} text-right tabular-nums` → `${field} text-center tabular-nums`
- **282행** 단가 `Input`: `${field} text-right tabular-nums` → `${field} text-center tabular-nums`
- **283행** 단위 `select`: `className="h-8 w-full rounded border border-[var(--input)] bg-[var(--background)] px-2 text-xs"` → 끝에 ` text-center` 를 더해 `... px-2 text-center text-xs`

**280행 원사 표기 `Input`과 성분 요약 버튼은 그대로 둔다.**

### 5. 공정 표 머리 (294행 `<thead>` 안)

여섯 곳을 바꾼다.

- `<th className="px-1.5 py-1 text-left">그룹</th>` → `text-center`
- `<th className="px-1.5 py-1 text-left">공정명</th>` → `text-center`
- `<th className="px-1.5 py-1 text-left">업체</th>` → `text-center`
- `<th className="px-1.5 py-1 text-right">단가</th>` → `text-center`
- `<th className="px-1.5 py-1 text-left">단위</th>` → `text-center`
- `<th className="border-l border-[var(--border)] px-1.5 py-1 text-right">LOSS %</th>` → `<th className="border-l border-[var(--border)] px-1.5 py-1 text-center">LOSS %</th>`

`#`(이미 center)와 `REMARK`(left 유지)는 그대로다.

### 6. 공정 표 값 (297~299행)

- **297행** 공정 그룹 `select`: 클래스 끝에 ` text-center` 를 더한다(`... px-2 text-center text-xs`). 바로 뒤 선염 안내 `<div className="pt-0.5 text-[10px] text-[var(--muted-foreground)]">선염 {money(result.dyedSharePct, 1)}%</div>` 를 `<div className="pt-0.5 text-center text-[10px] text-[var(--muted-foreground)]">선염 {money(result.dyedSharePct, 1)}%</div>` 로.
- **298행** 공정명 `Input`: `className={field}` → `className={`${field} text-center`}`
- **298행** 업체 `Input`: `className={field}` → `className={`${field} text-center`}`
- **298행** 비고(REMARK) `Input`: **그대로 둔다.**
- **298행** 공정 단가 `Input`: `${field} text-right tabular-nums` → `${field} text-center tabular-nums`. 바로 뒤 `<div title="원사 공정료는 …" className="pt-0.5 text-right text-[10px] text-[var(--muted-foreground)]">비중 곱한 값</div>` 의 `text-right` 를 `text-center` 로. **title 문구는 한 글자도 바꾸지 말 것.**
- **299행** 공정 단위 `select`: 클래스 끝에 ` text-center` 를 더한다.
- **299행** 로스 `Input`: `${field} text-right tabular-nums` → `${field} text-center tabular-nums`

## 주의

- 298행 한 줄에 `Input`이 넷(공정명, 업체, 비고, 단가) 있다. **`aria-label`로 구분해라.** `aria-label="공정명"`, `aria-label="업체"`, `aria-label="비고"`, `aria-label="공정 단가"` 다. 비고만 빼고 셋을 바꾼다.
- `text-right` 를 파일 전체에서 한 번에 치환하지 말 것. 아래 `항목별 원가`와 `이전 버전 대비` 표(311~312행), `투입 합계` 줄(288행), 이익률 입력(309행)은 **오른쪽 정렬을 유지한다.** 숫자를 세로로 비교하는 표라 자릿수가 맞아야 한다.
- `tabular-nums` 를 빼지 말 것. 가운데 정렬이어도 자릿수 폭은 고정이어야 숫자가 떨리지 않는다.

## 검증

1. `npm run build` 한 번. **실패하면 고치고 다시 돌려라.** 통과할 때까지다.
2. `git status --short` 로 이번에 바뀐 파일이 `src/components/dd/CostSheetDialog.tsx` 하나인지 확인한다. `src/index.css`, `src/components/analysis/AnalysisPrintDeck.tsx`, `src/data/cost-sheets.ts` 의 기존 변경은 그대로 남아 있어야 한다.

화면 확인은 박향근이 한다.
