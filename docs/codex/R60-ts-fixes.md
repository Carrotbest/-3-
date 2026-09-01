# R60 — TS 화면 후속 수정(데이터 표시·목록 컬럼·덱 확장)

## 배경(중요)
`src/data/ts-seed.ts`(68건, 실 25/26 데이터)는 **정상**이다. 그러나 화면에는 옛 데모/구버전 TS가 보인다.
원인: 부팅 시 (1) IndexedDB 캐시의 옛 `ts`, (2) Firestore 스냅샷(`applySnapshot`)이 `ts`를 seed 위에 덮어쓴다.
현재 TS 저장(`saveTsRecords`)은 localStorage만 쓰고 Firestore push는 하지 않는다 → **TS는 사실상 로컬 관리**.
따라서 이번 개편은 "로컬 우선 + seed 강제 재시딩"으로 정리한다. **Firestore 쓰기는 하지 않는다.**

대상: `src/routes/TS.tsx`, `src/components/cards/MaterialDeck.tsx`, `src/data/firestore-sync.ts`,
`src/store/useAppStore.ts`, `src/App.tsx`. `src/data/ts-seed.ts`는 **수정 금지**(이미 `TS_SEED_VERSION` export 포함).

---

## 항목 A — seed가 화면에 확실히 뜨도록(재시딩 + 동기화 제외)

### A-1. Firestore 스냅샷이 `ts`를 덮어쓰지 않게 제외
**`src/data/firestore-sync.ts` `applySnapshot`**
- `metas.forEach((n, key) => { ... })` 안에서 `ts` 키는 store/로컬에 적용하지 않는다.
  ```ts
  const SKIP_SYNC_KEYS = new Set<string>(["ts"]) // TS는 로컬(localStorage)+seed로 관리, 아직 팀 공유 대상 아님
  metas.forEach((n, key) => {
    if (!CACHE_KEY_SET.has(key)) return
    if (SKIP_SYNC_KEYS.has(key)) return
    ...
  })
  ```
- 주석으로 이유 남길 것. (pushCache/CACHE_KEYS 자체는 건드리지 않는다.)

### A-2. 버전 게이트 재시딩 액션
**`src/store/useAppStore.ts`**
- import: `import { tsSeed, TS_SEED_VERSION } from "@/data/ts-seed"` (기존 `tsSeed` import 있으면 합치기).
- 상수: `const TS_SEED_VERSION_KEY = "fabric.ts.seedVersion"`.
- 액션 추가:
  ```ts
  /** seed 버전이 바뀌면 로컬 TS(localStorage+IndexedDB 캐시)를 seed로 1회 강제 교체한다. */
  export async function ensureTsSeed(): Promise<void> {
    let applied: string | null = null
    try { applied = window.localStorage.getItem(TS_SEED_VERSION_KEY) } catch { /* noop */ }
    if (applied === TS_SEED_VERSION) return
    const seed = tsSeed()
    saveTsRecords(seed)                 // store + localStorage(fabric.ts)
    try { await saveCacheLocal("ts", seed) } catch { /* noop */ }  // IndexedDB 캐시도 seed로 (Firestore push 아님)
    try { window.localStorage.setItem(TS_SEED_VERSION_KEY, TS_SEED_VERSION) } catch { /* noop */ }
  }
  ```
  - `saveCacheLocal`은 `@/data/cache`에서 import(로컬 전용, Firestore push 없음). `saveCache`(push 트리거) 쓰지 말 것.

### A-3. 부팅 시 재시딩 호출
**`src/App.tsx`** 부팅 effect(현재 `loadAllCache`→`setAppState(cached)` 블록)
- 캐시/임베디드 적용이 끝난 **직후** `await ensureTsSeed()`를 호출한다. (스냅샷 구독 시작과 무관하게 로컬 seed가 최종 반영되도록.)
- 기존 R59에서 넣은 "빈 `cached.ts` 삭제" 가드는 유지해도 무방(ensureTsSeed가 최종 교체).
- import에 `ensureTsSeed` 추가.

> 결과: 다음 로드 때 로컬 TS가 seed 68건으로 교체되고, Firestore 옛 `ts`는 무시된다. 이후 웹에서 추가/수정하면 localStorage에 누적되어 유지된다(버전 동일하므로 재시딩 안 함).

---

## 항목 B — 신규 등록 카드: 설명 주석 삭제 (사용자 항목 1)
**`src/routes/TS.tsx`** "신규 등록" 카드 `CardHeader`
- `CardDescription`의 "엑셀 내용을 여기에 하나씩 입력하세요. 필수 4개 항목과 필요한 처리 내용을 덧붙일 수 있습니다." **문구(설명) 삭제**. `CardTitle`("신규 등록")은 유지. (CardDescription 요소 자체 제거.)

---

