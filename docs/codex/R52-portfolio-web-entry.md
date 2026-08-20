# R52 — PORTFOLIO 웹 직접 입력 (신규 등록 팝업 · 필수/선택 필드 · 사진·PDF 첨부)

**선행: R51 완료 후 진행.** R51에서 만든 `src/data/chemical.ts`·`src/routes/Portfolio.tsx`·스토어/캐시 배선 위에 얹는다.

대상(쓰기): `src/data/chemical.ts`(타입 확장 + 병합), `src/data/attachments.ts`(신규, 첨부 저장), `src/components/portfolio/PortfolioForm.tsx`(신규 등록/수정 팝업), `src/routes/Portfolio.tsx`(등록 버튼·수정·삭제·첨부 표시), `src/store/useAppStore.ts`·`src/data/cache.ts`(수기 항목·첨부 영속).
읽기전용 재사용: `src/components/ui/{dialog,sheet,input,label,select,button,badge}.tsx`, `src/components/cards/MaterialDeck.tsx`의 **MaterialFormSheet 입력 폼 패턴**(라벨·필수표시·검증·저장 UX를 그대로 따를 것).

## 배경 / 목적
R51은 `Chemical 개발 List.xlsx` 업로드로 포트폴리오를 채웠다. 그러나 **지속 가능한 툴**이 되려면 엑셀을 다시 만들어 올리는 방식이 아니라 **웹에서 바로 항목을 추가·수정**할 수 있어야 한다. 신규 개발 건이 생기면 담당자가 앱에서 등록하고, 사진·PDF 같은 근거 자료를 첨부한다.

**앱에 이미 같은 패턴이 있다**: `materials`(엑셀) + `materialsManual`(웹 등록)을 `materialsOf()`로 병합. **이 구조를 그대로 따른다** — 엑셀을 다시 업로드해도 웹 등록분이 사라지지 않아야 한다.

---

## Task 0 ★ — 저장소 어댑터 (Firebase 전환 대비, 최우선)
**Firebase(Firestore + Storage) 도입이 확정**됐다. 지금은 로컬(IndexedDB)로 구현하되, 나중에 **화면 코드를 고치지 않고 백엔드만 교체**할 수 있어야 한다. 따라서 데이터·첨부 접근을 **반드시 어댑터 뒤로 숨긴다.**

`src/data/portfolio-store.ts`(신규)에 인터페이스를 정의하고, 화면(`Portfolio.tsx`·폼)은 **오직 이 인터페이스만** 호출한다. IndexedDB를 화면에서 직접 부르지 말 것.
```ts
export interface PortfolioStore {
  listManual(): Promise<ChemicalItem[]>
  saveManual(item: ChemicalItem): Promise<void>        // upsert
  deleteManual(id: string): Promise<void>
  putAttachment(file: File): Promise<ChemicalAttachment>
  getAttachmentUrl(id: string): Promise<string | null>
  deleteAttachment(id: string): Promise<void>
  /** 변경 구독. 로컬 구현은 즉시 1회 호출 + 변경 시 호출. Firestore 전환 시 onSnapshot 으로 대체된다. */
  subscribe(listener: (items: ChemicalItem[]) => void): () => void
}
export const portfolioStore: PortfolioStore   // 현재는 createLocalPortfolioStore()
```
- 구현체 `createLocalPortfolioStore()`(IndexedDB)를 같은 파일 또는 `portfolio-store.local.ts`에 둔다.
- **비동기 시그니처를 지금부터 유지**한다(로컬이라 동기로 끝나더라도 Promise 반환). 나중에 네트워크로 바뀌어도 화면이 그대로여야 한다.
- `subscribe`는 로컬에서도 동작하게 만든다(저장/삭제 후 리스너 호출). 화면은 이 구독으로 목록을 갱신 — Firestore 실시간 동기화로 넘어갈 때 코드 변경이 없다.
- 어댑터 밖(화면·폼)에서 `indexedDB`·`cache.ts`를 직접 참조하면 안 된다.

