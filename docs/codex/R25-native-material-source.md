# 작업지시 R25 — TS·STUDY 덱을 기존 데이터에서 직접 생성 (별도 자료목록 폐기)

작성: Claude (기획·검토) / 구현: Codex / 최종 검토: Claude
배경: R24에서 TS·STUDY 덱을 별도 `자료목록.xlsx`(parseMaterials)에서 가져오게 만든 것은 **이중 관리라 잘못**이었다. TS·STUDY는 이미 각자의 엑셀을 앱이 읽고 있으므로 그 데이터에서 카드를 만든다.

## 확정 방향 (사용자 결정)

- **TS = A안**: 기존 TS 데이터(사고사례)로 카드 + 상세 팝업. 파일 첨부 없음. 카드 클릭 시 문의·원인·분석·조치·결과를 보여준다.
- **STUDY = B안**: 기존 STUDY 데이터로 카드. `materialFile`(교육자료 링크)이 있으면 "SharePoint에서 열기" 버튼 활성.
- **MACRO/FABRIC/PORTFOLIO(트렌드) = 현행 유지**: 네이티브 소스가 없으므로 `자료목록.xlsx`(parseMaterials) + 앱 직접 등록 경로를 그대로 쓴다.
- 따라서 `자료목록.xlsx`는 **폐기가 아니라 트렌드 전용으로 축소**된다. TS/STUDY 행은 더 이상 필요 없다.

## 맡을 파일

- `src/data/schema.ts` — `MaterialItem` 확장
- `src/data/derive.ts` — `tsMaterials()`, `studyMaterials()` 신설
- `src/routes/Home.tsx` — TS·STUDY 덱을 네이티브 소스로 교체
- `src/components/cards/MaterialDeck.tsx` — 상세 시트가 구조화 detail·readOnly 지원
- `src/routes/TS.tsx`, `src/routes/Study.tsx` — 상단 덱을 네이티브 소스로
- `src/routes/Setting.tsx` — 자료목록 드롭존 설명을 "트렌드 자료" 로 문구 수정

## 절대 건드리지 말 것

- DEVELOPMENT 전 화면, HOME 상단(KPI·RDDA), 공정 보드는 회귀 금지.
- DD·샘플대장 파서, `FIELDS` 17항목, 전역 `STAGES` 수정 금지.
- **TS 파서(`parseTechnicalServices`), STUDY 파서(`parseStudy`)의 컬럼 매핑은 바꾸지 마라.** 이미 잘 읽고 있다. 읽는 값을 카드로 "가공"만 한다.
- `parseMaterials`(트렌드용)는 그대로 둔다.
- git commit / reset / checkout 금지. 실제 데이터 값을 로그·문서에 남기지 마라.

---

## 1) `MaterialItem` 확장 (`schema.ts`)

```ts
export interface MaterialDetailRow { label: string; value: string }

export interface MaterialItem {
  id: string
  kind: MaterialKind
  title: string
  summary?: string
  date?: string
  tags: string[]
  link?: string
  owner?: string
  source: "excel" | "manual" | "ts" | "study"   // ts·study 추가
  detail?: MaterialDetailRow[]   // 구조화 상세(TS 사고사례 본문 등)
  readOnly?: boolean             // 네이티브 파생은 수정·삭제 불가
}
```

## 2) 네이티브 → MaterialItem 변환 (`derive.ts`)

### `tsMaterials(ts): MaterialItem[]`

`ts`는 store의 TS 레코드 배열. 실데이터는 `parseTechnicalServices`가 만든 `TechnicalServiceRecord`라 `inquiry/causes/analysis/action/result/productionSite/relatedDepartment/attn`를 갖는다(데모 데이터엔 없을 수 있으니 **옵셔널로 방어**).

- `kind: "TS"`, `source: "ts"`, `readOnly: true`, `link: undefined`
- `title` = `subject`
- `summary` = `inquiry` || `causes` (앞 120자 정도)
- `date` = `receivedAt`
- `owner` = `owner` || `from`
- `tags` = `[productionSite, ...relatedDepartment 를 / 로 분리]` 중 비지 않은 것 (중복 제거)
- `detail` = 아래 중 **값이 있는 것만** 순서대로:
  `문의(inquiry)` / `원인(causes)` / `분석(analysis)` / `조치(action)` / `결과(result)` / `유관부서(relatedDepartment)` / `생산처(productionSite)`
- `id` = 안정적 키(예: `ts-` + record.id)
- 정렬: `receivedAt desc`

### `studyMaterials(study): MaterialItem[]`

`study`는 store의 `StudyRecord[]`. 이미 `materialFile` 필드가 있다.

