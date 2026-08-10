# 작업지시 R3b — 나머지 화면 (TS·STUDY·SYNC·SETTING·CALENDAR·RDDA) + DEVELOPMENT 보드/타임라인

전제: `docs/REACT_REBUILD.md` 읽기. R0·R2·R3a 완료. 공용 부품이 이미 있다 —
**새로 만들지 말고 재사용하라**: `src/components/dashboard/{StatCard,SectionCard}`,
`src/components/charts/{AreaCard,BarCard,DonutCard,Sparkline}`,
`src/components/data-table/{DataTable,StatusBadge}`, `src/components/ui/*`(sheet 포함).
검증은 `npx tsc --noEmit` + `npm run build`.

## 먼저 읽을 것

- `src/routes/Home.tsx`, `src/routes/Development.tsx` — **이 두 파일이 스타일·구조의 본보기다. 그대로 따른다.**
- `src/store/useAppStore.ts`, `src/data/{schema,derive,reconcile,format}.ts`
- 각 화면의 원래 요구사항: `legacy-vanilla/assets/js/views/{ts,study,sync,setting,calendar,rdda}.js`
  (동작·구성 참고용. React+shadcn 으로 다시 쓴다. 로직은 src/data 함수를 쓴다.)

## 만들 화면 (각 src/routes/*.tsx)

### 1. TS.tsx — TS 관리
- StatCard 4: 접수 / 처리중 / 완료 / 발주 미연결(0 아니면 destructive 톤).
- **발주량 기입률** — 진행바 + "완료 N건 중 M건". 이 화면의 핵심.
- 상태 탭(전체/접수/처리중/완료) + DataTable(TS# / 접수일 / Subject / 요청처 / 담당 / 상태배지 / 발주량).
- **신규 접수 폼** (shadcn Card + Input/Label/Select). **완료 저장 규칙**:
  상태를 '완료'로 저장하려는데 발주량·발주 미연결 사유가 **둘 다 비면 저장 차단**,
  해당 필드에 `aria-invalid` + 오류문구. 하나 채우면 다른 쪽 비활성.
- 입력은 `useAppStore` 의 ts 갱신 + `localStorage['fabric.ts']` 저장. 삭제 기능 없음.
- 유형별 통계 BarCard(horizontal).

### 2. Study.tsx — STUDY 과제
- 서브 탭: 진행 현황 / 자료 라이브러리.
- 진행 현황: 이번 주 목요일 마감 알림(미제출 수), **주차×팀원 매트릭스**(CSS grid, 상태 배지),
  분류별 누적 BarCard, 미진행 목록(사유는 '사유 미기재'), 팀원 클릭 시 개인 상세.
- 자료 라이브러리: 검색+필터 껍데기, 예시 카드 1장 + emptyState('연결 예정 …'),
  파일명 규칙 문구(`YYYY.MM.DD 주제 (작성자)`). 더미 지어내지 마라.

### 3. Sync.tsx — 동기화 상태
- meta 기반. 상태 배너(통과 ok / 실패 crit: 어느 검사 몇 건 차이 + 이전값 유지 + 다음 조치 / 데모 중립).
- StatCard 4: 마지막 반영 시각 / 대조 n/5 / 반영 건수 / 경과일(7↑ warn).
- 대조 결과 DataTable(meta.checks 5행: 방법/엑셀합/반영값/차이/판정배지/비고).
- 반영 이력 DataTable(meta.history), 실패행 사유 표시.
- 데이터 이상 항목(meta.anomalies) — 없으면 emptyState. "원본은 고치지 않습니다" 문구.
- 되돌리기 버튼(관리자): `sensitiveUnlocked` false면 disabled+title. 누르면 confirm 안내만.
- **전문용어(reconcile/checksum) 화면에 쓰지 마라.** 실패 시 무엇을 해야 하는지 함께.

### 4. Setting.tsx — 관리자
- 서브 탭: 기준값 / 사용자 / 알림 / 이력. `localStorage['fabric.settings']` 저장, 없으면 schema 기본값.
- 기준값: 조직/가공/시즌/카테고리/담당자/Buyer 6목록. **삭제 없음, 비활성만.** 사용 건수는 records 에서 카운트.
  시즌 입력에 `normalizeSeason` 미리보기(SP27 → SS'27). Style No. 패턴/위반 건수 표시.
- 사용자: MEMBERS 표 + 권한 select(조회/등록·처리/관리자). 관리자 0명 금지(오류+되돌림).
- 알림: 규칙 4개 토글(`<button role="switch" aria-checked>`) + 기준일.
- 이력: 변경 기록 표. 저장 버튼 눌러야 반영, 저장 후 '저장했습니다' 3초 안내(alert() 쓰지 마라).

### 5. Calendar.tsx — 캘린더
- 일정 = `events` + `records.dueDate`(→ '{styleNo} 납기', type:due). 한 배열로 합침.
- 월/주 보기 탭. 월: 7열 그리드(일요일 시작), 이전/다음달 흐리게, 오늘 강조, 칸당 최대 3개 +N.
- 유형 색: 미팅 ok / 납기 warn / 외부 brand / 휴가 neutral. 범례(색+이름).
- 담당자 필터. 메일 추출 일정 자리 = emptyState('연결 예정 …') + 추출→확인→반영 3단계 정적 표시.
- 날짜 칸 클릭 → 그날 일정 패널(sheet), Esc 닫힘. roving tabindex.
- 월 이동은 Date 연산으로 안전하게(말일·윤년).

### 6. Rdda.tsx — RDDA REPORT
- StatCard 4: 올해 누적 등록/미팅/픽업/픽업율(%).
- 월별 추이 AreaCard(registered/meeting/pickup), 연도별 누적 BarCard(stacked: 보관/소진/폐기),
  원산지·조직 도넛 2개(cols 1-1).
- **Best Items DataTable** — 순위/FL/조직/중량/픽업/미팅. **민감 규칙**:
  `sensitiveUnlocked` false면 단가·협력사 **컬럼 자체를 만들지 마라**(가리지 말 것).
  아래 문구 "단가·협력사명은 TDS 파일을 연 팀 내부 화면에서만 표시됩니다."
  `useAppStore(s => s.sensitiveUnlocked)` 구독.
- 하단: "월별 실적 엑셀을 읽어 집계합니다. (IT부 데이터 다운로드 연동 예정)"

### 7. Development.tsx — 보드/타임라인 탭 채우기
- 지금 placeholder 인 보드·타임라인 탭 완성. 보드: 공정 6단계 칼럼 칸반(카드). 타임라인: 담당자 행 × 날짜.
- 드래그 없음(조회 전용). 목록과 같은 필터 결과 공유.

## 규칙 (엄수)

- 집계 재계산 금지 — `src/data/derive.ts` 함수 사용. 임의 hex 색 금지 — shadcn 토큰/차트 변수만.
- 공용 부품 재사용. 새 부품이 꼭 필요하면 `src/components/` 에 만들고 보고.
- `MutationObserver` 로 표 DOM 감시 금지(DataTable 의 cell 렌더 사용).
- 새 npm 설치 금지(막힘). 필요하면 보고. src/data·src/store·기존 화면(Home) 로직 변경 금지.
- 커밋 금지.

## 검증
`npx tsc --noEmit` 통과 + `npm run build` 성공. 브라우저 확인은 하지 마라(Claude 가 한다).

## 보고
```
DONE: <파일>
BUILD: <tsc/build>
NOTES: <부족 컴포넌트, 판단 필요 지점>
```
