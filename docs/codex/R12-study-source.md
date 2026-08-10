# 작업지시 R12 — STUDY 실데이터 연결 (Capability Improvement + 자료 폴더)

전제: `docs/REACT_REBUILD.md`, `docs/reference/data-sources.md`(§C STUDY 행). R11 폴더 연결 완료.
검증 `npx tsc --noEmit` + `npm run build`. 토큰 색만. 커밋 금지.

## R11 이 만든 실제 API (그대로 사용/확장)
- `src/data/folder-source.ts`: `readWorkbookFromFolder(dirHandle, fileName)`, `syncFromFolder(dirHandle)`,
  `syncFromFiles(files)`, `connectFolder()`, `refreshSavedFolder()`.
- `src/data/xlsx-parsers.ts`: `parseDevelopment`, `parseSamples`.
- `src/store/useAppStore.ts`: `setAppState`, `folderSource` 상태. STUDY 는 `store.study` 사용.

## 할 일

### 1. 중첩 경로 읽기 헬퍼 (folder-source.ts 확장)
현재는 루트 파일만 읽는다. STUDY 파일은 **하위 폴더**에 있다:
`주별 UPDATE 자료 / 개인 STUDY 과제 / Capability Improvement (개선안).xlsx`
- `readWorkbookByPath(dirHandle, pathParts: string[])` 추가: 하위 디렉터리를 `getDirectoryHandle` 로 순회 →
  마지막 파일을 대소문자·공백 관대하게 탐색 → 워크북 반환. 폴더/파일 없으면 명확한 에러(동기화 결과에 경고).
- `listFilesInSubfolder(dirHandle, pathParts: string[])` 추가: 해당 폴더의 **파일명 목록만** 반환(내용 파싱 없음).
  자료 라이브러리용. 경로: `주별 UPDATE 자료 / 개인 STUDY 과제 / 자료`.

### 2. STUDY 파서 (xlsx-parsers.ts 에 추가)
`parseStudy(workbook): StudyRecord[]`
- 시트: `Summary` 제외, 팀원 시트(`진영은`·`김지현`·`변재휘` 등 — Summary 아닌 모든 시트). 시트명 = owner.
- 헤더 = **행 index 1**, 데이터 = **행 index 2부터**. 컬럼:
  `0 Year, 1 Wk, 2 주차(월), 3 주제, 4 분류, 5 선정 배경, 6 주제 확정일, 7 작성 목표일, 8 완료일자, 9 자료(파일명), 10 상태, 11 미진행 사유`
- StudyRecord 매핑(필요시 schema.ts 의 StudyRecord 확장, 기존 필드 유지):
  week(Wk 숫자), owner(시트명), topic(주제), category(분류), state(상태: 완료/진행/계획/미진행),
  dueDate(작성 목표일), + `selectionReason`(선정 배경), `confirmedDate`(확정일), `completedDate`(완료일자),
  `materialFile`(자료 파일명), `reason`(미진행 사유). 빈 행 skip.
- 상태 문자열 정규화: 파일값(완료/진행/계획/미진행/미진행 등) → 화면 배지 매핑에 맞춤.

### 3. 동기화에 STUDY 연결 (folder-source.ts `syncFromFolder`)
- 기존 dev/sample 읽기에 이어, `readWorkbookByPath(...Capability Improvement...)` 시도 → `parseStudy` →
  `setAppState({ study })`. 파일이 없거나 잠기면 **STUDY 만 skip**(dev/sample 반영은 유지), 경고 기록.
- `listFilesInSubfolder(...자료)` → `setAppState({ studyFiles })`(파일명 배열). 파일명 규칙 `YYYY.MM.DD 주제 (작성자)`
  파싱해 라이브러리 카드에 사용.
- store 에 `study`(있으면 재사용) + `studyFiles: string[]` 상태 추가.

### 4. STUDY 화면 (Study.tsx) 실데이터 반영
- 연결되면 `store.study`(실데이터) 사용, 미연결이면 기존 sample 유지(폴백).
- **주차 캘린더**: 실제 Wk/주차(월)로 열 구성(최근 N주). 팀원 행 = 파싱된 owner 들.
- **미진행 사유**: 실제 `reason` 컬럼 표시(더는 '사유 미기재' 하드코딩 아님, 값 없으면만 미기재).
- **자료 라이브러리**: `studyFiles` 파일명 파싱(날짜/주제/작성자) → 카드. Capability 의 `materialFile` 과 대조해
  "규칙 위반/짝 없음" 표시(기존 자리 활용). 파일 열기는 아직 링크 불가하니 파일명만.

## 규칙
- 다른 화면·dev/sample 파서 훼손 금지. reconcile 은 dev/sample 기준 유지(STUDY 는 대조 대상 아님).
- 실데이터 repo·로그 금지. 새 npm 금지. MutationObserver 금지. reduced-motion 존중.

## 검증 `npx tsc --noEmit` + `npm run build`. 실제 폴더 읽기는 사용자 확인.
## 보고 DONE / NEW API / PARSER 매핑 / BUILD / NOTES.
