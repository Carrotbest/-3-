# R137 스타일 타임라인 TODAY 강조, 입체 막대, 게이지 모션

상태: 미착수. R136(`StyleTimeline`)의 표현만 바꾼다. 판정 규칙과 필터는 그대로 둔다.

## 요구 (사용자)
1. TODAY 세로선을 더 확실하게 보여 준다. 네온 글로우 모션이 들어가도 된다.
2. 스타일별 가로 막대에 입체 효과를 준다. 게이지가 차오르는 모션을 부드럽게 넣는다. 점점 빨라지는 가속 효과(ease-in)를 쓴다.

## 현재 코드 (`src/components/charts/StyleTimeline.tsx`)
- 140~145행 `gridLines()`: 행마다 월 눈금선과 TODAY 선(`w-px bg-[var(--foreground)]/35`)을 그린다. 행 사이 여백 때문에 TODAY 선이 끊겨 보인다.
- 196행 머리 `TODAY` 알약.
- 200행 `max-h-[70vh] overflow-y-auto` 스크롤 영역 안에서 `visibleRows.map`으로 행을 그린다.
- 221~224행 스타일 막대 버튼: `stateClass(row.state)` 테두리·배경, 안에 `fillClass` 채움(너비 `doneCount/options.length`).
- 234행 옵션 막대 버튼.
- `src/data/derive.ts` `styleTimeline`(R136), 636행 비공개 `fiveStageIndex(record, today)`(0~4).

## 파일별 조치
| 파일 | 조치 |
|---|---|
| `src/data/derive.ts` | `StyleTimelineOption`에 `progressPct: number`를 더한다. 값은 `state === "done" ? 100 : (fiveStageIndex(record, today) + 1) * 20`이다. `StyleTimelineRow`에도 `progressPct: number`를 더한다. 값은 옵션 `progressPct` 평균을 반올림한 것이다. 그 밖의 판정은 바꾸지 않는다. |
| `src/components/charts/StyleTimeline.tsx` | 아래 "표현" 명세대로 고친다. |

## 표현
### 1. 키프레임 (컴포넌트 안 `<style>` 한 곳, `LeadTimeGantt.tsx` 56행 방식)
```css
@keyframes style-bar-reveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes style-gauge-fill { from { width: 0%; } to { width: var(--gauge); } }
@keyframes style-today-glow {
  0%, 100% { opacity: .8; box-shadow: 0 0 4px 1px color-mix(in oklab, var(--primary) 55%, transparent), 0 0 12px 3px color-mix(in oklab, var(--primary) 30%, transparent); }
  50% { opacity: 1; box-shadow: 0 0 7px 2px color-mix(in oklab, var(--primary) 80%, transparent), 0 0 22px 6px color-mix(in oklab, var(--primary) 45%, transparent); }
}
```
- 가속 곡선은 `cubic-bezier(0.32, 0, 0.67, 0)`(ease-in cubic)이다. 상수 `EASE_IN = "cubic-bezier(0.32, 0, 0.67, 0)"`로 둔다.

### 2. TODAY 선 (끊기지 않는 한 줄)
- `gridLines()`에서 TODAY 선을 뺀다. 월 눈금선은 그대로 둔다.
- 200행 스크롤 영역 안에 `relative` 래퍼 div를 하나 두고 모든 행을 그 안에 넣는다. 래퍼 안 첫 자식으로 오버레이 `absolute inset-0 z-20 pointer-events-none grid grid-cols-[14rem_minmax(0,1fr)] gap-4 px-4`를 둔다. 오른쪽 칸에 `relative` span, 그 안에 선을 둔다. 래퍼가 콘텐츠 전체 높이를 가지므로 스크롤해도 선이 끝까지 이어진다.
- 선: `absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-[var(--primary)]`, `left: todayPct%`, `animation: style-today-glow 2.4s ease-in-out infinite`, `motion-reduce:animate-none`.
- 머리 `TODAY` 알약(196행)은 배경을 `var(--primary)`, 글자를 `var(--primary-foreground)`로 하고 같은 글로우 애니메이션을 준다. 알약 아래에 머리 영역 바닥까지 같은 색 `w-0.5` 짧은 선을 이어 붙여 본문 선과 연결되게 한다.

