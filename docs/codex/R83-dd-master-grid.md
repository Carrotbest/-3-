# R83 — DD MASTER 그리드 보완

상태: 미착수. 대상 파일은 `src/routes/DevelopmentMasterSheet.tsx`(2,246줄)와
`src/data/format.ts`, `src/data/schema.ts` 세 개다.

아래 좌표는 모두 실측했다. 저장소를 뒤지지 말고 이 좌표부터 열어라.

---

## 0. 먼저 알아야 할 구조

`GROUPS`(151행)가 8개 그룹을 정의한다. 각 그룹은 `MasterColumn[]`을 갖는다.
`PINNED_COLUMNS`(145행)는 좌측 고정 3열(담당, Status, Style No.)이다.

헤더는 `<thead>`(2001행)에 3행이다.

- 1행(h-6, 2003행) : 행번호 th(rowSpan 3), `고정 핵심` th(colSpan 3, rowSpan 2), 그룹 헤더들
- 2행(h-6, 2008행) : `sub`가 있는 그룹의 병합 소제목(원사, 편직, Finishing 등)
- 3행(h-8, 2011행) : 고정열 헤더 + 그룹별 열 헤더

**colSpan 불변식.** 1행 그룹 th의 `colSpan`, 2행 subRuns의 span 합, 3행 열 헤더 개수,
그리고 tbody가 그리는 셀 개수가 항상 같아야 한다. 하나라도 어긋나면 표가 통째로 밀린다.
이번 작업에서 열을 숨기므로 여기가 가장 위험하다.

---

## 1. 좌측 상단 `고정 핵심` 셀 삭제

2004행의 `<th colSpan={PINNED_COLUMNS.length} rowSpan={2}>...고정 핵심...</th>`를 지운다.

3행(2011행)에 있는 `PINNED_COLUMNS.map(...)` 블록을 1행으로 옮기고 `rowSpan={3}`을 준다.
행번호 th 바로 뒤에 온다. sticky 좌표(`left: pinnedLeft(index)`)와 너비 계산은 그대로 유지한다.

지워지는 것이 하나 있다. `고정 핵심` th에 달려 있던 그룹 일괄 너비 조절 핸들
(`startGroupResize(PINNED_COLUMNS, event)`)이다. 개별 열 핸들은 각 th에 그대로 남으므로
기능이 완전히 사라지지는 않는다. 대체 핸들을 새로 만들지 마라.

---

## 2. 개발 DETAIL의 Finishing 접기

숨김 대상은 5개다. `finishingA`, `finishingB`, `finishingC`, `finishingD`, `remark`.

기본값은 **닫힘**이다. 열려면 사용자가 눌러야 한다.

토글 버튼은 개발 DETAIL 그룹 헤더(1행 그룹 th)의 **우측 끝**에 둔다.
닫힘일 때 `+`, 열림일 때 `-`. 기존 너비 조절 핸들과 겹치지 않게 배치해라.

구현 지침이다.

- `useState`로 `finishingOpen`(기본 false)을 둔다. localStorage에 저장하지 마라.
- 숨김 열 id 집합을 만들고, **렌더에 쓰이는 모든 열 목록을 같은 집합으로 걸러라.**
  1행 그룹 th의 colSpan, 2행 `subRuns` 입력, 3행 열 헤더, tbody 셀, 그리고
  선택 범위 계산에 쓰는 `displayedColumns`와 `colIndexOf` 전부다.
- 걸러진 목록 하나를 만들어 모든 곳이 그것을 참조하게 해라. 각자 따로 거르면 반드시 어긋난다.

주의. `remark`를 숨기면 `subRuns`에서 Finishing 런이 통째로 사라진다.
개발 DETAIL 그룹에 `sub`를 가진 열이 하나도 남지 않으므로, 1행 그룹 th의
`rowSpan` 분기(`group.columns.some((column) => column.sub) ? 1 : 2`)가 2로 바뀐다.
이건 정상 동작이다. 2행에서 개발 DETAIL 자리가 비는 것이 맞다.

---

## 3. 열 너비와 정렬

아래 값을 `GROUPS` 정의의 `width`에 직접 반영한다.

