# 작업지시 08 — RDDA REPORT 화면

## 맡을 파일 (이 1개만 새로 만든다)

- `assets/js/views/rdda.js`

공용 CSS는 건드리지 마라. 화면 전용 스타일은 파일 안 `STYLE_TEXT` 상수에 넣는다.

## 먼저 읽을 것

1. `assets/js/views/development.js` — 뷰 구조·스타일 주입 패턴
2. `assets/js/ui/chart.js` — **이 화면은 차트가 중심이다.** API를 정확히 볼 것
3. `assets/js/ui/widgets.js`, `assets/js/ui/table.js`
4. `assets/js/data/sample.js` 의 `sampleRdda()` — 데이터 형태 전부가 여기 있다

## 데이터

`store.get().rdda`:

```js
{
  monthly:      [{ month:'2026.01', registered, meeting, pickup }],
  cumulative:   [{ year, stored, used, discarded }],
  origin:       [{ label, count }],
  construction: [{ label, count }],
  bestItems:    [{ rank, flNo, construction, weight, pickup, meeting, unitPrice, vendor }],
}
```

## 민감 정보 규칙 — 반드시 지킬 것

`bestItems`의 **`unitPrice`(단가)와 `vendor`(협력사명)는 민감 필드다.**

- `store.get().sensitiveUnlocked === false` 이면 그 **두 컬럼을 아예 만들지 마라.**
  값을 `***`로 가리는 방식은 금지다. 컬럼 자체가 없어야 한다.
- 대신 표 아래에 한 줄: `단가·협력사명은 TDS 파일을 연 팀 내부 화면에서만 표시됩니다.`
- `sensitiveUnlocked`는 `store.subscribe('sensitiveUnlocked', ...)`로 변화를 받는다.
  잠금이 풀리면 표를 다시 그린다. `unmount()`에서 구독을 해제한다.

## 만들 것 (IA_화면구성_v7 「RDDA REPORT」 행 기준)

1. **viewHead** — eyebrow `Fabric R&D`, 제목 `RDDA REPORT`,
   subtitle `부서 전체의 원단 등록·미팅·픽업 실적을 월 단위로 확인합니다.`
2. **KPI 4장** — 올해 누적 등록 / 미팅 / 픽업 / 픽업율(%).
   픽업율 = 픽업 ÷ 미팅 × 100, 소수 첫째 자리까지.
3. **월별 등록 추이** — `type:'line'`, 등록·미팅·픽업 3개 시리즈.
4. **연도별 누적** — `type:'bar'`, `stacked:true`. 창고보관 / 소진 / 폐기.
5. **원산지 분포**·**조직 분포** — 각각 도넛. 두 개를 `cols('1-1')`로 나란히.
6. **Best Items 표** — 순위 / FL No. / 조직 / 중량 / 픽업 / 미팅 (+ 잠금 해제 시 단가 / 협력사).
   `createTable`을 쓰고 `pageSize`는 10으로 둔다.
7. **데이터 출처 안내** — 화면 하단.
   `월별 실적 엑셀을 읽어 집계합니다. (IT부 데이터 다운로드 연동 예정)`

## 주의

- 차트가 6개까지 동시에 뜬다. `unmount()`에서 **모든 차트의 `destroy()`를 반드시 호출**하라.
  안 그러면 화면을 오갈 때마다 Chart 인스턴스가 쌓인다.
- `rdda`가 `null`일 수 있다. 그러면 `emptyState('RDDA 데이터가 아직 연결되지 않았습니다.')`.

## 확인

`node --check assets/js/views/rdda.js` 와 import 경로만 확인하고 보고한다. 브라우저 확인은 하지 마라.
