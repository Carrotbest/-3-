# R59 — TS(Technical Service) 화면 전면 개편 + 25/26 실적 seed

## 목적
TS 화면(`/ts`)을 "엑셀 업로드 병행"에서 "웹에서 직접 작성·관리"로 전환하기 위한 개편.
1. 신규 등록 폼 정리(용어 `접수`→`등록`, 버튼 중복·배치),
2. 담당 Advisor·요청자(From) 수기입력 + 기존 record 기반 자동완성,
3. TS 목록 단일화(탭 병합·상태 열·페이지 20·우측 카드 제거),
4. TS 자료 덱 개편(뱃지 제거·inquiry 하단 주석·카드 인라인 확장·7장/원근 강화),
5. 하단 자료 검색 목록 섹션 삭제,
6. 25/26 엑셀 실적 68건을 seed로 초기 로드(`src/data/ts-seed.ts` — **이미 생성 완료**).

대상 파일: `src/routes/TS.tsx`, `src/components/cards/MaterialDeck.tsx`, `src/data/sample.ts`,
`src/data/derive.ts`, `src/components/data-table/StatusBadge.tsx`, `src/store/useAppStore.ts`,
`src/App.tsx`(seed 보호 가드). **그 외 화면/컴포넌트 변경 금지.**

> 참고: `src/data/ts-seed.ts`(68건, `tsSeed(): TsRecord[]`)는 Claude가 실데이터로 생성해 둠. **이 파일은 수정하지 말 것.** 상태값은 이미 `"등록" | "처리중" | "완료"`로 들어 있음.

---

## 사전 작업 A — 상태값 `접수` → `등록` (데이터 모델)

**`src/data/sample.ts`**
- `export type TsState = "접수" | "처리중" | "완료"` → `"등록" | "처리중" | "완료"`.
- `sampleTs()` 내부의 `states = ["접수", ...]` 및 관련 로직에서 `"접수"` → `"등록"`으로 치환(데모 함수. 실제 초기값으로는 안 쓰이지만 타입 일치 위해 수정).

**`src/components/data-table/StatusBadge.tsx`**
- `NEW` 집합에 `"등록"` 추가: `const NEW = new Set(["신규", "접수", "등록", "New"])` (기존 `"접수"`도 하위호환 위해 유지).

**전역 grep**: `"접수"`가 TsState 값으로 비교/대입되는 모든 곳(`src/routes/TS.tsx` 포함)을 `"등록"`으로 바꾼다. UI 문구(카드 제목 등)는 각 항목 지시에 따름.

---

## 사전 작업 B — 25/26 seed 초기 로드 + 빈 데이터로 seed 덮어쓰기 방지

**`src/store/useAppStore.ts`**
- `import { tsSeed } from "@/data/ts-seed"` 추가.
- `createInitialAppState()`에서 `const ts: TsRecord[] = []` → `const ts: TsRecord[] = tsSeed()`.

**`src/App.tsx`** (부팅 시 캐시가 비어있으면 seed를 지우지 않도록 가드)
- 현재 부팅 로직(82~103행 근방)에서 `loadAllCache()` 결과 `cached`를 `setAppState(cached)`로 적용한다.
- **가드 추가**: `cached.ts`가 존재하지만 **빈 배열이면 삭제**해서 seed가 살아있게 한다. 임베디드/일반 두 경로 모두 적용:
  ```ts
  const cached = await loadAllCache().catch(() => ({}))
  if (Array.isArray((cached as any).ts) && (cached as any).ts.length === 0) delete (cached as any).ts
  ```
  (embedded 경로의 `next = { ...cached, ...embedded.patch }` 이전에 적용되도록 `cached` 정제 후 진행.)

**`src/routes/TS.tsx`** 부팅 effect
- 현재:
  ```ts
  useEffect(() => { const stored = loadTsRecords(); if (stored) saveTsRecords(stored) }, [])
  ```
  `loadTsRecords()`는 `[]`도 배열로 반환하므로 seed를 지울 수 있다. **비어있지 않을 때만** 덮어쓰도록:
  ```ts
  useEffect(() => { const stored = loadTsRecords(); if (stored && stored.length) saveTsRecords(stored) }, [])
  ```

> 결과: 처음 접속(로컬 저장 없음)하면 seed 68건이 목록·덱에 뜬다. 사용자가 웹에서 추가/수정하면 그 값이 localStorage에 쌓여 이후 우선한다.

---

## 사전 작업 C — 채번(nextTsId) 연도 인식

