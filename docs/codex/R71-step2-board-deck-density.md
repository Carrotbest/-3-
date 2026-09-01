# R71 — 2단계 (담당자 보드 테두리, 덱 조작감, 상세 이동 버튼, HOME 밀도·캘린더 이동)

상태: **미착수**. Codex가 구현한다.
R70이 워킹트리에 미커밋 상태로 얹혀 있다. `npm run build` 통과 상태다. 그 위에 이어서 작업한다.

대상
- `src/components/charts/OwnerLaneBoard.tsx`
- `src/components/cards/MaterialDeck.tsx`
- `src/routes/Home.tsx`

**계산 로직과 데이터 키는 건드리지 않는다. 이번 작업은 표시와 배치, 조작 감도만 바꾼다.**

---

## 작업 1. 담당자 보드 상태를 점에서 테두리로

`src/components/charts/OwnerLaneBoard.tsx`

### 배경

긴급도 체계는 이미 있다. 새로 만들지 마라.

- `danger` 지연됐거나 오늘 마감
- `soon` 남은 기간 1일에서 7일
- `normal` 8일 이상이거나 납기 미기재

이 기준과 임계값은 **그대로 둔다.** `laneUrgency`(`src/data/derive.ts` 450행)를 수정하지 마라.
노드 색을 그 안의 가장 급한 건으로 정하는 방식도 **그대로 둔다.** 지연 1건만 있어도 노드는 빨강이다. 의도된 동작이다.

### 지시

1. **점을 없앤다.** 134행의 노드 우측 상단 점을 삭제한다.
   ```
   <span className="absolute right-0 top-0 size-2.5 rounded-full border-2 border-[var(--card)]" style={{ background: URGENCY_COLORS[cell.urgency] }} aria-hidden="true" />
   ```

2. **테두리에 긴급도 색을 넣는다.** `nodeStyle`(73행)의 `borderColor`를 공정 단계 색에서 긴급도 색으로 바꾼다.
   ```
   borderColor: `color-mix(in oklab, ${URGENCY_COLORS[urgency]} 78%, var(--border))`
   ```
   원색 그대로 쓰지 마라. 노드가 여러 개 모여 있어서 쨍한 색이 그대로 들어오면 화면이 시끄럽다.

3. **테두리를 두껍게 한다.** 버튼의 `border`를 `border-2`로 바꾼다(127행 className). 1px으로는 색이 잘 안 보인다.

4. `background` 그라데이션과 `boxShadow`는 그대로 둔다. 공정 단계 색은 배경과 열 위치(`STAGE_X`)로 이미 구분되므로 테두리를 내줘도 정보가 사라지지 않는다.

5. **접근성.** 점을 지우면 정보가 색 하나에만 실린다. 색으로 구분이 어려운 사용자를 위해 버튼 `aria-label`(125행)에 긴급도를 넣는다.
   현재 `${owner} · ${stage.label} · ${cell.count} OPT · 옵션 목록 열기`
   여기에 긴급도 한국어 표기를 더한다. `danger`는 "지연·오늘", `soon`은 "임박", `normal`은 "정상"으로 쓴다.

6. 건이 없는 빈 노드(109행 `if (!cell.count)`)는 손대지 않는다.

---

## 작업 2. 덱 커서 반응 낮추기

`src/components/cards/MaterialDeck.tsx` 94행부터 96행.

마우스 좌우 위치가 회전 속도를 조종하는 방식은 유지한다. 상수만 바꾼다.

| 상수 | 현재 | 바꿀 값 | 이유 |
|---|---|---|---|
| `DEAD_ZONE` | `0.12` | `0.28` | 가운데 멈춤 구간을 넓혀 항목을 세우기 쉽게 한다 |
| `MIN_V` | `1.8` | `1.2` | 구간을 막 벗어났을 때 확 튀지 않게 한다 |
| `MAX_V` | `13` | `7` | 최고 속도를 절반 가까이 낮춘다 |

`VELOCITY_LERP`, `speedProgress`의 제곱 곡선, 그 밖의 계산식은 손대지 않는다.
HOME 덱과 전체 화면 덱이 이 상수를 함께 쓴다. 둘 다 같이 느려지는 게 맞다.

---

## 작업 3. 미리보기 팝업에 상세 화면 이동 버튼 추가

미리보기 팝업은 지금 그대로 유지한다. 없애지 마라. 팝업 안에 이동 버튼만 추가한다.

