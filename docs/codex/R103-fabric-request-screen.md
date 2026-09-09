# R103 — FABRIC REQUEST 화면

상태: 미착수. R102(데이터 모델·Storage 기반)는 완료·검증됨.

## 배경

통합원단부 1팀이 담당별로 흩어 관리하는 소싱 차트를 웹 한 원장으로 모은다.
엑셀 27열 4밴드 구조를 그대로 옮기되, 한 셀에 "1. / 2. / 3."으로 눌러 담던 옵션을 **라인으로 푼다.**
스타일 1건 아래에 옵션 라인 N개가 붙는다. 옵션 라인 하나가 나중에 DD MASTER 행 하나와 1대1로 연결된다(R104).

R102에서 만든 타입을 그대로 쓴다. `src/data/schema.ts`의 `RequestStyle`, `RequestOption`이다.
저장은 `useAppStore`의 `requests` 키다. IndexedDB 캐시와 Firestore 실시간 공유가 이미 붙어 있다.

## 하지 말 것

- 사진 리사이즈·업로드 로직을 새로 짜지 마라. `src/data/request-image.ts`에 이미 있다. 그 함수만 호출해라.
- DD MASTER 연결 버튼, 개발처·Yarn ETA·READY DATE·FL# 자동 표시를 만들지 마라. R104에서 한다.
- 셀 인라인 편집(더블클릭 편집)을 만들지 마라. R105로 미룬다. 이번에는 모달 편집만이다.
- 엑셀 업로드·파서를 만들지 마라. 별건이다.
- 열 너비 드래그 조절, 셀 범위 선택, 우클릭 메뉴를 만들지 마라. `Warehouse.tsx`에 있지만 이번 범위가 아니다.
- **긴 목록을 `SectionCard`로 감싸지 마라.** `Reveal`의 IntersectionObserver 임계값이 0.12라 카드가
  뷰포트보다 길면 영영 안 보인다. `src/components/ui/card.tsx`의 `Card`를 직접 써라.
- `src/routes/FabricAnalysis.tsx`를 건드리지 마라. 별도 판단이 남아 있다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/routes/FabricRequest.tsx` | 신규. 화면 전부 |
| `src/routes/route-config.ts` | 라우트 정의와 사이드바 항목 추가 |
| `src/data/screen-permissions.ts` | 권한 키 `fabricRequest` 추가 |
| `src/App.tsx` | import, Route, `IMPLEMENTED_ROUTES`, `fullBleed` |
| `src/store/useAppStore.ts` | `saveRequests` 함수 추가 |

## 1. `src/routes/route-config.ts`

`routeDefinitions` 배열에서 `{ path: "/development", ... }` **앞에** 넣는다. 흐름상 의뢰가 개발보다 먼저다.

```ts
  { path: "/request", title: "FABRIC REQUEST", subtitle: "1팀 의뢰 건의 접수와 개발 현황을 한 원장에서 관리합니다." },
```

`navigationGroups`의 `"개발"` 그룹에서 `DEVELOPMENT` 항목 **앞에** 넣는다. 아이콘은 이미 import된 `ClipboardList`를 쓴다.

```ts
      { label: "FABRIC REQUEST", path: "/request", icon: ClipboardList },
```

## 2. `src/data/screen-permissions.ts`

`SCREEN_PERMISSION_OPTIONS`에서 `development` 항목 앞에 넣는다.

```ts
  { key: "fabricRequest", label: "FABRIC REQUEST", paths: ["/request"] },
