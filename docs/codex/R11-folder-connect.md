# 작업지시 R11 — 팀즈 폴더 연결 (File System Access) + 실데이터 파서

전제: `docs/REACT_REBUILD.md`, **`docs/reference/data-sources.md`(실제 파일 구조·매핑, 반드시 정독)**.
검증 `npx tsc --noEmit` + `npm run build`. 토큰 색만. React18 forwardRef 규칙. 커밋 금지.

## 목표
사용자가 동기화된 팀즈 폴더(`통합원단부 - 3팀`)를 **1회 선택**하면, 앱이 루트의
`Development Dashboard.xlsx` 와 `샘플 관리 대장.xlsx` 를 **직접 읽어** 화면에 반영한다.
하루 1~2회 자동 + 수동 새로고침. 데이터는 브라우저 세션에만(전송·저장·커밋 없음).

## 1. 폴더 소스 모듈 — `src/data/folder-source.ts` (신규)
- `isSupported()` = `'showDirectoryPicker' in window` (크로미움만).
- `pickFolder()` = `await window.showDirectoryPicker({ mode:'read' })` → 핸들 반환.
- **핸들 영속화**: 브라우저 IndexedDB 에 저장(새 npm 금지 — 최소 IndexedDB 래퍼를 직접 작성).
  `saveHandle(handle)`, `loadHandle()`.
- `ensurePermission(handle)` = `handle.queryPermission({mode:'read'})`, 아니면 `requestPermission`.
- `readWorkbookFromFolder(dirHandle, fileName)`:
  디렉터리 순회로 대소문자·공백 관대하게 파일 탐색 → `getFile()` → `arrayBuffer()`
  → `XLSX.read(buf,{type:'array',cellDates:true})` 반환. 없으면 명확한 에러.
- `syncFromFolder(dirHandle)`:
  두 워크북 읽기 → 파서(아래) → reconcile → 통과 시 store 반영(records/completed/meta),
  실패 시 이전 값 유지 + meta.passed=false. meta.appliedAt=now, meta.fileName=폴더명.

## 2. 실데이터 파서 — `src/data/xlsx-parsers.ts` (신규). 매핑은 data-sources.md 표 그대로.
- `parseDevelopment(workbook) -> DevRecord[]`:
  `전체현황` 시트, 헤더=행 index 3, 데이터=행 index 5부터. 컬럼 인덱스로 읽어 DevRecord 로 매핑.
  - Category 축약: `SEASON DEV→SEASON`, `CORE UPDATE→CORE`, `EU MARKET→EU MARKET`, `PROJECT→PROJECT`.
  - `Co`(GD/국내/생산) → `devType`('GD'|'국내'). GD#/SA# → gdNo/saNo.
  - stage 판정: 공정 status 컬럼(30 Yarn in-fac / 32 Knitting / 34 Dyeing / 36 Finishing)에서
    마지막으로 완료/진행된 단계로 결정(가장 진척된 공정). FL# 있으면 완료로.
  - Status(진행중/완료/HOLD/DROP/REJECT) 보존(별도 필드 `devStatus`). DROP/REJECT 는 집계에서 제외 가능하도록.
  - Style No. 빈 행·소계 행 skip.
- `parseSamples(workbook) -> CompletedSample[]`:
  `창고보관` + `소진완료` 시트(헤더 행 index 3~4, 데이터 행 index 5부터).
  Final Data Width(13)/Weight(14) → inhouse.widthCm/weightGsm, Shrinkage(29/30) → inhouse.shrinkagePct,
  process = Yarn/Knit/Dye/Finish Status + Remark/Issue(28). pilling 없음 → null.
  Style/#·FL.#·Season·Category·Buyer·Developer·Cons. 매핑. Finish Date → completedAt.
- `parseListsToSettings(workbook)`(선택): `Lists` 시트 → 기준값(Status/Season/Category/Co/Dyeing Side/Cons./Finishing).
  있으면 SETTING 기준값 초기화에 사용.
- 헤더 위치가 흔들릴 수 있으니, 정확히 매칭 안 되면 상단 몇 행 안에서 헤더 텍스트로 탐색하는 폴백 둘 것.

## 3. reconcile 적응 — `src/data/reconcile.ts`
실제는 per-담당 시트가 아니라 `전체현황` 단일 시트 + 담당 컬럼이다. 대조 방법을 현실화:
- 담당별 합(전체현황 `담당` 그룹 합) vs 전체 / 카테고리별 합 / 시즌별 합 / Style+Opt 중복 / DROP·REJECT 제외 수.
- per-developer 요약 시트(박향근 등)의 TOTAL 을 교차 대조로 쓸 수 있으면 추가. 계산 불가 항목은 실패가 아니라 skip(ok) 처리.

## 4. SETTING "데이터 소스" 카드
- `src/routes/Setting.tsx` 에 데이터 소스 섹션 추가:
  - 미연결: "팀즈 폴더 연결" 버튼 → pickFolder → saveHandle → syncFromFolder.
  - 연결됨: 폴더명 · 마지막 동기화 시각 · "지금 새로고침" · "폴더 다시 선택" · 자동 새로고침 on/off.
  - 비지원 브라우저(showDirectoryPicker 없음): 안내 + 기존 "파일 열기" 수동 업로드 유지.

## 5. 자동 새로고침 — `src/store` 또는 App 레벨
- 앱 로드 시 저장된 핸들 있고 권한 OK면 자동 syncFromFolder.
- window `focus` 시 재동기화(쓰로틀 30분). setInterval 6시간. 수동 버튼.
- reduced-motion 무관. 실패는 조용히 로그 + databar 에 상태 표시(기존 databar 재사용).

## 6. 상단 databar/파일 열기
기존 "TDS 파일 열기" 수동 업로드는 **폴백으로 유지**. databar 문구를 폴더 연결 상태로 갱신.

## 하지 말 것
- 새 npm 설치(IndexedDB·FS Access·SheetJS 로 자체 구현). 실데이터를 repo·문서·로그에 남기기.
- 다른 화면 레이아웃 훼손. MutationObserver 표 감시. 커밋.

## 검증
`npx tsc --noEmit` + `npm run build`. **브라우저 폴더 선택은 사용자 제스처가 필요해 Codex/자동화로 테스트 불가**
→ 코드 정확성(타입·경로·매핑 인덱스)까지만. 실제 폴더 읽기는 사용자가 확인한다.

## 보고
DONE / NEW FILES / PARSER 매핑 요약 / BUILD / NOTES(브라우저 지원·권한 흐름·미해결).
