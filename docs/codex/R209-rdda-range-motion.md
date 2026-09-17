# R209 · RDDA 기간 설정, 실시간 재집계, 헤더 압축, 게이지 모션, 월별 추이 차트

상태: 구현 완료. 코덱스가 빌드 직전 한도로 멈춰 클로드가 마무리(중량 0 구간 제외 수정, 월간 리포트 KPI 중복 수정). 실데이터로 v2와 전 항목 일치 확인. 로그인 화면 확인 미완.

## 무엇을 하는가

1. 수집기가 12개월 집계(`RddaReportV2`) 대신 **전 기간 압축 데이터셋(`RddaDataset`)**을 보낸다. 수집기는 저장소 밖에서 클로드가 만든다. 계약은 아래와 같다.
2. 대시보드가 사용자가 고른 기간으로 `RddaReportV2`를 즉석에서 만든다. 탭 컴포넌트는 지금처럼 `RddaReportV2`만 받는다.
3. 헤더를 압축한다. 분석 기간 카드를 기간 설정 버튼으로 만들고, 전체 픽업률 카드를 추가한다.
4. 바이어 탭에서 미팅 수를 지운다. RDDA의 미팅 건수는 실제 미팅 횟수가 아니다.
5. 모든 막대와 수치에 0에서 차오르는 모션을 넣는다. 빠르게 시작해 천천히 멈춘다.
6. 바이어 탭의 월별 픽업률 막대를 월별 추이 복합 차트로 바꾼다.

## 틀렸던 가설. 다시 시도하지 말 것

- 기존 `RddaReportV2`를 월 단위로 나눠 합산하기. 픽업률, 팀 점유율, 추천은 비율과 집합이라 합산이 안 된다. 원단 단위 데이터가 있어야 한다.
- 원장 85,000행 원본을 데이터셋에 넣기. 수 MB가 되어 동기화가 무겁다. 원장 기반 지표는 기간과 무관한 누적값이라 수집기가 미리 계산해 `cumulative`로 보낸다.

## 1. 데이터 계약: `src/data/rdda-dataset.ts` (새 파일)

```ts
import type { RddaReportV2 } from "./rdda-report"

export interface RddaDataset {
  kind: "rdda-dataset"
  version: 3
  meta: { generatedAt: string; firstMonth: string; lastMonth: string; ledgerTotal: number; teamTotal: number }
  dict: { fl: string[]; con: string[]; fiber: string[]; cust: string[]; brand: string[]; season: string[]; gender: string[] }
  flCon: number[]    // dict.fl 순서와 같은 길이. 제안 목록 기준 construction 인덱스. 없으면 -1
  flFiber: number[]  // 같은 길이. fiber 인덱스. 없으면 -1
  team: [fl: number, ym: string, m: number, con: number, wt: number][]  // 팀 담당 FL 전량. ym "YYYY-MM" 또는 "". m 폐기 차감 누적 미팅수. con 원장 기준, 없으면 -1. wt 없으면 0
  meets: [ym: string, cust: number, brand: number, season: number, gender: number, offered: number[], picked: number[]][]  // 폐기 미팅 제외. 인덱스 없으면 -1. picked ⊂ offered
  cumulative: Pick<RddaReportV2, "ledger" | "origins" | "suppliers" | "gaps" | "trend" | "price" | "maturity" | "teamYears">
}

export function isRddaDataset(value: unknown): value is RddaDataset
export function monthsOf(from: string, to: string): string[]       // "YYYY-MM" 포함 범위
export function addMonths(ym: string, delta: number): string
export function defaultRange(ds: RddaDataset): { from: string; to: string }  // to = meta.lastMonth, from = addMonths(to, -11)
export function buildRddaReport(ds: RddaDataset, from: string, to: string): RddaReportV2
```

`isRddaDataset`: `kind === "rdda-dataset" && version === 3`, `meta.lastMonth` 문자열, `dict.fl`, `flCon`, `team`, `meets` 배열, `cumulative.ledger` 배열.

### `buildRddaReport` 규칙

지금 수집기(v2)의 집계를 기간 인자로 옮긴 것이다. 12~13개월 범위에서 v2 결과와 같은 숫자가 나와야 한다.

공통:
- `rate(a, b) = b ? Math.round(a / b * 1000) / 10 : 0`, `num(v) = Math.round(v * 10) / 10`
- 대상 미팅 = `meets` 중 `from <= ym <= to`
- 팀 집합 = `team`의 fl 인덱스 Set
- 미팅별 `pic = new Set(picked)`. 제안 한 건은 `offered`의 원소 하나다
- 표본 기준 스케일: `factor = Math.min(1, monthsOf(from, to).length / 12)`, `T(base) = Math.max(10, Math.round(base * factor))`