**`src/routes/TS.tsx` `nextTsId`**
- seed에는 `TS25-###`, `TS26-###`가 섞여 있다. 현재 로직은 `(\d+)$`로 접미 숫자만 최대치를 잡아 연도 구분 없이 충돌 가능.
- **현재 연도(2자리) prefix에 해당하는 id만** 대상으로 최대 번호를 구하고, 새 id는 `TS{YY}-{max+1 zero-pad 3}`로 만든다:
  ```ts
  function nextTsId(rows: readonly TsRecord[]): string {
    const yy = String(new Date().getFullYear()).slice(2)
    const prefix = `TS${yy}-`
    const max = rows.reduce((v, r) => r.id.startsWith(prefix)
      ? Math.max(v, Number(r.id.slice(prefix.length)) || 0) : v, 0)
    return `${prefix}${String(max + 1).padStart(3, "0")}`
  }
  ```

---

## 항목 1 — 신규 등록 폼: 용어·버튼 중복·배치

**`src/routes/TS.tsx`** "신규 접수" 카드(337~392행 근방)

1. 문구 `접수`→`등록`:
   - `CardTitle` `신규 접수` → `신규 등록`.
   - 토글 버튼 라벨: 열렸을 때 `접기`, 닫혔을 때 `신규 등록 입력`. **선행 `"+"` 문자 삭제**(아이콘 `<Plus/>`가 이미 +를 표시 → 중복 제거). 즉 `{formOpen ? "접기" : "신규 등록 입력"}`.
   - 하단 제출 버튼 `접수 저장` → `등록`.
2. 버튼 배치 우측→좌측:
   - **토글 버튼**: 현재 `CardHeader`가 좌측 제목 + 우측 버튼(`justify-between`) 구조다. 버튼을 **제목 왼쪽**으로 옮긴다(버튼을 헤더의 첫 자식으로, 제목 블록을 그 뒤로). 정렬은 `justify-start`, 버튼과 제목 사이 `gap`.
   - **제출 버튼**: 마지막 `<div className="flex justify-end">` → `justify-start`(좌측 정렬).
3. `initialForm()`의 `state: "접수"` → `state: "등록"`. 필수검증·기타 로직의 `"접수"` 잔재도 모두 `"등록"`.
4. `TS_STATES` 상수: `["접수", "처리중", "완료"]` → `["등록", "처리중", "완료"]`.

---

## 항목 2 — From / 담당 Advisor 수기입력 + record 기반 자동완성

**`src/routes/TS.tsx`**

- **담당 Advisor**: 현재 `<Select>`(MEMBERS 고정)를 **수기 입력(`<Input>`) + `<datalist>`**로 교체한다. 이유: 실데이터 advisor에 `박근후/진영은`처럼 복수·비MEMBERS 값 존재.
  - 입력값 자동완성 옵션 = **기존 record들의 advisor + From에 등장한 사람 + MEMBERS 이름**의 합집합(중복 제거, 공백 제거, `/`로 이어진 복수값은 분해해서 각각도 후보에 포함).
  - 필수 유지(별표·검증). 자유 텍스트 허용(복수 입력 `박근후/박향근` OK).
- **요청자 From**: 이미 `<Input>`이지만 동일한 자동완성 `<datalist>`를 연결한다(기존 record의 from·advisor 인물 목록).
- 자동완성 후보 계산은 `useMemo`로 `rows` 기반 파생:
  ```ts
  const peopleOptions = useMemo(() => {
    const set = new Set<string>()
    const push = (v?: string) => v?.split("/").map(s => s.trim()).filter(Boolean).forEach(s => set.add(s))
    rows.forEach(r => { push(r.advisor); push(r.from) })
    MEMBERS.forEach(m => set.add(m.name))
    return [...set].sort((a, b) => a.localeCompare(b, "ko-KR"))
  }, [rows])
  ```
  `<Input list="ts-people"/>` + `<datalist id="ts-people">{peopleOptions.map(...)}</datalist>` 하나를 두 입력이 공유.
- "(처리단계 카드 명칭 포함)": 상단 **처리 단계 스텝퍼**(309~335행)의 단계명·caption도 `접수`→`등록`으로 갱신(`steps` 배열의 `{ state: "등록", caption: "새 요청 확인" }`).

---

## 항목 3 — TS 목록 단일화

**`src/routes/TS.tsx`** 목록 영역(394~435행)

