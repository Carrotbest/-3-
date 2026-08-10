# 작업지시 R24 — HOME 하단 3개 섹션 재구성 (자료 덱 · 트렌드 coverflow · 핀보드)

작성: Claude (기획·검토) / 구현: Codex / 최종 검토: Claude
대상: `src/routes/Home.tsx`의 `Work report` / `Trend issue` / `Quick access` + `/ts`, `/study` 페이지

## 배경 — 확정된 사용자 결정

1. **자료 저장소**: 팀즈 폴더 = SharePoint(`hansoll365.sharepoint.com`)이며 이미 로컬 동기화 중이다. 브라우저 앱은 보안상 로컬 경로(`C:\...`)를 직접 못 읽으므로 **SharePoint 공유 링크**로 연결한다. 별도 서버 구매 없음.
2. **자료 등록 경로 = 둘 다 지원** (사용자 확정)
   - (A) 엑셀 `자료목록.xlsx` 업로드
   - (B) 앱 화면에서 직접 등록
3. **덱 + 검색 목록 병행** (사용자 확정) — 덱만 두면 자료가 쌓였을 때 못 찾는다.
4. **Quick access = 핀보드 스타일** (번호·점선 연결선 없음)

## 맡을 파일

- `src/routes/Home.tsx` — Work report / Trend issue / Quick access 섹션 교체
- `src/routes/TS.tsx`, `src/routes/Study.tsx` — 상단에 덱, 하단에 검색 목록 추가
- `src/data/schema.ts` — `MaterialItem` 타입 신설
- `src/data/xlsx-parsers.ts` — `parseMaterials()` 신설
- `src/data/upload.ts`, `src/store/useAppStore.ts`, `src/data/cache.ts` — 자료 목록 적재 경로
- (신규) `src/components/cards/MaterialDeck.tsx` — 3D 스크롤 덱
- (신규) `src/components/cards/CoverflowGallery.tsx` — 트렌드 coverflow
- (신규) `src/components/cards/PinBoard.tsx` — Quick access 핀보드
- `src/routes/Setting.tsx` — 자료목록 파일 드롭존 카드 추가

## 절대 건드리지 말 것

- DEVELOPMENT 전 화면(오버뷰·하위화면·보드·타임라인·완료 라이브러리)은 대상 아님. **회귀 금지.**
- HOME 상단(전체 개발 진행 / 완료·접수·스케줄 KPI / RDDA 등록 현황)은 그대로 둔다.
- DD·샘플대장 파서(`DEV_DEFAULT_COLUMNS`, `SAMPLE_DEFAULT_COLUMNS`, `parseSamples`) 수정 금지.
- `FIELDS` 17항목, 전역 `STAGES` 수정 금지.
- git commit / reset / checkout 금지.
- **사용자 실제 데이터 값(스타일번호·거래처명·SharePoint URL 등)을 로그·문서·커밋에 남기지 마라.** 건수만 확인.

---

## 1) 데이터 계층 — 자료(Material)

### 타입 (`schema.ts`)

```ts
export type MaterialKind = "TS" | "STUDY" | "MACRO" | "FABRIC" | "PORTFOLIO"

export interface MaterialItem {
  id: string                 // link||title 정규화 해시. 중복 판정 키
  kind: MaterialKind
  title: string
  summary?: string
  date?: string              // YYYY-MM-DD
  tags: string[]
  link?: string              // SharePoint/OneDrive 공유 링크
  owner?: string
  source: "excel" | "manual" // 출처 배지용
}
```

### (A) 엑셀 파서 `parseMaterials(file)` (`xlsx-parsers.ts`)

- 기존 파서들과 같은 방식으로 헤더를 별칭 탐색한다(`columnWith` 재사용). **인덱스 하드코딩 금지** — 이 파일은 사용자가 새로 만들 것이라 열 순서가 유동적이다.
- 헤더 별칭:
  | 필드 | 별칭 |
  |---|---|
  | kind | `구분`, `분류`, `kind`, `category` |
  | title | `제목`, `title`, `자료명` |
  | summary | `요약`, `설명`, `summary`, `description` |
  | date | `날짜`, `작성일`, `date` |
  | tags | `태그`, `tag`, `키워드` — 쉼표/슬래시/공백 구분 |
  | link | `링크`, `link`, `url`, `주소` |
  | owner | `담당`, `작성자`, `owner` |
- `kind` 정규화: `TS`/`기술지원` → `TS`, `STUDY`/`교육` → `STUDY`, `MACRO` → `MACRO`, `FABRIC` → `FABRIC`, `PORTFOLIO` → `PORTFOLIO`. 매칭 실패 행은 **건너뛰고 건수만 집계**(SETTING 진단에 "구분 불명 N건" 표기).
- 제목이 비면 건너뛴다.
- 시트는 첫 시트 또는 헤더가 발견되는 시트.

