# R210~R213 · RDDA 원단 성과를 FL No.로 전 화면에 연결

상태: 클로드 직접 구현 완료(코덱스 한도 소진). 빌드 통과. 로그인 화면 확인 미완.

## 무엇을 했나

| 번호 | 내용 | 파일 |
|---|---|---|
| R210 | 수집기 v5가 팀 FL마다 원장 누적 픽업·오더 수를 보낸다. FL 성과 색인과 등급 계산 | `src/data/fabric-performance.ts`, `src/data/rdda-dataset.ts`(team 튜플 6·7번째), 바탕화면 `RDDA_수집_v5.js` |
| R211 | 창고 표 `RDDA 성과` 열 그룹(등급, 제안/픽업/오더, 픽업률)과 행 강조, 출고 누계 카드에 보관 중 오더·베스트 수, 원단 상세 성과 패널 | `src/routes/Warehouse.tsx`, `src/components/fabric/PerfBadge.tsx`, `src/components/fabric/FabricPerformancePanel.tsx`, `src/routes/FabricDetail.tsx`, `src/index.css` |
| R212 | 폐기 라운드 생성 시 오더·베스트 원단 자동 제외(사유 표시, 포함으로 되돌림), 기존 라운드에 `RDDA 성과 반영` 버튼, FL 칸 배지 | `src/data/disposal-round.ts`, `src/data/schema.ts`, `src/components/warehouse/DisposalRoundPanel.tsx` |
| R213 | DD MASTER FL# 칸, FABRIC REQUEST Link 열, 보관함 FL# 칸에 오더·베스트·고적중 아이콘 | `src/routes/DevelopmentMasterSheet.tsx`, `src/routes/FabricRequest.tsx`, `src/components/request/RequestArchiveView.tsx` |

## 기준

- 수치 = RDDA FL 원장 `MeetingCount`, `PickupCount`, `OrderCount`에서 폐기 리스트 미팅(Customer=Hansoll) 제안·픽업을 뺀 누적값. 전사 기준이라 개인 계정 미팅 조회 범위의 영향을 받지 않는다.
- 범위 = 3팀 담당 FL(사번 `inCharge`). 다른 FL은 색인에 없어 표시하지 않는다.
- 등급(`GRADE_RULES` 한 곳에서 조정): 오더 1회 이상 > 픽업 3회 이상(베스트) > 제안 3회 이상·픽업률 40% 이상(고적중) > 등록 24개월 이내·픽업 0(성숙 중) > 제안 3회 이상·픽업 0(반응 없음) > 제안 0(미제안) > 나머지 보통.
- 폐기 자동 제외 등급 = `KEEP_GRADES`(오더, 베스트).

## 실데이터 검증 (2026-09-17, v5 수집)

- 팀 FL 5,540건 전부 색인. 오더 57, 베스트 227, 고적중 132, 보통 2,248, 성숙 중 849, 반응 없음 789, 미제안 1,238.
- 데이터셋 1,736KB. 기간 재집계 12개월 43ms, 전 기간 288ms.
- `buildRddaReport(ds, 2025-09, 2026-09)`가 v2 집계 JSON과 summary, buyers, brands, genders, fibers, weights, seasons, recommend, months 전 항목 차이 0건.

## 주의

- 오더 원단 중 픽업 0인 건이 있다. 폐기 미팅 픽업 차감으로 0이 되었거나 RDDA에서 픽업 없이 오더가 잡힌 건이다. 오더는 그대로 인정한다.
- CLAUDE.md의 "keeping 자동 제외 금지"는 지난 라운드 보관 판정 이야기다. RDDA 성과 제외와 다르다.
