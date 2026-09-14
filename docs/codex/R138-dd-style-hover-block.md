# R138 DD MASTER 같은 스타일 호버 블럭

상태: 미착수

## 요구 (사용자 결정 2026-09-14, D안)
- DD MASTER에서 **Style No. 칸에 마우스를 올리면** 같은 Style No.인 행 전체를 드래그로 블럭 잡은 것처럼 묶어 입체 호버 효과를 준다.
- 같은 스타일이 떨어져 있으면 **떨어진 위치마다 따로 같은 모양의 블럭**을 띄워 같은 스타일임을 알게 한다.
- 색은 스타일 타임라인(R136·R137)의 상태 톤과 맞춘다.

## 설계 판단 (바꾸지 말 것)
- **행이나 셀에 transform, box-shadow를 직접 걸지 않는다.** 고정 열(`sticky`)이 깨지고, 셀은 이미 선택 테두리를 인라인 `boxShadow`로 쓰고 있어(`selectionShadow`) 덮어쓰기가 충돌한다. **스크롤 영역 안에 떠 있는 오버레이 층에 블럭을 그린다.**
- **호버 상태를 `DevelopmentMasterSheet`의 state로 두지 않는다.** 이 컴포넌트는 64열 x 전체 행을 그리므로 마우스 이동마다 다시 그리면 느려진다. 오버레이 컴포넌트가 자기 state만 갖고, 부모는 `ref` 핸들로 `show(key)`, `hide()`만 부른다.
- 묶음 키는 `record.styleNo.trim()`이다. 빈 Style No.는 대상이 아니다(스타일 타임라인과 같은 규칙).

## 현재 구조 (`src/routes/DevelopmentMasterSheet.tsx`)
- 179행 `PINNED_COLUMNS`의 `{ id: "styleNo", ... }`.
- 2452~2458행 스크롤 컨테이너 `<div data-route-scroll-root ... className={`min-h-0 flex-1 overflow-auto ...`}>`. ref가 없다.
- 2459행 `<table data-dd-master-grid ...>`, 2460행 `thead`는 `sticky top-0 z-30`.
- 2474행 `filtered.map((record) => { ... })`, 2512행 `<tr key={rowId} data-row-id={rowId} ...>`.
- 2517~2527행 고정 열 렌더. 편집 중이면 2525행, Status면 2526행, 나머지(Style No. 포함)는 2527행 일반 `td`다. 고정 셀은 `sticky z-20`.
- `moveDragRef`(행 끌기 중 여부), `editCell`(편집 중 셀) 상태가 있다.
- 스타일 상태는 `src/data/derive.ts`의 `styleTimeline(records, today)` → `StyleTimelineRow.state`(`late | due | progress | done`)다. HOLD·DROP·REJECT만 남은 스타일은 결과에 없다.
- 타임라인 상태색(`src/components/charts/StyleTimeline.tsx` `stateClass`): late=`--destructive`, due=`--warning`, done=`--chart-2`, progress=`--chart-1`.

## 파일별 조치
| 파일 | 조치 |
|---|---|
| `src/components/data-table/StyleHoverLayer.tsx` (신규) | 아래 "오버레이" 명세 |
| `src/routes/DevelopmentMasterSheet.tsx` | 아래 "연결" 명세 |
| `CLAUDE.md` | "## DD MASTER" 절 끝에 한 줄: Style No. 칸 호버는 `StyleHoverLayer`가 스크롤 영역 위 오버레이로 같은 스타일 행 묶음(연속 구간마다 하나)을 그린다. 색은 `styleTimeline` 상태 톤이다. 호버를 부모 state로 올리지 말 것(64열 전체 재렌더). 행·셀에 transform을 걸지 말 것(sticky 깨짐). |

