# 작업지시 R28 — TS 신규 접수 폼 전면 재설계 (엑셀 기준 정리 + 발주 삭제)

작성: Claude (실파일 분석·기획) / 구현: Codex / 최종 검토: Claude
대상: `src/routes/TS.tsx`, `src/data/schema.ts`(또는 `sample.ts`의 `TsRecord`), `src/data/xlsx-parsers.ts`, `src/data/derive.ts`

## 배경 — 실파일 분석 (Claude가 원본 직접 확인)

`Technical survices 2026.xlsx` [TS] 시트, 헤더 4행/데이터 5행~, 유효 24건. 14개 컬럼 실측:

| 엑셀 컬럼 | 역할 | 입력률 |
|---|---|---|
| Date | 접수일 | 100% |
| From | 요청자(사람/부서) | 100% |
| 유관부서 | 관련 부서/바이어 | 100% |
| Attn | 메일 수신자 | 50% |
| Advisor | 우리팀 TS 담당자 | 100% |
| Subject | 건명(자유 텍스트, 평균 40자) | 100% |
| Inquiry | 의뢰 내용/요청 조건 | 100% |
| Analysis | 현황 분석 | 100% |
| Causes | 원인 | 88% |
| Action | 해결 방안/조치 | 100% |
| Result | 결과/후속 | 83% |
| 생산처 | 생산처 | 92% |
| Order Volume | 발주량(자유 텍스트, "약 40만장") | 25% |

**업무 프로세스**: 사업부/유관부서가 통원부3팀에 Trouble shooting 의뢰 → 요청조건(Inquiry) 보고 현황분석(Analysis) → 원인(Causes) 파악 → 해결방안(Action) 제시 → 결과(Result). 요청자(From)·관련부서(유관부서)·수신자(Attn)·담당(Advisor)이 각각 다른 주체다.

**현재 웹 폼의 문제**: Subject를 잘못 "유형 드롭다운"으로 사용, Inquiry/Analysis/Action/Result가 폼에 없음, 엑셀에 없는 Style No./조직/시험항목이 붙어 있음, 발주(Order) 추적 로직이 붙어 있음.

## 사용자 확정 방향

- 엑셀 컬럼 기준으로 필수/선택 재구성.
- Inquiry/Causes/Analysis/Action/Result를 **워크플로 순서(의뢰→분석→원인→해결→결과)로 정리**.
- Order Volume은 수치가 아니라 **자유 텍스트**로 입력.
- **기존 발주 관련 부분(발주 미연결 사유, 발주량 기입률 추적, orderQty 숫자화)은 전부 삭제.**
- 웹 입력이 원본. 사용자가 엑셀 내용을 하나씩 웹에 입력해 옮긴다.

## 절대 건드리지 말 것

- HOME 상단·DEVELOPMENT·RDDA·STUDY 화면 회귀 금지.
- TS 파서의 **컬럼 위치 탐색 방식**(헤더 별칭)은 유지하되 매핑 대상만 조정.
- git commit / reset / checkout 금지. 실제 데이터 값을 로그·문서에 남기지 마라.

---

## 1) 데이터 모델 `TsRecord` 재정의

현재 `TsRecord`(sample.ts / TechnicalServiceRecord)에서 **제거**: `orderQty: number`, `unlinkedReason`, `styleNo`, `flNo`, `construction`, `testItem`.
**최종 필드**:

```ts
export type TsState = "접수" | "처리중" | "완료"

export interface TsRecord {
  id: string
  receivedAt: string        // Date, YYYY-MM-DD
  subject: string           // 건명 (자유 텍스트)
  from: string              // 요청자
  relatedDepartment: string // 유관부서
  attn: string              // 수신자 (선택)
  advisor: string           // 담당 (팀원)  ※ 기존 owner→advisor 로 명확화(호환 위해 owner 별칭 유지 가능)
  inquiry: string           // 의뢰 내용
  analysis: string          // 현황 분석
  causes: string            // 원인
  action: string            // 해결 방안
  result: string            // 결과
  productionSite: string    // 생산처 (선택)
  orderVolume: string       // 발주량 (자유 텍스트, 선택)
  attachment?: string       // 첨부 SharePoint 링크 (선택)
  state: TsState
  source?: "excel" | "web"
}
```

