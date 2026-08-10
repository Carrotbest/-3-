# 작업지시 R22 — DEVELOPMENT 하위화면(EU/SEASON/CORE/PROJECT) 개편

작성: Claude (기획·검토) / 구현: Codex / 최종 검토: Claude
대상 라우트: `#/development/eu`, `/season`, `/core`, `/project` (= `DevelopmentList` 컴포넌트)

## 맡을 파일

- `src/routes/Development.tsx` — `DevelopmentList`, `CompletedSampleLibrary`, 보드/타임라인 렌더 부분
- `src/components/dashboard/StatCard.tsx` — 상단 KPI 카드(현재 Sparkline "Details" 포함)
- `src/data/derive.ts` — 아래 명시한 헬퍼 **신설**
- (신규) `src/components/charts/` 하위에 간트/에너지바 등 시각화 컴포넌트 추가 가능

## 절대 건드리지 말 것

- `DevelopmentOverview`(= `/development` 오버뷰)는 이번 작업 대상이 아니다. 이미 완료됨.
- 데이터 파이프라인(`xlsx-parsers.ts`, `upload.ts`, `cache.ts`, `store`)과 `schema.ts`의 `DevRecord` 인터페이스는 수정하지 않는다.
- `STAGES` 전역 상수는 그대로 둔다(다른 로직이 6단계를 참조). 보드는 아래처럼 **뷰 내부에서** 5단계로 매핑만 한다.
- 커밋은 사용자가 요청할 때만. `git reset/checkout`으로 사용자 변경을 되돌리지 마라.

## 먼저 읽을 것

1. `src/routes/Development.tsx` 전체 — 특히 `DevelopmentList`(목록/보드/타임라인/완료 탭), `CompletedSampleLibrary`.
2. `src/data/schema.ts` — `DevRecord`, `CompletedSample`, `FIELDS`, `STAGES`, `CATEGORIES`.
3. `src/data/derive.ts` — `kpis`, `statusOf`, `isInProgress`, `scheduleAlerts`, `categoryStyleList`(참고용 패턴).
4. `src/routes/Home.tsx`의 `Tilt3D` 사용부와 `src/components/motion/Tilt3D.tsx` — 3D 톤앤매너 기준.
5. `src/data/format.ts` — `fmtDate`, `fmtDateFull`, `toDate`.

## 톤앤매너

- 색: 기존 `--chart-1~4`, `--warning`(주황=임박), `--destructive`(빨강=지연), `--muted` 사용. 새 하드코딩 색 남발 금지.
- 3D: `Tilt3D`(절제된 틸트)를 기본으로 하되, 이 화면들은 사용자가 "3D를 조금 더 강하게 해도 된다"고 허용했으므로 카드 섹션·완료 캘린더 등에 `max`/`lift`를 키우거나 깊이감을 더 줘도 된다.
- `prefers-reduced-motion` 반드시 대응(전환 생략).
- 최종 검증은 `npm run build`(= `tsc --noEmit && vite build`) 통과 + 브라우저 확인.

---

## 요구사항 1 — 상단 4개 KPI 카드 클릭 시 하단 개발 목록 자동 필터

`DevelopmentList` 상단의 KPI 4장은 현재 `전체 / 진행 / 임박 / 지연`(`StatCard`)이다. 이걸 **클릭 가능한 필터**로 만든다.

- 새 상태: `const [statusFilter, setStatusFilter] = useState<"all" | "progress" | "due" | "late">("all")`
- 매핑:
  - `전체` → `all` (필터 해제)
  - `진행` → `progress` (`statusOf(row)==="progress"`)
  - `임박` → `due` (`statusOf(row)==="due"`)
  - `지연` → `late` (`statusOf(row)==="late"`)
- 카드 클릭 시 해당 상태로 `filteredRows`를 좁힌다(목록·보드·타임라인 **세 뷰 모두** 이 결과를 공유). 같은 카드를 다시 클릭하면 `all`로 토글 해제.
- 활성 카드는 시각적으로 강조(테두리/배경). `aria-pressed` 부여.
- 기존 툴바의 검색·셀렉트 필터와 **AND 조건**으로 함께 적용된다.
- `statusFilter`는 완료 탭에는 적용하지 않는다(완료 탭은 요구사항 6에서 별도 재설계).

