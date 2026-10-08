# R321 TECHNICAL REFERENCES 재빌드 1단계 — 화면 골격과 데이터 계약

상태: **미착수.**

## 배경

`/study` 화면을 **처음부터 다시 만든다.** 기존 `src/routes/Study.tsx`(201줄)는 폐기한다. 매주 study 자료를 제출하던 업무 프로세스가 없어져 주차별 제출 현황판이 쓸모가 없어졌다. 대신 통합원단부 3팀이 공유하는 원단 자료 라이브러리가 된다.

실제 자료는 Teams(SharePoint) 폴더에 459개 파일이 있고, 파이썬 색인 스크립트가 메타데이터를 뽑아 Firestore에 넣을 예정이다. **그건 R323이다. 이 작업에서는 하지 않는다.**

이 작업의 목적은 **박향근이 로컬에서 레이아웃을 눈으로 보는 것**이다. 그래서 데모 데이터로 화면만 세운다.

## 범위

| 포함 | 제외 (다음 작업) |
|---|---|
| `ReferenceItem` 타입과 카테고리 상수 | Firestore 저장과 구독 (R322) |
| 새 `TechnicalReferences` 화면 | `firestore.rules` 수정 (R322) |
| 데모 데이터 12건 | HOME의 study 참조 절단 (R322) |
| 기존 `Study.tsx` 폐기와 라우트 교체 | 파이썬 색인 스크립트 (R323) |
| | 요약 자동 생성, 질문과 댓글, 자동 태그 |

## 하지 말 것과 그 이유

- **`src/data/schema.ts`의 `MaterialItem`과 `MaterialKind`를 재사용하거나 수정하지 마라.** 그 타입은 TS, MACRO, FABRIC, PORTFOLIO 카드가 같이 쓴다. 여기에 경로, 파일 형식, 크기, 분류 근거를 더하면 다른 화면 넷이 오염된다. **새 타입을 새 파일에 만든다.**
- **`src/components/cards/MaterialDeck.tsx`를 쓰지 마라.** 코버플로 3D 덱이다. 2026-10-08에 박향근이 "모션은 좋으나 효율이 떨어진다"고 폐기를 지시했다. 459건 탐색에 맞지 않는다.
- **`src/routes/Home.tsx`를 수정하지 마라.** HOME은 아직 `state.study`를 읽는다. 그 절단은 R322다. 지금 건드리면 이 작업의 되돌리기 범위가 커진다.
- **`src/data/derive.ts`의 `studyMaterials`, `materialsOf`를 수정하거나 지우지 마라.** HOME이 아직 쓴다.
- **`src/data/cache.ts`의 `CACHE_KEYS`에서 `study`, `studyFiles`를 지우지 마라.** 아직 데이터가 남아 있고 삭제는 R322 이후 별도 배포다.
- **Firestore를 호출하지 마라.** 이 작업에는 저장이 없다. 데모 데이터는 모듈 상수다.
- **엑셀 업로드 경로를 만들지 마라.** 2026-09-22에 폐기한 방향이다. `DataUpload`, `ingestStudyWorkbook`을 새 화면에 넣지 마라.
- **카드 월(masonry)이나 가변 개수 카드 격자를 쓰지 마라.** 박향근이 "자료의 양에 따라 빈칸이 생기는 형태는 지양한다"고 못 박았다. 카테고리 카드는 **항상 6개**이고 자료 목록은 표형 리스트다.
- **표 격자 칸 안에 `backdrop-filter`(`backdrop-blur`)와 번짐 그림자를 넣지 마라.** 2026-10-07에 REQUEST 칩에 글라스 효과를 넣었다가 표가 떨려 전량 되돌렸다.
- **`SectionCard`로 긴 목록을 감싸지 마라.** `Reveal`의 IntersectionObserver 임계값이 0.12라 카드가 뷰포트보다 길면 영영 안 보인다. 자료 리스트는 `Card`를 직접 쓴다.
- **`DialogContent`에 `relative`, `absolute`, `static`을 넘기지 마라.** tailwind-merge가 기본 `fixed`를 지워 팝업이 문서 흐름으로 떨어진다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/reference-schema.ts` | 신규. 타입과 카테고리 상수 |
| `src/data/reference-demo.ts` | 신규. 데모 데이터 12건 |
| `src/routes/TechnicalReferences.tsx` | 신규. 화면 |
| `src/routes/Study.tsx` | **삭제** |
| `src/App.tsx` | 라우트가 새 컴포넌트를 가리키게 수정 |
| `src/routes/route-config.ts` | 53행 subtitle 문구 수정 |

`Study.tsx` 삭제는 박향근이 2026-10-08에 "있는 화면을 수정하는게 아니라 아예 처음부터 다시 빌드한다"로 승인했다.

## 1. `src/data/reference-schema.ts` (신규)

```ts
export type ReferenceCategoryId =
  | "fundamentals" | "process" | "quality" | "materials" | "market" | "testing"

