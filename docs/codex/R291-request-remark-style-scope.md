# R291 — DEVELOPMENT REQUEST의 REMARK를 스타일 단위로 병합

추론 강도: **medium**. 파일 6개. 데이터가 옵션에서 스타일로 올라가는 계약 변경이지만, 손댈 자리는 아래에 전부 좌표로 적어 두었다. 저장소를 탐색하지 말 것.

## 상태

미착수.

## 왜

REMARK가 `RequestOption`에 있어 옵션마다 한 칸씩 쪼개져 있다. 스타일 1건의 코멘트를 한곳에 모아 이력처럼 쌓아 읽으려면 옵션별 분리가 방해가 된다. 2026-10-06에 박향근이 스타일 단위 한 칸으로 병합하고, 그 칸에 옅은 채움을 넣어 기록이 눈에 들어오게 하라고 지시했다.

확정 사항 세 가지다.

1. 병합된 REMARK는 **자유 입력 여러 줄**이다. 날짜나 이름을 자동으로 붙이지 않는다. 기존 `area` 편집기(`editKindOf`가 이미 `remark`를 `area`로 준다)를 그대로 쓴다.
2. 옵션별로 이미 적혀 있는 옛 REMARK는 **번호 없이 줄바꿈으로 이어 붙여** 보여 준다. 일괄 변환(마이그레이션 스크립트)은 하지 않는다. 그 칸을 처음 고칠 때 `style.remark`로 옮겨 적히는 것으로 끝낸다.
3. 요청 옵션을 DD로 넘길 때 REMARK를 DD의 `note`에 복사하던 동작은 **없앤다.** 스타일 전체 기록을 DD 행마다 붙이는 건 맞지 않다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/schema.ts` | `RequestStyle.remark` 추가, `RequestOption.remark` 옛 필드로 격하, `styleRemarkText` 추가 |
| `src/data/request-template.ts` | 양식 열 scope 변경, 내보내기·파서를 스타일 값으로 |
| `src/routes/FabricRequest.tsx` | 열 정의 scope 변경, 첫 행 렌더 순서, 옵션 추가 줄 colSpan, 옅은 채움, 값 읽기 |
| `src/data/request-link.ts` | DD `note` 복사 2곳 제거 |
| `src/components/request/RequestArchiveView.tsx` | 보관 표의 Remark 칸을 스타일 값으로 |
| `src/components/dd/RequestBrowseDialog.tsx` | 검색 대상에서 옵션 remark를 스타일 remark로 |

---

## 1. `src/data/schema.ts`

### 1-1. `RequestStyle`에 필드 추가

`devPlan` 바로 아래, `options: RequestOption[]` 위에 넣는다. 현재 코드:

```ts
  /** 엑셀 Q열 "개발" */
  devPlan: string
  options: RequestOption[]
```

이렇게 바꾼다:

```ts
  /** 엑셀 Q열 "개발" */
  devPlan: string
  /**
   * REMARK. 스타일 1건의 코멘트를 여러 줄로 쌓는 칸(R291).
   * 값이 `undefined`면 아직 옮기지 않은 옛 데이터다. 읽을 때는 `styleRemarkText`를 쓴다.
   */
  remark?: string
  options: RequestOption[]
```

### 1-2. `RequestOption.remark` 격하

현재 코드(235행대):

```ts
  /** 엑셀 Z열. 수기 유지 */
  remark: string
```

이렇게 바꾼다:

```ts
  /**
   * 옛 옵션별 REMARK. R291에서 스타일 단위(`RequestStyle.remark`)로 올렸다.
   * 새로 쓰지 않는다. 옛 데이터를 읽어 합쳐 보여 주는 용도로만 남긴다.
   */
  remark?: string
```

### 1-3. `styleRemarkText` 추가

`RequestOption` 인터페이스 바로 아래에 넣는다.

```ts
/**
 * 화면과 양식이 함께 쓰는 REMARK 읽기 함수(R291).
 * `style.remark`가 있으면 그 값이고, 없으면 옛 옵션별 REMARK를 번호 없이 줄바꿈으로 이어 붙인다.
 * 옛 값을 합쳐 보여 주다가 사용자가 그 칸을 처음 고치면 `style.remark`로 굳는다.
 */
