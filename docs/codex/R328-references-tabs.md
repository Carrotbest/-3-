# R328 자료 라이브러리 화면을 RDDA REPORT 형식의 탭 화면으로 재구성

상태: 미착수. 워킹트리에 R326, R327 미커밋 변경이 있다. 그 위에서 작업한다.

## 목적
`/study`(`src/routes/TechnicalReferences.tsx`)를 `src/routes/Rdda.tsx`와 같은 디자인 언어의 탭 화면으로 다시 만든다. 카테고리 체계를 6개에서 자료 성격 기준 5개로 바꾼다. 데이터는 이미 Firestore `referenceItems`에서 `useReferenceItems()`로 읽고 있다. 그대로 쓴다.

## 확정된 설계. 다시 따지지 말 것
### 카테고리 5개 (`src/data/reference-schema.ts`)
`ReferenceCategoryId`와 `REFERENCE_CATEGORIES`를 아래로 교체한다. 옛 id(`process`, `quality`, `materials`, `market`, `testing`)는 지운다. 순서가 곧 색 순서다. 바꾸지 말 것.

| 순서 | id | label | korean | 색 슬롯 |
|---|---|---|---|---|
| 1 | `fundamentals` | FUNDAMENTALS | 기초 교육 | 1 |
| 2 | `study` | CASE STUDY | 스터디 | 2 |
| 3 | `functional` | FUNCTIONAL | 기능성 원단 | 3 |
| 4 | `sustainable` | SUSTAINABLE | 친환경 소재 | 4 |
| 5 | `external` | EXTERNAL | 외부 자료 | 5 |

- `ReferenceCategory`에서 `pending` 필드를 없애고 `slot: 1 | 2 | 3 | 4 | 5`, `hint: string`(탭 카드 아래 짧은 설명), `topicOrder?: string[]`를 둔다. hint: 기초 교육 "공정별 기본기", 스터디 "팀 사례 연구", 기능성 원단 "기능별 소재와 가공", 친환경 소재 "리사이클과 인증", 외부 자료 "시장과 업체 자료".
- `topicOrder`는 `fundamentals`에만 준다: `["섬유 원료", "방적", "편직", "염색", "프린트", "워싱", "가공", "시험", "생산 공정"]`. 나머지는 건수 내림차순.
- `categoryOf(id)`는 모르는 id면 `undefined`. 화면은 모르는 id 자료를 "미분류"로 센다. 데이터 재분류 전 옛 id가 Firestore에 남아 있다. 이 자료가 화면에서 사라지면 안 된다.

### `ReferenceItem` 필드 추가 (모두 선택)
- `displayTitle?: string` 화면용 제목. 있으면 화면 어디서나 `title` 대신 쓴다. `titleOf(item)` 헬퍼를 schema에 두고 화면, 검색, `referenceToMaterial`(`src/data/references.ts`) 모두 이걸 쓴다. 상세 팝업에는 원본 파일명으로 `title`도 따로 보여 준다(`displayTitle`이 있을 때만).
- `topic?: string` 세부 주제(예: 항균, 발열, 리사이클). 자유 문자열.
- `kind?: "file" | "folder"` 없으면 file. folder면 목록에 폴더 아이콘(`lucide-react` `Folder`), 크기 칸은 "-", 팝업 버튼 문구 "폴더 열기".

### 색
`src/index.css`의 `:root`에 `--ref-cat-1`~`--ref-cat-5`, `.dark`에 같은 이름으로 정의한다. 앱의 `--chart-1~5`는 쓰지 않는다(미검증 팔레트).
- 밝은 모드 `#2a78d6`, `#eb6834`, `#1baf7a`, `#eda100`, `#e87ba4`
- 어두운 모드 `#3987e5`, `#d95926`, `#199e70`, `#c98500`, `#d55181`
- 색약 분리 검증을 통과한 순서다. 밝은 모드에서 3, 4, 5번이 배경 대비 3:1 미만이라 **색 칩 옆에는 반드시 이름과 건수 글자를 붙인다. 글자에 카테고리 색을 쓰지 말 것.** 글자는 `--foreground`, `--muted-foreground`.

