# R43 — WAREHOUSE 재설계: DD 연동 4탭 워크플로 · yds/출고 balance · 폐기 · 샘플대장 열순서 · 무스크롤

대상: `src/routes/Warehouse.tsx`, `src/data/fabric-ledger.ts`, `src/data/schema.ts`(타입 필드 추가), `src/store/useAppStore.ts`(applyFabricAction 확장). 기존 `buildFabricLedger`(DD+샘플대장+overrides 병합)·4상태·4자리 자동 채번·`applyFabricAction` 이력 구조를 확장한다.

확정된 설계 결정(사용자):
- **열 구성 = 핵심 열만(한눈에, 가로 스크롤 없음)**. 공정 4단계·in-house 4종 등 상세는 **행 클릭 상세 모달**로.
- **출고 수령자 = 자유 입력**.
- **폐기 = 수동 선택 일괄 폐기만**(capa 숫자 없음). 사유는 **용량 초과 / 품질 불량** 선택.

---

## 개념(업무 흐름)
입고대기(READY) → [4자리 R&D No. 순서 부여 + 입고] → 창고보관(WAREHOUSE) → [출고(컷팅·분출)로 잔량 감소, 잔량 0 시 자동] → 소진완료(EXHAUSTED). 폐기(DISPOSED)는 입고대기/창고보관에서 수동 선택으로 일괄 처리(용량/품질).
- 데이터는 **DD MASTER에서** 온다(`buildFabricLedger`가 records+samples 병합, 이미 그러함). 완료(receivedDate/완료 Status) 건이 READY로 잡힌다.
- **네 탭의 열 순서·내용은 동일**해야 한다(아래 통일 컬럼). 탭마다 다른 것은 "처리(action) 열"과 체크박스뿐.

## Part 1 — 통일 컬럼(샘플관리대장 열 순서 벤치마크, 핵심만)
네 탭 공통으로 아래 순서의 컬럼을 쓴다(가로 스크롤 없이 들어오도록 폭 압축, 긴 값 truncate+title):
1. **R&D No.**(storageNo) — 없으면 "자동 채번"(READY)
2. **Style No.**
3. **FL No.**
4. **Season**
5. **Category**
6. **Buyer**
7. **담당**(owner)
8. **조직**(construction)
9. **중량**(weight, gsm)
10. **완료일**(completedAt)
11. **재고/잔량**(yds) — 창고보관/소진: `보유 N · 잔량 M yds`(잔량은 색으로 강조), 입고대기/폐기: `—`
12. **처리**(탭별 contextual, 아래) — 데이터 열 아님

- 전각 값·공정·in-house(폭/중량/수축/필링)·출고 이력은 **행 클릭 시 상세 모달**에 샘플대장 순서대로 보여준다.
- 탭 진입 시 상태 badge 열은 생략 가능(탭 자체가 상태). 단 컬럼 "순서·내용 동일" 원칙 유지: 위 1~11은 모든 탭 동일.

## Part 2 — 레이아웃 무스크롤 압축
현재 상단(4개 큰 카드 + 상태분포 패널 + Tabs + SectionCard)이 세로를 많이 차지한다. **한 화면에 들어오게** 압축:
- 상단을 **한 줄 탭 스트립**(입고대기/창고보관/소진완료/폐기 + 각 건수 badge)으로. 큰 카드 그리드 제거, 상태분포는 **슬림 바 1줄**(옵션)로 축소하거나 탭 badge로 대체.
- 검색 + 탭별 액션 버튼(입고 등록·일괄 폐기 등)을 한 줄 툴바로.
- 표는 `min-h-0 flex-1 overflow-auto`로 나머지 높이를 채운다. 페이지 세로 스크롤 최소화.
- PageHeader의 샘플대장 업로드 버튼은 유지하되 툴바로 합쳐 빈 줄 없게(선택).

## Part 3 — 입고대기(READY)
- 각 행 체크박스. 하단/툴바 액션 2종:
  - **선택 입고 등록**: 현재 `receiveChecked` 유지·개선 — 기존 최대 R&D No. 다음 4자리를 **순서대로** 부여하며 WAREHOUSE로. 입고 시 **yds 입력(옵션)** 받을 수 있게(모달 또는 입고 후 창고보관에서 기입 허용).
  - **선택 폐기**: 체크 항목을 일괄 폐기(사유 선택: 품질 불량/용량). → DISPOSED.