```

## 3. `src/App.tsx`

네 군데다.

- import 추가: `import { FabricRequest } from "@/routes/FabricRequest"`
- 35행 `IMPLEMENTED_ROUTES` Set에 `"/request"` 추가
- 63행 `fullBleed` 조건에 `pathname === "/request"` 추가. 현재 코드:
  ```ts
  const fullBleed = (pathname === "/development/workspace" || pathname === "/warehouse") && canViewCurrentPath
  ```
  27열 그리드라 2200px 폭 제약을 풀어야 한다.
- `<Route path="/warehouse" element={<Warehouse />} />` 앞에 `<Route path="/request" element={<FabricRequest />} />` 추가

## 4. `src/store/useAppStore.ts`

`saveTsRecords` 근처에 저장 함수를 더한다. `saveCache`는 IndexedDB와 Firestore 양쪽에 반영한다.

```ts
/** FABRIC REQUEST 원장 저장. 캐시와 팀 공유(Firestore)에 함께 반영한다. */
export function saveRequests(requests: RequestStyle[]): void {
  setAppState({ requests })
  void saveCache("requests", requests)
}
```

## 5. `src/routes/FabricRequest.tsx` (신규)

### 5.1 열 정의

`Warehouse.tsx` 57행 `WarehouseColumn` / `WarehouseGroup` 구조를 본떠 모듈 상단에 상수로 둔다.
고정 열 2개와 그룹 5개다. `scope`는 그 열이 스타일 행에 그려지는지 옵션 행에 그려지는지다.

| 그룹 | 열 (id, 라벨, 폭, scope) |
|---|---|
| 고정 | `image` 사진 88 style · `garmentNo` Garment No. 120 style |
| ORIGINAL | `brand` Brand 100 · `contents` Contents 150 · `origConstruction` Cons. 120 · `origWeight` Weight 80 — 전부 style |
| 분석 | `yarnAnalysis` Yarn analysis 180 · `devConstruction` Cons.(개발) 120 · `comment` Comment 160 · `analyst` 분석 담당 90 — 전부 style |
| 의뢰 | `urgent` URGENT 64 · `requester` 의뢰자 90 · `developer` 개발 담당 90 · `devPlan` 개발 200 — 전부 style |
| 옵션 | `optNo` Opt 50 · `yarnDetail` Yarn Detail 200 · `color` Color 120 · `dyeingMethod` Dyeing 90 · `remark` Remark 180 — 전부 option |

그룹 색은 `var(--chart-1)`, `var(--chart-2)`, `var(--chart-3)`, `var(--warning)` 순으로 준다.
헤더 2단 구성은 `Warehouse.tsx` 1011~1027행을 그대로 참고한다. 그룹 헤더가 위, 열 헤더가 아래다.

### 5.2 행 모델

스타일과 옵션을 한 배열로 펼쳐 렌더한다.

```ts
type Line =
  | { kind: "style"; style: RequestStyle }
  | { kind: "option"; style: RequestStyle; option: RequestOption }
