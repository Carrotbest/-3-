# 작업지시 05 — 동기화 상태 화면 (신규)

## 맡을 파일 (이 1개만 새로 만든다)

- `assets/js/views/sync.js`

다른 파일은 **읽기만** 한다. 공용 CSS는 건드리지 마라 — 화면 전용 스타일은
`assets/js/views/development.js`처럼 파일 안 `STYLE_TEXT` 상수에 넣는다.

## 먼저 읽을 것

1. `assets/js/views/development.js` — 뷰 구조·스타일 주입 패턴의 본보기
2. `assets/js/data/reconcile.js` — 이 화면이 보여줄 결과를 만드는 곳. **계약을 그대로 따른다.**
3. `assets/js/data/sample.js` 의 `sampleChecks()`·`sampleHistory()` — 데모 모드에서 쓸 값
4. `assets/js/ui/widgets.js`

## 이 화면이 답해야 하는 질문

> "지금 화면에 보이는 숫자가 언제 기준이고, 확인을 통과한 값인가?"

팀이 같은 숫자를 본다는 것을 증명하는 화면이다. 화려할 필요 없고 **명확해야 한다.**

## 데이터

전부 `store.get().meta`에 있다.

```js
meta = {
  mode: 'demo'|'tds', fileName, appliedAt, appliedBy, passed,
  checks:   [{ name, excel, applied, diff, ok, note }],   // 5종
  anomalies:[{ type, tone, count, samples[] }],
  history:  [{ appliedAt, appliedBy, fileName, count, passed, state, reason }],
}
```

`store.subscribe('meta', ...)`로 갱신에 반응하고 `unmount()`에서 해제한다.

## 만들 것 (IA_화면구성_v7 「동기화 상태」 행 기준)

1. **viewHead** — eyebrow `Operations / Data assurance`, 제목 `동기화 상태`,
   subtitle `팀이 보는 숫자의 기준 시각과 검증 결과를 확인합니다.`
2. **상태 배너** — 화면 최상단. `meta.passed`에 따라 두 얼굴을 가진다.
   - 통과: ok 톤. `합계 대조를 통과했습니다 · N건` + 반영 시각·반영자
   - 실패: crit 톤. `합계가 맞지 않아 반영하지 않았습니다` +
     **어느 검사에서 몇 건 차이인지** + `이전 반영 값(시각)을 그대로 보여주고 있습니다`
   - 데모 모드: 예시 데이터임을 알리는 중립 톤
3. **KPI 4장** — 마지막 반영 시각 / 대조 통과 n/5 / 반영 건수 / 마지막 반영 후 경과일.
   경과일이 7 이상이면 warn 톤 + `HOME에 안내가 표시됩니다` 문구.
4. **합계 대조 결과 표** — `meta.checks` 5행.
   컬럼: 대조 방법 / 엑셀 합 / 반영 값 / 차이 / 판정(배지) / 비고(`note`).
   `excel`이 `null`이면 `—`와 함께 `검사 생략`으로 표시한다.
   판정 배지는 ok면 `통과`(ok 톤), 아니면 `불일치`(crit 톤).
5. **반영 이력** — `meta.history` 표. 반영 시각 / 파일 / 건수 / 검증 / 상태(배지).
   실패 행은 `reason`을 같은 행 아래 작은 글씨로 덧붙인다.
6. **데이터 이상 항목** — `meta.anomalies`. 각 항목에 유형·건수 배지와
   `samples`의 Style No.를 최대 5개까지 나열한다.
   맨 아래 문구: `원본은 고치지 않습니다. 확인 후 TDS에서 직접 수정해 주세요.`
   이상 항목이 없으면 `정리할 데이터가 없습니다.` (emptyState)
7. **되돌리기 버튼 (관리자)** — 이력의 이전 통과 건으로 되돌리는 버튼.
   실제 되돌리기 로직은 만들지 말고, 누르면 확인 대화(`confirm`)를 띄운 뒤
   `되돌리기는 관리자 승인 후 동작합니다.` 안내만 표시한다.
   `store.get().sensitiveUnlocked`가 false면 버튼을 `disabled` + `title`로 사유를 남긴다.

## 문구 원칙

- 사용자는 개발자가 아니다. `reconcile`, `checksum` 같은 말을 화면에 쓰지 마라.
- 실패했을 때 **무엇을 해야 하는지**가 항상 함께 보여야 한다.
  예: `진영은 담당 SEASON 3건이 담당시트와 전체현황에서 다릅니다. TDS에서 확인 후 다시 열어 주세요.`

## 확인

`node --check assets/js/views/sync.js` 와 import 경로만 확인하고 보고한다. 브라우저 확인은 하지 마라.
