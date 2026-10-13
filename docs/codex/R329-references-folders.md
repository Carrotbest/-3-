# R329 자료 라이브러리 카테고리 탭을 폴더 카드 그리드와 폴더 팝업으로 교체

상태: 미착수. 데이터는 준비됐다. Firestore `referenceItems` 304건 전부에 `folder`, `docType` 문자열 필드가 들어가 있다(2026-10-13).

## 목적
`src/routes/TechnicalReferences.tsx`의 카테고리 탭(`CategoryTab`)에서 "주제 분포" 가로 막대와 자료 목록 표를 걷어낸다. 그 자리에 폴더 카드 그리드를 둔다. 카드를 누르면 그 폴더의 자료 목록 팝업이 뜬다.

## 데이터 계약 (확정, 다시 따지지 말 것)
- `folder`: 카테고리 안의 폴더 이름. 아래 표의 이름과 정확히 같다.
- `docType`: 자료 형태. 값은 8개: `소개 자료`, `기술 자료`, `시험 성적`, `인증과 기준`, `교육 자료`, `팀 스터디`, `발표 자료`, `기사`.
- `topic`(기존 세부 주제)은 그대로 남는다. 폴더보다 잘게 나뉜 값이다. 팝업 행의 보조 글자와 상세 배지에만 쓴다.

## 파일별 조치

### `src/data/reference-schema.ts`
1. `ReferenceItem`에 `folder?: string`, `docType?: string` 추가.
2. `ReferenceCategory`에서 `topicOrder`를 지우고, fundamentals 항목의 `topicOrder` 값도 지운다.
3. 아래를 추가한다.
```ts
export interface ReferenceFolder { name: string; description: string }
export const REFERENCE_FOLDERS: Record<ReferenceCategoryId, ReferenceFolder[]> = { ... }  // 아래 표 그대로, 표 순서 = 화면 순서
export const DOC_TYPE_ORDER = ["소개 자료", "기술 자료", "시험 성적", "인증과 기준", "교육 자료", "팀 스터디", "발표 자료", "기사"]
export const UNASSIGNED_FOLDER = "폴더 미지정"
export const folderOf = (item: ReferenceItem) => item.folder?.trim() || UNASSIGNED_FOLDER
```

| 카테고리 | 폴더 이름 | description |
|---|---|---|
| fundamentals | 원료와 방적 | 섬유 분류, 원사, 방적 공정 |
| fundamentals | 편직 | 편성 원리와 편직 불량 |
| fundamentals | 염색과 프린트 | 색의 원리, 염색, 프린트 기법 |
| fundamentals | 워싱과 가공 | 가먼트 워싱과 후가공 종류 |
| fundamentals | 시험 | 견뢰도, 이화학 시험, 광원과 CCM |
| fundamentals | 생산 공정과 불량 | 생산 흐름과 원단 불량 원인 |
| fundamentals | 기능성과 지속가능성 | 기능성 원단 키워드와 ESG |
| study | 가공 | 후가공 공정 정리와 현장 입회 보고 |
| study | 염색 | 염색성, Shade, 견뢰도, 이염 |
| study | 원사와 소재 | 원사 구조와 섬유 비교 |
| study | 편직과 조직 | 조직 구조와 편직 사양 추정 |
| study | 품질 사고 | 사고 원인 분석과 관리법 |
| study | 환경과 규제 | 환경 부하, 인증, 규제 검토 |
| study | 제안 자료 | 바이어 트렌드 제안과 협업 제안 |
| functional | 항균 소취 가공 | 후가공으로 넣는 항균, 소취제와 시험 결과 |
| functional | 항균 섬유 | 원사 단계에서 항균 성분을 넣은 섬유 |
| functional | 항바이러스 | 바이러스 저감 가공과 시험 |
| functional | 발열 보온 | 흡습발열, 광발열, 원적외선 소재 |
| functional | 냉감과 온도 조절 | 접촉 냉감과 체온 반응형 가공 |
| functional | 흡한속건 | 흡수와 건조, 일방향 수분 이동 |
| functional | 웰니스 스킨케어 | 콜라겐, 아연, 프로바이오틱 피부 케어 소재 |
| functional | 발수와 형태 안정 | 비불소 발수, 형태 안정, 항필링, 촉감 가공 |
| functional | 신소재와 종합 자료 | 그래핀, 형광 면 염색, 가공제 종합 카탈로그 |
| sustainable | 인증과 기준 | GRS, OCS, RCS, BCI 인증 기준과 인증서 |
| sustainable | 리사이클 | 리사이클 폴리, 면, 원착사와 탄소발자국 |
| sustainable | 생분해와 바이오 | 생분해 원사, PLA, PHA, 바이오 원료 |
| sustainable | 친환경 염색 공정 | 양이온 면, 냉패드배치 등 물과 약품을 줄이는 염색 |
| sustainable | 무염색과 유기농 면 | 무염색, 컬러드, 유기농, 재생농업 면 |
| sustainable | 재생 셀룰로스 | 모달, 라이오셀, 대나무, 리사이클 레이온 |
| external | 소재 업체 소개 | 원사, 소재 업체의 회사와 제품 소개 |
| external | 면화 세미나 2026 | 미국 면화 수급, 교역, 추적성 발표 |
| external | 면화 세미나 2021~2022 | 면화 전망과 지속가능성 발표 |
| external | 기사 | 소재 관련 언론 기사 |

