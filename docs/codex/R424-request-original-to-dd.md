# R424 의뢰에서 DD로 넘길 때 ORIGINAL 분석을 함께 옮긴다

상태: 구현 완료, 빌드 통과, 화면 확인 미완. 클로드가 직접 시공했다(코덱스 사용량 한도).

2026-11-12 박향근 보고다.

> DD에서 신규 생성할때 리퀘스트에서 불러오면 오리지널 분석쪽이 안채워진다

## 무엇이 문제였나

DD 신규 작지 접수 창의 「DEVELOPMENT REQUEST에서 불러오기」가 담당, Style No., Buyer, Planner, 옵션 사양만 채우고 **ORIGINAL 분석 블록 여섯 칸을 통째로 비워 두었다.** 의뢰 스타일에 그 값이 다 들어 있는데 옮기는 코드가 없었다.

`requestToIntakeRecords`(`src/data/request-link.ts`)가 쓰는 필드에 `tech.original`이 없었던 것이 전부다.

## 대응 표

의뢰 스타일과 DD의 ORIGINAL 분석은 1대1로 붙는다.

| DD `tech.original` | 화면 라벨 | 의뢰 `RequestStyle` |
|---|---|---|
| `brand` | Brand | `brand` |
| `contents` | Contents | `contents` |
| `construction` | Cons. | `origConstruction` |
| `weight` | Org. Weight | `origWeight` |
| `yarn` | Yarn (분석) | `yarnAnalysis` |
| `comments` | Comments | `comment` |

**`devConstruction`(분석의 Construction 개발)과 `analyst`(분석 담당)는 넘기지 않는다.** DD에 받을 칸이 없다. 개발 조직은 옵션의 `construction`이 따로 간다.

**Season과 Category는 채우지 않는다.** 보드 이름으로 그 둘을 정하지 않는 것이 기존 결정이다. 접수 창에서 사람이 고른다.

## 한 일

`src/data/request-link.ts` 한 파일이다.

1. `originalFieldsOf(style)`를 더했다. 위 표대로 옮기고 **빈 값은 키를 아예 만들지 않는다.** 값 없는 키를 만들면 Firestore가 그 문서를 거부한다(R340). `origWeight`는 숫자일 때만 넣는다. 의뢰 쪽 타입이 `number | ""`다.
2. `emptyOnly(current, patch)`를 더했다. 지금 값이 비어 있는 키만 남긴다.
3. **`requestToIntakeRecords`**(신규 접수)는 새 레코드라 그대로 넣는다.
4. **`applyRequestLinks`의 빈 칸 채우기**는 `emptyOnly`를 거쳐 **빈 칸만** 채운다. 이미 적힌 ORIGINAL을 덮지 않는다. R422의 개발처 처리와 같은 원칙이다.

같은 자리에 R423의 FINISH도 함께 넣었다. 옵션의 `finish`가 DD의 Finishing A(`tech.finishingSlots.a`)로 간다. 연결 쪽은 그 칸이 비었을 때만이다.

## 뒤집지 말 것

- **빈 값으로 덮지 마라.** 의뢰 쪽이 비었다고 DD에 적힌 값을 지우면 안 된다.
- **연결(`applyRequestLinks`)에서 기존 값을 덮지 마라.** 신규 접수와 다르다.
- `tech.finishing`(문자열 배열)은 건드리지 않았다. DD MASTER 인라인 편집도 `finishingSlots`만 고친다.
- Season, Category를 보드 이름이나 차트명으로 채우지 마라.

## 검증

`npm run build` 통과. `tsc --noEmit` 포함이다.

화면 확인은 박향근이 한다. DD MASTER 신규 작지 접수에서 「DEVELOPMENT REQUEST에서 불러오기」로 스타일을 고르면 ORIGINAL 분석의 Brand, Contents, Cons., Org. Weight, Yarn (분석), Comments가 차는지 보면 된다.
