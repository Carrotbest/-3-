# 작업지시 R18 — 파일 동기화 전면 전환: 화면별 업로드 + 파싱 로딩 팝업 + 결과 캐싱

전제: R17 완료. 검증 `npx tsc --noEmit` + `npm run build`. 커밋·실데이터 로그 금지.
사용자 확정: **폴더 자동연결 완전 제거 → 화면별 업로드로 대체**, **파싱 결과 IndexedDB 캐싱**(새로고침 유지).

## 목표
1. 각 화면에서 그 화면이 쓰는 엑셀을 **드래그앤드롭 또는 파일 선택**으로 업로드해 파싱·반영.
2. 파싱 중 **로딩 상태 팝업**(읽는 중 → 파싱 → 검증 → 완료/오류).
3. 파싱 결과를 **IndexedDB 에 캐싱**해 새로고침·재접속 시 자동 복원. SETTING 에 "캐시 비우기".
4. **폴더 자동연결(디렉터리 피커·저장된 핸들·자동 새로고침) 완전 제거.** 파서·reconcile·meta 로직은 보존.

---

## A. 데이터/인프라 (핵심 계약)

### A-1. `src/data/upload.ts` (신규) — 파일 → 파싱 → 스토어 → 캐시
기존 파서를 재사용한다. `applyParsed`(현재 `folder-source.ts` 안, reconcile+meta+setAppState)를 **export 하거나 upload.ts 로 이동**해 재사용.
각 함수는 `File`(또는 `File[]`)을 받아 파싱하고 해당 스토어 슬라이스를 갱신, 성공 시 캐시에 저장한다. 파싱은 `XLSX.read(await file.arrayBuffer(), { type:"array", cellDates:true })`.

- `ingestDevelopment(file: File): Promise<void>`
  - 워크북에 `전체현황` 시트 있으면 `parseDevelopment(wb)`, 없으면 `loadTds(file)` 의 records.
  - `applyParsed(records, store.completed, wb, file.name)` 로 **reconcile+meta 보존**(대조 실패 시 records 미갱신·meta만).
  - 캐시: `records`, `meta`, `completed`(변동 없으면 그대로).
- `ingestSamples(file): Promise<void>` — `parseSamples(wb)` → `setAppState({completed})`. 캐시 completed. (reconcile 은 DD 내부 대조이므로 샘플 단독 업로드는 reconcile 불필요.)
- `ingestStudy(files: File[]): Promise<void>` — 파일 중 `Capability Improvement`/`.xlsx` 워크북 → `parseStudy(wb)` → study. 나머지 첨부(ppt/pdf/doc/docx 등) 파일명 → `studyFiles`. 캐시 study·studyFiles.
- `ingestRdda(files: File[]): Promise<void>` — 월별 RDDA xlsx 들 → 기존 `parseRdda`/`parseRddaSnapshot` 계약대로(최신월 기준). 캐시 rdda.
- `ingestFabric(file): Promise<void>` — `parseFabricAnalysis(wb)` → fabricAnalysis. 캐시.
- `ingestTs(file): Promise<void>` — Technical survices 워크북 파싱(기존 TS import 경로 재사용: `TS.tsx`/parser 에 이미 있으면 그것을 호출) → `mergeTsRecords`. 캐시 ts.
- `ingestOrg(files: File[]): Promise<void>` — 조직도 JSON 파일들 → 기존 org 파싱 로직(파일명 폴백 포함) → orgMembers. 캐시.

공통: 각 ingest 는 **파싱 상태를 store 의 `ingest` 슬라이스로 보고**(A-3). 오류는 throw 하지 말고 상태에 담아 UI 가 표시.

### A-2. `src/data/cache.ts` (신규) — IndexedDB 파싱결과 캐시
- DB 하나(예: `fabric-rnd-cache`), objectStore `parsed`, 키 = 슬라이스명(`records|completed|meta|study|studyFiles|rdda|fabricAnalysis|ts|orgMembers`).
- `saveCache(key, value)`, `loadAllCache(): Promise<Partial<AppState>>`, `clearCache(): Promise<void>`.
- 값은 JSON 직렬화 가능한 현재 스토어 형태 그대로(파서가 날짜를 ISO 문자열로 저장하므로 안전).
- **App 초기화 시 `loadAllCache()` 로 스토어를 덮어써 복원.** 캐시 비어 있으면 기존 데모 유지.
- 민감정보는 사용자 PC 브라우저에만 남고 git 과 무관(주석으로 명시).

### A-3. store `ingest` 슬라이스 (로딩 팝업용)
`useAppStore` `AppState` 에 추가:
```ts
ingest: { active: boolean; kind: string | null; fileName: string | null; step: "reading"|"parsing"|"validating"|"done"|"error"; message: string | null }
```
setter `setIngestState(patch)`. ingest 함수가 단계별로 갱신(reading→parsing→validating→done, 실패 시 error+message).