### `src/routes/TechnicalReferences.tsx`

**지울 것**: `TopicCount`, `UNASSIGNED_TOPIC`, `topicOf`, `countTopics`, `CategoryTab` 안의 `selectedTopic`, 주제 분포 Card, 자료 목록 표.

**1. 폴더 집계 헬퍼** `groupFolders(items, categoryId)`: `REFERENCE_FOLDERS[categoryId]` 순서대로 `{ name, description, items }`를 만든다. 0건 폴더는 뺀다. 표에 없는 `folder` 값이나 비어 있는 자료는 `folderOf()` 값별로 모아 맨 뒤에 붙인다(description은 빈 문자열).

**2. `FolderCard`** (카드 뉴스 형태, 기존 `Card` 사용)
- 전체가 `<button type="button">`. 높이는 그리드 행에 맞춰 `h-full`.
- 맨 위 4px 띠: `categoryColor(category)` 배경. 색만으로 구분하지 않는다. 글자는 `--foreground`, `--muted-foreground`만.
- 첫 줄: 폴더 이름(`text-base font-semibold`) 왼쪽, 건수(`text-2xl font-semibold tabular-nums` + 작은 "건") 오른쪽.
- 둘째 줄: description, `text-xs text-[var(--muted-foreground)] line-clamp-2 min-h-8`.
- 대표 자료 2건: `titleOf()` 기준, 정렬은 팝업과 같은 기본 정렬의 앞 2건. 한 줄씩 `truncate text-xs`, 앞에 4px 회색 점.
- 맨 아래: 자료 형태별 건수. `DOC_TYPE_ORDER` 순서, 0건 생략, `소개 자료 9  시험 성적 12` 형태로 작은 `Badge variant="secondary"` 나열. 가운뎃점 문자 쓰지 말 것.
- hover는 테두리 색 변화만. `backdrop-blur`, 번짐 그림자, 상시 애니메이션 금지.

**3. `CategoryTab` 새 구성**
- `study`일 때만 기존 작성자별 칩 줄을 맨 위에 그대로 둔다.
- 폴더 카드 그리드: `grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`.
- 카드가 0개면 "선택한 조건에 맞는 자료가 없습니다." 문구.
- 카드를 누르면 `openFolder` 상태에 `{ name, description, items }`를 넣고 `FolderDialog`를 연다.
- props에 `searching: boolean` 추가. 상위에서 `query.trim() !== ""`를 넘긴다. `searching`이 참이면 그리드 아래에 "검색 결과 n건" 목록을 둔다. 행은 기존 `ItemRow`(compact 아님)를 쓰고 누르면 상위 `onOpen(item)`.

