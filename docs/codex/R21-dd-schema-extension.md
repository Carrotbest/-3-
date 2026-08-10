# 작업지시 R21 — DD 스키마·파서 확장 (R22의 선행 작업)

작성: Claude (실파일 실측 기반) / 구현: Codex / 최종 검토: Claude
**R22-development-subpages.md 의 요구사항 6(완료 라이브러리 technical data)을 하려면 이 작업이 먼저다.**

## 배경 — 실측 결과

원본 `Development Dashboard.xlsx`를 직접 열어 전수 조사했다. **DD는 64컬럼짜리 기술데이터 창고인데, 현재 파서는 그중 약 20개만 읽고 있다.**

- 시트: `Overview` / `전체현황`(1205행·64열, 자동통합 읽기전용) / `박향근`·`진영은`·`김지현`·`변재휘`(담당자별 원본) / `Lists` / `대장이관`
- `전체현황` 헤더: 3행=그룹, **4행=주헤더, 5행=서브헤더, 6행부터 데이터** (현 파서의 `headerRow=3`, `dataStart=5` 0-based와 일치 ✅)
- 담당자 시트: **11행=헤더, 12행부터 데이터**. `담당` 컬럼이 없어 전체현황 대비 **컬럼이 1칸씩 앞으로 밀린다.**
- 실데이터 82행(진행중 61 / 완료 12 / HOLD 3 / DROP 3 / REJECT 3)

## DD 전체현황 64컬럼 실측 매핑 (0-based 인덱스)

현 파서 `DEV_DEFAULT_COLUMNS`와 교차검증 완료 — 기존 20개 인덱스는 **전부 정확**했다. 아래는 **미사용 컬럼을 포함한 전체**다. `★` = 이번에 새로 읽어야 할 것.

| 0-based | 1-based | 그룹 | 헤더 | 현재 파서 | 비고 |
|---|---|---|---|---|---|
| 0 | 1 | 개발 REQUEST | 담당 | `owner` | 담당자 시트엔 없음 |
| 1 | 2 | | Status | `status` | 진행중/완료/HOLD/DROP/REJECT |
| 2 | 3 | | Style No. | `styleNo` | |
| 3 | 4 | | # of Opt | `opt` | |
| 4 | 5 | | Season | `season` | |
| 5 | 6 | | Buyer | `buyer` | |
| 6 | 7 | | Category | `category` | |
| 7 | 8 | | Planner | `planner` | |
| 8 | 9 | | Request Date | `requestDate` | |
| 9 | 10 | | Due Date | `dueDate` | |
| 10 | 11 | ORIGINAL 분석 | Brand | ★ `origBrand` | 입력률 82% |
| 11 | 12 | | Contents | ★ `origContents` | 혼용률. 76% |
| 12 | 13 | | Cons. | `constructionPrimary` | |
| 13 | 14 | | Org. Weight | `originalWeight` | |
| 14 | 15 | | Yarn (분석) | ★ `origYarn` | 82% |
| 15 | 16 | | Comments | ★ `origComments` | 12% |
| 16 | 17 | 개발 DETAIL | Developer | `owner` 보조 | |
| 17 | 18 | | Co | `co` | GD/국내 판정 |
| 18 | 19 | | GD#/SA# | `developmentNo` | |
| 19 | 20 | | Arrange# | ★ `arrangeNo` | 40% |
| 20 | 21 | | **Yarn Detail** | ★ `yarnDetail` | **원사 — 입력률 100%** |
| 21 | 22 | | Cons. | `constructionSecondary` | 조직 |
| 22 | 23 | | T.Weight | `targetWeight` | |
| 23 | 24 | | Color | `color` | |
| 24 | 25 | | Dyeing Side | `dyeing` | |
| 25–28 | 26–29 | | Finishing A/B/C/D | ★ `finishingA~D` | A 21%, B 5%, C·D 0% |
| 29 | 30 | | Remark | `remark` | |
| 30 | 31 | 공정 SCHEDULE | **Yarn in-fac / Mill** | ★ `yarnMill` | **작업처 — 100%** |
| 31 | 32 | | Yarn / Status | `yarnStatus` | 완료일 |
| 32 | 33 | | **Knitting / Mill** | ★ `knittingMill` | **작업처 — 100%** |
| 33 | 34 | | Knitting / Status | `knittingStatus` | |
| 34 | 35 | | **Dyeing / Mill** | ★ `dyeingMill` | **작업처 — 100%** |
| 35 | 36 | | Dyeing / Status | `dyeingStatus` | |
| 36 | 37 | | **Finishing / Mill** | ★ `finishingMill` | **작업처 — 93%** |
| 37 | 38 | | Finishing / Status | `finishingStatus` | |
| 38 | 39 | 결과 RESULT | Received Date | `receivedDate` | 완료일 · 20% |
| 39 | 40 | | FL# | `flNo` | 7% |
| 40 | 41 | | 옵션 완료 (완료/전체) | ★ `optionProgress` | `"0 / 2"` 문자열 · 100% |
| 41 | 42 | | Review | ★ `review` | 2% |
| 42 | 43 | DATA | Actual / Width | ★ `actualWidth` | **폭** · 17% |
| 43 | 44 | | Actual / Weight | ★ `actualWeight` | **중량(실측)** · 17% |
| 44 | 45 | | Actual / Balance | ★ `actualBalance` | 17% |
| 45 | 46 | | 축률(L)% | ★ `shrinkageLength` | **축률 장** · 17% |
| 46 | 47 | | 축률(W)% | ★ `shrinkageWidth` | **축률 폭** · 17% |
| 47 | 48 | | Knitting / Inch | ★ `knitInch` | 20% |
| 48 | 49 | | Knitting / Gauge | ★ `knitGauge` | 20% |
| 49 | 50 | | Knitting / Needles | ★ `knitNeedles` | 20% |
| 50–52 | 51–53 | | Loop (F/T/B) | ★ `loopF/loopT/loopB` | 18/11/9% |
| 53 | 54 | | Greige / Width | ★ `greigeWidth` | 17% |
| 54 | 55 | | Greige / Weight | ★ `greigeWeight` | 17% |
| 55 | 56 | | Tenter / Width | ★ `tenterWidth` | 17% |
| 56 | 57 | | Tenter / Weight | ★ `tenterWeight` | 17% |
| 57 | 58 | | Wash / Width | ★ `washWidth` | 12% |
| 58 | 59 | | Wash / Weight | ★ `washWeight` | 12% |
| 59 | 60 | | Finish / Brush | ★ `finishBrush` | 9% |
| 60 | 61 | | Finish / Chemical | ★ `finishChemical` | 11% |
| 61 | 62 | REVIEW & HISTORY | Pass/Fail | ★ `passFail` | 15% |
| 62 | 63 | | Fail 사유 | ★ `failReason` | 1% |
| 63 | 64 | | Style History | ★ `styleHistory` | 5% |

