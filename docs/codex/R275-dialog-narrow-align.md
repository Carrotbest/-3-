# R275 팝업 폭 축소와 두 표 열 정렬

상태: **미착수.** R274 까지 구현 완료, 워킹트리 미커밋, `npm run build` 통과 확인함.
실사용 화면을 보고 나온 수정이다.

## 만드는 것

| 파일 | 조치 |
|---|---|
| `src/components/dd/CostSheetDialog.tsx` | 팝업 폭 축소, 원사 표기 칸 확대, 성분 입력 접기, 공정 표 순번과 열 정렬 |

이 파일 하나만 고친다. `fabric-cost.ts`, `yarn-blend.ts`, `cost-*.ts` 를 건드리지 마라.

---

## 1. 왜 성분 입력을 접나

R273 에서 성분 입력 칸을 원사 행 안에 가로로 넣었다. 성분 한 묶음이
섬유 `w-[104px]` + 굵기 `w-[56px]` + 단위 `w-[62px]` 로 222px 다.

팝업 폭을 800px 로 줄이면 쓸 수 있는 가로가 약 760px 이고, 번호, 투입%, 단가, 단위,
선염, 액션이 이미 400px 가까이 먹는다. 성분 입력을 그대로 두면 원사 표기 칸이
100px 대로 떨어진다. 지금 200px 보다 좁아진다.

R274 에서 혼방 표기를 일반 규칙으로 읽게 되어 **해석 실패가 예외가 됐다.**
해석된 행은 성분을 고칠 일이 없으므로 평상시에는 요약만 보이면 된다.

---

## 2. 팝업 폭

`DialogContent` className 을 바꾼다. `xl:w-[1120px]` 을 `xl:w-[800px]` 로.

```
"flex max-h-[92vh] w-[96vw] max-w-none flex-col xl:w-[800px]"
```

**`relative`, `absolute`, `static` 을 넘기지 마라.**

상단 입력 4칸(`환율`, `완성 중량`, `완성 폭`, `gr/yd`)의 격자도 좁은 폭에 맞춘다.
`md:grid-cols-[repeat(4,minmax(0,150px))]` 를 `md:grid-cols-4` 로 바꾼다.

---

## 3. 원사 표

### 3-1. 열 구성

`<colgroup>` 을 이렇게 바꾼다. **성분 전용 열을 없앤다.**

| 열 | `<col>` | 내용 |
|---|---|---|
| # | `w-8` | 번호 |
| 원사 표기 | (없음, 남는 폭) | Input + 해석 요약 |
| 투입 % | `w-[64px]` | 그대로 |
| 단가 | `w-[84px]` | 그대로 |
| 단위 | `w-[92px]` | 그대로 |
| 선염 | `w-[52px]` | 그대로 |
| 액션 | `w-[72px]` | 삭제 버튼. 오른쪽 정렬 |

액션 열을 `w-8` 이 아니라 `w-[72px]` 로 두는 이유는 아래 공정 표와 폭을 맞추기 위해서다.
`<td>` 안을 `flex justify-end` 로 해 삭제 버튼을 오른쪽 끝에 붙인다.

머리줄도 `#`, `원사 표기`, `투입 %`, `단가`, `단위`, `선염`, 빈 칸 일곱 개로 맞춘다.

### 3-2. 원사 표기 칸 안쪽

Input 과 해석 요약을 한 칸에 가로로 둔다.

```tsx
<td className="px-1.5 py-1">
  <div className="flex items-center gap-1.5">
    <Input aria-label="원사 표기" placeholder="CM26's/1" disabled={!canEdit}
      value={yarn.name}
      title={parseYarnSpec(yarn.name) ? undefined : "표기를 해석하지 못했습니다. 성분을 직접 채워 주세요"}
      onChange={/* 지금 코드 그대로 */}
      className={`${field} min-w-0 flex-1 ${parseYarnSpec(yarn.name) ? "" : "border-amber-500"}`} />
    <button type="button" onClick={() => toggleSpec(index)}
      title="성분 보기와 고치기"
      className="shrink-0 max-w-[140px] truncate text-left text-[10px] text-[var(--muted-foreground)] underline decoration-dotted underline-offset-2">
      {specSummary(yarn)}
    </button>
  </div>
</td>
```

`onChange` 핸들러는 **지금 코드를 그대로 쓴다.** `autoYarns` 갱신과 `setYarn` 동작을 바꾸지 마라.

`specSummary` 는 파일 위쪽에 새로 만든다. 성분을 짧게 잇는다.

```ts
const specSummary = (yarn: CostYarnLine): string => {
  const components = yarn.spec?.components ?? []
  if (!components.length) return "성분 입력"
  const first = components[0]
  if (first.blend?.length) return first.blend.map((item) => `${item.fiber} ${item.pct}`).join(" / ")
  return components.map((item) => `${item.fiber || "성분"}${item.nominal ? ` ${item.nominal}${item.unit}` : ""}`).join(" + ")
}
```

`describeSpec` 이 아직 남아 있으면 지운다. `specSummary` 가 대신한다.

### 3-3. 성분 입력 줄

성분 입력은 **원사 행 바로 아래 둘째 `<tr>`** 로 내린다. R273 에서 없앴던 구조를 되살리되
조건이 다르다. R273 은 항상 접혀 있고 사람이 펴야 했는데, 이번에는 **해석 실패면 자동으로 펴진다.**

상태 하나를 더한다.