- `kind: "STUDY"`, `source: "study"`, `readOnly: true`
- `title` = `topic`
- `summary` = `selectionReason` || `category`
- `date` = `completedDate` || `confirmedDate` || `dueDate`
- `owner` = `owner`
- `tags` = `[category]` 중 비지 않은 것
- `link` = `httpsMaterialLink(materialFile)` — **https 로 시작할 때만** 링크로 인정, 아니면 `undefined`
- `detail` = 값 있는 것만: `주차(weekLabel||week)` / `카테고리(category)` / `상태(state)` / `선정 사유(selectionReason)` / `비고(reason)`
- `id` = `study-` + owner + week + topic 정규화
- 정렬: `date desc`

> 주의: STUDY 파서가 `materialFile`을 고정 컬럼(row[9])에서 읽는 것은 그대로 둔다. 사용자에게는 "그 열(자료 링크)에 SharePoint 공유 링크를 넣으면 열기 버튼이 활성화된다"고 안내하면 된다(코드 변경 아님).

## 3) `MaterialDeck.tsx` — 상세 시트 개선

`MaterialDetailSheet`에서:
- `item.detail`이 있으면 **dl 그리드로 상세 행을 렌더**한다(label/value). 없으면 기존 summary만.
- `item.link`이 있을 때만 `SharePoint에서 열기` 버튼(활성). 없으면 버튼을 숨기거나 비활성 + "링크 미등록".
- `item.readOnly === true`면 **수정·삭제(편집) 버튼을 숨긴다**(네이티브 파생은 원본이 엑셀이므로 앱에서 못 고친다).
- 덱 카드 자체는 기존 형태 유지. `readOnly` 여부와 무관하게 클릭 → 상세.

## 4) `Home.tsx` — 덱 소스 교체

- `tsMaterials(ts)` 로 TS 덱, `studyMaterials(study)` 로 STUDY 덱을 만든다.
- **선택**: 같은 kind의 수동 등록(`materialsManual`)이 있으면 뒤에 병합(있으면 표시, 없으면 무시). 없어도 되게.
- 빈 상태 문구 변경:
  - TS: `SETTING에서 TS 엑셀을 업로드하면 사고사례가 카드로 표시됩니다.`
  - STUDY: `SETTING에서 STUDY 엑셀을 업로드하면 교육 과제가 카드로 표시됩니다.`
- TS 덱의 `자료 추가` 버튼은 **제거**한다(원본이 엑셀이므로 앱에서 추가하지 않는다). STUDY도 동일하게 제거.
  - ※ 트렌드(Trend issue) 섹션의 `자료 추가`는 유지한다(네이티브 소스 없음).
- Trend issue 섹션(MACRO/FABRIC/PORTFOLIO)은 R24 그대로 둔다.

## 5) `/ts`, `/study` 페이지

- 상단 덱을 `tsMaterials`/`studyMaterials` 로 교체.
- `/ts`는 기존 TS 목록 테이블을 그대로 유지(덱은 그 위 요약). 중복 데이터지만 목록은 검색·필터용, 덱은 훑어보기용이라 역할이 다르다.
- `/study`도 마찬가지. 기존 섹션 유지.
- 여기서도 TS/STUDY `자료 추가` 버튼 제거.

## 6) `Setting.tsx`

- 자료목록 드롭존 설명을 다음으로 수정:
  `트렌드 자료 목록 엑셀 (MACRO·FABRIC·PORTFOLIO). TS·STUDY는 각 화면 엑셀에서 자동 반영됩니다.`
- 진단 표기는 유지하되, TS·STUDY가 이 파일에서 오지 않는다는 점이 문구로 드러나면 된다.

---

## 검증

- `npm run build` 통과.
- TS 덱: 예시 데이터에서 사고사례 카드가 뜨고, 클릭 시 문의/원인/분석/조치/결과가 보이는지. 편집 버튼 없는지.
- STUDY 덱: 과제 카드가 뜨고, `materialFile`이 https면 열기 버튼 활성·아니면 비활성.
- TS/STUDY 덱에 `자료 추가` 버튼이 없는지. Trend issue엔 있는지.
- 트렌드 3탭은 R24 동작(3건 미만 그리드, 0건 데모) 유지되는지.
- HOME 상단·DEVELOPMENT 회귀 없는지. 콘솔 에러 없는지.

## 완료 후 보고

- `tsMaterials`/`studyMaterials`가 각각 몇 건 생성되는지(예시 데이터 기준)
- STUDY materialFile 중 https 링크로 인정된 비율
- 제거한 버튼과 수정한 문구
