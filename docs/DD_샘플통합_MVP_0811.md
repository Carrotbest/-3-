# DD 마스터 시트·샘플관리대장 통합 MVP

## 1. 목표 정정

이 기능의 중심은 상태 카드형 원장이 아니라 **Development Dashboard의 전체현황 64열을 웹으로 옮긴 마스터 시트**다. 샘플관리대장은 별도의 주 화면이 아니라 DD 행에 FL No. 기준으로 연결되는 창고·소진·폐기 후속 이력이다.

## 2. 사용자 목표

- DD Excel을 열지 않아도 동일한 전체 데이터를 한 화면에서 조회한다.
- 열이 많아도 중요 열은 고정하고, 업무별 열 그룹을 접고 펴서 읽는다.
- 검색·필터·상세 조회를 Excel보다 빠르게 사용한다.
- 개발 완료 뒤 샘플관리대장 상태를 같은 DD 행에서 이어서 확인한다.
- 향후 서버 도입 시 여러 사용자가 같은 DD를 수정하는 기반으로 사용한다.

## 3. DD 원본 구조

`전체현황` 시트의 64열을 다음 7개 원본 그룹으로 보존한다.

| 그룹 | 열 수 | 주요 내용 |
|---|---:|---|
| 개발 REQUEST | 10 | 담당, Status, Style, 옵션, 시즌, Buyer, Category, Planner, 요청일, 납기 |
| ORIGINAL 분석 | 6 | Brand, Contents, 조직, 원본 중량, Yarn, Comments |
| 개발 DETAIL | 14 | Developer, Co, GD/SA, Arrange, Yarn Detail, 목표 사양, Finishing A~D, Remark |
| 공정 SCHEDULE | 8 | 원사·편직·염색·가공의 Mill과 Status |
| 결과 RESULT | 4 | Received Date, FL#, 옵션 완료, Review |
| DATA | 19 | 실측 물성, 편직 사양, Greige/Tenter/Wash, Finish |
| REVIEW & HISTORY | 3 | Pass/Fail, Fail 사유, Style History |

샘플관리대장 연결 열 4개는 DD 64열과 구분해 우측 확장 그룹으로 표시한다.

## 4. P0 화면 기능

- 담당·Status·Style No. 왼쪽 고정
- 열 그룹별 접기/펴기
- `핵심 보기`, `공정·결과`, `전체 64열` 프리셋
- 세로·가로 스크롤이 가능한 고밀도 표
- 64개 전체 열 검색
- 담당 및 Status 필터
- 행 클릭 시 64열 전체를 그룹별 상세 표시
- FL 기준 샘플관리대장 상태·넘버링·원본 시트·웹 변경일 연결
- 원본 Excel은 수정하지 않고 브라우저 캐시에 저장

## 5. 데이터 보존 변경

기존 파서에서 요약되던 다음 원본값을 별도로 보존한다.

- ORIGINAL의 Cons.와 Org. Weight
- DETAIL의 Developer, Co, GD#/SA# 원문
- Finishing A/B/C/D의 개별 슬롯

기존 캐시에는 새 원본 필드가 없으므로 **실제 DD를 다시 업로드해야 모든 열이 채워진다.**

## 6. 구현된 업무 기능

- `/development/workspace`는 DD MASTER SHEET 전용 화면이며 목록·보드·타임라인·완료 샘플 탭을 노출하지 않는다.
- EU/SEASON/CORE/PROJECT 화면에서는 DD 마스터 탭을 노출하지 않는다.
- 각 행에 `접수`, `수정`, `완료` 작업을 제공한다.
- 수정 화면에서 DD 64열 전체를 그룹별로 편집하며 수식 열은 읽기 전용이다.
- 접수 시 Status를 `진행중`으로, 비어 있는 Request Date를 처리일로 기록한다.
- 완료 시 Status를 `완료`로, 비어 있는 Received Date를 처리일로 기록한다.
- 별도 `/warehouse` 화면에서 `입고 대기 → 창고 보관 → 소진 완료/폐기` 흐름을 관리한다.
- 입고 대기 항목을 복수 선택하면 기존 R&D No.의 최대 4자리 번호 다음 번호부터 순서대로 자동 채번한다.
- 소진·폐기는 사유가 필수이며, 웹 처리 상태와 이벤트 이력을 IndexedDB에 함께 저장한다.

## 7. Excel 로직 재현 범위

실제 `Development Dashboard.xlsx` 담당자 시트의 수식·검증·조건부 서식을 확인해 다음 로직을 웹 저장 시 다시 계산한다.

- C열 옵션 번호: 동일 담당·Style 안에서 원본 행 순서대로 1부터 부여
- AN열 옵션 진행: 동일 Style의 `완료 건수 / 전체 옵션 수`
- AR열 중량 Balance: `(Actual Weight - Target Weight) / Target Weight`
- Status 선택값: 진행중, 완료, HOLD, DROP, REJECT
- Season, Category, Co, Dyeing, Pass/Fail은 Excel 선택값 기반 입력
- 원사·편직·염색·가공은 업체와 Status/날짜를 한 쌍으로 입력하며 한쪽만 입력하면 경고
- Due Date 경과, 완료일과 Status 불일치, FL 미입력, 비GD Arrange 입력, FAIL 사유 미입력을 행 경고로 표시
- 원본 Excel을 덮어쓰지 않고 브라우저 캐시의 웹 업무 데이터로 저장

## 8. 현재 제외 범위

- Firebase 다중 사용자 동기화
- 관리자/일반 사용자 로그인과 권한
- 원본 Excel 파일 직접 덮어쓰기
- 자동 백업과 승인 알림

## 9. 승인 기준

- 전체 열 프리셋을 선택하면 DD 원본 64열이 모두 표시된다.
- 접힌 그룹은 표에서 제거되고 다시 펼치면 즉시 복구된다.
- 왼쪽 핵심열은 가로 스크롤 중에도 유지된다.
- 검색은 현재 접힌 열을 포함한 전체 64열을 대상으로 한다.
- 실제 DD 재업로드 후 각 원본 그룹 값이 대응하는 열에 표시된다.
- 동일 FL의 샘플대장 상태가 DD 행 우측 확장 열에 연결된다.
- 완료된 DD 행 또는 샘플대장 `현황` 행을 선택해 다음 4자리 R&D No.로 입고할 수 있다.
- 샘플대장 `창고보관`, `소진완료`, `폐기`의 기존 R&D No.와 상태가 창고 화면에 반영된다.
- `npm run build`가 통과한다.

## 10. 후속 P1

- 저장 전 변경 셀 강조 및 일괄 저장
- 열 너비 조절·사용자별 열 배치 저장
- 행 신규 등록·복제·보류 처리
- 관리자/일반 사용자 로그인과 승인 권한
- Excel 내보내기 및 변경 이력 비교