export function styleRemarkText(style: Pick<RequestStyle, "remark" | "options">): string {
  if (typeof style.remark === "string") return style.remark
  return style.options.map((option) => (option.remark ?? "").trim()).filter(Boolean).join("\n")
}
```

`RequestOption`이 `RequestStyle`보다 뒤에 선언돼 있어도 `interface`는 호이스팅되므로 그대로 쓴다.

---

## 2. `src/data/request-template.ts`

### 2-1. 양식 열 scope

59행:

```ts
  { band: "옵션", head: "REMARK", width: 26, scope: "option", key: "remark" },
```

→ `scope`만 바꾼다. **밴드와 `head`는 절대 바꾸지 말 것.** 바꾸면 기존 양식 파일이 "양식이 다릅니다" 오류로 안 읽힌다.

```ts
  // R291에서 스타일 단위로 올렸다. 열 위치와 이름은 옛 양식 파일을 계속 읽기 위해 그대로 둔다.
  { band: "옵션", head: "REMARK", width: 26, scope: "style", key: "remark" },
```

### 2-2. 내보내기 값

112행:

```ts
    case "remark": return option ? option.remark || null : null
```

→ 스타일 분기(`case "devPlan"` 쪽, 105행 근처)로 옮긴다. `cellOf` 안에서 `case "devPlan": return style.devPlan || null` 아래에 다음 줄을 넣고, 112행의 옛 `case "remark"`는 지운다.

```ts
    case "remark": return styleRemarkText(style) || null
```

`styleRemarkText`를 `./schema`에서 import한다. 이 파일은 이미 `import type { RequestOption, RequestStyle } from "./schema"`를 쓰므로, 타입 import는 그대로 두고 값 import를 한 줄 더 넣는다.

```ts
import { styleRemarkText } from "./schema"
```

내보내기 루프(`column.scope === "style" && offset > 0 ? null : ...`)는 손대지 않는다. scope가 바뀌면 자동으로 첫 행에만 적힌다.

### 2-3. 파서

(가) 290행 `optionKeys`에서 `"remark"`를 뺀다.

```ts
  const optionKeys = ["yarnDetail", "construction", "weight", "color", "dyeingMethod"]
```

(나) 스타일 생성 객체(305행대)에 `remark`를 넣는다. `devPlan` 아래다.

```ts
        devPlan: asText(at(row, "devPlan")),
        remark: asText(at(row, "remark")),
