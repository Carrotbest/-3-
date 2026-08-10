# 작업지시 R14 — RDDA 실데이터 연결 (Meeting/Pickup 활용도)

전제: `docs/REACT_REBUILD.md`, `docs/reference/data-sources.md`. R11~R13 완료.
검증 `npx tsc --noEmit` + `npm run build`. 토큰 색만. 커밋 금지. 실데이터 repo·로그 금지.

## 소스 파일 (기타\HS Develop 활용도\)
정본 = `*MeetingPickup*.xlsx` 중 **최신**(파일명 날짜 큰 것). 시트 3개:
- **Summary** (작음): 헤더 근처에 `Year of Suggestion | 제안건수 | Pickup건수 | Pick-up rate`. 연도별 KPI 원천.
- **Meeting** (약 37,000행): `FL_NUMBER, MeetDate, SupplierCode, SupplierName, OriginalFabric, CountryOfOrigin, DevType, MemberCode, MemberName, CustomerName, SeasonName, SampleNo, SeasonYear`
- **Pickup** (약 5,000행): 위 + `PickupDate, PickupDetailCode`
- (보조) `전략자료\RDDA 픽업율\개발 원단 사용 픽업율 (2025).xlsx` 는 **.xls 추정**(openpyxl not-zip). SheetJS 는 .xls 읽음 — 있으면 참고, 없거나 실패해도 무시.

## 성능 원칙 (중요)
37k 행을 **상태에 저장하지 마라.** 읽는 즉시 **1패스 집계**해서 **집계 결과만** store 에 넣고 raw 는 버린다.
집계는 카운트/그룹 위주(연·월·원산지·고객·담당). 파싱이 수 초 걸릴 수 있으니 동기화 중 표시 유지.

## 1. 파서 (xlsx-parsers.ts 에 추가)
`parseRdda(workbook): RddaReport`
- **Summary** → `yearly: [{ year, suggested(제안건수), pickup(Pickup건수), rate(Pick-up rate %) }]`. 헤더 텍스트로 행 탐색.
- **Meeting** 1패스 집계:
  - `monthly`: MeetDate 의 연-월별 제안건수 (최근 N개월).
  - `origin`: CountryOfOrigin 별 건수(상위 N + 기타).
  - `byCustomer`: CustomerName 별, `byMember`: MemberName 별 건수.
- **Pickup** 1패스 집계: PickupDate 월별 pickup건수 → monthly 에 병합(registered=제안, pickup=pickup).
- `bestItems`: FL_NUMBER 별 (meeting수, pickup수) 상위 N. 단가·협력사(SupplierName)는 **민감** → `sensitiveUnlocked` 시에만.
- 반환 타입은 기존 `RddaReport`(schema.ts)에 맞추되, 실데이터에 맞게 필드 조정 필요 시 확장(기존 화면 안 깨지게).

## 2. 동기화 연결 (folder-source.ts)
- `syncFromFolder` 에 RDDA 읽기 추가하되 **선택적**: 최신 MeetingPickup 파일 있으면 parseRdda → `setAppState({ rdda })`.
  없거나 잠기면 skip + 경고(dev/sample/STUDY 반영 유지).
- 37k 파싱이 무거우면, RDDA 는 **"지금 새로고침" 또는 RDDA 화면 진입 시에만** 로드하는 지연 로딩도 허용(구현 판단, 보고).

## 3. RDDA 화면 (Rdda.tsx) 실데이터 반영
- 연결 시 실 `rdda` 사용, 미연결 시 기존 sample 폴백.
- KPI: 올해 제안/Pickup/Pickup율(Summary·집계). 월별 추이(Meeting/Pickup). 원산지 도넛(CountryOfOrigin).
  고객/담당 분포. Best Items 표(민감 컬럼 규칙 유지).
- 숫자는 NumberTicker, 차트는 기존 컴포넌트 재사용.

## 규칙
- dev/sample/STUDY/TS 파서·화면 훼손 금지. reconcile 대상 아님. 새 npm 금지. MutationObserver 금지. 커밋 금지.

## 검증 `npx tsc --noEmit` + `npm run build`. 실제 폴더 파싱은 사용자 확인.
## 보고 DONE / NEW API / 집계 방식·성능 처리 / BUILD / NOTES.