## 오버레이 `StyleHoverLayer`
```ts
export type StyleTone = "late" | "due" | "progress" | "done" | null
export interface StyleHoverLayerHandle { show: (key: string) => void; hide: () => void }
interface Props { containerRef: RefObject<HTMLDivElement | null>; toneOf: (key: string) => StyleTone }
export const StyleHoverLayer = forwardRef<StyleHoverLayerHandle, Props>(...)
```
1. state: `{ key: string; blocks: { top: number; height: number }[]; left: number; width: number } | null`.
2. `show(key)`: 컨테이너 안 `table[data-dd-master-grid] > tbody > tr`를 DOM 순서로 훑는다. `tr.dataset.styleKey === key`인 행을 모으고, **바로 앞 형제 행도 같은 키일 때만 같은 구간으로 잇는다.** 구간마다 첫 행 top과 마지막 행 bottom을 잰다. 좌표는 `rect.top - containerRect.top + container.scrollTop`이다. `left = container.scrollLeft`, `width = Math.min(container.clientWidth, table.scrollWidth - container.scrollLeft)`. 행이 0개면 `hide()`.
3. `hide()`: state를 null로 한다.
4. 보이는 동안 컨테이너 `scroll` 이벤트와 window `resize`에서 같은 키로 다시 잰다. `requestAnimationFrame`으로 한 프레임에 한 번만 잰다. 숨기면 리스너를 뗀다.
5. 렌더: state가 있으면 `pointer-events-none absolute left-0 top-0 z-[25]`인 블럭 div들을 그린다. thead(z-30)보다 아래, 고정 셀(z-20)보다 위다. 블럭마다 `style={{ top, height, left, width }}`.
   - 색 변수: `const tone = toneOf(key)`, `const color = tone === "late" ? "var(--destructive)" : tone === "due" ? "var(--warning)" : tone === "done" ? "var(--chart-2)" : tone === "progress" ? "var(--chart-1)" : "var(--grid-selection)"`.
   - 모양(블럭 선택 느낌 + 입체):
     - `border: 2px solid color`
     - `border-radius: 5px`
     - `background: color-mix(in oklab, color 9%, transparent)`
     - `box-shadow: inset 0 1px 0 rgba(255,255,255,.55), 0 10px 24px -10px color-mix(in oklab, color 55%, transparent), 0 3px 8px rgba(0,0,0,.14)`
   - 등장 모션: `@keyframes style-hover-lift { from { opacity: 0; transform: translateY(3px) scale(.997); } to { opacity: 1; transform: translateY(-1px) scale(1); } }`, `animation: style-hover-lift 180ms cubic-bezier(.2,.8,.2,1) both`. 오버레이 div에만 transform을 쓴다. `prefers-reduced-motion`이면 애니메이션 없이 최종 모습(`transform: none`)이다. 인라인 animation이 클래스를 이기므로, 컴포넌트 `<style>`에 `@media (prefers-reduced-motion: reduce) { .dd-style-hover { animation: none !important; } }`을 넣고 블럭에 `dd-style-hover` 클래스를 단다(R137에서 인라인 animation에 `motion-reduce:` 클래스가 안 먹었다).
   - 첫 블럭 왼쪽 위에 작은 칩 하나: `absolute -top-5 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm`, 배경은 `color`. 내용은 `{key} · {전체 행 수}행`이다. 구간이 2개 이상이면 뒤에 ` · {구간 수}곳`을 붙인다. 떨어진 블럭들에는 `{key}`만 넣은 같은 칩을 단다.

## 연결 (`DevelopmentMasterSheet.tsx`)
1. 2458행 스크롤 컨테이너에 `ref={gridScrollRef}`(`useRef<HTMLDivElement>(null)`)를 달고 className 앞에 `relative `를 더한다.
2. 컨테이너 안, `</table>` 바로 뒤에 `<StyleHoverLayer ref={styleHoverRef} containerRef={gridScrollRef} toneOf={styleToneOf} />`를 둔다.
3. `const styleToneByKey = useMemo(() => new Map(styleTimeline(records, new Date()).map((row) => [row.styleNo, row.state])), [records])`. `const styleToneOf = useCallback((key: string) => styleToneByKey.get(key) ?? null, [styleToneByKey])`.
4. 2512행 `<tr>`에 `data-style-key={record.styleNo.trim() || undefined}`를 더한다.
5. 2527행 일반 고정 `td` 중 `column.id === "styleNo"`일 때만 핸들러를 더한다.
   - `onMouseEnter`: `event.buttons !== 0`이거나 `moveDragRef.current`이거나 편집 중(`editCell`)이면 무시한다. 키가 비어도 무시한다. 아니면 `hoverTimerRef`로 120ms 뒤 `styleHoverRef.current?.show(key)`를 부른다.
   - `onMouseLeave`: 타이머를 취소하고 `hide()`를 부른다.
6. 2459행 `table`의 기존 `onMouseDown` 흐름을 막지 않고, 마우스를 누르는 순간 숨긴다. tbody 행 `onMouseDown`(2514행) 처리 맨 앞에서 `styleHoverRef.current?.hide()`를 부른다.
7. `filtered`가 바뀌면 숨긴다(`useEffect(() => { styleHoverRef.current?.hide() }, [filtered])`). 언마운트 때 타이머를 정리한다.

## 하지 말 것
- 호버 key를 `DevelopmentMasterSheet`의 useState로 두지 않는다.
- 행·셀의 className, 인라인 style, `selectionShadow`, `GridCell` props를 바꾸지 않는다. `tr`에 data 속성 하나만 더한다.
- ref 콜백 안에서 setState 하지 않는다. `forwardRef`와 `useImperativeHandle`만 쓴다.
- `styleTimeline`, `StyleTimeline.tsx`를 고치지 않는다.
- 선택, 채우기, 행 끌기, 붙여넣기 로직을 바꾸지 않는다.
- R135~R137 미커밋 변경을 되돌리지 않는다.

## 검증
- `npm run build` 성공.
- `git status --short`에 이번 변경은 `DevelopmentMasterSheet.tsx`, `StyleHoverLayer.tsx`(신규), `CLAUDE.md`, 이 문서만 더해진다.