## Part 4 — 창고보관(WAREHOUSE): yds 재고 + 출고 balance
- **yds 재고**: 각 원단에 보유 yds를 기입/수정(인라인 편집 또는 행 액션). 저장은 override에 `yds` 필드.
- **출고(컷팅·분출)**: 행 "출고" 액션 → 모달: **수령자(자유 입력)** + **수량(yds)** + 날짜(기본 오늘). 확정 시 출고 이벤트 추가.
  - **잔량(balance) = 보유 yds − Σ(출고 수량)**. 재고/잔량 컬럼에 표시.
  - 행 클릭 상세 모달에 **출고 이력(누가·얼마·언제) + 잔량** 표.
- **잔량 0(이하) 시 자동 소진**: 출고로 잔량이 0 이하가 되면 상태를 EXHAUSTED로 이동(소진 탭으로). yds 미기입이면 자동 판정 불가 → 수동 "소진 완료" 액션도 유지.
- 창고보관에서도 **폐기**(품질/용량) 가능.

## Part 5 — 소진완료(EXHAUSTED) / 폐기(DISPOSED)
- 소진완료: 통일 컬럼 동일, 재고/잔량은 `소진(0)` 표시, 상세에 출고 이력. **창고 복구** 가능.
- 폐기: 통일 컬럼 동일 + 상세에 **폐기 사유(용량/품질) · 처리자 · 일시**. **복구** 가능. 일괄 폐기는 READY/WAREHOUSE에서 체크 선택 → 사유 선택 → 확정.

## Part 6 — 데이터 모델·store 확장(추가형, 하위호환)
- `src/data/schema.ts`
  - `FabricLedgerOverride`에 `yds?: number` 추가(보유 재고).
  - `FabricLedgerAction`에 `"OUTBOUND"` 추가.
  - `FabricLedgerEvent`에 옵셔널 `qty?: number`, `to?: string`, `reason?: string` 추가(출고 수량·수령자, 폐기 사유).
- `src/data/fabric-ledger.ts`
  - `buildFabricLedger`가 `fabricEvents`도 받아(또는 컴포넌트에서 계산) 각 item에 `yds`, `outbound: {to,qty,date}[]`, `outboundTotal`, `balance` 를 부여. (시그니처 추가 인자는 옵셔널로 하위호환.)
  - 잔량 0 이하면 소진으로 간주하는 헬퍼 제공(자동 이동 판정용).
- `src/store/useAppStore.ts` `applyFabricAction`
  - 입력에 옵셔널 `yds?`, `qty?`, `to?`, `reason?` 추가.
  - `OUTBOUND`: 출고 이벤트(qty·to) 추가, override 상태 유지, 잔량 계산해 0 이하면 `toStatus=EXHAUSTED`.
  - yds 설정: 액션으로 override.yds 갱신(RECEIVE 시 또는 별도 재고수정). 
  - `DISPOSE`: reason 저장(event.reason).
  - 기존 RECEIVE/EXHAUST/RESTORE/NOTE 동작 보존.

## 검증 · 금지사항
- `npm run build`(`tsc --noEmit && vite build`) **무오류**, 콘솔 에러 0(하드 리로드 후).
- 확인: (1) READY 체크→순차 4자리 부여→창고보관 이동, (2) 창고보관 yds 기입·출고 시 잔량 감소·누가/얼마 표시·잔량0 자동 소진, (3) 폐기 일괄(사유), (4) 4탭 컬럼 순서·내용 동일, (5) 가로 스크롤 없이 핵심 열이 한눈에, 세로도 최소, (6) 상세 모달에 공정·in-house·출고이력.
- 원본 엑셀 미수정 원칙 유지(웹 상태=override/event만). 전역 토큰·다른 라우트 변경 금지. `CalendarEvent` 등 무관 타입 변경 금지. 기존 시그니처는 **옵셔널 필드 추가**만.
- git 커밋·푸시 금지. 실데이터/캐시 로그 금지.
- 결과 요약을 `.codex-runs/R43-last.txt`에 남기고 모델 확장·balance/자동소진·폐기사유·레이아웃 압축 방식을 기록.