### `src/components/cards/MaterialDeck.tsx`

`MaterialDetailSheet`(586행)에 선택 prop을 하나 더한다.

```
onNavigate?: (item: MaterialItem) => void
```

`onNavigate`가 들어온 경우에만 `DialogBody` 안 외부 링크 버튼 아래에 버튼을 하나 렌더한다.
문구는 `상세 화면으로 이동`, 아이콘은 이미 이 파일에서 쓰는 것 중 화살표 계열을 쓴다.
누르면 `onNavigate(item)`을 부르고 `onOpenChange(false)`로 팝업을 닫는다.

`onNavigate`가 없으면 버튼을 렌더하지 않는다. 기존 호출부가 깨지면 안 된다.

### `src/routes/Home.tsx`

1118행 `MaterialDetailSheet`에 `onNavigate`를 넘긴다.
자료 종류에 따라 갈 곳을 정한다.

- `TS`는 `/ts`
- `STUDY`는 `/study`
- `PORTFOLIO`는 `/trend/portfolio`
- 그 밖의 종류는 갈 곳이 없으므로 `onNavigate`에서 아무것도 하지 않는다. 이 경우 버튼이 아예 안 나오는 편이 낫다면 그렇게 처리해도 된다.

**항목 id를 URL로 넘기는 딥링크는 이번 범위가 아니다.** 목록 화면까지만 이동한다.

---

## 작업 4. HOME 밀도 완화와 팀 일정 캘린더 이동

`src/routes/Home.tsx`

### 4-1. 팀 일정 캘린더를 화면 맨 아래로 옮긴다

현재 구조는 이렇다.

```
grid xl:grid-cols-12
  ├ xl:col-span-8 : KPI 3장 + 공정 summary 카드
  └ aside xl:col-span-4 : <TeamSchedule />
```

바꿀 결과는 이렇다.

1. `xl:grid-cols-12` 래퍼와 `xl:col-span-8` 안쪽 div, `aside`를 걷어낸다.
   KPI 3장과 공정 summary 카드가 **화면 전체 폭**을 쓴다. 이게 여백 확보의 핵심이다.
2. `<TeamSchedule />`을 화면 맨 아래 Quick access와 **한 줄로 묶는다.**
   Trend issue 섹션 다음에 온다.

```
<div className="grid gap-6 xl:grid-cols-12">
  <section aria-labelledby="quick-access-title" className="xl:col-span-7"> ... 기존 Quick access 그대로 ... </section>
  <div className="xl:col-span-5"><TeamSchedule /></div>
</div>
```

**왜 전체 폭으로 내리지 않는가.** `TeamSchedule`은 7칸짜리 월 그리드다. 폭이 넓어지면 날짜 칸이 과하게 늘어나 깨진다. 좁은 칼럼을 유지해야 한다.
Quick access는 타일 그리드라 폭이 줄어도 잘 접힌다. 둘 다 참조용 정보라 화면 맨 아래에서 성격이 맞는다.

`TeamSchedule` 컴포넌트 내부는 수정하지 마라. 감싸는 자리만 바꾼다.

### 4-2. HOME 여백 확보

값만 키운다. 구조는 그대로 둔다.

| 위치 | 현재 | 바꿀 값 |
|---|---|---|
| 최상위 `<section>` (947행) | `space-y-5` | `space-y-8` |
| KPI 3장 그리드 | `gap-4` | `gap-5` |
| 각 섹션 제목 블록 | `mb-4` | `mb-5` |
| HOME 안 섹션 카드 패딩 | `p-5 sm:p-6` | `p-6 sm:p-7` |

패딩은 **`src/routes/Home.tsx` 안에서만** 바꾼다. 공용 컴포넌트나 다른 화면 파일로 번지면 안 된다.
`src/index.css`나 Tailwind 설정, 본문 최대폭(2200px)은 건드리지 않는다.

---

## 검증

1. `npm run build` 통과(`tsc --noEmit && vite build`).
2. `git diff --stat`에 위 세 파일만 나와야 한다. 다른 파일이 딸려 오면 되돌린다.
3. `src/data/derive.ts`가 diff에 나오면 잘못한 것이다. 긴급도 계산은 손대지 않는다.
4. 커밋하지 않는다.

## 보고

- 바꾼 파일과 줄 번호
- `npm run build` 결과
- 지시와 다르게 판단한 부분이 있으면 이유
- 팀 일정 카드가 5칼럼 폭에서 깨지지 않는지 확인한 결과
