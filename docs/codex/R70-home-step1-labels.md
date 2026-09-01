# R70 — 1단계 즉시 개선 (KPI 카드 명칭·순서, Technical References 개명)

상태: **미착수**. Codex가 구현한다.
직전 커밋 `e41968e`가 origin/main에 올라가 있다. 워킹트리는 이 커밋 기준으로 깨끗하다(미추적 `backup/`, `docs/`, `scripts/capture-*` 제외).

대상: `src/routes/Home.tsx`, `src/routes/Study.tsx`, `src/routes/route-config.ts`, `src/data/screen-permissions.ts`.

**이번 작업은 표시 문자열과 카드 순서만 바꾼다. 데이터 키, 라우트 경로, 계산 로직은 한 글자도 건드리지 않는다.**

---

## 배경

8월 27일 대시보드 미팅 결과 중 "즉시 개선" 항목의 앞 세 건이다.
지표 정의가 바뀌는 항목(공정 summary, RDDA 누적 그래프)은 기준 확정 전이라 이번 범위에서 제외한다.

---

## 작업 1. KPI 카드 명칭 변경과 위치 스위치

대상 `src/routes/Home.tsx` 974~976행.

### 현재

```
[ 완료 ]  [ 접수 ]  [ ScheduleCard ]
```

### 바꿀 결과

```
[ 신규 접수 ]  [ 완료 ]  [ ScheduleCard ]
```

### 지시

1. `label="접수"`를 `label="신규 접수"`로 바꾼다.
2. 두 `KpiCard`의 JSX 순서를 맞바꾼다. 신규 접수가 첫째, 완료가 둘째다. `ScheduleCard`는 셋째 자리 그대로 둔다.
3. **`delay` prop은 카드를 따라가지 말고 자리를 따라간다.** 등장 애니메이션이 왼쪽부터 순서대로 떠야 한다.
   - 첫째 카드(신규 접수): `delay` 없음
   - 둘째 카드(완료): `delay={75}`
   즉 지금 `delay={75}`가 붙어 있는 쪽은 신규 접수인데, 자리를 옮기면 이 값을 완료 쪽으로 넘겨야 한다.
4. 각 카드의 나머지 prop은 카드를 따라간다. 바꾸지 않는다.
   - 신규 접수: `icon={<TimerReset />}`, `value={sections.thisWeekNew}`, `rangeLabel={rangeLabel("new")}`, `caption="Request Date 기준"`, `accent="var(--gradient-1)"`, `onClick`/`onCalendarClick`은 `setKpiDetailKind("new")`
   - 완료: `icon={<CheckCircle2 />}`, `value={sections.lastWeekDone}`, `rangeLabel={rangeLabel("completed")}`, `caption="Received Date 기준"`, `accent="var(--chart-2)"`, `onClick`/`onCalendarClick`은 `setKpiDetailKind("completed")`
5. 상세 시트 제목도 맞춘다. 같은 파일 195행 `new` 항목의 `title: "접수 상세"`를 `"신규 접수 상세"`로 바꾼다.
   같은 블록의 `description`, `dateLabel`, `empty` 문구는 그대로 둔다.

### 건드리지 말 것

- `kpiDetailKind`의 값 `"new"`, `"completed"`, `"schedule"`은 내부 키다. 그대로 둔다.
- `sections.thisWeekNew`, `sections.lastWeekDone` 등 집계 필드명과 계산은 그대로 둔다.
- `sm:grid-cols-3` 등 레이아웃 클래스는 그대로 둔다.

---

## 작업 2. FABRIC STUDY를 Technical References로 개명

화면에 보이는 이름만 바꾼다. 경로 `/study`와 화면권한 키 `study`는 유지한다.
팀원들에게 이미 공유된 링크가 있고, 권한 키를 바꾸면 Firebase에 저장된 사용자별 권한 값이 어긋난다.

### 표기 규칙

주변 메뉴가 전부 대문자다(TROUBLE SHOOTING, RDDA REPORT, FABRIC ANALYSIS).
HOME의 Work report 카드 제목은 대소문자를 섞어 쓴다(TS 관리, STUDY 과제).

그래서 자리에 맞춰 두 가지로 쓴다.

- 메뉴, 페이지 헤더, 라우트 제목, 권한 라벨: `TECHNICAL REFERENCES`
- HOME Work report 카드 제목: `Technical References`

### 바꿀 곳 (이 다섯 군데만)

| 파일 | 위치 | 현재 | 바꿀 값 |
|---|---|---|---|
| `src/routes/Home.tsx` | 1043행 deck 배열 | `title: "STUDY 과제"` | `title: "Technical References"` |
| `src/routes/route-config.ts` | 47행 | `title: "FABRIC STUDY"` | `title: "TECHNICAL REFERENCES"` |
| `src/routes/route-config.ts` | 88행 사이드바 | `label: "FABRIC STUDY"` | `label: "TECHNICAL REFERENCES"` |
| `src/data/screen-permissions.ts` | 7행 | `label: "FABRIC STUDY"` | `label: "TECHNICAL REFERENCES"` |
| `src/routes/Study.tsx` | 88행 PageHeader | `title="FABRIC STUDY"` | `title="TECHNICAL REFERENCES"` |

`subtitle`과 `description` 문구는 전부 그대로 둔다.

### 절대 건드리지 말 것

아래는 전부 데이터 키이거나 엑셀 원본 파일을 가리키는 문구다. 하나라도 바꾸면 파싱, 저장, 권한이 깨진다.

- `MaterialKind`의 `"STUDY"`, `MATERIAL_KINDS` 배열, `byKind`의 `STUDY` 키 (`src/data/schema.ts`, `src/store/useAppStore.ts`, `src/data/xlsx-parsers.ts`)
- `materialsOf("STUDY", ...)`, `<MaterialDeckSection kind="STUDY" ...>`의 `kind` 값
- `src/data/xlsx-parsers.ts`의 시트 판별 키워드 `"study"`, `"교육"`
- `src/data/screen-permissions.ts`의 `key: "study"`와 `paths: ["/study"]`
- 라우트 경로 `/study`, `href: "#/study"`
- `src/routes/Setting.tsx`의 `"STUDY 현황"`, `"STUDY 마감 알림"`, 업로드 파일명 안내 (엑셀 원본을 가리킨다)
- `src/routes/Study.tsx`의 `"STUDY 자료 덱"`, `aria-label="STUDY 보기"`, `"SETTING에서 STUDY 엑셀을 업로드하면..."` 안내 문구
- `src/routes/Home.tsx` 1043행의 `kind: "STUDY"`와 `empty` 안내 문구

즉 **바꾸는 것은 위 표의 다섯 줄뿐이다.** 일괄 치환(sed, replace all)을 쓰지 말고 다섯 군데를 하나씩 고친다.

---

## 검증

1. `npm run build`가 통과해야 한다(`tsc --noEmit && vite build`).
2. `git diff --stat`이 위 네 파일만 보여야 한다. 다른 파일이 딸려 오면 되돌린다.
3. 변경 줄 수는 열 줄 안쪽이어야 한다. 그보다 크면 범위를 넘은 것이다.
4. 커밋하지 않는다. 워킹트리에 두면 Claude가 확인한 뒤 처리한다.

## 보고

작업 후 아래를 적는다.

- 실제로 바꾼 파일과 줄 번호
- `npm run build` 결과
- 지시와 다르게 판단한 부분이 있으면 이유