### A-4. 폴더 자동연결 제거
- `App.tsx`: `startFolderAutoRefresh()` 제거 → 대신 마운트 시 `loadAllCache()` 로 캐시 복원(1회).
- `folder-source.ts`: 디렉터리 피커/저장 핸들/자동 새로고침 공개 API(`connectFolder`, `refreshSavedFolder`, `startFolderAutoRefresh`, `pickFolder`, `saveHandle`, `loadHandle`, `syncFromFolder`, handle IndexedDB) **제거**. 파서 호출 헬퍼·`applyParsed`·`reconcile` 연계는 upload.ts 로 옮기거나 유지. `syncFromFiles` 는 upload.ts 로 대체.
- `store.folderSource` 는 제거하거나 최소화(연결/권한/자동새로고침 필드 불필요). DataSourceBar·Sync·SETTING 의 폴더 관련 참조를 정리(빌드 깨지지 않게).

---

## B. UI

### B-1. `src/components/upload/DataUpload.tsx` (신규) — 공용 업로드
- props: `{ kind: string; label: string; accept?: string; multiple?: boolean; onFiles: (files: File[]) => void; compact?: boolean }`.
- 드래그앤드롭 존 + `<input type="file" accept={accept} multiple={multiple}>`("파일 선택" 버튼). accept 기본 `.xlsx,.xls,.csv`.
- dragover 하이라이트, 드롭/선택 시 `onFiles`. 접근성(label, keyboard). 토큰 색만.
- `compact` 모드: 헤더에 놓는 작은 "엑셀 업로드/교체" 버튼. 기본 모드: 큰 드롭존(빈 상태용).

### B-2. `src/components/upload/ParsingOverlay.tsx` (신규) — 로딩 팝업
- store 의 `ingest` 를 구독. `active` 면 전체 화면 위 모달(반투명 배경 + 카드).
- 스피너 + 파일명 + 단계 라벨(읽는 중/파싱 중/검증 중/완료). `error` 면 빨강 메시지 + 닫기 버튼.
- `done` 이면 잠깐 성공 표시 후 자동 닫힘(또는 확인 버튼). reduced-motion 존중.
- `App.tsx` 최상단(라우터 밖)에 1회 마운트.

### B-3. 화면별 업로드 배치 (각 화면 헤더에 compact 업로드 + 데이터 없을 때 큰 드롭존)
데이터 유무 판정은 "실데이터인지"—간단히 `meta.mode !== "demo"`(또는 슬라이스 비어있음)로. 데모 상태면 큰 드롭존 empty-state, 실데이터면 헤더 compact 버튼.
- **HOME**: PageHeader 액션에 compact 업로드(개발 현황=DD, 샘플대장 2종). `onFiles`→ 파일명으로 DD/샘플 분기(`전체현황` 시트 유무 또는 파일명 `샘플 관리 대장`)해 `ingestDevelopment`/`ingestSamples`.
- **DEVELOPMENT**: 동일(DD+샘플). 데모면 상단 드롭존.
- **STUDY**: `ingestStudy`(워크북+첨부 다중). 헤더 compact + 데모 드롭존.
- **TS 관리**: `ingestTs`(Technical survices.xlsx). 기존 import 버튼이 있으면 이 방식으로 통합.
- **RDDA**: `ingestRdda`(월별 다중 선택).
- **FABRIC ANALYSIS**: `ingestFabric`(원단분석 export 1개). 파일 없을 때 안내 + 드롭존.
- **CALENDAR**: 업로드 없음(현행 유지).
- **SETTING**: 조직도 업로드(`ingestOrg`, 다중) + **"캐시 비우기"** 버튼(`clearCache()` 후 데모로 리셋). 기존 폴더 연결 카드 제거.

### B-4. DataSourceBar / Sync 화면
- 상단 DataSourceBar: 폴더 연결 상태 대신 **현재 데이터 출처 요약**(데모/업로드됨 + 마지막 업로드 시각) + 전역 compact 업로드(선택). 폴더 문구 제거.
- Sync 화면(동기화 상태): 폴더 동기화 개념 제거 → "데이터 출처·대조 결과·캐시 상태" 뷰로 축소(대조 5종 결과는 유지). 라우트/사이드바 항목은 유지하되 내용 정리.

---

## 규칙
- 파서·reconcile·meta·대조 5종 로직 보존(대조 실패 시 records 미반영 유지). 집계는 derive.
- 새 npm 금지(xlsx·zustand·기존 것만). MutationObserver 금지. reduced-motion 존중. 커밋·실데이터 로그 금지. `legacy/` 접근 금지.
- 빌드가 어느 단계에서도 깨지지 않게: 폴더 API 제거 시 남은 참조를 모두 정리.

## 검증 `npx tsc --noEmit` + `npm run build`.
## 보고 DONE 파일 / 신규 모듈·컴포넌트 / 제거한 폴더 API / 화면별 업로드 매핑 / 캐시 키 / TSC·BUILD / NOTES(가정·한계).