1. **탭 병합**: DataTable `toolbar`의 상태 Tabs(`전체/접수/처리중/완료`) **제거**. 툴바에는 **검색 입력만** 남긴다. `activeState`/`ALL` 기반 탭 필터 제거.
   - 대신 상단 **처리 단계 스텝퍼**를 목록 필터로 사용한다: 스텝 클릭 시 해당 상태로 목록을 좁히고(토글), 같은 스텝 재클릭 시 전체 해제. (스텝퍼 count 뱃지는 유지.)
   - 기존 `openStatePopup`/`selectedState`/`RecordListDialog`(439행) **제거**(목록이 상태 열로 전부 보여주므로 팝업 불필요). 미사용 import(`RecordListDialog`) 정리.
2. **컬럼 순서·내용 확정**: `TS# / Date / Subject / From / Advisor / Co(생산처) / 상태`.
   - `발주량(orderVolume)` 컬럼 **삭제**.
   - `Co` = `productionSite`(생산처). header 라벨 `Co`.
   - `상태`는 **가장 우측 마지막 열**, `<StatusBadge status={row.state} />`.
   ```ts
   const columns: DataTableColumn<TsRecord>[] = [
     { id: "id", header: "TS#", accessor: (r) => r.id },
     { id: "receivedAt", header: "Date", accessor: (r) => r.receivedAt, cell: (r) => fmtDate(r.receivedAt) },
     { id: "subject", header: "Subject", accessor: (r) => r.subject },
     { id: "from", header: "From", accessor: (r) => r.from },
     { id: "advisor", header: "Advisor", accessor: (r) => r.advisor },
     { id: "productionSite", header: "Co", accessor: (r) => r.productionSite, cell: (r) => r.productionSite || "—" },
     { id: "state", header: "상태", accessor: (r) => r.state, cell: (r) => <StatusBadge status={r.state} /> },
   ]
   ```
3. **페이지 크기 20**: `<DataTable ... pageSize={10}/>` → `pageSize={20}`.
4. **우측 카드 제거 + 목록 확장**: `aside`(395~401행, 접수/처리중/완료 `StatCard` 3개) **삭제**. 12칼럼 그리드 래퍼도 제거하고 목록 `SectionCard`를 **폭 전체(full width)**로 배치. `counts`는 스텝퍼에서 계속 사용하므로 유지.
5. `filteredRows` 계산에서 탭(activeState) 필터는 스텝퍼 선택 상태 기준으로만 적용, 검색은 그대로.

> 주의: `StatCard`, `ClipboardList/LoaderCircle/CheckCircle2` 아이콘이 목록에서 더 안 쓰이면 import 정리(스텝퍼가 아이콘을 쓰면 유지).

---

## 항목 4 — TS 자료 덱 개편

**`src/components/cards/MaterialDeck.tsx`** — 아래 동작은 **prop으로 게이팅**해 TS 페이지에서만 적용한다(Home의 TS/STUDY 덱은 현행 유지).

`MaterialDeck` props 확장(모두 옵셔널, 기본값은 현행 유지):
```ts
{ items, emptyMessage, onOpen, onAdd,
  visibleCards?: number,     // 기본 MATERIAL_DECK_VISIBLE_CARDS(9)
  hideBadges?: boolean,      // 상단 kind/source 뱃지 숨김
  expandInline?: boolean,    // 카드 선택 시 팝업 대신 인라인 확장
  deepPerspective?: boolean, // 원근 강화
}
```

**4-공통. 상단 뱃지 제거(주제만)**: `hideBadges`면 상단 헤더의 `<Badge kind>` + `<SourceBadge>` 줄(434~438행)을 렌더하지 않는다. 제목(주제)만 노출.

**4-1. 카드 표시: 날짜+주제 메인, inquiry 2줄 하단 주석**
- 회전 카드(454~480행) 레이아웃 변경(TS일 때):
  - 상단: 날짜(`fmtDateFull(item.date)`) + 제목(`item.title`)을 메인으로.
  - 하단: `item.summary`(= inquiry, 아래 derive 변경 참조)를 **2줄(`line-clamp-2`) 주석**으로.
- **`src/data/derive.ts` `tsMaterials`**: 카드 요약을 원인(causes) 대신 **inquiry** 기준으로:
  - `summary: materialSummary(record.inquiry || record.analysis || record.causes)` (2025분은 inquiry가 없어 analysis/causes로 폴백).
  - `detail` 배열은 그대로 유지(확장 카드에서 사용).

