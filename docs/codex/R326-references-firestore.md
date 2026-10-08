# R326 자료 라이브러리 Firestore 연결과 HOME의 state.study 절단

상태: 미착수.

## 목적
`/study` 화면(TECHNICAL REFERENCES, `src/routes/TechnicalReferences.tsx`)이 데모 12건(`REFERENCE_DEMO`)을 읽는다. 이것을 Firestore `referenceItems` 컬렉션으로 바꾼다. HOME은 폐기한 주차별 과제(`state.study`)를 아직 읽는다. 이 참조를 끊고 같은 덱을 `referenceItems` 최근 자료로 채운다.

실데이터 투입(R327)은 이번 범위가 아니다. 이번 작업이 끝나면 운영 화면은 빈 상태로 보이는 것이 정상이다.

## 확정된 설계. 다시 따지지 말 것
- **`state` 컬렉션 캐시 키로 만들지 않는다.** `CACHE_KEYS`, `MERGE_IDS`, `firestore-sync.ts`에 넣지 않는다. 별도 컬렉션 `referenceItems`, 자료 1건이 문서 1개다. 문서 ID는 `ReferenceItem.id`(예: `ref-278bfe45fe45455a`)다. 색인 스크립트가 나중에 Firebase Auth REST로 문서 단위로 올린다(R327).
  - 이유: 459건이 약 350KB다. state 키로 두면 한 건 고칠 때마다 전체를 다시 올린다. 문서 단위면 쓰기 1회다.
- **Firestore 영구 캐시를 켜지 않는다.** `src/data/firebase.ts`의 `getFirestore`를 `initializeFirestore`로 바꾸지 말 것. 앱 전체 동기화(`state`)에 영향이 간다.
- 그래서 읽기 비용을 구독 범위로 줄인다. HOME은 최신 6건만(`orderBy("modifiedAt","desc")`, `limit(6)`, 읽기 6회). 전체 459건 구독은 `/study` 화면이 열려 있을 때만 한다. 단일 필드 정렬이라 복합 색인이 필요 없다.
- 공개 저장소다. 실제 자료 제목, 사내 경로, 폴더명, 팀원 실명을 코드나 주석에 넣지 말 것.

## 근거 수치
- 색인 459건, 건당 평균 757바이트.
- `modifiedAt` 형식은 색인이 `2026-07-21T10:31:12`, 데모가 `2025-07-18`이다. 둘 다 문자열 정렬로 시간순이 맞다. 변환하지 말 것.
- `state.study`를 읽는 곳은 `src/routes/Home.tsx` 839, 867, 1008행뿐이다. 1041행은 kind 문자열 `"STUDY"`로 이동 경로만 고른다. 그대로 둔다.

## 파일별 조치
| 파일 | 조치 |
|---|---|
| `firestore.rules` | `costSheets` 블록 뒤, `{document=**}` 앞에 `match /referenceItems/{docId}` 추가. `read: if isApproved()`, `create, update, delete: if isOwner()`. 주석 두 줄: 사내 자료 색인이며 색인 스크립트가 소유자 계정으로 올린다. 팀원 분류 수정 화면이 생기면 update를 넓힌다. |
| `src/data/reference-schema.ts` | `ReferenceItem`에 선택 필드 `keywords?: string[]` 추가. 다른 필드는 건드리지 않는다. |
| `src/data/references.ts` (신규) | 아래 명세. |
| `src/routes/TechnicalReferences.tsx` | `REFERENCE_DEMO` 참조 7곳(107, 110, 115, 123, 124, 125, 126행 근처)을 `useReferenceItems()` 결과로 바꾼다. import 제거. 로딩 중, 오류, 0건일 때 표 자리에 한 줄 안내를 띄운다. 0건 문구: "아직 색인된 자료가 없습니다. Teams 자료 폴더 색인이 올라오면 여기 표시됩니다." |
| `src/routes/Home.tsx` | 아래 명세. |
| `src/data/reference-demo.ts` | **지우지 말 것.** 화면에서 import만 끊는다. |

