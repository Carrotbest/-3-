# 작업지시 R13 — TS 관리: 기존 엑셀 가져오기 + 엑셀 내보내기 (웹이 원천)

전제: `docs/REACT_REBUILD.md`, `docs/reference/data-sources.md`. R11·R12 완료.
**확정 전략: TS 는 웹 직접 입력이 원천(SoR).** 기존 `Technical survices {연도}.xlsx` 는 **초기 1회/수동 가져오기**로만 쓰고,
자동 동기화 대상이 아니다(덮어쓰기 방지). 산출은 **새 엑셀 파일 다운로드**(폴더 덮어쓰기 안 함).
검증 `npx tsc --noEmit` + `npm run build`. 토큰 색만. 커밋 금지.

## 실제 파일 구조 (TECH SERVICE\Technical survices {연도}.xlsx)
시트 `TS`. 현행(2026) 헤더 = **행 index 3**, 데이터 = **행 index 4부터**:
```
# T/S | Date | From | 유관부서 | Attn | Advisor | Subject | Inquiry | Causes | Analysis | Action | Result | 생산처 | Order Volume
```
(구형 2025 는 열 순서가 다름: #T/S·Date·Subject·Analysis·Causes·Action·Result·Advisor·유관부서1~3·생산처·Order Volume.
→ **헤더 텍스트로 레이아웃 자동 판별**: `From`/`Inquiry` 있으면 2026, 없으면 2025.)
- **엑셀엔 상태·발주 미연결 사유 컬럼이 없음.** 웹이 추가한다.

## 1. 파서 (xlsx-parsers.ts 에 추가)
`parseTechnicalServices(workbook): TsRecord[]`
- `TS` 시트, 헤더 행 탐색(상단 5행 내 `# T/S`/`Subject` 포함 행), 데이터는 그 다음 행부터.
- 헤더명으로 컬럼 인덱스 매핑(순서 하드코딩 대신 이름 매칭). `# T/S` 빈 행 skip.
- TsRecord 매핑: id(`# T/S` → 예 `TS26-001` 형식 생성 또는 원본 번호), receivedAt(Date), from(From 또는 유관부서),
  subject(Subject), owner(Advisor), orderQty(Order Volume 숫자만), 그리고 상세필드
  inquiry/causes/analysis/action/result(있으면), 생산처.
- **상태 추론**(엑셀에 없으므로): Result 채워짐 → `완료`, 아니면 `처리중`(Date만 있으면 최소 접수). 추론 규칙 명확히 주석.
- **발주 미연결 판정**: 상태=완료인데 Order Volume 비면 → 발주 미연결(사유는 빈 값, 웹에서 채우도록).

## 2. 가져오기 흐름 (수동, 자동 아님)
- folder-source.ts 의 `readWorkbookByPath` 로 `TECH SERVICE / Technical survices {연도}.xlsx` 읽기.
  연도 자동 선택: 폴더 파일명에서 가장 큰 연도. 잠김/없음이면 명확한 안내.
- TS 화면(또는 SETTING TS 영역)에 **"기존 TS 엑셀 가져오기"** 버튼:
  parseTechnicalServices → 기존 `store.ts` 와 **id 기준 병합(dedupe)** → localStorage 저장.
  이미 있는 건 덮지 않음(웹 입력분 우선). 가져온 건수 안내.
- **syncFromFolder 에는 TS 를 넣지 마라**(TS 는 웹 SoR, 자동 덮어쓰기 금지).

## 3. 엑셀 내보내기 (새 파일 다운로드)
- TS 화면에 **"엑셀 내보내기"** 버튼: `store.ts` 를 2026 헤더 레이아웃의 워크북으로 구성
  (SheetJS `XLSX.utils.json_to_sheet` + `XLSX.writeFile` 또는 Blob 다운로드).
  파일명 `Technical_Services_export_YYYYMMDD.xlsx`. **폴더에 쓰지 말고 브라우저 다운로드.**
- 상태·발주 미연결 사유 등 웹 전용 컬럼도 포함(팀이 엑셀에서도 보게).

## 4. 화면 유지
- R8 의 TS 화면(상단 스텝퍼·신규접수 폼·완료 저장 규칙)은 그대로. 상단 액션에 가져오기/내보내기 버튼 추가.
- 데모(미가져오기) 시 기존 sample 유지.

## 규칙
- dev/sample/STUDY 파서·다른 화면 훼손 금지. reconcile 대상 아님. 실데이터 repo·로그 금지. 새 npm 금지. 커밋 금지.

## 검증 `npx tsc --noEmit` + `npm run build`. 실제 가져오기/내보내기는 사용자 확인.
## 보고 DONE / NEW API / 상태추론 규칙 / BUILD / NOTES.
