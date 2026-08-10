# 작업지시 R20 — 총계·접수현황 재정의 + 담당자별 PROCESS STATUS를 legacy 로직/룩으로

파일: 주로 `src/routes/Development.tsx`, `src/data/derive.ts`. 필요 시 store/parser 정리.
검증 `npx tsc --noEmit` + `npm run build`. 커밋 금지. 다른 화면·집계 훼손 금지.
데이터: DevRecord 는 `processReached { yarn, knitting, dyeing, finishing }`(각 공정 Status 완료일 ≤ 파싱일이면 true)와 `gdNo`/`saNo`(GD#/SA# 원본 = col18)를 이미 보유. statusOf(record) 로 완료/진행 판정 가능.

## 1) "총 샘플" 카드 = 진행중만
- DevelopmentOverview 상단 "총 샘플" 값을 **진행중 건수만**으로. 진행중 = `statusOf(record) !== "done"`.
- 라벨/서브텍스트는 "진행중 개발" 취지로 자연스럽게(예: "총 개발(진행중)" · "진행중 반영 데이터 기준").
- 참고: GD/국내 통합 카드의 `총 N건`·GD/국내 건수도 진행중 기준으로 맞출지? → **통합 카드는 현행(전체) 유지**, 총 샘플 카드만 진행중. (혼선 없게 각 카드 캡션에 기준 명시.)

## 2) "접수현황" 재정의 — 진행중 & GD#/SA# 5자리 숫자
- legacy 로직 이식: **개발번호(GD#/SA#)가 `/^#?\d{5}(-\d+)?/` (5자리 숫자, #·-N 접미 허용)이면 접수완료. SA접두·텍스트·공백은 미접수.**
- 대상 = **진행중 레코드**(statusOf !== "done"). 값 = 접수 건수 / 진행중 건수.
  - 접수 판정 문자열 = `record.gdNo || record.saNo` (= 원본 GD#/SA# col18).
- **derive 순수 함수로** 계산(예: `receiptStatus(records): { total, received, missing, receivedPct }`) 후 카드에서 사용. 화면 재계산 금지.
- **기존 담당시트 ARRANGE# 방식 제거**: `parseGdReceipt`(xlsx-parsers), store `gdReceipt` 필드, cache key `"gdReceipt"`, ingestDevelopment 의 gdReceipt 세팅, 데모 기본값을 모두 제거하고 위 derive 로 대체. (제거 후 참조 없게 정리.)
- 카드 라벨 "접수현황", 서브텍스트 "진행중 · GD#/SA# 기입 N% · 미기입 M건".

## 3) 담당자별 PROCESS STATUS — legacy STATUS BY MEMBERS 로직 + 룩(화이트 배경)
### 3-1. 버킷 로직 (legacy hpGetPipelineStage 동일)
`byOwnerDetailed` 의 공정 4버킷을 아래로 교체(각 레코드는 정확히 1개 버킷, 합=담당 총건):
- **미접수** = `!yarn`
- **편직대기** = `yarn && !knitting`
- **염색중** = `knitting && !dyeing`
- **등록대기** = `dyeing || finishing`
(현재 stage 문자열 기준 매핑을 processReached 기준으로 바꾸는 것. 키 unreceived/knitting/dyeing/registration 유지 가능.)

### 3-2. 시각 — legacy 누적 막대 룩을 화이트 배경으로
현재 "공정별 개별 솔리드 바 4개"(R19) 를 **legacy 처럼 하나의 가로 누적 막대(4세그먼트)** 로 되돌리되 화이트 배경에 맞춤:
- 한 줄 막대, 세그먼트 폭 = 각 버킷 비율. 세그먼트 색(그라디언트) 및 글로우(legacy 동일):
  - 미접수: `linear-gradient(90deg,#334155,#64748b,#94a3b8)`, glow `rgba(100,116,139,.4)`
  - 편직대기: `linear-gradient(90deg,#0e7490,#06b6d4,#a5f3fc)`, glow `rgba(6,182,212,.5)`
  - 염색중: `linear-gradient(90deg,#5b21b6,#8b5cf6,#ddd6fe)`, glow `rgba(139,92,246,.5)`
  - 등록대기: `linear-gradient(90deg,#065f46,#10b981,#6ee7b7)`, glow `rgba(16,185,129,.5)`
- 효과(legacy 동일): 세그먼트가 **width:0 → 실제 비율로 채워지는 애니메이션**, 마운트/호버 시 **수치 0 → 실제값 카운트업**, 세그먼트 hover 시 해당 구간 강조·툴팁(`라벨: N건 (P%)`).
- **화이트 배경 대응**: 카드 배경은 흰색(`--card`) 유지. 글로우는 은은하게(과한 네온 금지), 막대 트랙은 `--muted`. 라벨/수치 텍스트는 각 색의 진한 톤 또는 `--foreground`로 대비 확보. 0건 버킷은 세그먼트 없이 범례에만 0 표기.
- 막대 아래(또는 옆) **범례**: 4색 점 + 라벨 + 건수. 좁은 폭에서 겹치지 않게.
- reduced-motion 존중. progressbar/tooltip ARIA 유지.

## 규칙
집계는 derive. 새 npm 금지. gradient 사용은 이 막대에 한해 허용(요구사항). 커밋·실데이터 로그 금지. legacy/ 는 로직 참고만(코드 복붙 위 명세로 충분).

## 검증 `npx tsc --noEmit` + `npm run build`.
## 보고 DONE / 변경 파일 / 제거한 gdReceipt 경로 / 새 derive / 버킷·접수 로직 / 막대 효과 / TSC·BUILD / NOTES.