### 공정 SCHEDULE 업체 열 (60%)

| id | 현재 | 변경 |
|---|---|---|
| yarnMill | 108 | 65 |
| knittingMill | 108 | 65 |
| dyeingMill | 108 | 65 |
| finishingMill | 108 | 65 |

`완료일` 열(yarnStatus 등 4개)은 날짜라 5번 항목에서 따로 줄인다.

### 결과 RESULT (70%, 전부 가운데 정렬)

| id | 현재 | 변경 |
|---|---|---|
| receivedDate | 114 | 80 |
| flNo | 116 | 81 |
| optionProgress | 96 | 67 |
| review | 176 | 123 |

가운데 정렬은 너비만 바꿔서는 안 된다. `alignOf`(262행)가
`LEFT_ALIGN_IDS`(257행)에 있으면 무조건 왼쪽으로 보낸다.
**`LEFT_ALIGN_IDS`에서 `receivedDate`, `flNo`, `review` 세 개를 빼라.**
빼지 않으면 너비만 줄고 정렬은 그대로다.

### 날짜 열 (연도 표기가 사라지므로 축소)

| id | 현재 | 변경 |
|---|---|---|
| requestDate | 108 | 76 |
| dueDate | 108 | 76 |
| yarnStatus | 104 | 76 |
| knittingStatus | 104 | 76 |
| dyeingStatus | 104 | 76 |
| finishingStatus | 104 | 76 |

`receivedDate`는 위 결과 RESULT 표의 80을 쓴다. 76으로 덮어쓰지 마라.

### 반드시 함께 할 것

너비는 localStorage에 저장된다. `loadColumnWidths`(264행)가 저장값으로 기본값을 덮는다.
**`COL_WIDTHS_STORAGE_KEY`(24행)를 `"dd-col-widths"`에서 `"dd-col-widths-v2"`로 바꿔라.**
이걸 안 하면 이미 화면을 쓴 사람에게는 새 너비가 하나도 반영되지 않는다.
사용자가 "안 바뀌었다"고 하는 원인이 대부분 이것이다.

---

## 4. 초기 오픈 그룹

`DEFAULT_OPEN`(250행)을 바꾼다. 열려 있어야 할 그룹은 세 개다.

```
request: true, original: false, detail: true, schedule: false,
result: true, data: false, history: false, ledger: false
```

`schedule`과 `ledger`가 true에서 false로 바뀐다. 이 값은 저장되지 않으므로 바로 반영된다.

---

## 5. 날짜를 월-일로 표시

화면 표기만 바꾼다. **저장값은 반드시 연도를 포함한 `YYYY-MM-DD`를 유지한다.**

`src/data/format.ts`에 새 포맷터를 추가한다.

```ts
export const fmtDateMd = (v: unknown): string => {
  const d = toDate(v)
  return d ? `${PAD(d.getMonth() + 1)}-${PAD(d.getDate())}` : "—"
}
```

`fmtDate`(21행)와 `fmtDateFull`(26행)은 **건드리지 마라.** 다른 화면이 쓰고 있다.
`fmtDate`는 점 구분(`09.03`)이라 요구한 하이픈 표기와 다르므로 재사용하지 마라.

`DevelopmentMasterSheet.tsx` 95행의 지역 함수를 바꾼다.

```ts
const dateText = (value: CellValue): string => value ? fmtDateMd(String(value)) : "—"
```

이 한 줄로 DD MASTER의 모든 날짜 셀이 월-일이 된다. 다른 화면에는 영향이 없다.
`dueDate`의 지연 색상 render도 `dateText`를 쓰므로 함께 바뀐다. 정상이다.

---

## 6. 월-일 수기 입력을 당해년도로 저장

사용자가 `09-03`, `0903`, `9/3` 같이 연도 없이 입력하면 **올해 연도를 붙여**
`YYYY-MM-DD`로 저장한다.

`format.ts`에 정규화 함수를 만든다.

```ts
/** 연도 없는 월-일 입력을 올해 기준 YYYY-MM-DD로 바꾼다. 연도가 이미 있으면 그대로 둔다. */
export function normalizeDateInput(raw: string): string
```

