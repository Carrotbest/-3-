# R65 — DD MASTER 행 삭제·드래그 순서 이동·대분류 폭 조정

상태: **구현 완료(Claude 작업분)**. `npm run build`(tsc+vite) 통과. 아래는 Codex가 이어받아 작업할 때 참고할 인수인계 기록이다. 커밋은 아직 안 함.

## 목표(사용자 요청)
DD MASTER(`/development/workspace`, `src/routes/DevelopmentMasterSheet.tsx`)에서
1. 각 샘플 옵션(행)을 삭제하는 버튼
2. 행을 드래그앤드롭으로 순서 이동
3. 상단 대분류(고정핵심·개발 REQUEST 등) 단위로 열 간격(폭) 조정

## 변경 파일 (3개)
- `src/data/schema.ts` — `DevRecord`에 `sortOrder?: number` 추가
- `src/store/useAppStore.ts` — `deleteDevelopmentRecord`, `reorderDevelopmentRecords` 추가
- `src/routes/DevelopmentMasterSheet.tsx` — UI·핸들러 전반

## 1) 행 삭제
- 스토어 `deleteDevelopmentRecord(identity)`: `records`에서 `recordIdentity`(=`_src.sheet::_src.row`) 일치 행 제거 후 `saveCache("records")`.
- 담당(owner) 셀 hover 시 휴지통 버튼 노출 → `setConfirmDelete(record)`.
- 파일 하단에 확인 다이얼로그 추가(`confirmDelete` 상태, `confirmDeleteRecord`). Style No.·color·opt 표시, `variant="destructive"` 삭제 버튼.

## 2) 드래그 순서 이동
- 스키마 `sortOrder?`가 있으면 요청일 정렬보다 우선. 없으면 기존 `compareRequestDate`.
- 정렬 비교 함수 `compareManualOrder`: 둘 다 `sortOrder` 있으면 숫자 비교 / 하나만 있으면 **순서 없는(새) 행이 위** / 둘 다 없으면 요청일. `filtered`의 `.sort(...)`에서 `compareRequestDate` → `compareManualOrder`로 교체.
- 스토어 `reorderDevelopmentRecords(orderedIdentities)`: 넘어온 identity 배열 순서대로 index를 `sortOrder`로 부여, 나머지는 유지. `saveCache("records")`로 저장 → 팀 공유(Firestore) 동기화됨.
- UI: 담당 셀 왼쪽에 grip 손잡이(`<span role="button">`, **button 아님** — button이면 HTML5 drag를 삼킴). `onMouseDown` → `setArmedRow(rowId)`.
- `<tr draggable={dragEnabled && armedRow === rowId}>`, `onDragStart`→`setDragRow`, `onDragEnter/Over`→`setDragOverRow`+preventDefault, `onDrop`→`handleRowDrop(rowId)`+`endRowDrag`, `onDragEnd`→`endRowDrag`, `onMouseUp`→드래그 안 했으면 armed 해제.
- `handleRowDrop`: `filtered` identity 배열에서 splice 이동 후 `reorderDevelopmentRecords`.
- **게이트**: `dragEnabled = !categoryScope && owner===ALL && status===ALL && !search.trim()`. 필터가 걸리면 grip 자체가 렌더되지 않음(부분 목록 재배치로 전체 순서가 꼬이는 것 방지). 이 컴포넌트는 실사용상 `categoryScope=null`(Development.tsx:1348)만 쓰임.
- 드롭 대상 행 표시: `[&>td]:shadow-[inset_0_2px_0_0_var(--primary)]`, 끌리는 행은 `opacity-40`.

## 3) 대분류(그룹) 폭 조정
- 기존엔 개별 열만 리사이즈 가능(`startColumnResize`)했고 핀 고정열(담당·Status·Style)은 상수 폭으로 조절 불가였음.
- `PINNED_WIDTH` 상수 제거 → 핀 열도 `widthOf(column)`(=`colWidths[id] ?? column.width`) 기반 동적 폭. sticky `left`는 `pinnedLeft(index)`, 합계는 `pinnedTotal`로 계산.
- 너비 저장 대상 확장: `GROUP_COLUMN_IDS` → `RESIZABLE_COLUMNS`/`RESIZABLE_COLUMN_IDS`(핀+그룹 전체). `loadColumnWidths`/`saveColumnWidths`도 이 집합 사용. localStorage 키 `dd-col-widths` 그대로.
- `startGroupResize(columns, event)`: 드래그로 그룹 총폭 변화분을 각 열에 **비율대로** 분배(`factor = targetTotal/startTotal`, 각 열 `max(MIN_COLUMN_WIDTH, round(start_i*factor))`). `resizeCleanupRef` 패턴 재사용, `saveColumnWidths` 저장.
- 헤더 배치: 고정핵심 `<th>` 오른쪽에 알약형 핸들(`title="고정 핵심 너비 조절"`, `startGroupResize(PINNED_COLUMNS,...)`). 각 그룹 `<th>`는 `relative`+오른쪽 끝 col-resize 핸들(`startGroupResize(group.columns,...)`). 개별 열 핸들(핀 포함)도 유지.
- 담당 열 기본폭 84 → 118(버튼 3개 grip·수정·삭제 수용). `열 너비 초기화` 버튼으로 전부 리셋.

## 검증
- `npm run build` 통과.
- 로컬 확인은 **캡처 모드**(`VITE_CAPTURE=1 npx vite --port 5176`, 데모 데이터, Firebase 로그인 우회 — `src/data/capture.ts`, `App.tsx`/`AuthExperience.tsx`의 `CAPTURE` 분기)에서 진행. 실제 워크스페이스는 Firebase 로그인 필요.
- 확인된 동작: 행당 grip/수정/삭제 48개·대분류 핸들 6개 렌더, 삭제 다이얼로그 표시, 4번째 행→최상단 드래그 이동 반영, 고정핵심 +50px 시 세 열 비율 확대(118→134·108→123·140→159) 및 localStorage 저장.
- localStorage·IndexedDB는 오리진별 격리 → :5176 캡처 세션이 실제 :5175/배포에 영향 없음.

## 알아둘 점 / 후속 여지 (Codex 참고)
- 담당 셀 인라인 편집(더블클릭) 제거됨 — 버튼과 충돌 방지. owner 수정은 담당 셀 ⤢(전체 수정 모달)로 가능. 필요하면 이름 span 더블클릭만 인라인 편집 복구 가능.
- `sortOrder`는 `records`에 실려 Firestore로 동기화됨. 팀 전체 순서가 바뀌는 점 유의(개인별 순서 아님). 데이터 동기화 손대기 전 `fabric-rnd-ts-sync-incident` 메모리 확인 권장(단, 이번 변경은 TS가 아니라 records 라인).
- 필터/검색 상태에서는 드래그 비활성(의도). 필터 상태 재배치가 필요하면 별도 설계 필요.
- `recalculateDevelopmentRecords`(dd-workflow.ts:87)는 `...record` 스프레드라 `sortOrder` 보존됨.
- 미커밋 상태. 사용자 지시 시 커밋.