### (B) 앱 내 등록

- 각 덱 섹션과 `/ts`·`/study` 목록 상단에 `자료 추가` 버튼 → 폼(제목·구분·요약·날짜·태그·링크·담당).
- 저장: IndexedDB(`cache.ts`에 `materialsManual` 키 추가). `source: "manual"`.
- 삭제·수정 가능. 최소 삭제는 반드시 제공.
- **링크 입력 검증**: `https://` 로 시작하지 않으면 저장 거부(문구: "https:// 로 시작하는 공유 링크를 입력하세요"). `javascript:` 등 스킴 차단.

### 병합 규칙

- 표시 = 엑셀 목록 + 수동 등록 합집합. `id` 중복 시 **엑셀 우선**.
- 각 항목에 출처 배지(`엑셀` / `직접등록`)를 작게 표기.
- 헬퍼 `materialsOf(kind)` 를 `derive.ts`에 두고 정렬은 `date desc` → `title`.

### 링크 열기 규칙 (공통)

- `<a target="_blank" rel="noopener noreferrer">`.
- 링크가 없으면 "열기" 버튼을 **비활성**하고 "링크 미등록" 문구 표시. 가짜 다운로드 버튼 만들지 마라.
- 버튼 라벨은 `SharePoint에서 열기`. (앱이 파일을 직접 내려주는 게 아니므로 "다운로드"라고 쓰지 않는다.)

---

## 2) `MaterialDeck` — 3D 스크롤 카드 덱

사용자가 참고 이미지로 지정한 형태: 카드가 뒤로 겹쳐 쌓이고 중앙 카드가 활성, 하단에 `02 / 06` 카운터.

- props: `{ items: MaterialItem[]; emptyMessage: string; onOpen(item): void }`
- 최대 **6장**만 덱에 올린다(최신순). 나머지는 아래 검색 목록에서 본다.
- 배치: 활성 카드 중앙 정면, 좌우 카드는 `translateX + scale + rotateY + opacity` 감쇠로 뒤에 깔린다. CSS transform만 사용(외부 3D 라이브러리 금지).
- **조작 3종 모두 제공**: 마우스 휠 / 좌우 드래그(포인터) / 좌우 화살표 버튼 + 키보드 `←` `→`.
- **휠 가로채기 규칙(중요)**: 덱에 포인터가 올라가 있을 때만 휠을 가로채고, **양 끝(첫 장·마지막 장)에 도달하면 가로채기를 풀어 페이지가 정상 스크롤**되게 한다. 이걸 안 하면 페이지를 내리려는 사용자가 덱에 갇힌다. `wheel` 리스너는 `{ passive: false }` + 조건부 `preventDefault()`.
- 카드 클릭 → 상세 팝업(`Sheet`): 제목·구분·날짜·담당·태그·요약 + `SharePoint에서 열기` 버튼 + 출처 배지.
- `prefers-reduced-motion`: 전환 애니메이션 제거, 카드는 단순 교체.
- 접근성: 덱은 `role="group"` + `aria-roledescription="carousel"`, 활성 카드만 탭 가능, 카운터는 `aria-live="polite"`.
- 항목 0개면 `emptyMessage`와 `자료 추가` 버튼만 표시(빈 덱 그리지 마라).

---

## 3) HOME `Work report` 섹션 재구성

기존 4개 균일 카드(TS/STUDY/FABRIC/CALENDAR)를 아래로 교체한다. **섹션 제목 `Work report`와 기존 톤앤매너(카드 라운드·보더·여백)는 유지.**

레이아웃(데스크톱 기준, 반응형 필수):

```
Work report
┌───────────────────────────┬───────────────────────────┐
│ TS 관리 (3D 덱)            │ STUDY 과제 (3D 덱)         │
│ 사고사례·불량 trouble shoot │ 섬유 교육자료               │
│ [덱]  02/06   [자료 추가]   │ [덱]  01/04   [자료 추가]   │
│           전체 보기 →/ts    │           전체 보기 →/study │
├───────────────────────────┴───────────────────────────┤
│ FABRIC ANALYSIS — 분석 의뢰 보드                        │
│ [의뢰 접수 n] [분석 중 n] [완료 n]   + 분석 의뢰하기      │
├───────────────────────────────────────────────────────┤
│ CALENDAR (기존 카드 유지)                               │
└───────────────────────────────────────────────────────┘
```

### FABRIC ANALYSIS 의뢰 보드

- 데이터: 기존 `fabricAnalysis: FabricAnalysisRow[]`(`anNo`, `requestDate`, `completeDate`, `item`, `owner`).
- 3단계 분류: `completeDate` 있으면 **완료**, 없고 `requestDate` 있으면 **분석 중**, 그 외 **의뢰 접수**.
  - ※ 실제로는 대부분 2단계로 나뉜다. 0건 단계도 열은 표시하되 "해당 건 없음" 대신 옅게 `0`만 둔다.
