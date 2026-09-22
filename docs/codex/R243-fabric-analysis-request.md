# R243 FABRIC ANALYSIS 분석 의뢰 원장 (AX 대체 1단계)

상태: 미착수

## 목적

사내 AX 시스템의 원단 분석 의뢰를 대시보드로 옮긴다. 1팀이 의뢰하고 3팀이 분석 결과를 적고 완료한다. 의뢰와 완료 때 Outlook 메일 초안(.eml)을 띄운다.

이번 범위가 아닌 것(R244에서 한다): 엑셀 일괄 의뢰(사진 포함), 완료 건을 FABRIC REQUEST로 넘기기, 건별 리포트 엑셀 내보내기.

## 근거 (AX 실물, 2026-09-22 확인)

- 번호 형식 `AN` + YYMM + 4자리. 예: `AN26090005`(2026-09-16 의뢰). 월마다 0001부터 다시 센다(사용자 확인).
- AX 리캡 엑셀 22열: Analysis request number, RDDA(사진 칸), Department, Customer name, Brand name, Objective of analysis, Analysis Description, Comment (Requester), Original Fabric Source, Source code, Season/Year, Gender/Age, Brand, Construction Name, Fabric Content, Fabric weight (gsm), Request type, Yarn description, Construction (RND), Fabric weight g/m2(RND), comment (RND), In charge.
- 값 예: Request type `Urgent`, Objective `Development`, Source `Market sample`, Gender `Women's`, Description `Yarn count, Spinning type`, 결과 Yarn `CM 30S/1(RING) +CM 30S/1(RING)`, Construction(RND) `OTTOMAN`.
- AX 의뢰 메일 제목 `[Fabric Analysis Request] 분석 요청`, 첫 줄 `Analysis request number: AN26090005 로 분석 요청이 왔습니다`. 완료 메일 제목 `[Fabric Analysis Request] 분석 완료`, 첫 줄 `Analysis request number: AN26090005 분석이 완료되었습니다.` 완료 메일 받는 사람은 의뢰자, 참조는 1팀과 3팀.

## 데이터 계약

### 타입 (`src/data/schema.ts`, 기존 `FabricAnalysisRow` 바로 아래에 추가)

```ts
export const ANALYSIS_STATES = ["의뢰", "완료", "취소"] as const
export type AnalysisState = (typeof ANALYSIS_STATES)[number]
export const ANALYSIS_REQUEST_TYPES = ["Normal", "Urgent"] as const
export type AnalysisRequestType = (typeof ANALYSIS_REQUEST_TYPES)[number]

/** FABRIC ANALYSIS 분석 의뢰 1건. AX 리캡 22열을 그대로 옮기고 사진과 상태를 더했다. */
export interface AnalysisRequest {
  /** 병합 id. `an:{Date.now 36진}:{난수 6자}`. 한 번 정하면 바꾸지 않는다. */
  id: string
  /** AN+YYMM+4자리. 사람이 고칠 수 있다(AX 번호를 이어받는 달). */
  anNo: string
  state: AnalysisState
  /** yyyy-mm-dd */
  requestedAt: string
  requestType: AnalysisRequestType
  requester: string
  /** 완료 메일 받는 사람. 의뢰 저장 시 로그인 메일을 넣는다. */
  requesterEmail: string
  department: string
  customer: string
  objective: string
  /** AX "Analysis Description" = 메일의 Request item */
  description: string
  requesterComment: string
  source: string
  sourceCode: string
  season: string
  gender: string
  brand: string
  construction: string
  contents: string
  weight: number | ""
  imagePath?: string
  imageThumbPath?: string
  // 결과(3팀)
  inCharge: string
  yarnDescription: string
  constructionRnd: string
  weightRnd: number | ""
  commentRnd: string
  /** yyyy-mm-dd. 완료 처리 때 채운다. */
  finishedAt: string
  /** R244 FABRIC REQUEST 연결용 자리. 이번에는 읽지도 쓰지도 않는다. */
  requestReqId?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}
```

### 저장 키 `analysisRequests`

`rddaReports`가 등록된 자리마다 똑같이 등록한다(`grep -rn rddaReports src`로 나오는 곳 중 Rdda 화면 코드 제외).