> 구현 메모: 현재 `filteredRows`(useMemo)에 `statusFilter !== "all"`이면 `statusOf(row, today) === statusFilter` 조건을 추가. `summary = kpis(filteredRowsBeforeStatusFilter)`가 되도록 주의 — **카드 숫자는 statusFilter 적용 전(검색·셀렉트만 반영된) 집합 기준**이어야 클릭해도 숫자가 안 흔들린다. 즉 두 단계로 나눈다: `scopedFiltered`(검색·셀렉트) → 카드 숫자는 이걸로 `kpis()`, `statusFilter` 적용한 `visibleRows` → 목록/보드/타임라인에 전달.

## 요구사항 2 & 3 — KPI 카드의 "Details" 스파크라인 삭제 → 의미 있는 시각정보로 교체

두 요구사항은 같은 대상(상단 4카드의 하단 `Details + Sparkline`)이다. 통합해서 처리한다.

- `StatCard`에서 하단 `Details` + `deltaPct` 화살표 + `<Sparkline>` 블록을 **제거**한다. (`KPI_SPARKS` 상수, `deltaPct`, `spark`, `Sparkline` import도 이 화면에서 제거. `StatCard` 컴포넌트를 다른 화면에서도 쓰면 prop을 optional로 만들어 호환 유지 — 현재 이 4장 외 사용처 없으면 깔끔히 정리.)
- 대신 각 카드에 **의미 있는 미니 시각정보**를 넣는다. 카드별 개별 그래프 or 4장을 아우르는 통합 그래프 **둘 다 허용**. 권장 구성(실무 도움·한눈 파악 우선):
  - **전체**: 카테고리(또는 GD/국내) 비중 미니 도넛 or 누적 막대.
  - **진행**: 5공정(원사·편직·염색·가공·완료) 도달 분포 미니 스택바.
  - **임박(D-7)**: 남은 일수 버킷(D-7~D-4 / D-3~D-1 / 오늘) 미니 막대, 주황 톤.
  - **지연(D+)**: 지연 일수 버킷(1~3 / 4~7 / 7+) 미니 막대, 빨강 톤.
- 4카드 섹션 전체를 `Tilt3D`로 감싸 3D 강화 가능. 클릭(요구사항 1)과 충돌하지 않게 카드 자체가 `<button>`이 되도록.
- 필요한 집계는 `derive.ts`에 헬퍼로 뺀다(예: `subpageCardStats(rows)` → `{ total, progress, due, late, categoryMix, processMix, dueBuckets, lateBuckets }`). 하드코딩 금지, 현재 필터 데이터 기준.

## 요구사항 4 — 보드(Board) 재설계

- **5단계**로 축소: `원사 → 편직 → 염색 → 가공 → 완료`. **시험 단계 그냥 삭제.**
  - 뷰 내부에 `BOARD_STAGES = [원사, 편직, 염색, 가공, 완료]` 정의(전역 `STAGES` 수정 금지).
  - `stage === "시험"`인 레코드는 **보드에서 제외**한다(사용자 확정: 그냥 삭제). ※ 시험 상태 건은 보드에 표시되지 않는다는 점만 인지.
  - **완료 컬럼**은 delivery date를 표기한다. delivery date = `receivedDate`(완료일) 우선, 없으면 `dueDate`.
- **카드 크기 최소화 + 비주얼라이징**:
  - 각 카드는 컴팩트하게: `Style No.` + `OPT`(강조), 그 아래 한 줄에 담당 이니셜 아바타 + 상태 점(주황/빨강/기본) + 날짜(완료 컬럼은 delivery date, 그 외는 납기 D±).
  - 카드에 공정 진행 미니 인디케이터(5칸 중 현재 단계까지 채움) 한 줄 추가 → 한눈에 진행도 파악.
  - 컬럼 헤더에 건수 badge + 컬럼별 톤 색(원사~완료 그라데이션, `--chart-1~4` + 완료는 `--chart-2`/그린 계열).
  - 카드 hover 시 절제된 3D 틸트/살짝 떠오름. 클릭 시 기존 상세 시트(`setSelectedRecord`) 유지.
  - 한 화면에 다수가 들어오도록 카드 패딩·폰트 축소, 컬럼 폭 최소화(가로 스크롤 허용하되 5열이 기본 뷰포트에 최대한 담기게).

## 요구사항 5 — 타임라인(Timeline) → 간트/에너지바 재설계