`tally(keyOf, minOff)`:
- 제안마다 key를 구해(-1이면 건너뜀) `{ off, pic, t, tp }` 누적. `pic`은 `pic.has(fl)`, `t`는 팀 FL, `tp`는 팀 FL이면서 픽업
- `off >= minOff`만 남긴다. `enough = t >= T(20)`
- `otherRate = (off - t) ? (pic - tp) / (off - t) * 100 : 0`
- 행 = `{ name, offers: off, pickRate: rate(pic, off), teamOffers: t, teamShare: rate(t, off), teamPickRate: enough ? rate(tp, t) : null, gap: enough ? num(rate(tp, t) - otherRate) : null }`
- `offers` 내림차순

필드:
| 필드 | 규칙 |
|---|---|
| `meta` | `{ generatedAt, periodFrom: from, periodTo: to, meetings: 대상 미팅 수, offers, picks, ledgerTotal, teamTotal }` |
| `summary` | 전체 제안 수, 픽업 수, 픽업률, 팀 제안, 팀 점유, 팀 픽업, 팀 픽업률 |
| `buyers` | `tally(cust, T(50))` → `{ name, meetings: 그 바이어의 대상 미팅 수, offers, pickRate, teamOffers, teamShare, teamPickRate: teamPickRate ?? 0 }` |
| `brands` | `tally(brand, T(150)).slice(0, 16)` |
| `genders` | `tally(gender, T(200))` |
| `seasons` | `tally(season, T(150))` |
| `fibers` | `tally(flFiber[fl], T(150))` → `{ name, offers, pickRate, teamOffers, teamShare, gap }` |
| `weights` | 팀 FL의 `wt`만. 구간 `[0,140) [140,180) [180,220) [220,260) [260,300) [300,∞)`, 라벨 `"0~140"`…`"300+"`. 구간별 `off >= T(30)`만 `{ band, offers, pickRate }` |
| `months` | `monthsOf(from, to)` 전부(제안 0인 달 포함). `{ month: ym.slice(2), offers, pickRate, picks, teamOffers, teamPicks, teamPickRate, teamShare }` |
| `recommend` | 아래 |
| 나머지 8개 | `ds.cumulative`에서 그대로 복사 |

`recommend`: `buyers` 앞 6곳마다
- 그 바이어 대상 미팅의 제안으로 `offered` Set과 construction별 `{ o, p }`(con은 `flCon[fl]`, -1 건너뜀)
- `pref` = `o >= T(25)`인 con → `{ name, offers: o, picks: p, pickRate: rate(p, o) }`, `pickRate` 내림차순. 비면 그 바이어는 뺀다
- `top` = `pref` 중 `pickRate > 0` 앞 6개 이름
- `cand` = `team` 중 `con`이 top에 있고, `offered`에 없고, `ym >= \`${Number(to.slice(0, 4)) - 2}-01\``
- `mix` = cand의 con별 개수 내림차순 앞 6개 `{ name, count }`
- `items` = cand 중 `m === 0`, `ym` 내림차순 앞 8개 `{ flNo: dict.fl[fl], construction: dict.con[con] }`
- 값 = `{ buyer, candidates: cand.length, teamPickRate: 바이어 행 teamPickRate, allPickRate: 바이어 행 pickRate, top: pref[0], avoid: pref.at(-1), preferences: pref.slice(0, 10), mix, items }`

`src/data/rdda-report.ts` `RddaReportV2.months` 원소 타입에 선택 필드 `picks?, teamOffers?, teamPicks?, teamPickRate?, teamShare?`(모두 number)를 더한다.

## 2. 저장과 수신: `src/data/upload.ts`, `src/store/useAppStore.ts`

- `useAppStore.ts` 66행 `rdda` 타입에 `| RddaDataset`을 더한다.
- `applyRddaReport(value)`(R208에서 만든 함수):
  - `isRddaDataset(value)`면 `setAppState({ rdda: value })`, `saveCache("rdda", value)`, 스냅샷은 `buildSnapshot(buildRddaReport(value, ...Object.values(defaultRange(value))))`로 만든다. 인자 순서는 from, to로 명시해서 넘긴다
  - 아니면 기존 V2 경로 그대로
  - 둘 다 아니면 기존 오류
- JSON 파일 업로드도 같은 함수를 타므로 따로 고칠 것 없다.

## 3. `src/routes/Rdda.tsx`