## 항목 C — TS 목록 컬럼 재정의 (사용자 항목 3)
**`src/routes/TS.tsx`** `columns`
- 컬럼을 **정확히 이 순서/구성**으로: `# T/S / Date / Subject / Analysis / Causes / Action / Result / Advisor / CO`.
- **상태 열은 제거**(사용자가 명시한 목록에 없음). 상태값 자체는 스텝퍼 필터·재시딩에 계속 사용되므로 데이터/타입은 유지.
  ```ts
  const columns: DataTableColumn<TsRecord>[] = [
    { id: "id", header: "# T/S", accessor: (r) => r.id },
    { id: "receivedAt", header: "Date", accessor: (r) => r.receivedAt, cell: (r) => fmtDate(r.receivedAt) },
    { id: "subject", header: "Subject", accessor: (r) => r.subject, cell: (r) => <span className="block max-w-[22rem] truncate">{r.subject}</span> },
    { id: "analysis", header: "Analysis", accessor: (r) => r.analysis, cell: (r) => <span className="block max-w-[16rem] truncate">{r.analysis || "—"}</span> },
    { id: "causes", header: "Causes", accessor: (r) => r.causes, cell: (r) => <span className="block max-w-[16rem] truncate">{r.causes || "—"}</span> },
    { id: "action", header: "Action", accessor: (r) => r.action, cell: (r) => <span className="block max-w-[16rem] truncate">{r.action || "—"}</span> },
    { id: "result", header: "Result", accessor: (r) => r.result, cell: (r) => <span className="block max-w-[16rem] truncate">{r.result || "—"}</span> },
    { id: "advisor", header: "Advisor", accessor: (r) => r.advisor, cell: (r) => r.advisor || "—" },
    { id: "productionSite", header: "CO", accessor: (r) => r.productionSite, cell: (r) => r.productionSite || "—" },
  ]
  ```
- `StatusBadge` import가 목록에서만 쓰였다면 미사용 정리(단 상세 팝업 `TsDetailDialog`에서 계속 쓰면 유지).
- 페이지 20건, 검색 툴바는 유지(R59 결과).

---

## 항목 D — 상세 팝업: 빈 필드 숨겨 공통 양식 (사용자 항목 4)
**`src/routes/TS.tsx` `TsDetailDialog` / `DetailRows`**
- 현재 `DetailRows`는 빈 값도 "—"로 모두 출력해, 2025 레코드(From/Attn/Inquiry 없음)는 빈칸투성이로 보인다.
- **값이 있는 행만** 출력하도록 `DetailRows`가 빈 값 행을 걸러낸다:
  ```tsx
  function DetailRows({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
    const filled = rows.filter(([, value]) => Boolean(value && value.trim()))
    if (!filled.length) return null
    return ( <dl ...>{filled.map(([label, value]) => ( ...value... ))}</dl> )
  }
  ```
- `TsDetailDialog`의 세 섹션(의뢰 주체 / Trouble shooting / 상태·기타)에서 해당 섹션의 `DetailRows`가 `null`이면 섹션 제목(`<h3>`)도 렌더하지 않는다(빈 섹션 숨김). 상태는 헤더 배지로 이미 보이므로 "상태·기타"는 생산처/발주량만 있고 비면 섹션 생략.
- 결과: 2025 레코드도 채워진 필드(Analysis/Causes/Action/Result/담당/유관부서/생산처)만 깔끔히 보인다.

---

## 항목 E — 덱: 7장으로 더 벌리기 (사용자 항목 5)
**`src/components/cards/MaterialDeck.tsx` `cardTransform`**
- 현재 TS 덱은 `visibleCards={7}`인데도 5장 정도만 보이고 간격이 좁다. `deepPerspective`일 때 **spread를 넓힌다**.
  - `cardTransform(... deepPerspective)`에서 `const spread = isHomeDeck ? 1 : (deepPerspective ? 0.95 : MATERIAL_DECK_SPREAD)` (기존 `MATERIAL_DECK_SPREAD=0.65`).
  - 필요 시 `edgeTravel` 계산의 카드 최소 폭 계수도 소폭 상향(예 `cardWidth * 0.72` → `deepPerspective ? cardWidth * 0.9 : cardWidth * 0.72`)해 7장이 좌우로 충분히 퍼지게 한다.
- 목표: 활성 카드 기준 좌우 각각 3장(총 7장)이 눈에 보이도록 확실히 벌어질 것. Home 덱(기본, deepPerspective 미전달)은 현행 유지.

---

## 항목 F — 덱 상세: "카드 자체가 아래로 늘어나는" 확장으로 교체 (사용자 항목 6)
**`src/components/cards/MaterialDeck.tsx`**
현재 `expandInline`은 **덱 하단에 별도 분할 패널**을 그린다(스크린샷). 이를 **카드 자체가 아래로 길어지는** 방식으로 바꾼다. 요구: 컬럼(덱 섹션) 구역 높이는 키우지 말고, 활성 카드만 아래로 늘어나 상세를 보여준다(오버레이).

