# R72 — 담당자 보드 노드 외곽선을 비율 게이지 링으로

상태: **미착수**. Codex가 구현한다.
R70, R71이 워킹트리에 미커밋 상태로 얹혀 있다. `npm run build` 통과 상태다. 그 위에 이어서 작업한다.

대상: `src/components/charts/OwnerLaneBoard.tsx` 한 파일.

**`src/data/derive.ts`는 건드리지 않는다.** 필요한 데이터는 이미 다 있다.

---

## 목표

노드 하나의 원형 외곽선을 세 구간으로 나눠 상태 비율대로 그린다.
R71에서 넣은 단색 2px 테두리를 이 링이 대체한다.

보드가 화면에 들어오면 링이 한 번 차오른다. 다 차면 그대로 유지한다.

---

## 1. 데이터

`LaneCell.urgencyCounts`에 `{ normal, soon, danger }` 건수가 이미 들어 있다(`derive.ts` 539행).
세 값의 합은 `cell.count`와 정확히 같다. 두 값 모두 레코드 수를 센다. 그러니 분모는 `cell.count`를 쓰면 된다.

색은 기존 `URGENCY_COLORS`를 그대로 쓴다.

- `normal` 초록 `var(--status-normal)`
- `soon` 노랑 `var(--status-soon)`
- `danger` 빨강 `var(--status-danger)`

---

## 2. 링 그리기

`FlowNode`(83행) 안, 버튼 내부에 절대 위치 `<svg>`를 하나 넣는다.

- `viewBox="0 0 100 100"`, `className="pointer-events-none absolute inset-0 size-full"`, `aria-hidden="true"`
- 뷰박스 단위로 그리므로 노드 크기(`size`)가 달라져도 링 두께 비율이 유지된다.
- 원: `cx=50 cy=50 r=46`, `strokeWidth=8`, `fill="none"`
- 둘레 `C = 2 * Math.PI * 46`. 상수로 한 번만 계산한다.

### 밑바탕 트랙

항상 보이는 회색 원을 하나 먼저 깔아 둔다. `stroke="var(--border)"`, 투명도 낮게.
게이지가 차기 전에도 노드 윤곽이 남아 있어야 한다.

### 세 구간

`normal`, `soon`, `danger` 순서로 12시 방향에서 시계 방향으로 이어 그린다.
전체 `<g>`에 `transform="rotate(-90 50 50)"`를 걸어 시작점을 12시로 옮긴다.

각 구간마다

- 비율 `ratio = count / cell.count`, 길이 `L = C * ratio`
- 앞선 구간들의 길이 합만큼 회전시킨다. `transform={`rotate(${(누적비율) * 360} 50 50)`}`
- `strokeDasharray={`${L} ${C - L}`}`
- `strokeLinecap="butt"` 를 쓴다. 둥근 캡을 쓰면 구간끼리 겹쳐서 색이 섞인다.
- **건수가 0인 구간은 렌더하지 않는다.** 길이 0짜리를 그리면 이음매에 점이 남는다.

---

## 3. 게이지 모션

### 트리거

`useInView`(`src/lib/useInView.ts`)를 보드 최상위 컨테이너에 건다. 기본 옵션(`once` 기본값 true)을 그대로 쓴다.
`inView` 값을 `FlowNode`에 prop으로 내려보낸다.

한 번 차오르면 유지한다. 되감지 않는다.

### 방식

**rAF로 값을 올리지 마라. CSS 트랜지션으로만 그린다.**

이 프로젝트에는 rAF로만 오르는 게이지가 탭이 비활성일 때 0으로 남는 문제가 이미 있다.
CSS 트랜지션을 쓰면 `inView`가 참이 되는 순간 최종 상태가 DOM에 박히므로, 모션이 눈에 안 보이더라도 값은 항상 옳다.

각 구간에서

- `strokeDashoffset`을 `inView ? 0 : L` 로 준다. `L`이면 dash가 시작점 밖으로 밀려나 안 보이고, `0`이면 다 그려진다.
- `style={{ transition: "stroke-dashoffset 520ms cubic-bezier(0.22, 1, 0.36, 1)", transitionDelay: ... }}`
- 지연은 구간 순서대로 준다. 초록 `0ms`, 노랑 `140ms`, 빨강 `280ms`. 초록부터 차례로 차오른다.
- `motion-reduce:transition-none` 을 함께 건다. `useInView`가 reduced motion일 때 `inView`를 곧바로 참으로 만들어 주므로 결과는 완성 상태다.

---

## 4. 기존 테두리 정리

- `nodeStyle`(73행)의 `borderColor` 줄을 **삭제한다.** 링이 대신한다.
- 버튼 className의 `border-2`를 **없앤다.** CSS 테두리와 링이 겹쳐 보이면 안 된다.
- `background` 그라데이션과 `boxShadow`는 그대로 둔다.
- `focus-visible:ring-[3px]` 은 그대로 둔다. 키보드 포커스 표시가 사라지면 안 된다.
- R71에서 지운 우측 상단 점은 되살리지 않는다.

---

## 5. 접근성

링이 이제 세 값의 비율을 보여 주므로 라벨도 내역을 말해야 한다.

`aria-label`(현재 `${owner} · ${stage.label} · ${cell.count} OPT · ${URGENCY_LABELS[cell.urgency]} · 옵션 목록 열기`)에서
`URGENCY_LABELS[cell.urgency]` 자리를 이 파일에 이미 있는 `urgencyText(cell)`(65행)로 바꾼다.
`urgencyText`는 "오늘·지연 2 · 임박 1 · 정상 4" 형태를 만든다.

이 교체로 `URGENCY_LABELS`가 더 이상 쓰이지 않으면 지운다.

---

## 6. 건드리지 말 것

- `src/data/derive.ts` 전체. 긴급도 계산과 임계값은 그대로다.
- 노드 크기 계산(`size = 38 + Math.sqrt(density) * 12`)
- 건이 없는 빈 노드 분기(109행 `if (!cell.count)`)
- `Magnetic` 래퍼의 값들
- 공정 열 배경, 담당자 레인 선, 헤더

---

## 검증

1. `npm run build` 통과(`tsc --noEmit && vite build`).
2. `git diff --stat`에 `src/components/charts/OwnerLaneBoard.tsx` 한 파일만 늘어나야 한다. R70, R71에서 이미 바뀐 파일들은 그대로 두고 손대지 마라.
3. `src/data/derive.ts`가 diff에 나오면 잘못한 것이다.
4. 커밋하지 않는다.

## 보고

- 바꾼 줄 번호
- `npm run build` 결과
- 구간이 하나뿐인 노드(예: 전부 정상)에서 링이 온전한 원으로 보이는지 확인한 결과
- 지시와 다르게 판단한 부분이 있으면 이유
