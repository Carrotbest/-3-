# 작업지시 R14b — RDDA 소스·방식 정정 (월별 Meeting,Pickup + 원본 분석 로직)

전제: R14 로 만든 `parseRdda`·RDDA 연결이 있음. 이를 **소스와 집계 방식을 아래로 교체**한다.
`docs/reference/data-sources.md` §C·§D 를 그대로 따른다. 검증 `npx tsc --noEmit` + `npm run build`. 커밋·실데이터 로그 금지.

## 소스 변경 (중요)
- (구)`기타\HS Develop 활용도\...` · `개발 원단 사용 픽업율(2025).xlsx` **사용 중단**.
- **정본 = `전략자료\RDDA 픽업율\26년 {N}월 Meeting,Pickup.xlsx`** (파일명 콤마 주의: `Meeting,Pickup`).
  folder-source 에서 `전략자료/RDDA 픽업율/` 폴더의 `*Meeting,Pickup*.xlsx` 목록을 찾아,
  **파일명 속 월 숫자(3~6…)가 가장 큰 = 최신 파일**을 집계 기준으로 쓴다.
- 각 파일 시트 `Meeting`(헤더 행0, 데이터 행1~)·`Pickup`. 컬럼:
  FL_NUMBER·MeetDate·SupplierCode·SupplierName·OriginalFabric·CountryOfOrigin·DevType·
  MemberCode·MemberName·CustomerName·BrandName·GenderName·SeasonName·SampleNo(+PickupDate).
- **월별 파일은 YTD 누적 스냅샷** → 합치지 마라. 집계는 **최신 파일 하나**로. 3~6월 각 파일 총계는 스냅샷 추이용으로만 별도 계산.

## 집계 방식 (legacy 원본 그대로 — §D)
`parseRdda` 를 다음 의미로 재작성:
- **Hansoll 제외**: SupplierName/CustomerName 이 `hansoll textile ltd` / `hansoll textile ltd.`(소문자·트림 비교)인 행 카운트 제외.
- **두 관점**: `all`(전체) 와 `team3`(MemberName ∈ [박향근, 김지현, 변재휘, 진영은]).  ※이름 기준 필터(코드 하드코딩 금지).
- 관점별: `meetingTotal`(Meeting 행수), `pickupTotal`(Pickup 행수), `pickupRate = pickup/meeting*100`.
- `pickupByCustomer`: CustomerName 그룹 → {name, pickupCount, meetingCount, rate}. 픽업수 내림차순.
- `origin`: CountryOfOrigin 분포(빈 값 '기타'). 상위 + 기타.
- `bestItems`: FL_NUMBER 별 (meetingCount, pickupCount) 집계 → **pickupCount ≥ 2 AND meetingCount ≥ 3**, Hansoll 제외,
  픽업수 내림차순(동률 동일순위). SupplierName(협력사)은 민감 → `sensitiveUnlocked` 시에만 표시.
- **월별 스냅샷 추이**: 3~6월 각 파일의 (meetingTotal, pickupTotal) 만 뽑아 `snapshots:[{month, meeting, pickup, rate}]`.
  (각 파일 1회 읽어 총계만; 무거우면 Meeting/Pickup 행수만 세고 종료.)

## 반환/화면
- `RddaReport` 타입을 위 구조에 맞게 조정(기존 화면 안 깨지게, 필드 없으면 안전 기본값).
- Rdda.tsx: KPI(전체/3팀 토글 or 병렬) 제안·Pickup·픽업율, 고객별 가로바, 원산지 도넛, Best Items 표(민감 규칙),
  월별 스냅샷 추이(3~6월). 미연결 시 sample 폴백.
- 성능: 최신 파일만 상세 집계, raw 미저장. 파싱 중 표시 유지.

## 규칙
- 다른 파서(dev/sample/STUDY/TS)·화면 훼손 금지. 새 npm 금지. MutationObserver 금지. 커밋·실데이터 로그 금지. legacy/ 는 열지 마라(방식은 이 지시서에 정리됨).

## 검증 `npx tsc --noEmit` + `npm run build`.
## 보고 DONE / 소스·집계 변경점 / BUILD / NOTES.