## 할 일

### 1. `src/data/schema.ts` — `DevRecord` 확장

기존 17개 필드와 `_src`는 **그대로 두고**, 아래를 **선택 필드 그룹으로 추가**한다. 기존 `FIELDS`/`DEFAULT_COLUMNS`/`DevRecordFieldKey`를 깨뜨리지 마라(목록 테이블·상세시트가 `FIELDS`를 순회한다).

```ts
/** DD 원본의 확장 기술데이터. 값이 없으면 필드 자체를 생략한다. */
export interface DevTechnical {
  // 공정 작업처 (DD 공정 SCHEDULE 그룹의 Mill 컬럼)
  mills?: { yarn?: string; knitting?: string; dyeing?: string; finishing?: string }
  // 공정별 완료일 (기존 processReached 판정에 쓰는 Status 원본값)
  processDates?: { yarn?: string; knitting?: string; dyeing?: string; finishing?: string }
  // 개발 사양
  yarnDetail?: string
  arrangeNo?: string
  finishing?: string[]          // A~D 중 값이 있는 것만
  optionProgress?: string       // "0 / 2"
  review?: string
  // ORIGINAL 분석
  original?: { brand?: string; contents?: string; yarn?: string; comments?: string }
  // 실측 물성
  actual?: {
    width?: number | null; weight?: number | null; balance?: number | null
    shrinkageLength?: number | null; shrinkageWidth?: number | null
  }
  // 편직 사양
  knitSpec?: {
    inch?: string; gauge?: string; needles?: string
    loopF?: string; loopT?: string; loopB?: string
  }
  // 공정단계별 폭/중량
  stageData?: {
    greige?: { width?: number | null; weight?: number | null }
    tenter?: { width?: number | null; weight?: number | null }
    wash?: { width?: number | null; weight?: number | null }
  }
  finish?: { brush?: string; chemical?: string }
  // 리뷰
  passFail?: string
  failReason?: string
  styleHistory?: string
}

export interface DevRecord {
  // ... 기존 필드 유지 ...
  tech?: DevTechnical   // ★ 추가
}
```