```

- 스타일 행은 고정·ORIGINAL·분석·의뢰 열을 채우고, 옵션 그룹 열은 빈칸이다.
- 옵션 행은 반대다. 스타일 쪽 열은 빈칸이고 옵션 그룹 열만 채운다.
- 옵션이 없는 스타일도 스타일 행 하나는 그린다.

### 5.3 행 높이와 스크롤

**이게 이번 화면의 핵심 요구다.** 엑셀에서는 글자 길이에 맞춰 행 높이를 계속 늘렸다. 웹에서는 고정한다.

- 스타일 행 높이 `112px` 고정. 사진 자리를 감안한 값이다.
- 옵션 행 높이 `40px` 고정.
- 내용이 넘치는 셀은 **셀 안에서 세로 스크롤**한다. 행 높이는 절대 늘어나지 않는다.
  각 셀 내용을 `<div className="h-full overflow-y-auto whitespace-pre-wrap break-words px-1.5 py-1 text-xs">`로 감싼다.
- 표는 `table-fixed`, `border-separate`, `border-spacing-0`을 쓴다. `Warehouse.tsx` 1005행과 같다.

### 5.4 고정 열

`image`와 `garmentNo`는 좌측 sticky다. `Warehouse.tsx` 513행 `fixedLeft` 패턴을 따라
누적 폭으로 `left` 값을 계산한다. 헤더도 함께 sticky다.

### 5.5 사진 칸

Firebase Storage가 활성화되어 있다. R102에서 만든 `src/data/request-image.ts`를 그대로 쓴다.
내보내는 함수는 `validateRequestImage`, `uploadRequestImage`, `requestImageUrl`, `deleteRequestImage` 넷이다.
**리사이즈와 업로드를 새로 짜지 마라.** 그 안에 이미 있다.

스타일 행 `image` 셀 동작은 이렇다.

- `style.imageThumbPath`가 있으면 썸네일을 그린다. `<img className="h-full w-full rounded object-cover" />`
- 없으면 점선 상자에 `사진 추가`를 그린다.
- 셀을 클릭하면 숨은 `<input type="file" accept="image/jpeg,image/png,image/webp">`를 연다.
- 파일을 고르면 `validateRequestImage`로 먼저 거른다. 문구가 돌아오면 그 문구를 그대로 보여주고 멈춘다.
- 통과하면 업로드 중 표시를 켜고 `uploadRequestImage(style.reqId, file)`를 부른다.
  돌아온 `imagePath`, `imageThumbPath`를 해당 스타일에 반영하고 `saveRequests`를 부른다.
- 업로드가 던지면 오류 문구를 보여주고 원래 상태로 되돌린다. 화면을 깨뜨리지 마라.

URL 해석은 비동기다. 경로를 URL로 바꾸는 훅을 파일 안에 하나 둔다.

```tsx
function useRequestImageUrl(path: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!path) { setUrl(null); return }
    let alive = true
    void requestImageUrl(path).then((value) => { if (alive) setUrl(value) })
    return () => { alive = false }
  }, [path])
  return url
}
```

`requestImageUrl`은 모듈 안에 URL 캐시를 갖고 있다. 행마다 불러도 네트워크는 경로당 한 번이다.

썸네일을 클릭하면 원본(`style.imagePath`)을 `Dialog`로 크게 띄운다. 여기서도 `bg-background`를 쓰지 마라.

편집 모달 상단에도 같은 사진 칸을 둔다. 셀과 같은 동작이면 된다.

### 5.6 상단 도구줄

`Card`(SectionCard 아님) 안에 한 줄로 놓는다.

- 탭 3개: `전체` / `분석` / `개발`. `RequestStyle.stage`로 거른다. `src/components/ui/tabs.tsx`를 쓴다.
- 정렬 `Select` 1개: `순번` / `의뢰자` / `개발 담당` / `분석 담당`. 기본은 `순번`.
  **정렬은 스타일 단위로 하고 옵션 라인은 부모 스타일에 붙어 함께 움직인다.** 옵션만 따로 떨어지면 안 된다.
- `URGENT만` 체크박스.
- 차트 `Select`: `requests`에 실제로 있는 `chart` 값 목록 ∪ `전체`.
- 우측에 `신규 의뢰` 버튼.
- 우측에 건수 표시: `스타일 N건 · 옵션 M건`.

### 5.7 신규·편집 모달

`src/components/ui/dialog.tsx`를 쓴다. **`bg-background`를 쓰지 마라.** 매핑이 없어 팝업이 투명해진다.
이 프로젝트의 dialog는 `var(--card)`를 명시해 쓰고 있다.

한 모달에서 스타일과 옵션을 함께 편집한다.

- 상단: 차트, 단계(분석/개발), 순번, Garment No., Brand, Contents, Cons., Weight
- 중단: Yarn analysis, Cons.(개발), Comment, 분석 담당
- 하단: URGENT 체크박스, 의뢰자, 개발 담당, 개발
- 옵션 영역: 옵션 라인 목록. 각 줄에 Yarn Detail, Color, Dyeing, Remark 입력과 `삭제` 버튼.
  아래에 `옵션 추가` 버튼.
- 저장하면 `saveRequests`를 호출한다.

담당자 입력은 자유 입력이 아니라 `Select`로 한다. 선택지는 `src/data/schema.ts`의 `MEMBERS` 이름 목록 ∪
`requests`에 이미 쓰인 값이다. 의뢰자는 1팀 사람이라 `MEMBERS`에 없으므로 자유 입력으로 둔다.

### 5.8 채번

```ts
const reqId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
```

`src/data/attachments.ts`가 쓰는 방식과 같다. 새 채번 규칙을 만들지 마라.
`optId`는 `` `${reqId}#${no}` `` 다. `no`는 1부터, 옵션 삭제 후에도 남은 라인을 1부터 다시 매긴다.

`createdAt`과 `updatedAt`은 `new Date().toISOString()`이다.

### 5.9 삭제

스타일 행 우측 끝에 삭제 버튼을 둔다. 확인 팝업 뒤 `requests`에서 제거하고 `saveRequests`를 부른다.
사진이 있던 건이면 `deleteRequestImage(reqId)`도 부른다. 이 함수는 없는 파일에 대해 조용히 넘어가므로
`imagePath` 유무를 따로 검사하지 않아도 된다. 실패해도 원장 삭제는 그대로 진행한다.

### 5.10 빈 상태

`requests`가 비어 있으면 표 대신 안내를 그린다.
`아직 등록된 의뢰가 없습니다. 우측 상단 '신규 의뢰'로 첫 건을 등록해 주세요.`

## 검증

```
npm run build
git status --short
```

성공 기준.

1. `npm run build` 통과.
2. `git status --short`에 이 지시서에 적힌 5개 파일과 이 문서만. `docs/manual/`은 원래 미추적이라 남아도 된다.
3. `src/routes/FabricRequest.tsx`가 `request-image.ts`의 함수를 쓰고, 리사이즈·업로드를 새로 구현하지 않았다.
4. `FabricRequest.tsx` 안에 `SectionCard`와 `bg-background` 문자열이 없다.

화면 확인은 사용자가 한다. 브라우저에서 확인할 항목은 지시서 밖이다.