```ts
const [openSpecRows, setOpenSpecRows] = useState<number[]>([])
const toggleSpec = (index: number) =>
  setOpenSpecRows((rows) => rows.includes(index) ? rows.filter((at) => at !== index) : [...rows, index])
```

보이는 조건이다.

```ts
const specOpen = !parseYarnSpec(yarn.name) || openSpecRows.includes(index)
```

`specOpen` 이면 `<tr className="bg-[var(--muted)]/20"><td colSpan={7} className="px-1.5 py-1">` 안에
R273 이 만든 성분 입력 묶음(`flex flex-wrap items-center gap-1` + 섬유, 굵기, 단위, 삭제, 성분 추가)을
**그대로 옮긴다.** 입력 칸 폭과 4개 상한 규칙도 그대로다.

원사를 지울 때 `openSpecRows` 도 같이 손봐야 한다. 지운 뒤 뒤 행 번호가 하나씩 당겨지므로
`removeYarn` 안에서 `setOpenSpecRows([])` 로 비운다. 번호를 맞춰 옮기려 들지 마라. 복잡하고
해석 실패 행은 어차피 자동으로 펴진다.

`새 원사 행 추가` 에서는 `openSpecRows` 를 건드리지 마라. 새 행은 표기가 비어 있어
`parseYarnSpec("")` 이 `null` 이므로 자동으로 펴진다.

---

## 4. 공정 표

### 4-1. 순번 열

맨 앞에 `#` 열(`w-8`)을 더한다. **번호는 그룹 안에서 1부터 다시 센다.**
엑셀 원본이 그렇다(`Yarn Dyed` 1~2, `Knitting` 1, `DYEING` 1, `Others` 1~5).

그룹 안 순번은 이렇게 구한다.

```ts
const seq = input.fees.slice(0, index).filter((item) => item.group === fee.group).length + 1
```

그룹 밴드 줄(`fee.group !== input.fees[index - 1]?.group` 일 때 그리는 `<tr>`)의
`colSpan` 을 7에서 **8** 로 고친다.

### 4-2. 열 폭

| 열 | `<col>` | 비고 |
|---|---|---|
| # | `w-8` | 원사 표와 같음 |
| 공정명 | `w-[88px]` | **줄인다.** 5글자를 안 넘는다 |
| 업체 | (없음, 남는 폭) | |
| 단가 | `w-[84px]` | 원사 표와 같음 |
| 단위 | `w-[92px]` | 원사 표와 같음 |
| LOSS % | `w-[52px]` | 원사 표 선염 열과 같음 |
| 액션 | `w-[72px]` | 원사 표와 같음 |

**오른쪽 네 열의 폭이 두 표에서 같아야 한다.** 그래야 단가와 단위가 세로로 줄이 선다.
`단가 84`, `단위 92`, `LOSS·선염 52`, `액션 72` 를 양쪽에 똑같이 넣어라.

공정명 칸이 좁아지므로 `placeholder` 를 `항목명` 에서 **빈 문자열**로 바꾼다. 글자가 잘린다.
`list`, `datalist`, `aria-label` 은 그대로 둔다.

액션 열 버튼 세 개(위, 아래, 삭제)가 72px 에 들어가도록 `className="size-6"` 를 준다.
`<td>` 안은 `flex justify-end` 다.

`LOSS %` 열의 `border-l border-[var(--border)]` 는 머리줄과 몸줄 모두 그대로 둔다.
단가 묶음과 LOSS 를 가르는 선이다.

LOSS 입력칸 옆 `%` 글자는 52px 안에 안 들어간다. **`%` 를 지우고 머리줄 `LOSS %` 만 남긴다.**

원사 그룹 줄 아래 `선염 {n}%` 보조 문구와 단가 칸 아래 `비중 곱한 값` 문구는 그대로 둔다.

---

## 5. 하지 말 것

- `parseYarnSpec`, `composeBlend`, `normalizeComponentMode`, `setComponent`, `autoYarns`, `editYarn` 의 동작을 바꾸지 마라.
- 성분 4개 상한을 계산이나 저장에서 막지 마라. `성분 추가` 버튼만 안 그린다.
- `blankComponent()` 기본 단위를 `D` 로 두지 마라. `Ne` 다.
- 공정 배열 순서가 공정 순서라는 계약을 바꾸지 마라. 그룹으로 정렬하지 마라. 그룹 안 순번은 **표시용**이다.
- 공정명을 `<select>` 로 바꾸지 마라. 목록 밖 이름(`DD + WICKING`)이 쓰인다.
- 결과 단가 세 칸(`Net USD/yd`, `Net USD/lb`, `Net USD/kg`)과 이익률 줄을 건드리지 마라. R273 에서 끝났다.
- **`ref` 콜백 안에서 `setState` 하지 마라.** 화면이 백지가 된다(R119 사고).
- **`DialogContent` 에 `relative`, `absolute`, `static` 을 넘기지 마라.**
- `saveNew`, `overwrite`, `loadVersion`, `buildSheet`, `refOf` 의 동작을 바꾸지 마라. 저장 경로다.
- 단가, 협력사명, 실데이터를 코드나 주석에 넣지 마라. 공개 저장소다.
- 파일을 삭제하지 마라.

## 6. 검증

```
npm run build
git status --short
```

**빌드가 실패하면 고치고 다시 돌려라. 통과를 본 뒤에 보고해라.**

마지막 보고는 수정 파일, 빌드 결과, 판단이 필요했던 지점만. 바꾼 코드를 다시 붙이지 마라.