구현:
1. 기존 "하단 분할 패널" 블록(현재 `{expandInline ? (<div ... grid-rows ...>...</div>) : null}`, 대략 529~560행) **삭제**.
2. 덱 최상위 `return`을 **`relative` 래퍼로 한 겹 감싼다**(overflow-hidden 루트가 오버레이를 자르지 않도록). 즉:
   ```tsx
   return (
     <div className="relative">
       <div ref={rootRef} ... className="... overflow-hidden ...">{/* 기존 덱 내용 */}</div>
       {expandInline && expandedItem ? (
         <div
           className="absolute left-1/2 top-[7rem] z-50 w-[clamp(230px,25%,340px)] -translate-x-1/2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_1.5rem_3rem_-0.5rem_rgba(16,24,64,0.35)] transition-[max-height,opacity] duration-300 ease-out motion-reduce:transition-none"
         >
           {/* 확장 카드: 날짜 + 제목 + 상세(detail) + 닫기 */}
           <div className="flex items-start justify-between gap-2">
             <div className="min-w-0">
               <p className="text-xs text-[var(--muted-foreground)]">{expandedItem.date ? fmtDateFull(expandedItem.date) : "날짜 미등록"}</p>
               <strong className="mt-1 block text-base leading-6 text-[var(--foreground)]">{expandedItem.title}</strong>
             </div>
             <Button type="button" variant="ghost" size="icon" aria-label="상세 접기" onClick={() => setExpandedItemId(null)}><X aria-hidden="true" /></Button>
           </div>
           <div className="mt-3 max-h-[22rem] overflow-y-auto">
             {expandedItem.detail?.length ? (
               <dl className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
                 {expandedItem.detail.map((row) => (
                   <div key={row.label} className="grid gap-1 border-b border-[var(--border)] p-3 last:border-b-0">
                     <dt className="text-[11px] font-semibold text-[var(--muted-foreground)]">{row.label}</dt>
                     <dd className="whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{row.value}</dd>
                   </div>
                 ))}
               </dl>
             ) : <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">{expandedItem.summary || "상세 내용이 등록되지 않았습니다."}</p>}
           </div>
         </div>
       ) : null}
     </div>
   )
   ```
   - 핵심: 오버레이는 **활성 카드와 같은 위치·같은 폭**(`left-1/2 -translate-x-1/2`, `w-[clamp(230px,25%,340px)]`, `top-[7rem]`)에서 **아래로만 길어진다**. 덱 섹션(래퍼)의 레이아웃 높이는 커지지 않는다(absolute). 하단의 페이저와 겹쳐도 무방(z-50).
   - `top` 값은 회전 카드 영역 시작(현재 카드 컨테이너 `top-[6.5rem]`, 카드 `top-2`)과 맞춰 활성 카드에서 자연스럽게 이어지도록 미세조정(대략 `top-[7rem]`).
   - "카드가 늘어나는" 느낌을 위해 열릴 때 `max-height` 트랜지션(0→22rem 등) 또는 상단에서 아래로 grow 애니메이션. `prefers-reduced-motion`이면 즉시.
3. 활성 카드 클릭 동작(`openItem`)은 그대로 `expandInline`이면 `expandedItemId` 토글. (팝업 `onOpen` 호출 안 함.)
4. `MaterialDetailSheet`는 `expandInline`일 때 렌더하지 않음(R59 유지).

> 시각 목표: 활성 카드를 누르면 그 카드 자리에서 카드가 아래로 길어지며 상세가 나타나고, 덱 섹션 자체의 높이/구역은 변하지 않는다.

---

## 검증
- `npm run build`(tsc + vite) 통과, 미사용 import 정리.
- (로컬 재시딩) 앱 재로드 시 TS 목록/덱에 **실 25/26 데이터**가 뜬다(데모 "신축 회복 불량" 류 사라짐). 목록 컬럼 = # T/S/Date/Subject/Analysis/Causes/Action/Result/Advisor/CO.
- 행 클릭 상세 팝업: 빈 필드 없이 채워진 항목만 표시(2025 레코드도 깔끔).
- 신규 등록 카드 설명 문구 없음.
- 덱 7장이 좌우로 확실히 벌어져 보임. 활성 카드 클릭 시 **하단 분할 패널이 아니라** 카드가 아래로 길어지며 상세 표시(덱 구역 높이 불변, reduced-motion이면 즉시).
- Home 화면 TS/STUDY 덱·다른 화면 회귀 없음.

## 절대 금지
- `src/data/ts-seed.ts` 수정 금지.
- Firestore로 데이터 push하는 코드 추가 금지(로컬 재시딩만).
- CACHE_KEYS 변경 금지(스냅샷 적용에서 ts만 건너뛰기).
- git commit/reset/checkout 금지. 실데이터 값 로그/결과 파일에 남기지 말 것.
