# R62 — TS 화면: 차트 제목·2/3 레이아웃+그래프형 처리단계·신규등록 버튼 모션

대상: `src/components/charts/TsTrendCard.tsx`, `src/routes/TS.tsx`. 그 외 파일 변경 금지.

---

## 항목 1 — 차트 제목 변경
**`src/components/charts/TsTrendCard.tsx`**
- 카드 제목 `TS 등록 추이` → **`월별 TS 현황`**. 부제("접수일 기준 월별 · 상태별 분포")는 유지.

---

## 항목 2 — 2/3 차트 + 우측 1/3 그래프형 처리단계

**`src/routes/TS.tsx`**
현재 세로로 쌓인 (A) `<TsTrendCard ts={rows} />`(327행)와 (B) "처리 단계" `Card`(335~361행)를
**한 행의 2컬럼 그리드**로 합친다. 좌측 2/3 = 차트, 우측 1/3 = 처리 단계(그래프 포함).

- 두 블록(A, B)을 제거하고 그 자리에 아래 배치:
  ```tsx
  <div className="grid gap-4 xl:grid-cols-3">
    <div className="min-w-0 xl:col-span-2"><TsTrendCard ts={rows} /></div>
    <aside className="xl:col-span-1"><TsStagePanel counts={counts} activeState={activeState} onSelect={(s) => setActiveState((current) => current === s ? null : s)} /></aside>
  </div>
  ```
- `actionNotice` 블록(329~333)은 이 그리드 **위**로 이동(또는 그대로 위치 유지하되 그리드 바깥). 순서: PageHeader → 덱 → actionNotice → (2컬럼 그리드) → 신규 등록 → 목록.

### `TsStagePanel` (TS.tsx 내부 컴포넌트 신설) — 그래프 포함 처리단계
- 세로 카드. 구성: 제목("처리 단계") + 부제("단계를 선택하면 목록이 좁혀집니다") → **도넛 그래프**(등록/처리중/완료 비율) → 아래 **3개 단계 버튼(세로 스택)**.
- 색은 TS 상태 칩과 동일 톤: 등록 `#0ea5e9`(sky-500), 처리중 `#f59e0b`(amber-500), 완료 `#10b981`(emerald-500).
- **도넛**: recharts `PieChart`+`Pie`(innerRadius로 도넛), 데이터 `[{name:"등록",value:counts.received,fill:"#0ea5e9"},{name:"처리중",value:counts.processing,fill:"#f59e0b"},{name:"완료",value:counts.done,fill:"#10b981"}]`, `dataKey="value"`, `startAngle={90} endAngle={-270}`, `paddingAngle={2}`, `stroke="var(--card)"`. 높이 약 `h-44`. 값이 모두 0이면 회색 원 하나로 폴백.
  - 도넛 중앙에 총합 표시: 차트를 `relative` 컨테이너로 감싸고 절대배치 `<div>`로 `{counts.received+counts.processing+counts.done}`건 + "전체" 라벨.
  - recharts import는 TS.tsx 상단에 추가(`PieChart, Pie, Cell, ResponsiveContainer` 또는 Pie에 data.fill 사용 시 Cell 불필요).
- **단계 버튼(세로)**: 기존 `steps`(등록/처리중/완료 + caption + count) 데이터를 재사용해 세로 스택으로. 각 버튼:
  - 클릭 시 `onSelect(step.state)`(activeState 토글) — 기존 필터 동작 유지.
  - 선택되면 강조(현재와 동일하게 primary 톤), 미선택은 카드 톤. 좌측에 상태색 닷(등록 sky/처리중 amber/완료 emerald), 라벨+caption, 우측 count 뱃지.
  - `aria-pressed`, focus-ring 유지.
- 기존 가로 스텝퍼(ol grid-cols-3)는 제거하고 이 세로 패널로 대체. `steps`/`counts`/`activeState`/`setActiveState`는 계속 사용.

> 반응형: `xl` 미만에서는 그리드가 1열로 떨어져 차트 위, 처리단계 아래로 자연 배치되면 됨(`xl:grid-cols-3`).

---

## 항목 3 — 신규 등록 버튼 모션 강화
**`src/routes/TS.tsx`** "신규 등록" 토글 버튼(366~368행)을 세련된 그라디언트 + 호버/클릭 모션으로 교체:
```tsx
<Button
  type="button"
  size="lg"
  className="group relative shrink-0 overflow-hidden rounded-full border-0 bg-[linear-gradient(110deg,#5B6CFF,#8B5CF6_55%,#EC4899)] bg-[length:200%_100%] text-white shadow-[0_8px_24px_-8px_rgba(91,108,255,0.7)] transition-[transform,box-shadow,background-position] duration-300 hover:-translate-y-0.5 hover:bg-[position:100%_0] hover:shadow-[0_14px_32px_-8px_rgba(139,92,246,0.85)] active:translate-y-0 active:scale-[0.96] focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transform-none motion-reduce:transition-none"
  aria-expanded={formOpen}
  aria-controls="ts-intake-form"
  onClick={() => setFormOpen((open) => !open)}
>
  <span aria-hidden="true" className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)] transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden" />
  <span className="relative z-10 inline-flex items-center gap-2">{formOpen ? <ChevronUp aria-hidden="true" /> : <Plus aria-hidden="true" />}{formOpen ? "접기" : "신규 등록 입력"}</span>
</Button>
```
- 효과: 그라디언트 배경이 호버 시 슬라이드(bg-position), 살짝 떠오름(-translate-y), 흰 빛 sheen이 좌→우로 스윕, 클릭 시 눌림(active:scale). `prefers-reduced-motion`이면 정적.
- 접근성: 텍스트/아이콘은 `relative z-10`로 sheen 위에.

---

## 검증
- `npm run build`(tsc + vite) 통과, 미사용 import 정리.
- `/ts`: 덱 아래에 좌 2/3 "월별 TS 현황" 차트 + 우 1/3 "처리 단계"(도넛 그래프 + 세로 단계 버튼) 2컬럼. xl 미만 1열.
- 처리 단계 도넛이 등록/처리중/완료 비율을 sky/amber/emerald로 표시, 중앙 총합. 단계 버튼 클릭 시 목록 필터(토글) 정상.
- 차트 제목 "월별 TS 현황".
- 신규 등록 버튼: 호버 시 그라디언트 슬라이드+상승+sheen 스윕, 클릭 시 눌림 모션.
- 홈 등 다른 화면 회귀 없음.

## 절대 금지
- `src/data/ts-seed.ts` 수정 금지. git commit/reset/checkout 금지. 실데이터 값 로그/결과에 남기지 말 것.