**4. `FolderDialog`** (기존 `Dialog`, `DialogContent className="max-w-3xl"`. `relative`, `absolute`, `static` 넘기지 말 것)
- 헤더: 색 칩 10px + 카테고리 korean `Badge variant="secondary"`, 제목은 폴더 이름, 옆에 건수. description은 `DialogDescription`으로 보이게.
- 형태 필터: 폴더 안 `docType` 종류가 2개 이상일 때만. "전체" + 있는 형태들(`DOC_TYPE_ORDER` 순서, 건수 포함) 칩 버튼, `aria-pressed`. 한 번에 하나 선택.
- 목록: `DialogBody` 안 세로 목록, 최대 높이는 DialogBody 기본 스크롤에 맡긴다. 행 = 왼쪽 제목(`titleOf`) + 아래 보조 글자(`topic`이 있으면 topic, 없으면 요약 첫 줄), 오른쪽 `docType` 작은 outline Badge, 자료일(`documentDate || modifiedAt`), 형식 대문자. 폴더 링크 자료(`kind === "folder"`)는 `Folder` 아이콘.
- 기본 정렬: `study` 카테고리는 자료일 내림차순. 나머지는 `DOC_TYPE_ORDER` 순 다음 제목순(`localeCompare(..., "ko-KR")`).
- 행을 누르면 같은 Dialog 안에서 상세 화면으로 바뀐다(Dialog를 겹쳐 열지 말 것). 상세 화면 위에 `ArrowLeft` 아이콘 "목록으로" ghost 버튼. 누르면 목록으로 돌아가고 필터 상태는 유지.
- 상세 화면 내용은 지금 `ReferenceDialog`의 본문과 같다. 중복을 피하려고 `ReferenceDialog`의 배지 줄, 요약, dl, 원본 열기 버튼을 `ReferenceDetail({ item })` 컴포넌트로 빼서 두 곳에서 쓴다. 배지 줄에 `docType`이 있으면 outline Badge 하나 더.
- 팝업이 닫히면 상세 상태와 필터를 초기화한다.

**5. `Overview`**: 카테고리 카드의 "상위 주제 3개" 줄을 폴더 기준으로 바꾼다(`groupFolders` 결과를 건수 내림차순 앞 3개 이름).

**6. 검색**: `searched` 필터 문자열에 `item.folder ?? ""`, `item.docType ?? ""`를 추가한다. 검색 입력 placeholder는 "제목, 요약, 폴더로 검색".

## 하지 말 것
- `firestore.rules`, `firestore-sync.ts`, `cache.ts`, `src/data/references.ts`의 Firestore 읽기 코드, `tools/references/*.py`를 고치지 말 것. `references.ts` 37행이 문서 필드를 그대로 펼치므로 새 필드는 손대지 않아도 들어온다.
- 차트 라이브러리 추가 금지. 막대 차트 새로 만들지 말 것.
- 표 칸, 카드, 팝업 안에 `backdrop-blur`, 번짐 그림자, 상시 애니메이션 금지(2026-10-07 표 떨림 사고). 유리 효과는 머리말과 탭 바에만.
- 긴 목록을 `SectionCard`로 감싸지 말 것.
- 실데이터 제목, 업체명, 사내 경로, 팀원 실명을 코드에 넣지 말 것. 폴더 표의 문구만 넣는다.
- `reference-demo.ts`는 지우지 말 것. 데모 항목에 `folder`가 없어도 "폴더 미지정" 카드로 보이면 된다.
- `Rdda.tsx`, `components/rdda/*`는 고치지 말 것.

## 검증
- `npm run build` exit 0 한 번.
- `grep -n "countTopics\|UNASSIGNED_TOPIC\|topicOrder" src/` 0줄.
- `git status --short`에 삭제 없음.