## Task 1 — 데이터 모델 확장
`chemical.ts`의 `ChemicalItem`에 필드 추가(기존 필드 유지, 파서 호환 깨지 말 것):
```ts
export interface ChemicalAttachment {
  id: string            // 첨부 고유 id (IndexedDB 키)
  name: string          // 원본 파일명
  type: string          // MIME
  size: number          // bytes
  kind: "image" | "pdf" | "other"
  addedAt: string       // ISO
}
export interface ChemicalItem {
  // ...기존 필드
  source?: "excel" | "web"        // 기본 "excel", 웹 등록분은 "web"
  link?: string                    // OneDrive/SharePoint 원본 링크
  owner?: string                   // 등록자(MEMBERS 선택)
  attachments?: ChemicalAttachment[]
  createdAt?: string
  updatedAt?: string
}
```
- 스토어에 `chemicalManual: ChemicalItem[]` 추가(웹 등록분). IndexedDB 키 예 `chemicalManual`.
- **병합 함수** `mergeChemicalPortfolio(excel, manual): ChemicalPortfolio`:
  - 엑셀 카테고리 + 수기 항목의 카테고리를 합집합으로. 수기 항목이 **새 카테고리**를 만들 수 있어야 한다(카테고리 목록에 없으면 신규 생성, `strategy`는 비거나 사용자가 입력).
  - `totals`는 병합 결과 기준으로 재계산.
  - 화면(`Portfolio.tsx`)과 HOME 프리뷰는 **병합 결과**를 소비하도록 교체.

## Task 2 — 첨부 저장 `src/data/attachments.ts`
사진·PDF를 **IndexedDB에 Blob으로** 저장한다(별도 스토어 `attachments`, 키 = 첨부 id).
```ts
export async function putAttachment(file: File): Promise<ChemicalAttachment>   // Blob 저장 + 메타 반환
export async function getAttachmentUrl(id: string): Promise<string | null>      // objectURL 생성(호출측에서 revoke)
export async function getAttachmentBlob(id: string): Promise<Blob | null>
export async function deleteAttachment(id: string): Promise<void>
```
제약·검증(폼에서 사용자에게 안내):
- 허용 타입: `image/*`(jpg·png·webp), `application/pdf`. 그 외 거부 + 안내.
- **파일당 10MB 상한**, 항목당 **최대 6개**. 초과 시 인라인 에러(저장 차단).
- 저장 전 이미지 리사이즈는 하지 않되(원본 보존), 큰 파일 경고 문구 노출.
- objectURL은 컴포넌트 언마운트/모달 닫힘 시 **반드시 `URL.revokeObjectURL`** (누수 금지).
- 항목 삭제 시 연결된 첨부도 함께 삭제(고아 Blob 방지).

## Task 3 — 신규 등록/수정 팝업 `PortfolioForm.tsx`
`dialog.tsx`(또는 기존 `MaterialFormSheet`와 동일한 sheet 패턴) 기반 모달. **등록·수정 겸용**.

**필수 항목(★ 표시 + 미입력 시 저장 차단, 인라인 에러)**
1. **카테고리** ★ — 기존 카테고리 `Select` + "새 카테고리 추가" 옵션(선택 시 텍스트 입력 노출). 신규일 때 `한글명`도 함께 받아 `English (한글)` 형식으로 조립하거나 입력값 그대로 사용.
2. **Chemical / Brand** ★ — 텍스트(약품·브랜드명).
3. **상태** ★ — `Select`: 개발완료 / 개발중 / 미착수 / Drop.

**선택 항목**
4. **Description & Effect** — `textarea`(여러 줄).
5. **Fabrication** — `textarea`, **한 줄에 원단 하나**라고 placeholder로 안내(모달 상세에서 목록 렌더됨).
6. **Market Product Analysis** — `textarea`.
7. **FL#** — 텍스트 입력(쉼표/줄바꿈 구분 다중). 입력 즉시 `FL\d{8,10}` 형식 검증 → **유효한 것은 칩으로 표시**, 형식이 틀리면 경고(저장은 허용하되 표시). 앱 채번 규칙(FL+YY+MM+4자리) 안내 문구.
8. **검증 통과 메모** — 자유 텍스트(예 `항균 PASS`). 입력 시 `passNotes`에 반영되어 KPI "검증 통과"에 집계.
9. **담당자** — `MEMBERS` Select.
10. **원본 링크** — OneDrive/SharePoint URL. `https://` 형식 간단 검증.
11. **첨부** — 드래그앤드롭 + 파일 선택. 선택된 파일은 **썸네일(이미지) / 파일 아이콘+이름(PDF)** 목록으로 표시하고 개별 삭제 가능. 위 Task 2 제약 안내.