규칙이다.

- 빈 문자열은 빈 문자열로 돌려준다.
- 이미 연도가 있는 값(`2026-09-03`, `2026/9/3` 등)은 `YYYY-MM-DD`로만 정규화하고 연도를 보존한다.
  **기존 데이터의 연도를 올해로 덮어쓰면 안 된다.** 과거 이력이 통째로 망가진다.
- 연도가 없는 `MM-DD`, `MM/DD`, `MMDD`(4자리)는 올해 연도를 붙인다.
- 달이나 일이 범위를 벗어나면(13월, 32일) 원문을 그대로 돌려준다. 억지로 고치지 마라.

**호출 지점은 한 곳이다.** `updateRecordCell`(약 410행부터)에서 `column.date`가 true인 열의
`raw`를 함수 통과시킨 뒤 저장한다. 여기가 인라인 편집, 수정 모달, 붙여넣기가 모두 지나는
단일 통로다. 세 곳에 각각 넣지 마라.

---

## 7. 결과 RESULT에 FDS, YDS 추가

`receivedDate`와 `flNo` **사이**에 날짜 열 두 개를 넣는다.

```
{ id: "fds", label: "FDS", width: 76, date: true, value: (row) => row.tech?.sampleDates?.fds, render: ... }
{ id: "yds", label: "YDS", width: 76, date: true, value: (row) => row.tech?.sampleDates?.yds, render: ... }
```

**저장 경로.** `TECH_PATHS`(385행)에 두 줄을 더한다.

```
fds: ["sampleDates", "fds"],
yds: ["sampleDates", "yds"],
```

`src/data/schema.ts`의 `DevTechnical`에 `sampleDates?: { fds?: string; yds?: string }`를 더한다.
기존 필드를 필수로 바꾸지 마라. 전부 optional이다.

`updateRecordCell`의 switch에는 넣지 마라. `TECH_PATHS` 경로가 알아서 처리한다.

**빨강 채움 규칙.** 아래 조건일 때만 셀 배경을 빨갛게 칠한다.

```
record.receivedDate 가 비어 있지 않다  그리고  해당 셀 값이 비어 있다
```

Received Date가 아직 없으면 칠하지 않는다. 샘플이 도착하지 않았으니 요구할 단계가 아니다.
값이 채워지면 빨강이 걷히고 월-일로 표시된다(5번 항목 규칙을 그대로 탄다).

색은 하드코딩하지 말고 `var(--destructive)`를 낮은 비율로 섞어 쓴다.
글자가 안 읽히면 안 된다. 예: `color-mix(in srgb, var(--destructive) 18%, var(--card))`.

---

## 하지 말 것

- `fmtDate`, `fmtDateFull`을 고치지 마라. 다른 화면이 쓴다.
- 저장 형식을 월-일로 바꾸지 마라. 화면 표기만이다.
- 열 순서를 임의로 바꾸지 마라. 지시한 위치만이다.
- `PINNED_COLUMNS`의 열 구성을 바꾸지 마라. 헤더 배치만 바뀐다.
- 전체 담당 화면의 편집 비활성화 규칙을 건드리지 마라.
- Firebase 동기화 코드에 손대지 마라.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 git reset이나 git checkout으로 되돌리지 마라.
- 이 저장소는 공개다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- public/data 아래 JSON을 열지 마라. archive.json은 2.5MB다.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라. 세 번째 시도를 하지 마라.

## 검증

- `npm run build`를 모든 수정을 마친 뒤 **한 번만** 돌려 통과시켜라.
- colSpan 불변식을 코드로 확인해라. 1행 그룹 colSpan 합, 3행 헤더 개수, tbody 셀 개수가
  Finishing 열림과 닫힘 **두 경우 모두** 같아야 한다.
- `normalizeDateInput`의 판정을 주석으로 남겨라. 어떤 입력이 올해가 붙고 어떤 입력이
  연도를 보존하는지 예시로 적어라.

## 보고

수정 파일 목록, 빌드 결과, 판단이 필요한 지점만 한국어로 써라.
바꾼 코드를 보고에 다시 붙이지 마라.