- 각 단계에 최근 3건까지 `AN#-품목-담당` 한 줄 표기 + 단계 건수 배지.
- `분석 의뢰하기` 버튼 → `/fabric-analysis` 이동.
- 카드 클릭 → `/fabric-analysis` 이동. (별도 팝업 만들지 마라 — 이 화면은 요약이다.)
- 톤앤매너: Work report의 다른 카드와 동일한 border/radius. 3D 틸트는 쓰지 않는다(정보 밀도가 높다).

---

## 4) HOME `Trend issue` — 탭 + Coverflow

- 상단에 탭 3개: `MACRO TREND` / `FABRIC TREND` / `PORTFOLIO` (기존 `MaterialKind`의 `MACRO`/`FABRIC`/`PORTFOLIO`).
- 각 탭 안의 자료를 **coverflow**로 배치: 중앙 카드 정면·확대, 좌우로 갈수록 `rotateY` + `scale` 감쇠 + 원근.
- 조작은 `MaterialDeck`과 동일(휠·드래그·버튼·키보드), **휠 가로채기 양끝 해제 규칙 동일 적용**.
- **폴백**: 해당 탭 항목이 **3개 미만이면 coverflow를 쓰지 말고** 일반 카드 그리드로 렌더한다. (2장짜리 coverflow는 초라하다.)
- 카드 클릭 → `MaterialDeck`과 같은 상세 팝업 재사용.
- 기존 `homeTrendCards()`가 만들던 데모 카드는 **자료 목록에 해당 kind 항목이 하나도 없을 때만** 폴백으로 보여준다.

---

## 5) HOME `Quick access` — 핀보드

- 기존 `QUICK_ACCESS` 9개 항목 유지, 링크 동작 유지.
- 스타일: 각 카드 상단 중앙에 **핀(압정) 아이콘**, 카드가 살짝 기울어진 느낌.
  - 회전각은 **인덱스 기반 결정적 값**(예: `[-1.5, 1, -0.8, 1.6, -1.2, 0.7, -1.8, 1.3, -0.5]`)을 쓴다. `Math.random()` 쓰지 마라 — 리렌더마다 카드가 흔들린다.
  - hover 시 회전이 0에 가까워지며 살짝 떠오르는 정도. 과한 3D 틸트는 금지.
- **번호(01·02)와 점선 연결선은 넣지 마라.** 참고 이미지의 그 요소는 순차 절차용인데 Quick access는 순서가 없다.
- 배경은 은은한 질감 정도까지만 — 진한 코르크 텍스처는 다른 화면과 톤이 어긋난다. `--muted` 계열 + 미세한 그림자로 판 느낌만 낸다.
- 다크 모드에서도 핀·그림자가 자연스러운지 확인.

---

## 6) `/ts`, `/study` 페이지 — 덱 + 검색 목록

- 각 페이지 **상단**에 해당 kind의 `MaterialDeck`(최신 6건) 추가. 기존 섹션들은 그 아래에 유지한다.
- 그 아래 **자료 검색 목록**: 검색어(제목·태그·요약) + 태그 필터 칩 + 정렬(최신/제목). 페이지네이션 또는 20건씩.
- `/study`에는 이미 `자료 라이브러리` 섹션이 있다. **중복 UI를 만들지 말고 그 섹션을 새 검색 목록으로 대체**한다.
- `자료 추가` 버튼을 여기에도 둔다.

---

## 7) SETTING

- `파일 연결 센터`에 **자료목록 드롭존 카드** 추가(kind: `materials`). 설명: "TS·STUDY·트렌드 자료 목록 엑셀".
- 업로드 후 진단 표기: 인식 건수, kind별 건수, `구분 불명` 건수, `링크 없음` 건수.

---

## 검증

- `npm run build` (= `tsc --noEmit && vite build`) 통과.
- 덱: 휠로 넘어가는지, **첫 장에서 위로/마지막 장에서 아래로 휠 시 페이지가 스크롤되는지**(가장 중요), 드래그·버튼·키보드 동작, 카운터 갱신.
- 자료 0건 상태에서 각 섹션이 깨지지 않고 안내 문구가 나오는지.
- coverflow 2건 이하일 때 그리드로 폴백되는지.
- 링크 없는 항목의 "열기" 버튼이 비활성인지.
- HOME 상단(KPI·RDDA)과 DEVELOPMENT 전 화면 회귀 없는지.
- 콘솔 에러 없을 것.

## 완료 후 보고

- 섹션별 구현 내용
- 신설 타입·파서·컴포넌트 목록
- 휠 가로채기 해제 로직을 어떻게 구현했는지
- 자료 0건일 때 각 섹션 동작