- `advisor`가 담당이다. `derive.ts`의 `tsMaterials`는 R27대로 **owner(=advisor)**, 요약=**causes**, 제목=**subject** 유지. 필드명이 `owner`→`advisor`로 바뀌면 `tsMaterials`도 맞춰라.
- 데모 데이터(`sampleTs`)도 새 구조로 갱신(발주/불필요 필드 제거, inquiry/analysis/action/result에 예시 텍스트).

## 2) 파서 `parseTechnicalServices` 조정

- `Order Volume`을 **문자열 그대로**(`orderVolume: text(...)`) 읽는다. 숫자 변환(`numberOrNull`)·`orderQty`·`unlinkedReason` 제거.
- 나머지 컬럼(From/유관부서/Attn/Advisor/Subject/Inquiry/Causes/Analysis/Action/Result/생산처)은 기존 헤더 별칭 탐색 그대로 각 필드에 매핑.
- 상태(state): 엑셀엔 상태 컬럼이 없다. `Result`가 있으면 `완료`, 아니면 `처리중`으로 폴백(기존 로직 유지, "접수"는 웹 신규 입력에서만).
- `styleNo/flNo/construction/testItem` 매핑 제거.

## 3) TS 화면(`TS.tsx`) 재구성

### 3-A. 신규 접수 폼

섹션 3그룹으로 재구성. **Subject는 자유 입력 텍스트**(현재 유형 select 제거).

- **필수 항목** (4): 접수일(date) · Subject 건명(text) · 요청자 From(text) · 담당 Advisor(select, 팀원 `MEMBERS`).
- **의뢰 정보** (선택 3): 유관부서(text) · 수신자 Attn(text) · 생산처(text).
- **Trouble shooting 내용** (선택, textarea, 워크플로 순서로): 의뢰 내용(Inquiry) → 현황 분석(Analysis) → 원인(Causes) → 해결 방안(Action) → 결과(Result). 각 textarea, 여러 줄 입력.
- **상태·기타**: 상태(select: 접수/처리중/완료) · 발주량(text 자유입력, placeholder 예: "약 40만장 연속 오더") · 첨부(SharePoint 링크 text, `https://` 검증, R24 규칙 재사용).
- **삭제**: 대상 Style No. / FL No. / 조직 / 시험 항목 / 발주 미연결 사유.
- 유효성: 필수 4개만 required. 완료 저장 시 발주량 강제하던 검증 제거.
- 저장 로직은 기존 방식 유지하되 새 필드로. `source:"web"`.

### 3-B. 발주 추적 제거

- **"발주량 기입률" SectionCard 전체 삭제**(`linkedDone`, `unlinked` 집계, 관련 UI).
- 목록 테이블의 `발주량` 컬럼: 숫자(`fmtNum yds`)·`unlinkedReason` 폴백 제거 → **발주량 텍스트 그대로** 표시(없으면 `—`).
- `KpiRow`/상단 카드가 발주 지표를 쓰면 의미 있는 다른 지표(접수/처리중/완료 건수)로 교체.

### 3-C. 목록·상세

- 목록 컬럼(예): #T/S · 접수일 · Subject · 요청자 · 담당 · 상태 · (발주량 텍스트). 검색은 subject/from/advisor/inquiry 대상.
- 상세(행 클릭 또는 덱): 4주체(요청자/유관부서/수신자/담당) + 워크플로 5필드(의뢰/분석/원인/해결/결과) + 생산처/발주량/첨부. 링크 없으면 R27대로 "SharePoint 열기" 미표시.

## 4) HOME Work report의 TS 요약 카드 영향

- `homeWorkSummary`의 TS 부분이 발주(unlinked)를 참조하면 제거하고 접수/처리중/완료 건수 기반으로 바꾼다. HOME이 깨지지 않게.

## 검증

- `npm run build` 통과.
- 신규 접수 폼에 필수 4 + 의뢰정보 3 + 워크플로 5(textarea) + 상태/발주량/첨부가 나오고, **Subject가 자유 입력**인지.
- 발주 미연결/발주량 기입률/시험항목/Style No./조직 폼·표·집계가 **모두 사라졌는지**.
- 발주량이 텍스트로 저장·표시되는지.
- 웹 입력 저장 후 목록·상세·(HOME/TS 덱 카드)에 반영되는지. 덱 요약=Causes, 담당=Advisor, 제목=Subject.
- HOME 상단·DEVELOPMENT 회귀 없음, 콘솔 에러 없음.

## 완료 후 보고

- 최종 TsRecord 필드
- 폼 그룹 구성과 필수/선택
- 삭제한 발주 관련 코드 범위
- 파서 Order Volume 처리 변경