```

(다) `readOption`(368행대)에서 `remark: asText(at(row, "remark")),` 줄을 지운다.

(라) **옛 양식 파일 호환.** 옛 파일은 두 번째 옵션 행에도 REMARK가 적혀 있다. 그 행은 이제 `hasOption`이 false가 될 수 있어 "건너뛰었습니다" 경고가 뜬다. 스타일 행이 아닌 분기(`if (!hasOption)` 검사 앞)에 다음을 넣어 값을 스타일 REMARK에 이어 붙이고, 그 행에 REMARK뿐이면 경고 없이 넘긴다.

현재 코드:

```ts
    if (!hasOption) {
      warnings.push(`${excelRow}행: Garment Number도 옵션 값도 없어 건너뛰었습니다.`)
      continue
    }
    if (!current) {
```

이렇게 바꾼다:

```ts
    // 옛 양식은 옵션 행마다 REMARK를 적었다. 그 값은 스타일 REMARK 뒤에 줄바꿈으로 이어 붙인다(R291).
    const trailingRemark = asText(at(row, "remark"))
    if (trailingRemark && current) {
      current.remark = [current.remark ?? "", trailingRemark].filter(Boolean).join("\n")
    }
    if (!hasOption) {
      if (!trailingRemark) warnings.push(`${excelRow}행: Garment Number도 옵션 값도 없어 건너뛰었습니다.`)
      continue
    }
    if (!current) {
```

(마) 안내 시트 문구에서 REMARK 설명을 고친다. 현재:

```
"   Opt / YARN DETAIL / CONS / W'T / COLOR / DYEING METHOD / REMARK 만 채웁니다.",
```

→

```
"   Opt / YARN DETAIL / CONS / W'T / COLOR / DYEING METHOD 만 채웁니다.",
"   REMARK는 스타일 1건에 한 칸입니다. 첫 행에만 적고, 여러 줄로 쌓아 씁니다.",
```

---

## 3. `src/routes/FabricRequest.tsx`

### 3-1. 열 정의 scope (102행)

```ts
    { id: "remark", label: "Remark", width: 180, scope: "option" },
```

→ 자리는 그대로 두고 scope만 바꾼다. 주석도 붙인다.

```ts
    // R291에서 스타일 단위로 올렸다. 옵션 수만큼 세로로 병합된 한 칸이 되고, 여러 줄 기록을 쌓는다.
    { id: "remark", label: "Remark", width: 220, scope: "style" },
```

### 3-2. 첫 행 렌더 순서 — 반드시 같이 고칠 것

지금 본문 첫 행은 **스타일 열 전부 → 옵션 열 전부** 순서로 그린다. 지금까지는 `visibleColumns`에서 스타일 열이 모두 옵션 열보다 앞이라 머리글 순서와 같았다. `remark`가 옵션 그룹 안에서 스타일 scope가 되면 이 가정이 깨져 머리글과 본문이 한 칸 어긋난다.

1804~1807행 현재 코드:

```tsx
                    {styleColumns.map((column) => renderDataCell(styleLine, column, styleStart, blockHeight, blockHeight, rowSpan))}
                    {hasOptionColumns && firstOption
                      ? optionColumns.map((column) => renderDataCell({ kind: "option", style, option: firstOption }, column, styleStart, optionRowHeight, optionRowHeight))
                      : hasOptionColumns ? optionColumns.map((column) => renderDataCell(styleLine, column, styleStart, optionRowHeight, optionRowHeight)) : null}
```

이렇게 바꾼다. `visibleColumns` 순서로 한 번만 돌아 머리글과 어긋나지 않게 한다.

```tsx
                    {/* 머리글과 같은 순서로 그린다. 스타일 열은 세로 병합, 옵션 열은 첫 옵션 값이다(R291). */}
                    {visibleColumns.map((column) => column.scope === "style"
                      ? renderDataCell(styleLine, column, styleStart, blockHeight, blockHeight, rowSpan)
                      : firstOption
                        ? renderDataCell({ kind: "option", style, option: firstOption }, column, styleStart, optionRowHeight, optionRowHeight)
                        : renderDataCell(styleLine, column, styleStart, optionRowHeight, optionRowHeight))}
```

1763행 `styleColumns`는 더 쓰지 않으면 지운다. `optionColumns`는 아래에서 계속 쓴다.

### 3-3. 옵션 추가 줄 colSpan

`remark`가 스타일 열이 되어 세로 병합되므로, 옵션 열이 `remark`를 기준으로 **앞 묶음과 뒤 묶음으로 끊긴다.** 지금처럼 `colSpan={optionColumns.length}` 한 칸으로 깔면 병합된 칸과 겹쳐 표가 틀어진다.

`rows` 선언 근처(1773행대, `const rows: ReactNode[] = []` 앞)에 연속 구간 길이를 구해 둔다.

```tsx
                // 옵션 열이 세로 병합된 스타일 열(Remark)에 끊기므로, 옵션 추가 줄은 연속 구간마다 칸을 나눠 깐다(R291).
                const addRowSpans = visibleColumns.reduce<number[]>((runs, column) => {
                  if (column.scope === "option") runs.push((runs.pop() ?? 0) + 1)
                  else if (runs.at(-1) !== 0) runs.push(0)
                  return runs
                }, []).filter((run) => run > 0)
```

1838행 현재 코드:

```tsx
                      <TableCell colSpan={optionColumns.length} className="border-b border-r border-[var(--border)] border-b-[color-mix(in_srgb,var(--foreground)_16%,var(--border))] bg-[var(--card)] p-0">
                        <Button type="button" variant="ghost" aria-label={`${style.garmentNo || "스타일"} 옵션 추가`} className="h-5 w-full justify-start gap-1 px-2 text-[11px] font-normal text-[var(--muted-foreground)] opacity-0 transition-opacity duration-150 hover:text-[var(--foreground)] focus-visible:opacity-100 group-hover/add:opacity-100 motion-reduce:transition-none" onClick={() => addOption(style)}>
                          <Plus className="size-3" />옵션 추가
                        </Button>
                      </TableCell>
```

이렇게 바꾼다. 버튼은 첫 구간에만 둔다.

```tsx
                      {addRowSpans.map((span, runIndex) => (
                        <TableCell key={`add-run-${runIndex}`} colSpan={span} className="border-b border-r border-[var(--border)] border-b-[color-mix(in_srgb,var(--foreground)_16%,var(--border))] bg-[var(--card)] p-0">
                          {runIndex === 0 ? (
                            <Button type="button" variant="ghost" aria-label={`${style.garmentNo || "스타일"} 옵션 추가`} className="h-5 w-full justify-start gap-1 px-2 text-[11px] font-normal text-[var(--muted-foreground)] opacity-0 transition-opacity duration-150 hover:text-[var(--foreground)] focus-visible:opacity-100 group-hover/add:opacity-100 motion-reduce:transition-none" onClick={() => addOption(style)}>
                              <Plus className="size-3" />옵션 추가
                            </Button>
                          ) : null}
                        </TableCell>
                      ))}
```

### 3-4. 값 읽기 두 곳

(가) `cellValue`의 옵션 분기(1454행) `case "remark": return option.remark` 줄을 지운다. 스타일 분기(`case "devPlan": return style.devPlan` 아래, 1437행대)에 넣는다.

```ts
        case "remark": return styleRemarkText(style)
```

(나) `rawValue`(1194행대)는 `source[columnId]`로 읽어 `style.remark`가 `undefined`면 빈 문자열이 된다. 옛 값이 편집기와 복사에서 사라지지 않게 전용 분기를 넣는다. `const source = ...` 줄 바로 앞이다.

```ts
    // 옛 옵션별 REMARK를 합친 값까지 보이게 한다. 그 칸을 고치면 style.remark로 굳는다(R291).
    if (columnId === "remark") return styleRemarkText(line.style)
```

`styleRemarkText`를 `@/data/schema`에서 import한다. 이 파일의 기존 schema import 줄에 이어 붙인다.

### 3-5. 옅은 채움

`renderDataCell`의 `TableCell` className에서 배경 부분만 바꾼다. 현재:

```
${sel.inRange ? "bg-[color-mix(in_srgb,var(--grid-selection)_8%,var(--card))]" : "bg-[var(--card)]"}
```

이렇게 바꾼다. 선택 표시가 항상 채움보다 위다.

```
${sel.inRange ? "bg-[color-mix(in_srgb,var(--grid-selection)_8%,var(--card))]" : column.id === "remark" ? "bg-[color-mix(in_srgb,var(--warning)_7%,var(--card))]" : "bg-[var(--card)]"}
```

### 3-6. 옵션 삭제 확인 조건

871행:

```ts
    const filled = [option.yarnDetail, option.construction, option.weight, option.color, option.dyeingMethod, option.remark].some((value) => text(value).trim())
```

`option.remark`를 뺀다. 이제 옵션에 속한 값이 아니다.

```ts
    const filled = [option.yarnDetail, option.construction, option.weight, option.color, option.dyeingMethod].some((value) => text(value).trim())
```

### 3-7. `blankOption`

`blankOption`이 `remark: ""`를 넣고 있으면(225행대) 그 줄을 지운다. 타입이 optional이 되었으므로 빌드는 통과하지만 새 옵션에 쓰이지 않는 값을 심지 않는다.

### 3-8. 스타일 등록·수정 폼

478행대에 옵션별 Remark `Input`이 있다.

```tsx
                    <Input className="h-8 text-xs" placeholder="Remark" value={option.remark} onChange={(event) => setOption(index, "remark", event.target.value)} />
```

이 입력을 **옵션 줄에서 빼고 스타일 단위 입력으로 옮긴다.** 같은 폼 안에서 `devPlan`을 다루는 입력 바로 아래에 `Textarea`(이 파일에 이미 쓰이는 컴포넌트가 있으면 그것, 없으면 `Input`) 하나로 둔다. 라벨은 `Remark`, placeholder는 `스타일 코멘트. 여러 줄로 적습니다`로 한다. 폼 상태 타입에서 옵션의 `remark` 키를 빼고 스타일 쪽에 `remark`를 더한다.

354행 `setOption`의 키 유니온에서 `"remark"`를 뺀다.

```ts
  const setOption = (index: number, key: "yarnDetail" | "construction" | "color" | "dyeingMethod", next: string) =>
```

### 3-9. 538행 `editKindOf`

`case "remark"`는 `area`에 그대로 둔다. **바꾸지 말 것.**

---

## 4. `src/data/request-link.ts`

DD로 넘길 때 REMARK를 복사하지 않는다.

(가) 81행 `note: record.note || option.remark,` 줄을 지운다.

(나) 221행 `note: option.remark,` 줄을 지운다. `createBlankDevRecord`가 이미 빈 `note`를 준다.

두 곳 모두 지우기만 한다. 다른 필드(`color`, `dyeing`, `construction`, `weight`)는 건드리지 않는다.

---

## 5. `src/components/request/RequestArchiveView.tsx`

37행 한 줄짜리 표에서 Remark 칸이 옵션 값을 읽는다.

```tsx
<td className="border-b border-r p-1">{option?.remark ?? ""}</td>
```

스타일 값으로, 그리고 첫 줄에만 적는다. 바로 옆 칸들이 `index === 0 ? ... : ""` 꼴을 쓰고 있으니 같은 모양으로 맞춘다.

```tsx
<td className="border-b border-r p-1 whitespace-pre-wrap">{index === 0 ? styleRemarkText(style) : ""}</td>
```

`styleRemarkText`를 `@/data/schema`에서 import한다.

---

## 6. `src/components/dd/RequestBrowseDialog.tsx`

73행 검색에서 옵션 remark를 뺀다.

```ts
      const optionHit = Boolean(needle) && style.options.some((option) => hay(option.yarnDetail, option.color, option.dyeingMethod, option.remark).includes(needle))
```

→

```ts
      const optionHit = Boolean(needle) && style.options.some((option) => hay(option.yarnDetail, option.color, option.dyeingMethod).includes(needle))
```

같은 함수 안에 스타일 단위 검색(`styleHit` 같은 이름)이 있으면 그 `hay(...)` 인자에 `styleRemarkText(style)`을 더한다. 없으면 `optionHit` 줄 위에 다음을 넣고 반환 조건에 `|| remarkHit`를 더한다.

```ts
      const remarkHit = Boolean(needle) && hay(styleRemarkText(style)).includes(needle)
```

---

## 하지 말 것

- `TEMPLATE_COLUMNS`의 `head`와 `band`를 바꾸지 마라. 2행 열 이름으로 위치를 찾으므로 바꾸면 기존 양식 파일 업로드가 전부 깨진다.
- 옛 데이터를 일괄 변환하는 코드를 쓰지 마라. Firestore나 IndexedDB를 돌며 `option.remark`를 지우는 마이그레이션은 금지다. 읽을 때 합쳐 보여 주고 사용자가 고칠 때 굳는 방식만 쓴다.
- `RequestOption.remark` 필드를 schema에서 삭제하지 마라. 옛 데이터를 읽어야 한다.
- `editKindOf`의 `case "remark"`를 `text`로 바꾸지 마라. 여러 줄 입력이 요구사항이다.
- `src/data/zaji.ts`, `src/data/fds-yds-request.ts`, `src/data/fabric-cost.ts`, `src/components/dd/CostSheetDialog.tsx`의 `remark`는 **다른 데이터의 동명 필드다.** 열지 마라.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라. `AnalysisPrintDeck.tsx`, `CostSheetDialog.tsx`, `cost-sheets.ts`, `index.css`에 검증 대기 중인 수정이 있다.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- `npm run build`는 모든 수정을 마친 뒤 한 번만 돌려라.
- `public/data` 아래 JSON을 열지 마라. `archive.json`은 2.5MB다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

```
npm run build
```

`tsc --noEmit`가 포함돼 있다. 오류 0으로 끝나면 성공이다. 특히 다음이 걸리면 위 조치가 덜 된 것이다.

- `option.remark` 참조가 남아 `string | undefined` 오류 → 3-6, 6번 항목 확인
- `remark`가 없는 객체 리터럴 오류 → 2-3(다), 3-7 확인

```
git status --short
```

수정 파일이 아래 6개와 기존 대기 4개(`AnalysisPrintDeck.tsx`, `CostSheetDialog.tsx`, `cost-sheets.ts`, `index.css`)뿐이어야 한다.

- `src/data/schema.ts`
- `src/data/request-template.ts`
- `src/routes/FabricRequest.tsx`
- `src/data/request-link.ts`
- `src/components/request/RequestArchiveView.tsx`
- `src/components/dd/RequestBrowseDialog.tsx`

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