상태와 계산:
- `stored`가 `isRddaDataset`이면 `range` 상태(`{ from, to }`)를 둔다. 초기값은 localStorage `rdda.range`(JSON)에서 읽되 `[firstMonth, lastMonth]` 밖이면 `defaultRange`. 읽기와 쓰기는 모두 try/catch.
- `report = useMemo(() => buildRddaReport(ds, range.from, range.to), [ds, range.from, range.to])`
- V2가 저장돼 있으면 지금처럼 그대로 쓰고 기간 설정은 비활성. 안내 문구는 "RDDA 갱신으로 다시 수집하면 기간을 바꿀 수 있습니다."
- 샘플 fallback은 그대로.

헤더 압축(42~57행 교체):
- `header` 패딩 `p-5 sm:p-6` → `px-4 py-3 sm:px-5 sm:py-3.5`
- 아이콘 `size-11` → `size-9`, 제목 `text-2xl sm:text-[28px]` → `text-xl`, 설명 문단(`바이어 반응과 …`) 삭제, `mt-1.5` → `mt-0.5`
- 카드 줄 `mt-6 grid gap-2.5 sm:grid-cols-3` → `mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4`, 카드 `py-3` → `py-2`, 값 `mt-1.5` → `mt-0.5`
- 카드 순서: **분석 기간 | 분석 원단 | 3팀 픽업률 | 전체 픽업률**
  - 전체 픽업률 = `report.summary.pickRate`, 아이콘 `Percent`. 3팀 픽업률 카드 값 옆에 차이를 작게 붙인다: `+2.9%p`(양수 emerald-600, 음수 rose-600, `num(team - all)`)
  - 분석 기간 카드는 `<button>`이다. 오른쪽에 `기간 설정` 칩(`rounded-full border border-[var(--gradient-1)]/30 bg-[var(--gradient-1)]/8 px-2 py-0.5 text-[10px] font-semibold text-[var(--gradient-1)]` + `SlidersHorizontal` 아이콘)을 둔다. hover 시 테두리를 `var(--gradient-1)`로, `cursor-pointer`. V2나 샘플이면 `disabled`, 칩 대신 안내 title
  - 값 아래 보조 줄: `12개월` 식으로 개월 수(`text-[10px] text-[var(--muted-foreground)]`)

기간 설정 팝오버(새 파일 `src/components/rdda/RangePicker.tsx`):
- `@/components/ui/dropdown-menu`는 쓰지 않는다. 버튼 아래 절대 위치 패널을 직접 만든다(`absolute left-0 top-full z-30 mt-2 w-[300px] rounded-[12px] border bg-[var(--card)] p-3 shadow-xl`). 바깥 클릭과 Esc로 닫는다.
- 프리셋 버튼 2열: 최근 3개월, 최근 6개월, 최근 12개월, 올해, 작년, 전체. 기준은 `lastMonth`. 누르면 즉시 적용하고 닫는다.
- 아래에 `<input type="month">` 두 개(시작, 끝). `min={firstMonth} max={lastMonth}`. 시작이 끝보다 뒤면 둘을 바꾼다. **적용** 버튼으로 반영.
- props: `{ firstMonth, lastMonth, value: { from, to }, onChange(next) }`

## 4. 미팅 수 삭제

- `src/components/rdda/BuyerTab.tsx` 29행 KPI 첫 칸 `최근 12개월 미팅`을 `3팀 픽업률`(`s.teamPickRate`, note `팀 제안 ${s.teamOffers}건`)로 바꾼다. 순서는 전체 제안, 전체 픽업, 제안 대비 픽업률, 3팀 픽업률.
- 같은 파일 32행 `meetings` 열 삭제.
- `src/data/rdda-monthly.ts` 38행 `meetingRows`를 `offers` 내림차순으로 바꾸고, 53~55행 문장을 제안 기준으로 바꾼다: `${month}월 바이어 제안 원단은 ${count(offers)}건이었다.` / `1위 X N건, …`. 79행 제목 `월 바이어 미팅 현황` → `월 바이어 제안 현황`.
- `src/components/rdda/MonthlyReportDialog.tsx` 37행과 49행 `["바이어 미팅", …meetings…]` → `["전체 픽업률", \`${draft.kpi.pickRate.toFixed(1)}%\`]`. `kpi.meetings` 필드 자체는 저장된 과거 리포트 호환 때문에 타입에서 지우지 않는다.

## 5. 모션: `src/components/rdda/motion.tsx` (새 파일)