| 파일 | 조치 |
|---|---|
| `src/data/cache.ts` 7행 `CACHE_KEYS` | 끝에 `"analysisRequests"` 추가 |
| `src/data/firestore-sync.ts` 26행 `MERGE_IDS` | `analysisRequests: (item: { id: string }) => item.id,` 추가. 병합 키다. `NEVER_EMPTY_KEYS`에는 넣지 않는다 |
| `src/data/screen-permissions.ts` `CACHE_KEY_SCREENS`(124행 근처) | `analysisRequests: ["fabricAnalysis"],` 추가 |
| `src/store/useAppStore.ts` | 상태 `analysisRequests: AnalysisRequest[]`, 기본값 `[]`, 저장 함수 아래 참조 |
| `src/data/audit.ts` | `AuditScreen`에 `"analysis"` 추가, 61행 근처 라벨 맵에 `analysis: "FABRIC ANALYSIS"`, 158행 `AUDIT_SCREEN_KEY`에 `analysis: "analysisRequests"` |
| `src/components/settings/DataProtectionPanel.tsx` 라벨 맵(24~32행) | `analysisRequests: "FABRIC ANALYSIS 의뢰"` |

저장 함수(`saveRddaReports` 바로 아래, 같은 모양):

```ts
export function saveAnalysisRequests(list: AnalysisRequest[], kind: AuditKind = "edit"): void {
  const before = useAppStore.getState().analysisRequests
  setAppState({ analysisRequests: list })
  void saveCache("analysisRequests", list)
  void logAction({ kind, screen: "analysis", changes: diffByKey(before, list, (item) => item.id) })
}
```

**모든 저장은 이 함수 하나를 지난다.** 저장 직전 목록은 늘 `useAppStore.getState().analysisRequests`에서 새로 읽어 만든다(대기 중이던 옛 목록으로 저장하면 팀원이 넣은 건을 지운 것으로 병합된다).

### 데이터 도우미 새 파일 `src/data/fabric-analysis.ts`