### 3. 입체 막대 (스타일 막대, 221~224행)
- 모양: `h-7` 유지. 둥글기 `rounded-md`. 기존 `stateClass` 테두리는 유지한다.
- 입체감: 버튼에 `shadow-[inset_0_1px_0_rgba(255,255,255,0.45),inset_0_-2px_3px_rgba(0,0,0,0.10),0_2px_5px_rgba(0,0,0,0.14)]`. 위쪽 광택 오버레이로 `absolute inset-x-0 top-0 h-1/2 rounded-t-md bg-gradient-to-b from-white/40 to-transparent pointer-events-none`을 둔다(글자 아래, 채움 위).
- 게이지 채움: 기존 `fillClass` 채움을 바꾼다. 너비 기준은 `row.progressPct`(인라인 `--gauge: {progressPct}%`, `width: var(--gauge)`)다. 색은 상태별 그라데이션(`bg-gradient-to-r`, 왼쪽 상태색 35%에서 오른쪽 상태색 70%, `color-mix(in oklab, <상태색> N%, transparent)`)이다. 상태색 매핑은 `stateClass`와 같다(late=destructive, due=warning, done=chart-2, progress=chart-1). 채움 오른쪽 끝에 1px 밝은 선 `after:absolute after:right-0 after:inset-y-0 after:w-px after:bg-white/60`.
- 글자: `{styleNo} · {progressPct}%`로 바꾼다. `title`에는 기존 문구 뒤에 ` · 옵션 완료 {doneCount}/{options.length}`를 붙인다.

### 4. 모션
- 루트에서 `useInView`(`@/lib/useInView`, `{ threshold: 0.15, once: true }`)의 `ref`를 루트 div에 단다. 섹션이 화면에 들어오기 전에는 멈춰 있다가 들어오면 시작한다.
- 스타일 막대 버튼 인라인 스타일:
  - `animation: style-bar-reveal 900ms ${EASE_IN} ${delay}ms both`
  - `animationPlayState: inView ? "running" : "paused"`
  - `delay = Math.min(index, 24) * 40`
- 게이지 채움 인라인 스타일: `animation: style-gauge-fill 1100ms ${EASE_IN} ${delay + 300}ms both`, 같은 `animationPlayState`.
- 옵션 막대(234행, 펼칠 때 새로 붙는 것): `animation: style-bar-reveal 600ms ${EASE_IN} both`. 펼칠 때마다 한 번 돈다.
- 필터(담당, 카테고리, 상태, 기간)가 바뀌면 다시 돈다. 행 래퍼 div에 `key={`${owner}|${category}|${[...states].sort().join(",")}|${range}`}`를 준다.
- `prefers-reduced-motion`이면 모든 막대·게이지·글로우 애니메이션을 끈다. Tailwind `motion-reduce:[animation:none]`. 이때 최종 상태(클립 없음, 너비 `var(--gauge)`)로 보여야 한다. 키프레임 `from`에만 숨김 값을 둔 이유다.
- 흐르는 무한 애니메이션을 막대에 넣지 않는다. 행이 많아 무거워진다. 무한 애니메이션은 TODAY 선과 알약 두 곳뿐이다.

## 하지 말 것
- `styleTimeline`의 완료 판정(receivedDate), 제외 Status, Style No. 묶음, 상태 우선순위를 바꾸지 않는다.
- 필터 구성, 축 계산, 월 눈금 규칙을 바꾸지 않는다.
- `LeadTimeGantt.tsx`, `sampleLeadTimeline`은 건드리지 않는다.
- ref 콜백 안에서 setState 하지 않는다(CLAUDE.md 주의 항목). `useInView`의 ref 객체를 그대로 단다.

## 검증
- `npm run build` 성공.
- `git status --short`에 `derive.ts`, `StyleTimeline.tsx`, 이 문서만 이번 변경으로 더해진다. R135·R136 미커밋 변경은 보존한다.