```ts
export const RddaMotionContext = createContext("")     // Rdda.tsx가 `${from}|${to}`를 넣는다
export function useFill(duration = 1100): number       // 0→1 진행률
export function AnimatedNumber(props: { value: number; decimals?: number; suffix?: string; locale?: boolean }): JSX.Element
```

- 이징 `easeOutQuart = 1 - (1 - t) ** 4`. requestAnimationFrame으로 돈다.
- 마운트 시, 그리고 `RddaMotionContext` 값이 바뀔 때 0부터 다시 시작한다. 탭 전환은 컴포넌트가 새로 마운트되므로 자동으로 다시 돈다.
- `window.matchMedia("(prefers-reduced-motion: reduce)").matches`면 즉시 1.
- `AnimatedNumber`는 `useFill` 진행률 × value를 `decimals`(기본 0) 자리로 표시하고, `locale`이면 `toLocaleString()`. `tabular-nums`로 폭 흔들림을 막는다.

적용 대상:
| 파일 | 조치 |
|---|---|
| `MiniBar.tsx` | 막대 폭 = 목표폭 × fill. 오른쪽 수치: `detail`이 없으면 `AnimatedNumber`, 있으면 그대로 |
| `RateBar.tsx` | 배경 폭 = 목표폭 × fill, 수치 `AnimatedNumber decimals={1} suffix="%"` |
| `RddaTable.tsx` `KpiGrid` | `value`가 number면 `AnimatedNumber`로 그린다. 타입을 `ReactNode \| { n: number; decimals?: number; suffix?: string }`로 넓히고, 탭들의 숫자 KPI를 이 객체형으로 넘긴다 |
| `Rdda.tsx` 헤더 카드 | 분석 원단, 3팀 픽업률, 전체 픽업률 수치를 `AnimatedNumber` |
| `TrendTab.tsx` `TrendChart` | svg 선에 `clipPath` 사각형 폭 = 전체폭 × fill로 왼쪽에서 그려지게 |
| 새 월별 차트 | 아래 6 |

Rdda.tsx에서 탭 영역을 `<RddaMotionContext.Provider value={\`${report.meta.periodFrom}|${report.meta.periodTo}\`}>`로 감싸고, 헤더 카드도 그 안에 넣는다.

## 6. 월별 추이 차트: `src/components/rdda/MonthlyTrendChart.tsx` (새 파일)

바이어 탭 마지막 `월별 픽업률` 패널(40행)을 이 차트로 바꾸고 KPI 바로 아래로 올린다. 패널 제목 `월별 제안과 픽업률`, 부제 `막대: 팀·타팀 제안 원단 수 / 선: 전체·3팀 픽업률`.

- recharts `ComposedChart`, `ResponsiveContainer` 높이 260
- 막대 두 개를 한 스택으로: `teamOffers`(3팀, `var(--gradient-1)`), `offers - teamOffers`(타팀, `color-mix(in oklab, var(--gradient-1) 22%, transparent)`). 왼쪽 축
- 선 두 개: `pickRate`(전체, `#94a3b8`, 점선 `strokeDasharray="4 3"`), `teamPickRate`(3팀, `var(--gradient-3)`, 굵기 2.5). 오른쪽 축 `%`, 도메인 `[0, 'auto']`
- 모든 시리즈 `isAnimationActive`, `animationDuration={1100}`, `animationEasing="ease-out"`. `key`에 `RddaMotionContext` 값을 넣어 기간이 바뀌면 다시 그린다
- 툴팁: 월, 제안(3팀/타팀), 전체 픽업률, 3팀 픽업률, 팀 점유율
- 차트 아래 한 줄 요약: 기간 중 3팀 픽업률 최고 달과 최저 달(제안 30건 이상인 달만), 3팀 픽업률이 전체보다 높았던 달 수 `N/M개월`
- `months`에 `teamOffers`가 없는 V2 데이터면 기존 `MiniBar`를 그대로 보여 준다

## 하지 말 것

- 실데이터(바이어명, 업체명, FL 목록)를 샘플, 테스트, 문서에 넣지 마라. `sampleRddaReport`는 익명 그대로 둔다.
- 수집기나 사번을 저장소에 만들지 마라.
- R208의 `rdda-sync.ts` origin/source 검사를 바꾸지 마라.
- 탭 컴포넌트가 `RddaDataset`을 직접 받게 바꾸지 마라. 탭은 `RddaReportV2`만 안다.
- 차트 라이브러리를 새로 설치하지 마라. recharts는 이미 있다.

## 검증

- `npm run build` 통과
- `git status --short`에 이 문서의 파일 외 새 변경이 없을 것
- 숫자 대조와 화면 확인은 클로드와 박향근이 한다
