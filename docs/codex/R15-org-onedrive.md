# 작업지시 R15 — 조직도 연결 + OneDrive 온라인전용 파일 우아한 처리

전제: R11~R14b 완료. 검증 `npx tsc --noEmit` + `npm run build`. 커밋·실데이터 로그 금지. legacy/ 금지.

## A. OneDrive "온라인 전용(Files On-Demand)" 처리 — folder-source.ts (우선·중요)
팀즈 폴더의 일부 파일이 **로컬에 내려받히지 않은 클라우드 전용**일 수 있다(파일 탐색기 클라우드 아이콘).
이 경우 File System Access 로 `getFile()` 후 크기가 0이거나 읽기 실패한다.
- `readWorkbookFromFolder`/`readWorkbookByPath`/`readTextFile` 에서 파일 크기 0 또는 파싱 실패 시,
  **명확한 사용자 메시지**를 동기화 결과 경고로 올린다:
  `"<파일명> 이(가) OneDrive 온라인 전용 상태입니다. 파일 탐색기에서 해당 파일/폴더를 '이 장치에 항상 유지'로 설정해 내려받은 뒤 다시 시도하세요."`
- 이 경고는 해당 소스만 skip 하고 나머지 반영은 유지. databar/SETTING 데이터소스에 경고 목록 표시.

## B. 조직도 연결 — `조직도 편집기\팀원별 조직도\*.json`
- folder-source 에 `listOrgFiles()` + `readOrgMember(fileName)` 추가(중첩경로 `조직도 편집기/팀원별 조직도`).
- 파일명 = `이름 직급.json` (예: `박향근 차장.json`). **파일명에서 이름·직급 파싱**(부장>차장>과장>대리 순서 상수).
- JSON 내용은 조직도 편집기 산출물 → **읽히면 best-effort 로 활용, 안 읽히면(온라인전용) 이름·직급만** 사용.
- store 에 `orgMembers: [{name, title, rank}]` 추가. 없으면 schema 의 MEMBERS 기본값.

## C. 화면 반영 (가볍게)
- SETTING 사용자 섹션 또는 팀 카드에 **팀 계층**(직급 순 정렬: 부장·차장·과장·대리) 표시.
  이름·직급 배지. 과한 조직도 그래픽은 만들지 마라(가벼운 목록/카드).
- 기존 MEMBERS 기반 로직(담당자 필터 등)은 건드리지 마라. orgMembers 는 표시 보강용.

## 규칙
- 다른 파서·화면 훼손 금지. 새 npm 금지. MutationObserver 금지. reduced-motion 존중. 커밋·실데이터 로그 금지.

## 검증 `npx tsc --noEmit` + `npm run build`.
## 보고 DONE / NEW API / OneDrive 처리 방식 / BUILD / NOTES.