- `newAnalysisId(): string` — `an:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
- `AN_NO_PATTERN = /^AN\d{8}$/`
- `nextAnNo(list, date = new Date()): string` — 접두 `AN{YY}{MM}`인 번호 중 최댓값 뒷 4자리 + 1. 없으면 0001. 취소 건도 센다(번호 재사용 금지).
- `isDuplicateAnNo(list, anNo, selfId?)`
- 추천값 상수(입력칸 datalist용, 강제 아님): `ANALYSIS_OBJECTIVES = ["Development", "Quality check", "Reference"]`, `ANALYSIS_SOURCES = ["Market sample", "Buyer sample", "Mill sample"]`, `ANALYSIS_GENDERS = ["Women's", "Men's", "Kids", "Unisex"]`, `ANALYSIS_ITEMS = ["Yarn count", "Spinning type", "Contents", "Construction", "Weight", "Density"]`
- `DEFAULT_CUSTOMER = "Hansoll Textile Ltd."`
- `blankAnalysisRequest(opts: { requester: string; requesterEmail: string; list: AnalysisRequest[] }): AnalysisRequest` — 오늘 날짜(현지, `todayValue` 방식. toISOString 금지), `nextAnNo`, state 의뢰, requestType Normal, department는 localStorage `fabric.analysis.lastDepartment`(try/catch), customer DEFAULT_CUSTOMER, 나머지 빈 값.
- `analysisLeadDays(item): number | null` — 완료 건의 finishedAt - requestedAt 일수.

### 메일 새 파일 `src/data/analysis-mail.ts`

`src/data/mail-draft.ts`의 `buildEml`, `mailBodyHtml`, `mailTableHtml`, `downloadEml`, `fileDateStamp`를 쓴다. 창고 `OutboundRequestMailDialog.tsx` 84행과 같은 방식으로 .eml을 내려받게 한다.

- 의뢰 메일: 제목 1건 `[Fabric Analysis Request] 분석 요청 AN26090005`, 여러 건 `... 분석 요청 AN26090005 외 N건`. 첫 줄 1건 `Analysis request number: {anNo} 로 분석 요청이 왔습니다`, 여러 건 `분석 요청 {N}건이 왔습니다`. 표 열: AN No., Requested date, Request type, Requester, Gender, Brand, Construction, Weight, Contents, Source code, Request item. 받는 사람: 분석 받는 사람 목록.
- 완료 메일: 제목 `[Fabric Analysis Request] 분석 완료 ...`(같은 규칙). 첫 줄 `Analysis request number: {anNo} 분석이 완료되었습니다.` 또는 `분석 {N}건이 완료되었습니다.` 표 열: AN No., Finished date, Request type, In charge, Brand, Construction, Contents, Source code, Analysis result(yarnDescription), Comment(commentRnd). 받는 사람: 선택 건 `requesterEmail` 중복 제거(빈 값 제외). 참조: 분석 받는 사람 목록.

### 받는 사람 목록 (`src/data/mail-recipients.ts`)

기존 `RECIPIENT_DOC` 문서에 `analysis` 필드를 더한다. `loadInboundRecipients`, `saveInboundRecipients`를 본떠 `loadAnalysisRecipients`, `saveAnalysisRecipients`를 추가한다(`setDoc ... { merge: true }` 유지, `inbound` 필드를 건드리지 않는다). 편집은 소유자만(`useAuthStore` `isOwner`). 편집 UI는 `InboundRequestMailDialog.tsx`의 받는 사람 편집부(27~70행 `startEdit`, `saveDraft`)를 본뜬 작은 다이얼로그 `src/components/analysis/AnalysisRecipientsDialog.tsx`.

### 사진

Storage 규칙은 `requests/{reqId}/{file}`만 연다. **규칙 배포 없이 쓰려고 분석 사진은 `src/data/request-image.ts`의 `uploadRequestImage(\`analysis-${id}\`, file)`로 올린다.** 경로는 `requests/analysis-{id}/full.webp`, `thumb.webp`. 표시는 `requestImageUrl`, 검사는 `validateRequestImage`. `request-image.ts`와 `storage.rules`는 고치지 않는다.

## 화면 `src/routes/FabricAnalysis.tsx` (통째로 교체)

기존 15줄(AX export 업로드 화면)은 지운다. `ingestFabric`, `parseFabricAnalysis`, `fabricAnalysis` 키와 `derive.ts`는 건드리지 않는다.

구성은 `src/routes/TS.tsx`를 본뜬다(상태 패널 `TsStagePanel`, 상태 탭, 상세 다이얼로그 `TsDetailDialog`). 톤은 TS와 같게.

1. `PageHeader` 제목 `FABRIC ANALYSIS`, 부제 `원단 분석 의뢰와 결과를 관리합니다.` 오른쪽: `새 분석 의뢰`(편집 권한), `받는 사람`(소유자만).
2. 지표 4칸: 분석 대기(의뢰 상태 건수), Urgent 대기, 이번 달 완료, 평균 소요일(최근 90일 완료 건 `analysisLeadDays` 평균, 소수 1자리, 없으면 `-`).
3. 상태 탭 `전체 / 의뢰 / 완료 / 취소`(기본 의뢰) + 검색칸(AN No., Source code, Brand, Requester, Contents, Construction 부분 일치).
4. 표. **`SectionCard`로 감싸지 않는다**(`Reveal` 임계값 때문에 긴 표가 안 보인다). `Card`를 직접 쓴다. 풀폭. 정렬 `anNo` 내림차순. 열: 선택 체크박스, 사진 썸네일(36px, 없으면 빈 칸), AN No., 의뢰일, 구분(Urgent면 빨간 칩), Requester, Brand, Source code, Construction, Contents, Weight, Request item, 상태 칩, In charge, 완료일, Analysis result. 행을 누르면 상세 다이얼로그.
5. 선택 도구줄(1건 이상 선택 시): `의뢰 메일 초안`, `완료 메일 초안`(선택 중 완료 건만 대상, 없으면 비활성).
6. 새 의뢰 다이얼로그 `src/components/analysis/AnalysisRequestDialog.tsx`
   - 칸: AN No.(자동 추천, 고칠 수 있음, 형식과 중복 검사), 의뢰일, Request type(Normal/Urgent), Requester(기본 로그인 이름. Warehouse.tsx 512행 `defaultRequester`와 같은 식), Department, Customer, Objective, Request item(텍스트 + `ANALYSIS_ITEMS` 칩을 누르면 쉼표로 덧붙임), Comment, Source, Source code, Season/Year, Gender/Age, Brand, Construction, Contents, Weight(숫자), 사진(파일 선택 1장).
   - 필수: AN No., 의뢰일, Requester, Request item, Construction과 Contents 중 하나 이상. 빠지면 저장 버튼 비활성과 안내 한 줄.
   - 저장: 레코드를 먼저 저장하고, 사진이 있으면 올린 뒤 경로를 넣어 한 번 더 저장. 사진 실패는 레코드를 지우지 않고 안내만 한다. department를 localStorage에 기억.
   - 저장 뒤 다이얼로그 안에 `의뢰 메일 초안 열기` 버튼을 보인다(자동 다운로드 금지).
   - 같은 다이얼로그를 수정 모드로도 쓴다(상세에서 `의뢰 정보 수정`).
7. 상세 다이얼로그 `src/components/analysis/AnalysisDetailDialog.tsx`
   - 위: 의뢰 정보(읽기, `DetailRows` 모양)와 사진 크게(`requestImageUrl(imagePath)`, 누르면 새 탭).
   - 아래 결과 칸(편집 권한이면 입력): In charge(비었으면 로그인 이름), Yarn description(여러 줄), Construction (RND), Weight (RND), Comment (RND), 완료일(기본 오늘).
   - 버튼: `결과 저장`(상태 유지), `완료 처리`(Yarn description 또는 Comment (RND) 중 하나 필수, state 완료, finishedAt 채움), `완료 되돌리기`(완료 건만, state 의뢰, finishedAt 비움), `의뢰 취소`(의뢰 건만, 확인 한 번), `의뢰 정보 수정`, `완료 메일 초안`(완료 건만), `의뢰 메일 초안`.
   - 삭제 버튼은 만들지 않는다. 번호를 재사용하지 않기 위해 취소 상태로 남긴다.
8. 읽기 권한이면 새 의뢰, 결과 입력, 상태 변경 버튼을 모두 숨기고 메일 초안만 남긴다. 권한은 `useScreenAccess("/fabric-analysis")`로 본다.

## 하지 말 것

- `writeBatch`나 `mergeForKey`를 직접 부르지 마라. 저장은 `saveAnalysisRequests` → `saveCache` 경로만 쓴다(R121, R240 동기화 사고 이력).
- id를 `anNo`로 쓰지 마라. 번호는 사람이 고친다. 병합 id는 `id`다.
- 기존 `fabricAnalysis` 키, `ingestFabric`, `parseFabricAnalysis`, `homeWorkSummary`를 지우거나 고치지 마라.
- 엑셀 업로드 버튼을 이번 화면에 만들지 마라(R244).
- FABRIC REQUEST 파일(`FabricRequest.tsx`, `request-template.ts`, `request-board.ts`)을 건드리지 마라.
- `storage.rules`, `firestore.rules`, `request-image.ts`를 고치지 마라.
- ref 콜백 안에서 setState 하지 마라(R119 백지 사고).
- 실명, 메일 주소를 코드와 문서에 넣지 마라.

## 검증

- `npm run build` 통과(`tsc --noEmit` 포함).
- `git status --short`에 나오는 파일이 아래 표 범위 안.

| 파일 | 조치 |
|---|---|
| `src/data/schema.ts` | 타입 추가 |
| `src/data/cache.ts`, `firestore-sync.ts`, `screen-permissions.ts`, `audit.ts` | 키 등록 |
| `src/store/useAppStore.ts` | 상태와 `saveAnalysisRequests` |
| `src/components/settings/DataProtectionPanel.tsx` | 라벨 |
| `src/data/mail-recipients.ts` | analysis 받는 사람 load/save |
| `src/data/fabric-analysis.ts` | 새 파일 |
| `src/data/analysis-mail.ts` | 새 파일 |
| `src/components/analysis/*.tsx` | 새 파일 3개 |
| `src/routes/FabricAnalysis.tsx` | 교체 |