현재 담당자×납기 격자 테이블을 **샘플별 리드타임 간트 차트**로 교체.

- 각 행 = 개발 건 1개(정렬: 리드 시작일 asc 또는 납기 asc). 담당자로 그룹핑하거나 필터로 좁힐 수 있게.
- **리드타임 바** 계산:
  - `start` = `requestDate`(접수) → 없으면 `receivedDate` → 없으면 `dueDate`에서 -14일 등 방어적 대체.
  - `end` = 완료건이면 `receivedDate`, 진행건이면 `dueDate`.
  - 축: 데이터 전체의 min(start)~max(end)를 좌우 끝으로. 오늘 위치에 세로 "today" 마커.
- **에너지바(동적 UI)**: 바 내부를 현재 공정 진행도(원사~완료 5단계 중 도달 비율, `processReached` 또는 `stage` 기반)로 채우고 흐르는 그라데이션/이동 애니메이션(reduced-motion 시 정지). 상태색: 진행=`--chart-1~2`, 임박=주황, 지연=빨강.
- 바 hover 시 툴팁(Style No./담당/공정/기간/D±), 클릭 시 상세 시트.
- 라이브러리(예: recharts gantt) 없이 CSS grid/flex + `%` 포지셔닝으로 구현(기존 프로젝트 방침). recharts를 쓸 거면 커스텀 바로.
- 데이터가 없으면 빈 상태 메시지.

> 헬퍼 신설 제안: `derive.ts`에 `sampleLeadTimeline(rows, today)` → 각 행에 `{ record, start, end, offsetPct, widthPct, progressPct, state }` 배열 반환. 날짜 파싱은 `toDate` 사용, Excel 하루 밀림 주의.

## 요구사항 6 — 완료 샘플 라이브러리 재설계 (`CompletedSampleLibrary`)

> **선행 필수: `R21-dd-schema-extension.md`** — DD 64컬럼 중 미사용 기술데이터를 `DevRecord.tech`로 읽어와야 이 요구사항의 "technical data 전부"가 성립한다.

### 데이터 소스 (실측 근거 기반 확정)

원본 실측 결과, DD와 샘플관리대장은 **포함 관계가 축마다 다르다.**

| 축 | DD (Development Dashboard) | 샘플관리대장 |
|---|---|---|
| **필드(컬럼)** | **64컬럼 — 대장을 거의 완전히 포함** (작업처·원사·실측 폭/중량/축률·편직사양 전부 보유) | 37컬럼 |
| **행(데이터 범위)** | **82행 / 완료 12건 / FL# 6건** — 현재 진행 사이클만 | **4,987행 / 고유 FL 3,815건** — 역대 아카이브 |

→ **필드는 DD가 정본, 행(아카이브)은 대장이 정본.** 따라서:

- **완료 라이브러리 = DD 완료건 + 대장 아카이브 병합**, 단 **같은 건이면 DD 값이 항상 우선**.
  - DD 완료건: `records.filter((r) => statusOf(r) === "done")` → 12건. `tech` 기술데이터 **전체** 보유.
  - 대장 아카이브: `completed`(`CompletedSample[]`) → 수천 건. 요약 수준(조직/물성/완료일/FL).
  - 병합 키: `flNo`(공백제거·대문자) 우선, 보조로 `styleNo`. **DD에 있는 건은 대장 행을 흡수**하고 DD 값으로 표시.
  - 각 항목에 출처 배지: `DD`(기술데이터 전체) / `대장`(요약).
- 헬퍼 신설: `derive.ts`에 `completedLibrary(records, samples, today)` → 아래 형태의 통합 배열(완료일 desc).
  ```ts
  export interface CompletedLibraryItem {
    key: string                  // flNo || styleNo 정규화
    styleNo: string; flNo: string; season: string; category: string
    owner: string; construction: string
    completedAt: string          // DD: receivedDate ?? dueDate / 대장: completedAt
    source: "DD" | "대장"
    record: DevRecord | null     // DD 매칭 시 — technical data 원본
    sample: CompletedSample | null
  }
  ```
- **완료일** = DD면 `receivedDate` 우선 폴백 `dueDate`, 대장이면 `completedAt`.
- 대장 아카이브가 수천 건이므로 **하단 리스트는 반드시 페이지네이션 또는 가상 스크롤**을 넣는다(기존 `DataTable`의 `pageSize` 활용 권장). 전량 DOM 렌더 금지.

