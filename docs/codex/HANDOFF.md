# 인수인계 — 이 시점부터 Codex가 단독으로 진행한다

Claude(지휘)가 여기서 빠진다. 아래 순서대로 Codex가 끝까지 진행한다.
작업 폴더는 `C:\Users\hkpark\Desktop\fabric-rnd`, 브랜치는 `redesign/v2`.

---

## 1. 지금까지 끝난 것 (검수 완료, 손대지 마라)

| 파일 | 상태 |
|---|---|
| `index.html`, `assets/css/*` | 앱 셸 + 토큰·base·layout·components |
| `assets/js/core/*` | router·store·dom·format |
| `assets/js/data/*` | schema·sample·derive·tds-loader·reconcile(합계 대조 5종) |
| `assets/js/ui/*` | widgets·table(`onRender` 훅 포함)·chart |
| `assets/js/views/home.js` | HOME |
| `assets/js/views/development.js` | DEVELOPMENT + 서브 5개 |
| `assets/js/views/ts.js` | TS 관리 (완료 저장 규칙 포함) |
| `assets/js/views/sync.js` | 동기화 상태 |

**이 파일들은 브라우저에서 실제로 동작하는 것을 확인했다.** 요청받지 않은 수정을 하지 마라.

## 2. 진행 중이던 것

- `docs/codex/06-study.md` → `assets/js/views/study.js`
- `docs/codex/07-calendar.md` → `assets/js/views/calendar.js`

두 파일이 이미 만들어져 있으면 3번으로 넘어간다. 없으면 해당 지시서를 먼저 수행한다.

## 3. 남은 작업 — 순서대로

### 3-1. RDDA REPORT
`docs/codex/08-rdda.md` 를 읽고 `assets/js/views/rdda.js` 를 만든다.

### 3-2. SETTING (관리자)
`docs/codex/09-setting.md` 를 읽고 `assets/js/views/setting.js` 를 만든다.

### 3-3. 전체 점검
1차 8개 화면(HOME·DEVELOPMENT·RDDA·TS 관리·STUDY·CALENDAR·동기화 상태·SETTING)이 모두 뜬 뒤:

- `assets/js/main.js` 의 `LAZY` 배열에 모든 화면 id가 있는지 확인한다.
  (파일이 생기면 자동으로 연결되므로 보통 손댈 필요 없다)
- 각 뷰의 `unmount()`가 **구독·이벤트·차트·타이머를 전부 해제**하는지 확인한다.
  화면을 여러 번 오갔을 때 요소가 중복 생성되면 해제 누락이다.
- `AGENTS.md`의 금지 사항을 전 파일에 대해 다시 확인한다. 특히
  하드코딩 색상, `!important`, `MutationObserver`로 자기 DOM 감시.

### 3-4. 마지막 커밋 (사용자 지시: **맨 마지막에 한 번만**)
점검이 끝난 뒤 아래 한 번만 실행한다. **푸시하지 마라.**

```bash
git add -A
git commit -m "feat: 통합원단부 3팀 업무 플랫폼 전면 개편 (redesign v2)"
```

`docs/codex/*.result.txt` 는 `.gitignore`에 걸려 있어 커밋되지 않는다. 정상이다.

---

## 4. Claude가 하던 검증을 대신하는 법

이 환경에는 브라우저가 없다. **헤드리스 브라우저를 설치하려 하지 마라 — 시간만 쓴다.**
네가 할 수 있는 확인은 여기까지다:

```bash
node --check assets/js/views/<파일>.js     # 문법
```
- import 경로가 실제 파일과 일치하는지
- 지시서의 계약대로 `export default { id, title, crumb, mount, unmount }` 를 갖췄는지
- `unmount()`에서 `unsub?.()`, `chartApi?.destroy()`, `tableApi?.destroy()`, 이벤트 해제가 모두 되는지

**실제 화면 확인은 사용자가 한다.** 작업을 마치면 사용자에게 아래를 안내하라:

```bash
python -m http.server 5173 --directory fabric-rnd
```
→ `http://localhost:5173` 에서 좌측 메뉴로 8개 화면을 차례로 눌러 보고,
F12 콘솔에 빨간 에러가 없는지, 화면을 오가도 느려지지 않는지 확인.

## 5. 이미 밟은 지뢰 (다시 밟지 마라)

1. **`MutationObserver`로 표를 감시하다 무한 루프.** 콜백이 셀을 바꾸면 콜백이 다시 불린다.
   콘솔 에러 없이 브라우저가 완전히 멈춘다. 셀 꾸미기는 `createTable`의 `onRender` 훅으로만 한다.
2. **같은 뷰의 서브 라우트 전환 시 `unmount()` 누락.** 라우터에서 이미 고쳤다.
   뷰 쪽에서 중복 방어를 하는 것은 괜찮지만, 라우터를 고치지는 마라.
3. **공용 CSS 파일 동시 수정 충돌.** 화면 전용 스타일은 뷰 파일 안 `STYLE_TEXT` 상수에 넣는다.
   `assets/css/` 는 건드리지 않는다.
4. **민감 필드.** `sensitiveUnlocked`가 false면 단가·협력사명 컬럼을 `***`로 가리지 말고
   **아예 만들지 마라.**

## 6. 판단이 필요하면

계약(`docs/ARCHITECTURE.md` §2)을 바꿔야 한다고 판단되면 **코드를 고치지 말고 보고만 하라.**
사용자가 결정한다. 아직 답을 못 받은 질문이 하나 있다:

> IA_화면구성_v7의 DEVELOPMENT 행에 "17개 항목"이라고 적혀 있는데 나열된 항목은 16개다.
> 현재 `schema.js`의 `FIELDS`는 16개로 되어 있다. 빠진 항목이 있는지 사용자 확인 필요.
