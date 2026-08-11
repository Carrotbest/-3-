# 작업지시 R27 — 자료 덱 수정 (흰 배경·화살표 버그·TS 매핑·링크 UI 정리)

작성: Claude (기획·검토) / 구현: Codex / 최종 검토: Claude
대상: `src/components/cards/MaterialDeck.tsx`, `src/components/cards/CoverflowGallery.tsx`, `src/data/derive.ts`, `src/routes/TS.tsx`

## 배경

R26에서 덱을 검정 무대로 바꿨으나 사용자가 흰 배경을 원한다. 또한 하단 화살표가 클릭이 안 먹는 버그, TS 데이터 매핑(요약·담당) 오류, 링크 미등록 UI 노이즈를 정리한다.
**R26의 정사각 coverflow·좌우 peek·카드별 컬러 그라데이션·스무스 모션은 유지한다.** 무대 배경만 밝게 되돌린다.

## 절대 건드리지 말 것

- 덱 동작 로직(휠 양끝 해제, 드래그, 키보드) 자체는 유지. 화살표 버그만 고친다.
- DD/샘플대장/TS/STUDY 파서 수정 금지. HOME 상단·DEVELOPMENT 회귀 금지.
- git commit / reset / checkout 금지. 실제 데이터 값 로그 금지.

---

## 1) 무대 배경을 밝게 (검정 → 앱 서페이스)

`MaterialDeck.tsx`:
- 루트 컨테이너의 강제 다크 배경 `bg-[linear-gradient(180deg,#111114,#0b0b0f)]` 을 **테마 기본 서페이스**로 되돌린다: `bg-[var(--card)]` + `border-[var(--border)]`. 포커스 링도 `--ring`으로.
- 무대 중앙의 다크용 **radial glow(`activePalette.glow` blur 스팬) 제거.** 흰 배경에선 탁해 보인다. 깊이감은 카드 그림자로만.
- 하단 컨트롤(이전/다음 버튼, 카운터)의 다크 전용 클래스(`bg-white/10 text-white` 등)를 **기본 outline 버튼·`text-[var(--foreground)]`** 로 되돌린다.
- **카드 자체는 그대로 둔다**: 정사각, coverflow, 컬러 그라데이션 배경, `tone="onColor"`(카드 위 흰 텍스트), vignette, 스무스 모션 전부 유지. (카드는 컬러라 흰 글자가 맞다.)

`CoverflowGallery.tsx`: 위와 동일하게 무대 배경만 밝게, 다크 글로우·다크 컨트롤 되돌림. 카드 비주얼·폴백(3건 미만 그리드/0건 데모)·동작은 유지.

## 2) 하단 화살표 버튼 클릭 버그 수정 (원인 규명 완료)

**원인**: 덱 루트 div의 `onPointerDown` 이 `setPointerCapture(pointerId)` 를 호출한다. 화살표를 클릭하면 pointerdown 이 루트로 버블 → 루트가 포인터를 캡처 → 이후 `click` 이벤트가 화살표 버튼이 아니라 캡처 요소(루트)로 가서 **버튼 onClick 이 안 불린다.**

**수정**: 이전/다음 화살표 버튼(과 필요 시 카드 외 컨트롤)에 `onPointerDown={(e) => e.stopPropagation()}` 을 추가해 루트 캡처가 걸리지 않게 한다. 드래그(카드 영역)·휠·키보드 동작은 그대로 유지된다.
- `MaterialDeck.tsx` 의 두 화살표 버튼, `CoverflowGallery.tsx` 의 화살표에도 동일 적용.
- 수정 후 실제로 화살표로 카드가 넘어가는지 확인할 것.

## 3) TS 데이터 매핑 수정 (`derive.ts` `tsMaterials`)

현재:
```ts
summary: materialSummary(record.inquiry || record.causes),
owner: cleanMaterialText(record.owner) || cleanMaterialText(record.from) || undefined,
```
변경:
- **요약 = Causes 행**: `summary: materialSummary(record.causes)` (inquiry 폴백 제거).
- **담당자 = Advisor**: `owner: cleanMaterialText(record.owner) || undefined` (`record.from` 폴백 제거).
  - ※ TS 파서에서 `owner` 는 이미 `Advisor` 컬럼에서 온다(`locate(["Advisor","담당"])`). `from`(요청자 From 컬럼)을 쓰면 안 된다.
- **제목 = Subject** 는 현행 유지(`title: record.subject`). 이게 곧 "자료 검색 목록의 Subject 행"이다(요구 5 충족).
- `detail` 의 문의/원인/분석/조치/결과 항목은 **그대로 유지**한다(카드 클릭 시 TS 처리 상세, 요구 3).

## 4) 링크 미등록 UI 제거 (요구 4)

링크가 없는 항목(예: TS)에서 "링크 미등록" 문구와 **비활성 "SharePoint에서 열기" 버튼을 없앤다.** 링크가 있을 때만 열기 버튼을 렌더한다.

- `MaterialDeck.tsx` `MaterialDetailSheet`(≈283행): `link` 있으면 열기 버튼, **없으면 아무것도 렌더하지 않는다**(현재의 `disabled` 버튼 + "링크 미등록" `<p>` 분기를 삭제).
- `MaterialDeck.tsx` 검색 목록 카드(≈405행): 액션 영역에서 **`상세` 버튼만 항상 두고**, `link` 있을 때만 `SharePoint에서 열기` 추가. `링크 미등록` 텍스트와 `disabled` 버튼 분기 삭제.
- 이 규칙은 전역(모든 kind) 적용이라 STUDY 등 링크 없는 항목도 자동으로 깔끔해진다.

## 검증

- `npm run build` 통과.
- 덱 무대가 **흰색(라이트) / 테마 서페이스(다크)** 이고 카드는 컬러 그라데이션 유지.
- **하단 화살표로 카드가 실제로 넘어간다.**
- TS 카드/목록 요약이 **Causes**, 담당이 **Advisor** 로 표시(실데이터 업로드 시).
- TS 카드 클릭 → 문의/원인/분석/조치/결과 상세.
- 링크 없는 항목에 "링크 미등록"·비활성 열기 버튼이 **안 보인다**. `상세` 버튼은 남는다.
- HOME 상단·DEVELOPMENT 회귀 없음, 콘솔 에러 없음.

## 완료 후 보고

- 화살표 버그를 어떻게 고쳤는지(stopPropagation 위치)
- tsMaterials summary/owner 변경 확인
- 링크 UI 삭제 범위