두 영역으로 재구성한다.

### 6-A. 상단 — 완료 캘린더

- 통합 라이브러리 항목을 **완료일** 기준으로 **월 캘린더**에 배치.
- 각 날짜 칸에 그 날 완료된 건의 `styleNo`를 **작은 카드**로 나열(여러 건이면 스택, 초과분은 `+N`). 카드에 시즌/카테고리 색 점 + 출처 구분(DD/대장) 미세 표시.
- 월 이동(이전/다음) 컨트롤. 기본은 가장 최근 완료가 있는 달.
- 작은 카드 클릭 시 6-B와 동일한 상세 팝업 오픈.
- 3D 톤: 날짜 칸/카드에 절제된 깊이감 허용.

### 6-B. 하단 — 전체 완료 샘플 리스트(검색 + 기술데이터 팝업)

- 완료일 desc로 **통합 라이브러리 전체**를 목록(표) 형태로 나열. 컬럼에 **FL No. 포함**(+ Style No., 시즌, 카테고리, 조직, 담당, 완료일, 출처 배지).
- **검색 입력**(Style/FL/조직/Buyer/담당) + 시즌·카테고리 셀렉트. **페이지네이션 필수**(수천 건).
- 행/카드 클릭 시 상세 팝업:
  - **팝업 형태(Claude 결정)**: 신규 컴포넌트 대신 **기존 개발 상세 시트를 확장 재사용**한다. `setSelectedRecord(item.record)`로 목록 탭과 동일한 시트를 열되, 아래 **탭 구성**을 추가한다(정보량이 64컬럼으로 늘어 한 화면에 나열하면 못 읽는다):
    | 탭 | 내용 |
    |---|---|
    | **개요** | `FIELDS` 17항목 + 완료일/접수일 + Status + 원본 위치(`_src`) |
    | **공정** | 작업처 4곳(`tech.mills`) × 공정별 완료일(`tech.processDates`)을 **타임라인 형태**로. 원사(`tech.yarnDetail`), Finishing A~D, Remark |
    | **물성** | 실측 폭/중량/Balance/축률 L·W(`tech.actual`) + 단계별 폭·중량(Greige/Tenter/Wash, `tech.stageData`) 비교표 + Finish Brush/Chemical |
    | **편직/원단** | 편직사양(Inch/Gauge/Needles/Loop F·T·B, `tech.knitSpec`) + ORIGINAL 분석(Brand/Contents/Yarn/Org.Weight/Comments, `tech.original`) |
    | **이력** | Pass/Fail, Fail 사유, Style History, Review, Arrange#, 옵션완료 |
  - **값이 전부 빈 탭은 렌더하지 않는다**(입력률이 10~20%인 컬럼이 많다). 빈 항목은 `—`.
  - **출처가 `대장`인 항목**(DD 미매칭 아카이브): `tech`가 없으므로 개요 + `CompletedSample`의 조직/물성/공정 요약만 보여주고 **"대장 아카이브 · DD 미연결"** 배지를 단다. 탭은 자동 축소.
- 완료 건수/검색 결과 카운트 표기 유지.

> **DD ↔ 샘플관리대장 실측 대조 결론** (Claude가 원본 파일 직접 확인)
>
> **DD가 대장을 필드 차원에서 사실상 완전 포함한다.** 팀이 만든 `대장이관` 탭(DD→대장 변환기)이 그 증거이며, 그 탭의 주석이 대장 전용 항목을 명시한다:
> > *"※ No.·Feeder·Greige·wash는 대장에서 직접 관리하는 항목이라 빈칸으로 나옵니다. Final Width/Weight는 TSS의 Actual Width/Weight입니다."*
>
> **대장에만 있는 항목 = 4개뿐**: `No.`(대장 일련번호), `wash`(세탁 구분), `Feeder`, `Greige Width/Weight`(DD에도 컬럼은 있으나 이관 미연결).
> **필링(pilling)은 DD·대장 어디에도 없다** — 현재 코드 `CompletedSample.pilling`은 데모 시드(`sample.ts`) 산물이므로 UI에서 기대하지 마라.
> 반대로 **작업처(Mill)·원사(Yarn Detail)·실측 폭/중량/축률·편직사양·Tenter/Wash·Pass/Fail·Style History는 전부 DD에 있다.** (이전 기획서에서 "DD에 없음"이라 적었던 것은 파서 미구현 때문이며 **오류였다. 07번 문서 기준으로 정정한다.**)