**4-2. 카드 선택 시 인라인 확장(팝업 대신)**
- `expandInline`이면, **활성 카드 클릭 시 `onOpen` 호출 대신** 그 카드를 **인라인으로 확장**한다.
  - 확장 카드는 **아래로 길어지며**(높이 증가) `item.detail`(요청자/담당/의뢰 내용/현황 분석/원인/해결 방안/결과/생산처 등)을 스크롤 가능한 상세로 표시.
  - 다시 클릭하거나 우상단 닫기(X)로 접힘. 다른 카드로 이동하면 확장 해제.
  - 애니메이션: 높이/opacity 트랜지션으로 "하단으로 길어지는" 모션. `prefers-reduced-motion`이면 즉시.
  - 구현 자율: 코버플로우가 카드 절대배치+고정높이라 카드 자체 리사이즈가 어렵다. **활성 카드 위치에서 아래로 펼쳐지는 오버레이 패널**(덱 컨테이너 기준 anchor, z-index 상향, 덱 하단 여백 확보)로 구현해도 됨 — 시각적으로 "그 카드가 커지며 상세가 나오는" 느낌이면 허용. 코버플로우 회전/자동스크롤 로직(`useCoverflowMotion`)은 깨지 말 것.
  - TS 페이지에서는 확장으로 상세를 보므로 `MaterialDetailSheet`(팝업)를 열지 않아도 된다. (단 `expandInline`이 아닌 기존 사용처는 팝업 유지.)

**4-3. 7장 + 원근 강화**
- TS 덱은 `visibleCards={7}`로 렌더 → `data-coverflow-visible={visibleCards ?? MATERIAL_DECK_VISIBLE_CARDS}` 로 반영(현재 하드코딩 9를 prop으로).
- `deepPerspective`면 스테이지 `[perspective:720px]`(432행)를 **더 강하게**(예 `[perspective:560px]`) + 깊이 스텝(`MATERIAL_DECK_DEPTH_STEP` 사용부)을 약 20% 키운다. 과하지 않게(원근감 "조금만" 더). `cardTransform`이 `visibleCards`를 이미 받으므로 7장 기준 자연 배치됨.

**`src/routes/TS.tsx`의 덱 호출부**(301행 `MaterialDeckSection`)
- `MaterialDeckSection`은 내부에서 `MaterialDeck`을 렌더한다. TS용 옵션을 넘기기 위해 **`MaterialDeckSection`에 위 prop들을 통과(pass-through)** 시키거나, TS 페이지에서 `MaterialDeck`을 직접 렌더하도록 바꾼다(제목/설명 카드 래핑은 유지). 택1하되 Home 사용처에는 새 옵션을 넘기지 않아 현행 유지.
- 덱 설명 문구는 유지하되 "최신 6건" 등 수치 문구는 실제와 무관하니 자연스럽게(예 "사고사례·Trouble shooting 자료").

---

## 항목 5 — 하단 자료 검색 목록 섹션 삭제

**`src/routes/TS.tsx`**
- `<MaterialSearchSection kind="TS" ... />`(437행) **삭제**. 미사용이 되면 `MaterialSearchSection` import도 제거(`MaterialDeckSection`은 계속 사용).

---

## 검증
- `npm run build`(tsc + vite) 통과, 미사용 import/깨진 참조 없음.
- `/ts` 최초 진입(로컬 저장 없는 상태) 시 목록에 **68건**이 뜨고, 각 행 우측 끝에 상태(등록/처리중/완료) 뱃지. 컬럼 = TS#/Date/Subject/From/Advisor/Co/상태. 페이지당 20건.
- 우측 접수/처리중/완료 StatCard 사라지고 목록이 폭 전체.
- 상단 상태 탭 없음. 처리 단계 스텝퍼 클릭 시 목록 필터(토글).
- 신규 등록 카드: 제목 "신규 등록", 토글 버튼 "신규 등록 입력"(+중복 없음)·좌측, 제출 버튼 "등록"·좌측.
- Advisor·From 수기입력 + 자동완성(기존 인물 목록) 동작. Advisor 복수(`박근후/박향근`) 입력 가능.
- TS 자료 덱: 상단 TS/TS엑셀 뱃지 없음(주제만), 카드에 날짜+주제 메인·inquiry 2줄 주석, 7장 노출·원근 강화, 활성 카드 클릭 시 팝업 대신 아래로 확장되어 상세 표시(reduced-motion이면 즉시).
- 하단 자료 검색 목록 섹션 없음.
- Home 화면의 TS/STUDY 덱은 회귀 없이 현행 유지(뱃지·5/9장·팝업 그대로).

## 절대 금지
- `src/data/ts-seed.ts` 수정 금지(실데이터 정제본).
- Home·Development·Portfolio 등 TS 외 화면, DataTable/Dialog/Sheet 공용 컴포넌트 내부 로직 변경 금지(MaterialDeck는 prop 추가만, 기본 동작 불변).
- git commit/reset/checkout 금지. **실데이터 값을 로그·문서·결과 파일에 남기지 말 것.**
