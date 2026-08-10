# 작업지시 R2 — 업무 로직 TypeScript 이식

전제: `docs/REACT_REBUILD.md` 를 읽어라. R0(스캐폴드)는 끝났고 `node_modules` 도 설치돼 있다.
`npm run build` 와 `npx tsc --noEmit` 는 네트워크 없이 로컬에서 동작한다 — 이걸로 검증한다.

## 목표

`legacy-vanilla/assets/js/` 의 순수 JS 로직을 `src/data/` 와 `src/store/` 로 TypeScript 이식한다.
**동작을 바꾸지 마라.** 디자인이 아니라 로직 이관이다. 타입만 입힌다.

## 원본 → 이식 대상

| 원본 (legacy-vanilla) | 이식 (src) | 비고 |
|---|---|---|
| `assets/js/core/format.js` | `src/data/format.ts` | 날짜·숫자·시즌 정규화 |
| `assets/js/data/schema.js` | `src/data/schema.ts` | FIELDS·CATEGORIES·STAGES·STATUS·MEMBERS·HEADER_MAP. `interface DevRecord` 정의 |
| `assets/js/data/derive.js` | `src/data/derive.ts` | statusOf·kpis·countBy·attentionItems·anomalies·weeklyLines |
| `assets/js/data/reconcile.js` | `src/data/reconcile.ts` | 합계 대조 5종. 반환 타입 명시 |
| `assets/js/data/tds-loader.js` | `src/data/tds-loader.ts` | **`import * as XLSX from 'xlsx'`** 로 바꾼다 (전역 XLSX 아님) |
| `assets/js/data/sample.js` | `src/data/sample.ts` | 더미 데이터. 시드 고정 유지 |

## 상태 스토어

`assets/js/core/store.js` 의 상태 모델을 `src/store/useAppStore.ts` 로 옮긴다.
React용이므로 **zustand** 를 쓴다. zustand 는 이미 설치돼 있다(`package.json` 확인).
`import { create } from 'zustand'`.

상태 키(기존과 동일): `records, meta, ts, study, events, rdda, filters, theme, sensitiveUnlocked`.
`meta` 는 `{ mode:'demo'|'tds', fileName, appliedAt, appliedBy, checks[], anomalies[], history[], passed }`.

앱 시작 시 `sample.ts` 의 더미로 초기화한다(기존 main.js 와 동일).

## 계약 (반드시 보존)

1. **reconcile 5종**: 담당자별 시트 합 / 전체현황 합 / 카테고리 합 / 시즌 합 / Opt 중복.
   `passed === false` 면 스토어의 `records` 를 교체하지 않는다(이전 값 유지). 이 규칙을 그대로 옮겨라.
2. **민감 필드**: `sensitiveUnlocked = (meta.mode==='tds' && meta.passed)`.
   단가·협력사명은 이 값이 true 일 때만. (표시 로직은 R3 화면에서, 여기선 상태만.)
3. **TDS 파싱은 브라우저 안에서만.** 파일을 어디로도 보내지 않는다.

## TS 파일 로더 주의

`tds-loader.ts` 에서 SheetJS 는 `import * as XLSX from 'xlsx'`. `File.arrayBuffer()` →
`XLSX.read(buf, { type:'array', cellDates:true })`. 나머지 파싱 로직(헤더 행 탐색·매핑·요약시트 구분)은
원본 그대로 옮긴다.

## 하지 말 것

- 로직 변경·"개선". 값·규칙·함수 결과가 원본과 같아야 한다.
- 화면(routes/*) 수정 — R3 에서 한다. 여기선 src/data 와 src/store 만.
- 새 npm 패키지 임의 설치(네트워크 막힘). 필요하면 보고만.

## 검증

```
npx tsc --noEmit      # 타입 에러 0
npm run build         # 성공
```
브라우저 확인은 하지 마라.

## 보고

```
DONE: <만든 파일>
TYPES: <주요 interface/type 이름>
BUILD: <tsc / build 결과>
NOTES: <zustand 유무, 원본과 달라진 점(있으면), 판단 필요 지점>
```
커밋하지 마라.