---

## 신설 헬퍼 요약 (derive.ts)

```ts
// 요구사항 2·3: 서브페이지 카드 미니 시각화용 집계
export function subpageCardStats(rows: readonly DevRecord[], today?: Date): {
  total: number; progress: number; due: number; late: number
  categoryMix: Array<{ label: string; count: number; pct: number }>
  processMix: Array<{ key: string; label: string; count: number; pct: number }> // 5단계
  dueBuckets: Array<{ label: string; count: number }>   // D-7~-4 / D-3~-1 / 오늘
  lateBuckets: Array<{ label: string; count: number }>  // 1~3 / 4~7 / 7+
}

// 요구사항 5: 리드타임 간트
export interface LeadTimelineRow {
  record: DevRecord; start: string; end: string
  offsetPct: number; widthPct: number; progressPct: number
  state: "progress" | "due" | "late" | "done"
}
export function sampleLeadTimeline(rows: readonly DevRecord[], today?: Date): {
  rows: LeadTimelineRow[]; minDate: string; maxDate: string; todayPct: number
}

// 요구사항 6: 완료 라이브러리 = DD 완료건 + 대장 아카이브 병합 (DD 우선)
export function completionDate(record: DevRecord): string // receivedDate || dueDate
export interface CompletedLibraryItem { /* 위 6절 정의 참조 */ }
export function completedLibrary(
  records: readonly DevRecord[], samples: readonly CompletedSample[], today?: Date,
): CompletedLibraryItem[] // 완료일 desc, flNo→styleNo 키로 중복 제거(DD 우선)
```

## 확정된 결정사항 (사용자 지침 반영)

1. **요구사항 1**은 "필터(토글)"로 해석. 클릭 시 목록/보드/타임라인 공통으로 좁아지고, 카드 숫자는 statusFilter 적용 전 기준으로 고정.
2. **보드 시험 단계**: 그냥 삭제(시험 상태 레코드는 보드에서 제외). — 사용자 확정.
3. **보드 완료 컬럼 날짜(delivery date)**: `receivedDate` 우선, 없으면 `dueDate`. — 사용자 확정.
4. **타임라인 리드타임**: 시작=접수(requestDate) 폴백 체인, 종료=완료면 receivedDate·진행이면 dueDate.
5. **완료 라이브러리 데이터 소스**: **필드는 DD 정본**(사용자 확정) + **아카이브 행은 대장 병합**(DD 12건뿐이라 라이브러리 성립 불가 → Claude 판단). 동일 건은 DD 값 우선.
6. **완료 팝업**: 신규 컴포넌트 대신 **목록 탭 상세 시트를 탭 구조로 확장 재사용**(개요/공정/물성/편직·원단/이력). 빈 탭은 미렌더. — Claude 결정("더 효율적인 방법" 위임받음).
7. **DD 미보유 항목**: `No.`·`wash`·`Feeder`·`Greige`(대장 전용) 4개뿐. **필링은 양쪽 모두 없음**(데모 시드 산물).
8. **선행작업**: `R21-dd-schema-extension.md`(DD 64컬럼 파서 확장)를 **먼저** 끝내야 요구사항 6의 technical data가 성립한다.

## Claude 최종 검토 체크리스트 (구현 후 확인)

- [ ] eu/season/core/project 각 화면에서 카드 클릭 → 목록/보드/타임라인이 해당 상태로 필터, 재클릭 해제, 카드 숫자 불변.
- [ ] StatCard의 Sparkline/Details 완전 제거, 4카드 미니 시각화가 데이터 기준으로 정확.
- [ ] 보드 5열(원사·편직·염색·가공·완료), 시험 레코드 누락 없음, 완료 컬럼 delivery date 표기, 카드 컴팩트+진행 인디케이터+3D.
- [ ] 타임라인 간트: 리드타임 바/에너지바 동작, today 마커, hover 툴팁, 클릭 상세, reduced-motion 정지.
- [ ] 완료 라이브러리: 상단 캘린더(완료일별 styleNo 카드) + 하단 최근순 리스트(FL 포함)+검색, 클릭 시 DD technical data 전부(미매칭 폴백).
- [ ] `npm run build` 통과, 콘솔 에러 없음, 오버뷰/HOME 회귀 없음.
