# R429 — 선택 셀 요약이 메모 버튼과 겹치는 것을 분리

상태: 미착수

## 증상

DD MASTER와 WAREHOUSE에서 셀을 두 칸 이상 고르면 오른쪽 아래에 `개수 / 합계 / 평균` 알약이 뜬다. 그 알약이 화면 메모 버튼(R420) 위로 겹친다. 2026-11-12 박향근 보고.

## 원인 (실측)

네 요소가 같은 모서리에 `bottom-4`로 서 있다.

| 요소 | 위치 | 크기 | z |
|---|---|---|---|
| `ScheduleReminder` | `bottom-4 right-4` | 폭 최대 22rem | 90 |
| 메모 버튼 | `bottom-4 right-4` | `size-12`(48px) | 80 |
| 메모 추가 버튼(패널 열렸을 때) | `bottom-5 right-[4.5rem]` | `h-10` | 80 |
| **선택 셀 요약** | `bottom-4 right-6` | `px-3 py-1.5 text-xs` | 75 |

메모 버튼은 오른쪽 16px에서 64px까지를 쓴다. 요약은 오른쪽 24px에서 왼쪽으로 뻗는다. **24px부터 64px까지 40px이 겹친다.** 세로는 둘 다 아래 16px에서 44px 구간이라 완전히 포갠다. 요약이 `z-[75]`라 메모 버튼 아래로 깔린다.

## 조치

**모서리 아래쪽 48px 자리는 메모 버튼에 준다. 요약을 그 위로 올린다.** 왼쪽으로 미는 안은 버렸다. 메모 패널을 열면 추가 버튼이 `right-[4.5rem]`에 서서 다시 겹치고, 그 버튼은 패널 상태라 표가 알 수 없다.

### 1. `src/routes/DevelopmentMasterSheet.tsx` 3724행

`fixed bottom-4 right-6 z-[75]` 를 `fixed bottom-20 right-6 z-[75]` 로 바꾼다. 파일 안에 이 문자열은 한 번만 나온다. 그 줄의 나머지 클래스와 내용은 건드리지 마라.

### 2. `src/routes/DevelopmentMasterSheet.tsx` 3721행

```tsx
        <div data-grid-bottom-area aria-hidden="true" className="h-28 min-w-full" />
```

`h-28` 을 `h-32` 로 바꾼다. 이 스페이서는 떠 있는 알약이 마지막 행을 가리지 않게 두는 여백이다. 알약을 80px 위로 올리면 윗변이 바닥에서 약 110px이 되어 `h-28`(112px)에 2px 차로 붙는다. `h-32`(128px)로 여유를 준다.

### 3. `src/routes/Warehouse.tsx` 2112행

`fixed bottom-4 right-6 z-[75]` 를 `fixed bottom-20 right-6 z-[75]` 로 바꾼다. 파일 안에 이 문자열은 한 번만 나온다.

### 4. `src/components/layout/ScheduleReminder.tsx` 88행 (2026-11-12 추가 지시)

일정 알림 카드도 메모 버튼과 같은 `bottom-4 right-4` 라 버튼을 통째로 덮는다. 알림이 `z-[90]` 이라 뜨는 동안 메모 버튼을 누를 수 없다. 박향근이 같이 고치라고 했다.

`fixed bottom-4 right-4 z-[90]` 를 `fixed bottom-32 right-4 z-[90]` 로 바꾼다. 파일 안에 이 문자열은 한 번만 나온다. 폭(`w-[min(22rem,calc(100vw-2rem))]`), `flex-col gap-2`, `pointer-events-none`, 카드 내용은 건드리지 마라.

**이로써 그 모서리는 아래부터 세 단이다.**

| 단 | 바닥에서 | 무엇 |
|---|---|---|
| 1 | 16 ~ 64px | 메모 버튼 (`right-4`) |
| 2 | 80 ~ 110px | 선택 셀 요약 (`right-6`) |
| 3 | 128px 위로 | 일정 알림 카드 (`right-4`) |

알림을 제일 위에 둔 것은 드물게 뜨고 여러 장이 위로 쌓이기 때문이다. 선택 요약은 표에서 거의 늘 떠 있어 모서리에 가깝게 둔다.

## 하지 말 것

- **`MemoDock.tsx` 를 건드리지 마라.** 메모 버튼은 전 화면 공통이고 박향근이 정한 자리다. 세 단의 기준점이다.
- 알림 카드의 `z-[90]` 을 내리지 마라. 겹침은 자리로 풀었다.
- `z-[75]` 를 올리지 마라. 겹침을 z로 덮는 것이 아니라 자리를 떼는 것이 이번 조치다.
- `right-6` 을 바꾸지 마라. 엑셀 상태 표시줄과 같은 오른쪽 아래 자리를 유지한다.
- `pointer-events-none` 을 빼지 마라. 알약이 아래 버튼 클릭을 막는다.
- `selectionStats` 계산, `selectionNotice`, 표 로직은 건드리지 마라. 클래스 세 군데만 고친다.

## 검증

`npm run build` 한 번만 돌린다. 화면 확인은 사용자가 한다.

고친 자리는 넷이고 전부 className 문자열이다. `git diff --stat` 가 3 파일 4 줄이면 맞다.