**주의**: `DevRecordFieldKey = Exclude<keyof DevRecord, "_src" | "processReached">` 이므로 `"tech"`도 **Exclude에 추가**해야 한다. 안 그러면 `FIELDS` 타입이 깨진다.

```ts
export type DevRecordFieldKey = Exclude<keyof DevRecord, "_src" | "processReached" | "tech">
```

### 2. `src/data/xlsx-parsers.ts` — 컬럼 추가 + `tech` 채우기

- `DEV_DEFAULT_COLUMNS`에 위 표의 ★ 인덱스를 **0-based 그대로** 추가한다(전체현황 기준).
- `devColumns()`의 `locate(aliases, fallback)` 패턴을 그대로 써서 **별칭 + 폴백** 둘 다 준다.
  담당자 시트는 `담당` 컬럼이 없어 1칸 밀리므로, **폴백에만 의존하면 안 되고 별칭 탐색이 반드시 동작해야 한다.**
  - `combinedHeaders()`가 그룹+서브헤더를 합쳐주므로 헤더 텍스트는 `"actual width"`, `"greige width"`, `"yarn in-fac mill"` 형태가 된다.
  - `compact()`는 공백·`.`·`_`·`#`·`/`·`'`·`"`·`()`·`-`·`[]`를 제거하지만 **`%`는 남긴다**. `축률(L)%` → `축률l%`.
  - ⚠️ 별칭은 **추측하지 말고 실제 파싱 결과를 찍어서 확인**할 것. 아래 검증 절차 참조.
- 값 변환: 숫자 컬럼은 기존 `numberOrNull`, 날짜는 기존 날짜 처리(`XLSX.SSF.format("yyyy-mm-dd", …)` 하루 밀림 방지 유지), 나머지는 `text()`.
- **빈 값은 필드를 넣지 않는다**(`undefined`). 캐시 용량과 UI 분기를 단순하게 유지.
- 기존 `processReached` 판정 로직(Status 컬럼 기준)은 **변경하지 마라.** `tech.processDates`는 원본값 보관용으로만 추가.

### 3. 캐시 호환

- IndexedDB `fabric-rnd-cache`의 기존 레코드에는 `tech`가 없다. **UI는 `tech` 부재를 정상 상태로 처리**해야 한다(옵셔널 체이닝, 섹션 자체를 숨김).
- 사용자에게 "새 필드를 보려면 DD를 다시 업로드해야 한다"는 안내는 SETTING 화면 기존 문구 수준으로 충분. 별도 마이그레이션 만들지 마라.

## 검증 절차 (필수)

추측 금지. 실제 파일로 확인한다.

1. 사용자의 실제 DD를 SETTING(또는 DEVELOPMENT 업로드 버튼)으로 업로드한다.
2. 임시 콘솔 로그 또는 SETTING 진단 영역에서 다음을 확인:
   - 파싱된 레코드 수 = **82**
   - `tech.mills.yarn/knitting/dyeing` 채워진 비율 ≈ **100%**, `finishing` ≈ **93%**
   - `tech.yarnDetail` ≈ **100%**
   - `tech.actual.width/weight` ≈ **17%** (14건)
   - `tech.optionProgress` ≈ **100%**
   - Status 분포 = 진행중 61 / 완료 12 / HOLD 3 / DROP 3 / REJECT 3
3. 위 수치와 다르면 **별칭/인덱스가 틀린 것**이다. 담당자 시트(1칸 밀림)와 전체현황 양쪽에서 맞는지 확인.
4. 확인 후 임시 로그는 제거한다.
5. `npm run build` 통과.

## 절대 하지 말 것

- 사용자의 실제 데이터 값(스타일 번호, 거래처명, 컬러 등)을 로그·커밋·문서에 남기지 마라. 건수/비율만 확인한다.
- `샘플관리대장` 파서(`SAMPLE_DEFAULT_COLUMNS`, `parseSamples`)는 이번 작업에서 **건드리지 마라.** RDDA 집계가 물려 있다.
- 기존 `FIELDS` 17개 항목의 순서·라벨을 바꾸지 마라.