### 화면 골격 (`Rdda.tsx` 97~150행을 본뜬다)
1. **머리말**: `Rdda.tsx` 97~119행의 유리 머리말을 같은 클래스로. 아이콘은 `BookOpenCheck`, 제목 "Fabric references", 부제 "팀 자료 라이브러리". 오른쪽에 검색 입력(기존 검색 로직 재사용). 머리말 안 `MotionSection` 4칸 KPI: 전체 자료, 이번 달 신규(`modifiedAt` 이번 달), 분류 확인 필요(`needsReview`), 최근 갱신(가장 늦은 `modifiedAt` 날짜). 숫자는 `AnimatedNumber`.
2. **탭 바**: `Rdda.tsx` 122~135행의 탭 카드를 그대로. 탭 6개 `overview`(OVERVIEW, "전체 구성"), 그리고 카테고리 5개(label, hint). 칸 수는 `grid-cols-2 sm:grid-cols-3 xl:grid-cols-6`. 각 탭 hint 칩 자리에 hint와 건수(검색 적용 후).
3. **본문** `min-h-[70vh]`, `aria-live="polite"`. 탭 상태는 `useSearchParams`의 `tab`(기본 overview). 지금의 `category` 파라미터는 없앤다.
4. 푸터: `Rdda.tsx` 148행 형식. 왼쪽 "Teams 자료 폴더 색인 기준", 오른쪽 전체 건수.

### OVERVIEW 탭
- **구성 막대**: 카테고리 5개 + 미분류(있을 때만, 색은 `--muted-foreground` 40%)를 고정 순서로 가로 한 줄. 높이 22px, 조각 사이 2px 틈(`gap-[2px]`), 양 끝만 4px 둥글게. 조각 폭은 건수 비례(`flex-grow`). 마우스를 올리면 작은 말풍선에 "기능성 원단 168건 (51%)". 누르면 그 카테고리 탭으로 이동.
- **카테고리 카드 5개** 한 줄(`xl:grid-cols-5`, 작은 화면은 2열): 색 칩 10px + korean, 아래 label 작게, 건수(크게)와 비율, 상위 주제 3개(topic 건수순, 쉼표로). 누르면 그 탭으로.
- **최근 추가 6건**과 **분류 확인 필요 목록**(needsReview, 최대 10건)을 2열로. 행을 누르면 상세 팝업.
- 막대와 카드에 `backdrop-blur` 금지. 카드는 기존 `Card`.

### 카테고리 탭 (5개 공통 컴포넌트 하나)
- 위: **주제 분포 가로 막대**. topic별 건수, 한 색(그 카테고리 색)의 단일 계열. 막대 두께 12px, 끝 4px 둥글게, 왼쪽 주제명, 오른쪽 건수 글자. 순서는 `topicOrder` 있으면 그 순서, 없으면 건수 내림차순. topic이 없는 자료는 맨 아래 "주제 미지정". 막대를 누르면 아래 목록을 그 주제로 거르고 다시 누르면 해제.
- 아래: **자료 목록 표**. 지금 표를 재사용(제목, 주제, 작성자, 자료일, 형식, 크기). 카테고리 열은 빼고 주제 열을 넣는다. `study` 탭만 자료일 내림차순 기본 정렬, 나머지는 주제 순서 후 제목순.
- `study` 탭에만 표 위에 작성자별 건수 줄(작은 칩, `ownerDisplayName` 사용).
- 태그 칩 필터는 없앤다. 지금 태그가 비어 있다.

### 상세 팝업
R326 이후의 `ReferenceDialog`(Dialog) 유지. 분류 배지는 색 칩 + korean. 주제가 있으면 배지 하나 더. 원본 파일명(`title`)은 `displayTitle`이 있을 때 dl에 "원본 파일명"으로.

## 하지 말 것
- `firestore.rules`, `firestore-sync.ts`, `cache.ts`, `upload_references.py`를 고치지 말 것.
- 표 칸, 막대 조각, 카드 안에 `backdrop-blur`, 번짐 그림자, 상시 애니메이션 금지(CLAUDE.md: 2026-10-07 표 떨림 사고). 유리 효과는 머리말과 탭 바에만.
- 긴 목록을 `SectionCard`로 감싸지 말 것(Reveal 임계값 때문에 안 보인다).
- `DialogContent`에 `relative`, `absolute`, `static` 넘기지 말 것.
- `Rdda.tsx`와 `components/rdda/*`는 읽기만 한다. 고치지 말 것. `motion.tsx`의 `MotionSection`, `AnimatedNumber`, `RddaMotionContext`는 import해서 쓴다(Provider 값은 고정 문자열 "references").
- 실데이터 제목, 사내 경로, 팀원 실명을 코드에 넣지 말 것. `reference-demo.ts`는 새 카테고리 id에 맞게 고치기만 하고(materials→functional, process→study, quality→study, market→external) 지우지 말 것.
- 차트 라이브러리를 새로 넣지 말 것. 막대는 div로.

## 검증
- `npm run build` exit 0 한 번.
- `grep -n '"materials"\|"process"\|"quality"\|"market"\|"testing"' src/data/reference-schema.ts src/routes/TechnicalReferences.tsx` 0줄.
- `git status --short`에 삭제 없음.
