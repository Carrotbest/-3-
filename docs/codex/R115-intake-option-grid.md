# R115 신규 작지 접수 옵션을 탭에서 그리드로

상태: 구현 완료, 빌드 통과. 화면 확인 대기.

## 배경

옵션이 탭으로 나뉘어 한 번에 한 건만 보였다. 작지 하나에 12건이 걸리면 색상과 공정을 비교할 방법이 없었다.
창고 입고대기 그리드처럼 전체 목록을 한 표에 놓고 칸에서 바로 고치는 형태로 바꾼다.

## 열 구성

기본 화면에 가로 스크롤 없이 들어가는 구간이다.

| # | Body | Yarn | Cons. | Target wt' | Color | Dyeing Side | 원사 업체/완료일 | 편직 업체/완료일 | 염색 업체/완료일 | 가공 업체/완료일 | (삭제) |

오른쪽으로 밀어 둔 나머지 옵션 항목이다. 가로로 끌면 나온다.

| Co | GD#/SA# | Arrange# | Finishing A~D | Remark |

삭제하지 않고 남긴 이유는 접수 시점에 Co 와 GD#/SA# 를 채우는 일이 있어서다. 기본 화면 밖으로만 밀었다.

`#` 와 삭제 칸은 좌우 고정이다. 가로로 끌어도 몇 번째 옵션인지 놓치지 않는다.

## Body 열

DD 에 Body 열은 없었다. FDS/YDS 요청서가 쓰던 `tech.bodyNo` 를 그대로 쓴다.

`bodyLabel()` 은 저장값이 있으면 그것, 없으면 `opt` 순번으로 `B01`, `B02` 를 만든다.
그런데 작지 파서가 Part 를 저장하지 않아 색상이 둘 이상이면 순번이 그대로 Body 가 됐다. KOLORI 작지(BODY 6 x 2색)면 `B01`~`B12` 가 되어 틀린 값이었다.

그래서 `applyZajiOption` 이 작지의 Part 를 `tech.bodyNo` 에 넣도록 고쳤다. 이제 `B01`~`B06` 이 색상별로 두 번 나온다.
**FDS/YDS 요청서 BODY 값도 같이 교정된다.**

## 팝업 크기

- 그리드 높이 고정: 헤더 2줄(26px x 2) + 8줄(32px x 8) = 308px.
- 옵션이 8건을 넘으면 표 안에서만 세로 스크롤한다. 팝업 자체는 옵션 수와 무관하게 같은 높이다.
- 옵션 칩이 여러 줄로 늘어나던 것이 사라져 상단 높이도 고정된다.

## 파일별 조치

| 파일 | 조치 |
|---|---|
| `src/data/zaji.ts` | `applyZajiOption` 이 `tech.bodyNo = o.part` 저장 |
| `src/routes/DevelopmentMasterSheet.tsx` | `TECH_PATHS` 에 `bodyNo` 추가 |
| | `DateInput` 에 `compact` 분기 추가(행 높이 32px 용, 미리보기 줄 없음) |
| | `INTAKE_*` 상수, `IntakeCell`, `IntakeOptionGrid` 신설 |
| | 접수 팝업의 옵션 탭 + DETAIL/SCHEDULE 에디터를 그리드로 교체 |
| | `changeOptionAt(index, next)` 추가, 쓰지 않게 된 `changeOption` 제거 |

## 설계 메모

- 칸은 항상 편집 상태다. 더블클릭 편집기를 쓰지 않았다. 접수 옵션은 많아야 수십 건이라 입력 요소를 다 그려도 부담이 없고, DD 그리드 인라인 편집기의 키 처리 함정(`stopPropagation`)을 피할 수 있다.
- 값 읽기와 쓰기는 기존 `column.value` 와 `updateRecordCell` 을 그대로 쓴다. 열을 더할 때 매핑을 새로 만들 필요가 없다.
- 상단 병합 헤더는 기존 `subRuns()` 를 재사용한다.

## 검증

- `npm run build` 통과.
- 화면 확인 필요: 작지 첨부 후 12줄이 뜨는지, Body 가 B01~B06 두 벌인지, 9줄째부터 표 안에서만 스크롤되는지.

## 하지 말 것

- 옵션 그리드를 가상 스크롤로 바꾸지 마라. 행이 수십 건이라 필요 없다.
- `bodyLabel()` 의 `opt` 대체 규칙을 지우지 마라. 웹에서 손으로 추가한 옵션은 Part 가 없다.