export interface ReferenceCategory {
  id: ReferenceCategoryId
  /** 카드에 크게 적는 영문 이름. */
  label: string
  /** 그 아래 작게 적는 한글 설명. */
  korean: string
  /** 카드 좌상단 두 자리 코드. 표시 전용이며 id와 분리한다. */
  code: string
  /** 비어 있는 것이 정상인 카테고리. 0건 대신 "자료원 연결 대기"로 적는다. */
  pending?: boolean
}

export interface ReferenceItem {
  /** 안정 식별자. R323에서 SharePoint driveItem id로 채운다. 지금은 데모 문자열. */
  id: string
  title: string
  category: ReferenceCategoryId
  /** 2차 축. 공정 단계, 자료 성격, 소재, 바이어가 섞여 들어온다. */
  tags: string[]
  /** 파일 확장자 소문자. pdf, pptx, docx, xlsx 등. */
  format: string
  /** 바이트. 화면에서는 MB로 반올림해 보인다. */
  sizeBytes: number
  /** 파일명이나 문서에서 뽑은 자료 날짜. ISO yyyy-mm-dd. 없으면 undefined. */
  documentDate?: string
  /** 원본 파일 수정일. ISO. */
  modifiedAt: string
  /** 파일명에서 뽑은 작성자 실명. 표시는 ownerDisplayName을 거친다. */
  owner?: string
  /** SharePoint 원본 링크. 없으면 버튼을 비활성한다. */
  webUrl?: string
  /** 파이썬이 뽑은 발췌. 첫 문단이나 슬라이드 제목. */
  excerpt?: string
  /** 사람이 고쳐 쓴 요약. 재색인이 덮지 않는다. */
  curatedSummary?: string
  /** AI가 채울 자리. 지금은 늘 비어 있다. */
  generatedSummary?: string
  /** 자동 분류가 확실하지 않아 사람 확인이 필요한 건. */
  needsReview?: boolean
}
```

카테고리 상수는 **이 순서 그대로** `REFERENCE_CATEGORIES` 배열로 내보낸다.

| code | id | label | korean | pending |
|---|---|---|---|---|
| 01 | `fundamentals` | FUNDAMENTALS | 기초 교육 | |
| 02 | `process` | PROCESS | 공정 관리 | |
| 03 | `quality` | QUALITY | 품질 사고 | |
| 04 | `materials` | MATERIALS | 소재 기술 | |
| 05 | `market` | MARKET | 시장 인증 | |
| 06 | `testing` | TESTING | 시험 규격 | `true` |

보조 함수도 이 파일에 둔다.

- `categoryOf(id: ReferenceCategoryId): ReferenceCategory` — 못 찾으면 `fundamentals`를 반환하지 말고 `undefined`를 허용하는 형태로 만들어도 된다. 화면에서 안전하게 처리한다.
- `formatSize(bytes: number): string` — 1MB 미만은 `412 KB`, 이상은 `1.3 MB`. 소수 한 자리.
- `displaySummaryOf(item: ReferenceItem): string` — `curatedSummary` → `generatedSummary` → `excerpt` 순으로 처음 있는 값. 전부 없으면 빈 문자열. **이 우선순위를 화면 여러 곳에 흩지 말고 이 함수 하나로 모은다.**

## 2. `src/data/reference-demo.ts` (신규)

`REFERENCE_DEMO: ReferenceItem[]` 12건. **실제 사내 파일명을 쓰지 마라. 이 저장소는 공개 저장소다.** 아래 12건을 그대로 쓴다. 전부 가상의 예시다.

| id | title | category | format | tags |
|---|---|---|---|---|
| `demo-01` | 원사 번수와 데니어 환산 기초 | fundamentals | pdf | 원사, 교육 |
| `demo-02` | 편직기 게이지와 침수의 이해 | fundamentals | pptx | 편직, 교육 |
| `demo-03` | 염색 공정 단계별 관리 기준 | process | pdf | 염색, 기준 |
| `demo-04` | 후가공 온도와 폭 관리 | process | pptx | 가공, 기준 |
| `demo-05` | 편직 침수 역산 추정 | process | docx | 편직, 기준 |
| `demo-06` | 세로줄 불량 사례와 원인 분석 | quality | pptx | 편직, 사례 |
| `demo-07` | 백색 원단 색차 발생 사례 | quality | pptx | 염색, 사례 |
| `demo-08` | 재생 폴리에스터 기술 자료 | materials | pdf | 소재, 벤더자료 |
| `demo-09` | 항균 가공제 비교 자료 | materials | pdf | 가공, 벤더자료 |
| `demo-10` | 셀룰로오스계 신소재 개요 | materials | pptx | 소재, 벤더자료 |
| `demo-11` | 면 수급 동향 보고 | market | pdf | 시장 |
| `demo-12` | 지속가능 인증 체계 정리 | market | xlsx | 인증, 기준 |

`testing` 카테고리에는 **일부러 한 건도 넣지 않는다.** 비어 있는 카드가 어떻게 보이는지 확인하는 것이 이 작업의 목적 중 하나다.

나머지 필드는 알아서 그럴듯하게 채운다. 규칙은 이렇다.
- `sizeBytes`는 100KB에서 40MB 사이로 흩는다.
- `documentDate`와 `modifiedAt`은 2025-07부터 2026-09 사이로 흩는다. 둘이 같아도 된다.
- `owner`는 `박향근`, `김지현`, `변재휘` 셋만 쓴다. **퇴사자 이름을 데모에 넣지 마라.**
- `webUrl`은 전부 `undefined`로 둔다. 실제 링크가 없으므로 비활성 상태가 어떻게 보이는지 같이 확인한다.
- `excerpt`는 2~3문장. 12건 중 3건은 `undefined`로 둬서 발췌 없는 카드를 확인한다.
- `needsReview`는 `demo-05`와 `demo-06` 둘만 `true`로 둔다.

## 3. `src/routes/TechnicalReferences.tsx` (신규)

위에서 아래로 이 순서다.

### 3-1. PageHeader

`title`은 `route-config.ts`가 넣으므로 여기서는 `PageHeader`를 쓰되 `actions`에 **아무것도 넣지 마라.** 업로드 버튼이 없다.

### 3-2. 현황 띠 (KPI 4칸)

큰 카드 넷이 아니라 **한 줄짜리 띠**다. `Card` 하나 안에 4등분한다. 값은 전부 데모 데이터에서 계산한다.

| 칸 | 값 |
|---|---|
| 전체 자료 | 전체 건수 |
| 이번 달 신규 | `modifiedAt`이 이번 달인 건수 |
| 요약 있음 | `displaySummaryOf`가 빈 문자열이 아닌 건수 |
| 분류 확인 필요 | `needsReview`가 true인 건수 |

**미답변 질문과 조회 Top은 넣지 마라.** 그 기능이 아직 없다. 숫자가 늘 0인 칸을 만들지 않는다.

### 3-3. 카테고리 카드 6개 (핵심)

**항상 6개를 그린다.** 자료가 0건이어도 카드를 그린다.

- 격자는 `grid gap-4 sm:grid-cols-2 xl:grid-cols-3`. 데스크톱 3열 2행, 태블릿 2열 3행, 모바일 1열이다.
- **모든 카드가 같은 높이다.** 격자 자식에 `h-full`을 주고 내부를 `flex flex-col`로 세워 아래 줄을 바닥에 붙인다. 내용 길이에 따라 높이가 들쭉날쭉하면 안 된다.
- 카드 한 장의 구성은 위에서부터 이렇다.
  1. 좌상단 `code`(01~06)를 작게, 그 옆에 `label`을 크게, 아래에 `korean`을 작게.
  2. 가운데에 건수. `pending`이 true이고 0건이면 숫자 대신 **`자료원 연결 대기`**라고 적는다. **`0건`이라고 쓰지 마라.** 자료가 없는 것이 아니라 아직 연결하지 않은 것이다.
  3. 아래에 그 카테고리의 최근 자료 **제목 두 줄**. `modifiedAt` 내림차순 두 건이다. 자료가 없으면 이 영역을 빈 높이로 유지한다(자리는 남기고 글자만 비운다). 이것도 높이 고정 장치다.
- 카드는 버튼이다. 누르면 아래 리스트가 그 카테고리로 걸러지고, **선택된 카드는 테두리를 `var(--chart-1)`로 강조한다.** 같은 카드를 다시 누르면 필터가 풀린다.
- 선택 상태를 URL 쿼리에 남긴다. `?category=quality` 형태다. `useSearchParams`를 쓴다. 뒤로가기와 링크 공유가 되어야 한다.

### 3-4. 검색과 태그 필터

- 검색창 하나(`src/components/ui/input.tsx`). placeholder는 `제목, 요약, 태그로 검색`이다.
- 검색 대상은 `title`, `displaySummaryOf` 결과, `tags`, `owner`다. 대소문자와 공백을 무시하고 부분 일치로 본다.
- 태그 칩은 데이터에 실제로 있는 태그만 모아 빈도 내림차순으로 보인다. 누르면 토글이고 **여러 개를 고르면 AND**다.
- 검색어와 태그 선택은 **URL에 남기지 않는다.** 다음에 열었을 때 행이 왜 안 보이는지 헷갈린다. 이 프로젝트의 기존 원칙이다(`view-prefs.ts` 주석 참조).

### 3-5. 자료 리스트

`Card`를 직접 쓴다. `SectionCard`로 감싸지 마라.

- 표형이고 밀도가 높다. 열은 제목, 카테고리, 태그, 작성자, 자료일, 형식, 크기다.
- 제목 칸에는 제목 아래에 요약 한 줄을 `line-clamp-1`로 붙인다.
- `needsReview`가 true면 제목 옆에 `확인 필요` 배지를 단다.
- 행을 누르면 우측 상세 패널이 열린다.
- 결과가 0건이면 표 자리에 안내 문장 한 줄을 보인다. 필터 때문인지 자료가 없는 것인지 구분해 적는다.
- 작성자는 `ownerDisplayName`을 거쳐 보인다. **`@/data/schema`에서 import 한다.** 퇴사자 실명을 화면에 띄우지 않기 위한 기존 규칙이고, 진영은은 `J`로 나간다. 상세 패널의 작성자도 같은 함수를 거친다.

### 3-6. 상세 패널

`src/components/ui/sheet.tsx`를 써서 우측에서 나오는 패널로 만든다.

- 제목, 카테고리 배지, 태그 칩
- 요약 (`displaySummaryOf`). 없으면 `요약이 아직 없습니다`
- 메타 표: 작성자, 자료일, 원본 수정일, 형식, 크기
- 맨 아래 `원본 열기` 버튼. `webUrl`이 없으면 **비활성**으로 두고 `원본 링크가 아직 연결되지 않았습니다`를 밑에 작게 적는다.

## 4. `src/App.tsx`와 `src/routes/route-config.ts`

- `App.tsx`에서 `Study` import를 지우고 `TechnicalReferences`로 바꾼다. **경로 `/study`는 그대로 둔다.** 권한 키(`screen-permissions.ts`의 `study`)와 사이드바와 북마크가 그 경로를 쓴다. 경로를 바꾸면 전부 따라 고쳐야 한다.
- `route-config.ts` 53행의 subtitle을 `팀 학습 과제와 점검 현황을 확인합니다.`에서 `팀이 공유하는 원단 자료를 분류하고 검색합니다.`로 바꾼다. `title`은 `TECHNICAL REFERENCES` 그대로다.
- `route-config.ts` 100행 네비게이션 항목은 건드리지 마라.

## 검증

1. `npm run build` 한 번. 모든 수정을 마친 뒤에 돌린다.
2. `git status --short`로 위 표의 파일만 바뀌었는지 본다. `Study.tsx`가 삭제(`D`)로 잡혀야 한다.

개발 서버를 띄우거나 브라우저로 확인하지 마라. 박향근이 직접 본다.
