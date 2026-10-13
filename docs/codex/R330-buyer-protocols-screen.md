# R330 바이어 시험 프로토콜을 별도 화면 /protocol 로 분리

상태: 미착수. 데이터와 규칙은 끝났다(2026-10-13).
- Firestore 컬렉션 `buyerProtocols`에 43건. 문서 필드는 `ReferenceItem`(`src/data/reference-schema.ts`)과 같다. `topic`이 바이어 이름이다(예: 바이어명, `전 바이어`). `folder`는 모두 `바이어 시험 기준`, `docType`은 모두 `시험 기준`.
- `firestore.rules`의 `buyerProtocols`는 소유자만 읽고 쓴다. 배포 완료. 고치지 말 것.
- `referenceItems`에서 43건을 지웠고 `REFERENCE_FOLDERS`에서도 폴더를 뺐다. TECHNICAL REFERENCES 쪽은 손댈 것이 없다.

## 인코딩 주의
파일은 반드시 `Get-Content -Encoding UTF8`로 읽어라. 한글 문구를 영어로 바꾸지 마라. 아래 표의 한글 문구를 글자 그대로 쓴다.

## 파일별 조치

### 1. `src/data/references.ts`
- `useReferenceSubscription(count?: number)`에 첫 인자 `collectionName: string`을 더해 `COLLECTION` 대신 쓴다. `useReferenceItems`, `useRecentReferences`는 `"referenceItems"`를 넘긴다.
- `export function useBuyerProtocols()`를 추가한다. 컬렉션 `"buyerProtocols"`. **소유자가 아니면 구독하지 않는다**(`isOwner`가 false면 빈 상태 반환). 규칙상 권한 오류가 나기 때문이다.

### 2. `src/routes/TechnicalReferences.tsx`
`FolderCard`, `FolderDialog`, `ReferenceDialog`, `FolderGroup` 타입을 `export` 한다. 그리고 `FolderCard`, `FolderDialog`의 `category` prop을 아래로 바꾼다.
```ts
accent: { color: string; label: string; sortByDate: boolean }
```
- `color`는 기존 `categoryColor(category)` 자리, `label`은 기존 `category.korean` 배지 자리, `sortByDate`는 기존 `category.id === "study"` 판단 자리다.
- `sortItemsForFolder`도 `(sortByDate: boolean, items)`로 바꾼다.
- `CategoryTab` 안에서는 `{ color: categoryColor(category), label: category.korean, sortByDate: category.id === "study" }`를 만들어 넘긴다. 기존 화면 동작은 그대로여야 한다.

### 3. 새 파일 `src/routes/BuyerProtocols.tsx`
`export function BuyerProtocols()`.
- 머리말은 `TechnicalReferences`의 유리 머리말과 같은 클래스. 아이콘 `ShieldCheck`(lucide-react). 제목 `Buyer protocols`, 부제 `바이어 시험 기준 (소유자 전용)`. 오른쪽 검색 입력, placeholder `바이어, 제목, 요약으로 검색`. 검색 대상은 `titleOf`, `title`, `topic`, `displaySummaryOf`.
- KPI 3칸(`MotionSection`, `AnimatedNumber`, `RddaMotionContext.Provider value="protocols"`): `전체 문서`(건), `바이어`(곳, `topic` 종류 수), `최근 갱신`(가장 늦은 `modifiedAt` 날짜, `toLocaleDateString("ko-KR")`).
- 본문: 바이어 카드 그리드 `grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`. 바이어 = `topic`(없으면 `바이어 미지정`). 정렬: `전 바이어`를 맨 앞, 나머지는 바이어 이름 가나다순(`localeCompare(..., "ko-KR")`). 카드는 export한 `FolderCard`를 쓴다. 그룹의 `name`은 바이어 이름, `description`은 `최근 갱신 YYYY. M. D.`(그룹 내 최신 `modifiedAt`을 `toLocaleDateString("ko-KR")`).
- accent: `{ color: "var(--ref-cat-5)", label: "바이어 시험 기준", sortByDate: false }`.
- 카드를 누르면 export한 `FolderDialog`를 연다.
- 검색어가 있으면 그리드 아래 `검색 결과 n건` 목록(TechnicalReferences의 검색 결과 블록과 같은 모양). 행을 누르면 `ReferenceDialog`.
- 상태 문구: 로딩 `자료를 불러오는 중입니다.`, 오류는 훅의 `error`, 0건 `등록된 바이어 시험 기준이 없습니다.`
- 푸터 왼쪽 `Teams Test Protocols 폴더 기준`, 오른쪽 `전체 n건`.
- 표, 카드 안에 `backdrop-blur` 금지. 유리 효과는 머리말에만.

### 4. `src/App.tsx`
- `IMPLEMENTED_ROUTES`에 `"/protocol"` 추가.
- `<Route path="/protocol" element={isOwnerRaw ? <BuyerProtocols /> : <ScreenAccessDenied />} />` 를 `/setting` 라우트와 같은 방식으로 추가.

### 5. `src/routes/route-config.ts`
- `routeDefinitions`에 `{ path: "/protocol", title: "BUYER PROTOCOLS", subtitle: "바이어별 시험 기준 원문을 모아 봅니다. 현재 소유자 전용입니다." }`.
- `기술 · 분석` 그룹의 `TECHNICAL REFERENCES` 바로 아래에 `{ label: "BUYER PROTOCOLS", path: "/protocol", icon: ShieldCheck, ownerOnly: true }`. `ShieldCheck` import 추가.

## 하지 말 것
- `screen-permissions.ts`에 키를 추가하지 말 것. 새 키는 `normalizeScreenAccess`가 기존 사용자에게 편집으로 채워 버린다. 권한 체계는 나중에 따로 한다.
- `firestore.rules`, `firestore-sync.ts`, `cache.ts`, `tools/` 아래를 고치지 말 것.
- 실데이터 제목, 바이어 이름을 코드에 넣지 말 것(`전 바이어`, `바이어 미지정` 문구만 허용).
- 파일을 지우지 말 것.

## 검증
- `npm run build` exit 0 한 번.
- `git status --short`에 삭제 없음.