### `src/data/references.ts`
`src/data/presence.ts`의 구독 방식을 따른다. `useAuthStore.getState()`의 `isOwner`, `approval`로 승인 여부를 본다. 승인 전이면 구독하지 않고 빈 배열을 돌려준다. 규칙이 거부해 콘솔 오류가 쌓이는 것을 막는다.

- `const COLLECTION = "referenceItems"`
- `useReferenceItems(): { items: ReferenceItem[]; loading: boolean; error: string }` 컬렉션 전체 `onSnapshot`. 컴포넌트가 사라지면 해제한다. 승인 상태가 바뀌면 다시 구독한다(`useAuthStore`의 `approval`, `isOwner`를 훅 의존성으로).
- `useRecentReferences(count: number)` 같은 형태로 `orderBy("modifiedAt","desc"), limit(count)`.
- 문서 데이터는 `{ id: snapshot.id, ...data }`로 읽는다. `tags`가 배열이 아니면 `[]`로 채운다. 화면이 `item.tags.map`을 바로 부른다.
- `referenceToMaterial(item: ReferenceItem): MaterialItem` HOME 덱용. `id: item.id`, `kind: "STUDY"`, `title`, `summary: displaySummaryOf(item) || undefined`, `date: item.documentDate || item.modifiedAt.slice(0, 10)`, `tags: item.tags`, `link: item.webUrl`, `owner: item.owner`, `source: "study"`, `readOnly: true`, `detail`은 카테고리(`categoryOf(item.category)?.label`), 형식(`item.format.toUpperCase()`), 크기(`formatSize(item.sizeBytes)`) 세 줄. 빈 값 줄은 뺀다.
- 쓰기 함수는 만들지 않는다. 수정 화면이 없다.

### `src/routes/Home.tsx`
- 839행 `const study = useAppStore((state) => state.study)` 삭제.
- 35행 `studyMaterials as deriveStudyMaterials,` import 삭제.
- 867행을 아래로 바꾼다. `materialsManual` 병합은 유지한다. 팀원이 손으로 넣은 STUDY 자료가 있을 수 있다.
  ```ts
  const recentReferences = useRecentReferences(6)
  const studyDeckMaterials = useMemo(() => materialsOf("STUDY", recentReferences.items.map(referenceToMaterial), materialsManual), [materialsManual, recentReferences.items])
  ```
- 1008행 `description: "섬유 교육자료"`를 `"팀 자료 라이브러리 최근 자료"`로, `empty`를 `"Teams 자료 폴더 색인이 올라오면 최근 자료가 표시됩니다."`로 바꾼다. 나머지 필드는 그대로.

## 하지 말 것
- `useAppStore`의 `study`, `studyFiles` 키, `CACHE_KEYS`, `derive.ts`의 `studyMaterials`, `homeWorkSummary`, `upload.ts`의 `ingestStudyWorkbook`을 지우지 말 것. 호출처가 없어진 죽은 코드지만 삭제는 사용자 승인 사항이라 별건으로 한다.
- `firestore-sync.ts`, `cache.ts`, `sync-merge.ts`를 열지 말 것. 이번 작업과 무관하다.
- `firebase deploy`를 돌리지 말 것. 규칙 게시는 사용자가 한다.
- 표 칸 안에 `backdrop-blur`, 번짐 그림자, 상시 애니메이션 넣지 말 것(CLAUDE.md 주의 항목).
- 긴 목록을 `SectionCard`로 감싸지 말 것.

## 검증
- `npm run build`가 exit 0. `tsc --noEmit` 포함.
- `git status --short`에 위 표의 파일만 나온다. 삭제(` D`)가 없다.
- `grep -n "state.study\|deriveStudyMaterials" src/routes/Home.tsx` 결과 0줄.
- `grep -n "REFERENCE_DEMO" src/routes/TechnicalReferences.tsx` 결과 0줄.
