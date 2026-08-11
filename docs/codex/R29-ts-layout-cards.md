# 작업지시 R29 — TS 화면 레이아웃 재배치 · 데이터 초기화 · 자료검색 카드/버튼 · 신규 섹션 강조

작성: Claude (기획·검토) / 구현: Codex / 최종 검토: Claude
대상: `src/routes/TS.tsx`, `src/components/cards/MaterialDeck.tsx`(MaterialSearchSection 카드), `src/store/useAppStore.ts`, `src/data/sample.ts`

## 절대 건드리지 말 것
- HOME 상단·DEVELOPMENT·RDDA·STUDY 화면 회귀 금지. (단 MaterialSearchSection은 STUDY에도 쓰이므로 카드 스타일 변경은 STUDY 검색에도 동일 적용됨 — 그건 허용.)
- R28에서 만든 TS 신규 접수 폼(필드 구성)은 유지. 배치·강조만 바꾼다.
- git commit / reset / checkout 금지. 실제 데이터 값을 로그·문서에 남기지 마라.

---

## 1) 섹션 순서 재배치 (`TS.tsx`)

현재 순서: PageHeader → **자료 덱**(MaterialDeckSection) → **자료 검색**(MaterialSearchSection) → 처리 단계 → 신규 접수 → KPI 3장 → TS 목록(DataTable).

**목표 순서**(사용자 지시: 처리단계·신규접수·KPI·TS목록을 자료덱 바로 아래로 올리고, 자료 검색은 맨 하단으로 내림):
1. PageHeader
2. **TS 자료 덱** (MaterialDeckSection) — 그대로 최상단
3. **처리 단계** (step selector)
4. **신규 접수** (폼)
5. **KPI 3장** (접수/처리중/완료)
6. **TS 목록** (DataTable)
7. **자료 검색** (MaterialSearchSection) — 맨 아래로 이동

→ 즉 `MaterialSearchSection` 을 TS 목록 뒤로 옮기기만 하면 된다. 나머지 섹션 상대 순서는 유지.

## 2) 기존 TS 데이터 초기화 (사용자가 하나씩 입력할 예정)

- `src/data/sample.ts`의 TS 데모(`sampleTs`, 16건)를 **더 이상 초기값으로 쓰지 않는다.** `useAppStore.ts`에서 `const ts = sampleTs()` → `const ts: TsRecord[] = []`. (sampleTs 함수 자체는 남겨도 되나 호출 제거.)
- `ts`는 IndexedDB 캐시 키라서 이전에 업로드/입력된 데이터가 남아 있다. 사용자가 **한 번에 비울 수 있도록** TS 목록 헤더에 **"전체 삭제" 버튼**을 추가한다:
  - 클릭 시 확인 절차(간단한 confirm 또는 인라인 재확인) 후 모든 TS 레코드 삭제(`setAppState({ ts: [] })` → 캐시도 비워짐).
  - 파괴적 동작이므로 버튼은 `variant="outline"` 정도로 눈에 띄되 위험색(destructive) 텍스트, 확인 없이 즉시 삭제 금지.
- 초기 상태(데이터 0건)에서 덱/목록/검색이 빈 안내로 정상 표시되는지 확인(기존 empty state 유지).

## 3) 자료 검색 카드 — 한 줄에 4개 (`MaterialSearchSection`)

- 카드 그리드 `lg:grid-cols-2` → **반응형 4열**: `grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`.
- 카드 크기를 그에 맞게 축소(패딩·폰트 약간 줄여 4열에 균형 있게). 제목 `line-clamp-2`, 요약 `line-clamp-2` 유지.

## 4) 자료 검색 카드 — 배지 제거 + 상세 버튼 강조

현재 카드 액션: `상세`(outline sm) + (링크 있으면) SharePoint. 헤더에 `SourceBadge`("TS 엑셀").

- **`SourceBadge` 제거**(카드에서 "TS 엑셀"/"STUDY 엑셀" 배지 삭제).
- 액션 영역: **`상세` 버튼만** 두되 **눈에 띄는 색·큰 크기**로. `variant="default"`(또는 accent), `size="default"` 이상, 카드 하단 **가로 꽉 차게**(`w-full`) 배치해 클릭 유도.
  - TS는 링크가 없으므로 SharePoint 버튼은 어차피 안 나온다. 링크가 있는 kind(STUDY 등)에서는 `상세`(강조) + `SharePoint에서 열기`(보조 outline) 순서로.

## 5) 신규 접수 섹션·버튼 강조 (`TS.tsx`)

핵심 목적: **누가 봐도 여기 눌러서 입력하는 곳**임을 알게.

- **신규 접수 Card**를 강조: accent 테두리/링(`ring-1 ring-[var(--ring)]` 또는 `border-[var(--primary)]`), 옅은 배경 틴트(`bg-[var(--accent)]/40` 수준), 살짝 강한 그림자. 과하지 않게 톤앤매너 유지.
- **"+ 신규 접수" 토글 버튼**을 CTA로: `variant="default"`(primary 채움), 크기 키우고(`size` 확대 또는 `h`·`px` 확대), `Plus` 아이콘 유지, 라벨 예: `+ 신규 접수 입력`. 접힌 상태에서 특히 눈에 띄게. hover 시 미세한 확대/그림자.
- 폼이 접혀 있을 때 섹션에 한 줄 유도 문구가 이미 있음(유지). 필요하면 "엑셀 내용을 여기에 하나씩 입력하세요" 정도로 명확화.
- reduced-motion 대응.

## 검증
- `npm run build` 통과.
- TS 화면 순서: 자료덱 → 처리단계 → 신규접수 → KPI → TS목록 → 자료검색.
- "전체 삭제"로 TS 레코드가 0이 되고, 덱/목록/검색이 빈 상태로 정상.
- 자료 검색 카드가 넓은 화면에서 **한 줄 4개**, 카드에 "TS 엑셀" 배지 없음, **상세 버튼이 크고 컬러**로 강조.
- 신규 접수 섹션·버튼이 확연히 강조되어 입력 유도가 명확.
- HOME/DEVELOPMENT/STUDY 회귀 없음, 콘솔 에러 없음.

## 완료 후 보고
- 재배치한 섹션 순서
- TS 초기화 방식과 "전체 삭제" 버튼 위치
- 자료 검색 카드 그리드/버튼 변경
- 신규 섹션·버튼 강조 방식
