# R38 — 담당자별 현황 차트 데이터: 담당별 월별 FL 등록 건수(홈 RDDA 등록현황의 담당자 분해)

목표: `/development` Overview의 담당자 카드 라인차트를, 현재의 "접수일 기준 건수"가 아니라 **홈 `RddaTrendChart`(RDDA 등록 현황)와 동일한 정의의 "월별 FL 등록 건수"를 담당자별로** 표현하도록 데이터 소스를 교체한다. 차트 형태(축·그리드·라인 그려짐 모션 등 R36 결과)는 **그대로 유지**하고 **데이터만** 바꾼다.

대상: `src/data/derive.ts`(신규 집계 함수), `src/routes/Development.tsx`(호출부·라벨 문구).

---

## 배경(집계 정의 — 홈과 동일하게)
홈 `monthlyDevelopmentTrend`(derive.ts)의 RDDA 등록 집계 규칙을 그대로 따른다:
- **DD(records)**: `flNo` 기준 중복제거 후, `receivedDate`의 월(`YYYY-MM`)이 **`RDDA_ARCHIVE_CUTOFF_MONTH`("2026-07")보다 큰(=2026-08~)** 건만 그 월에 카운트.
- **샘플관리대장(samples = completed)**: `flNo` 기준 중복제거 후, `rddaMonthFromFlNo(flNo)`(FL 번호 인코딩 YYMM)의 월이 **cutoff 이하(≤2026-07)** 인 건만 그 월에 카운트.
- 각 월은 `month <= cutoff ? 샘플대장 : DD` 소스를 사용(홈과 동일).
- 이 규칙을 **담당자(owner)별로 분해**한다. `DevRecord.owner`, `CompletedSample.owner` 모두 존재하므로 각 건을 담당자에 귀속.

즉 결과는 "홈 RDDA 등록 현황"을 담당자별로 나눈 것과 동일하며, 값은 **월별 등록 FL 건수(총계 count)** 다(생산처 분해는 불필요, 단일 count 시리즈).

---

## Task 1 — 신규 집계 함수 `ownerMonthlyFlTrend`
`src/data/derive.ts`에 추가(기존 `monthlyDevelopmentTrend` 패턴 재사용):
```ts
export function ownerMonthlyFlTrend(
  records: readonly DevRecord[],
  samples: readonly CompletedSample[],
  today = new Date(),
  monthCount = 12,
): Record<string, { month: string; count: number }[]>
```
구현 요건:
- 월 배열: 최근 `monthCount`개월(홈과 동일 방식, 기본 **12** — 홈 RDDA와 맞춤).
- 담당자 키: `MEMBERS`의 이름 순서(로스터). MEMBERS에 없는 담당자 값은 무시(담당자 카드가 MEMBERS 기반이므로 일관).
- **DD 집계**: `records` 중 `flNo` 있는 건을 `flNo`(공백 제거·대문자) 기준 중복제거(홈과 동일하게 Map으로 마지막 우선) → 각 건의 `receivedDate.slice(0,7)`가 cutoff 초과면 `counts[owner][month] += 1`.
- **샘플대장 집계**: `samples` 중 `flNo` 있는 건을 동일 방식 중복제거 → `rddaMonthFromFlNo(flNo)`가 cutoff 이하면 `counts[owner][month] += 1`.
- 각 담당자에 대해 월 배열을 돌며 `count = (month <= cutoff ? 샘플대장 : DD) 버킷의 값 ?? 0`으로 `{ month, count }[]` 생성.
- `RDDA_ARCHIVE_CUTOFF_MONTH`, `rddaMonthFromFlNo` 기존 것 재사용. 날짜/FL 파싱 규칙은 홈과 동일(추가 정규화 금지).
- 반환: `{ [ownerName]: [{month, count}, ...] }`.

> 기존 `ownerMonthlyTrend`(접수일 기준)는 이 함수로 대체되어 미사용이 된다. **삭제**하거나, 참조가 사라졌으면 정리한다(빌드 무경고 지향).

---

## Task 2 — Overview 호출부 교체
`src/routes/Development.tsx` `DevelopmentOverview`:
- `const completed = useAppStore((state) => state.completed)` 이미 있음(재사용).
- `const ownerTrends = useMemo(() => ownerMonthlyTrend(records), [records])` →
  `const ownerTrends = useMemo(() => ownerMonthlyFlTrend(records, completed), [records, completed])` 로 교체.
- import 정리(`ownerMonthlyTrend` 제거, `ownerMonthlyFlTrend` 추가).

---

## Task 3 — 라벨/문구 정합
- `OwnerMonthlyChart`의 `aria-label`·툴팁·(있다면) 캡션 문구를 "월별 샘플 접수" → **"월별 FL 등록"**(또는 "월별 RDDA 등록") 취지로 수정. 데이터 의미가 FL 등록 건수임을 반영.
- 담당자별 현황 `SectionCard` subtitle의 "월별 샘플 접수 추이" 문구도 "월별 FL 등록 추이"로 정합(선택이지만 권장).
- 차트 폼(LineChart/축/그리드/툴팁/`animationDuration≈1950` 인뷰 게이트)은 **그대로**. 12개월로 늘어난 만큼 X축 라벨이 겹치면 `interval`로 솎고, 포인트 값 `LabelList`가 과밀하면 생략/간소화(가독성 우선). 카드 압축 높이(≈h-40)는 유지.

---

## 검증 · 금지사항
- `npm run build`(`tsc --noEmit && vite build`) **무오류**, 콘솔 에러 0(하드 리로드 후 확인).
- 집계 정의가 홈 RDDA와 일치하는지 자체 점검: 어떤 담당자의 월별 count 합이, 동일 기간 홈 RDDA 총계 중 그 담당자 몫과 논리적으로 일치해야 함(담당자 미상/로스터 외 제외분만큼 차이 가능 — result에 근거 기록).
- 전역 토큰·다른 라우트·store 변경 금지. `monthlyDevelopmentTrend` 등 기존 함수 시그니처 변경 금지(신규 추가만).
- git 커밋·푸시 금지. 실데이터/캐시 로그 금지.
- 결과 요약을 `.codex-runs/R38-last.txt`에 남기고 변경 파일·집계 근거·미상 담당자 처리 방식을 기록.