UX 규칙:
- 필수 미입력 시 저장 버튼 비활성 또는 클릭 시 첫 오류 필드로 포커스(**R30에서 확립한 필수항목 별표+저장차단 패턴을 따를 것**).
- 저장 시 `source:"web"`, `createdAt/updatedAt`, `id`는 `crypto.randomUUID()`.
- 수정 모드: 기존 값 프리필. **엑셀 출처 항목(`source==="excel"`)은 수정·삭제 불가**(읽기 전용 안내 배지) — 다음 엑셀 업로드에서 덮어써지기 때문. 웹 등록분만 수정/삭제 허용.
- 저장·취소 후 목록 즉시 반영(스토어 갱신).

## Task 4 — Portfolio 화면 연결
- 화면 우상단에 **`+ 신규 등록`** 버튼(항상 노출). 클릭 → 팝업.
- 카테고리 아코디언 안의 각 항목 카드에 **웹 등록 배지**(`source==="web"`)와 hover 시 **수정·삭제** 액션(웹 등록분만). 삭제는 확인 다이얼로그.
- **상세 모달 확장**(R51에서 만든 모달에 추가):
  - **첨부 갤러리**: 이미지 썸네일 그리드(클릭 시 원본 크게), PDF는 아이콘+파일명 → 클릭 시 새 탭(blob URL).
  - **원본 링크** 버튼(있을 때).
  - 등록자·등록일 표시.
- KPI·커버리지 막대는 **병합 데이터 기준**으로 재계산되어야 한다(웹 등록분이 즉시 반영).

## Task 5 — SETTING 안내 보완
- R51에서 추가한 `기능성 개발 List` 업로드 카드 설명에 한 줄 추가: 초기 이관은 엑셀, **이후 신규 건은 PORTFOLIO 화면에서 직접 등록**한다는 안내.

## ★ 알려진 한계 (구현은 하되 화면에 명시)
- 첨부와 웹 등록분은 **브라우저 IndexedDB 로컬 저장**이라 **팀원 간 자동 공유가 되지 않는다**(현재 앱 전체가 동일 구조). 실시간 공유는 향후 Firebase 도입 시 가능.
- 이 사실을 폼 하단 또는 화면 안내에 **한 줄로 표기**할 것(예: "웹 등록 자료는 현재 이 브라우저에 저장됩니다").
- 브라우저 저장 용량은 유한하다 — 첨부가 많아지면 용량 경고가 필요할 수 있음(과설계 금지, 파일당/항목당 상한만 지킬 것).

## 금지사항
- 새 npm 패키지 금지(순수 IndexedDB·File API·기존 shadcn). 
- **실데이터(협력사·브랜드·FL)를 저장소 파일에 커밋 금지** — 데모는 익명 유지.
- 엑셀 재업로드 시 **웹 등록분 유실 금지**(병합 필수).
- objectURL 누수 금지. `prefers-reduced-motion` 대응. 커밋 금지.
- 다른 화면 기능 변경 금지.

## 검증(구현 후 자기점검)
1. `tsc --noEmit && vite build` 통과.
2. `#/trend/portfolio`에서 `+ 신규 등록` → 팝업. 필수 3개(카테고리·Chemical/Brand·상태) 미입력 시 저장 차단·에러 표시.
3. 선택 항목(설명·Fabrication·FL#·링크·담당자) 입력 저장 → 목록/아코디언에 즉시 반영, KPI·커버리지 수치 증가.
4. 이미지·PDF 첨부 → 상세 모달에서 썸네일/파일 열람. 10MB 초과·미허용 타입은 거부.
5. 새 카테고리로 등록 → 카테고리 타일이 새로 생긴다.
6. 웹 등록 항목만 수정·삭제 가능(엑셀 항목은 읽기전용 배지). 항목 삭제 시 첨부도 삭제.
7. 엑셀을 다시 업로드해도 **웹 등록분이 유지**된다.
8. 새로고침 후에도 등록분·첨부가 남아 있다(IndexedDB 영속).
