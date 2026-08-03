# 작업지시 01 — 스타일시트 3종 구현

## 맡을 파일 (이 3개만 새로 만든다)

- `assets/css/base.css`
- `assets/css/layout.css`
- `assets/css/components.css`

다른 파일은 **읽기만** 한다. 특히 `legacy/`는 열지 마라.

## 먼저 읽을 것 (이 4개면 충분하다)

1. `assets/css/tokens.css` — 쓸 수 있는 변수의 전부. 여기 없는 색/치수는 만들지 마라.
2. `index.html` — 앱 셸의 실제 마크업과 클래스명.
3. `assets/js/ui/widgets.js` — 뷰가 생성하는 조각들의 클래스명.
4. `assets/js/views/home.js` — 실제 조합 예시. 이 화면이 제대로 보이면 성공이다.

## base.css — 리셋 · 타이포 · 유틸

- `box-sizing: border-box` 전역, `margin:0`, 이미지 `max-width:100%`
- `body`: `--font-sans`, `--fs-body`/`--lh-body`, `--c-canvas`, `--c-ink`
- 링크·버튼·인풋의 기본 폰트 상속
- `:focus-visible` 은 `--c-brand` 2px outline + offset 2px. `outline:none`만 주고 끝내지 마라.
- `.skip-link` — 평소 화면 밖, 포커스되면 좌상단에 나타남
- `.eyebrow` — `--fs-xs`, `--c-brand`, `--fw-bold`, `--ls-wide`, 대문자
- `.link` — `--c-brand-ink`, `--fw-bold`, `--fs-xs`, 밑줄 없음, hover 시 밑줄
- `.mono` — `--font-mono` + `font-variant-numeric: tabular-nums`
- `h1/h2/p` 기본 여백 제거. 간격은 레이아웃이 `gap`으로 만든다.

## layout.css — 앱 셸

```
.app          사이드바 --w-side + 1fr 그리드, 최소 높이 100vh
.side         --c-navy 배경, 세로 flex, 상단 브랜드 / 중앙 nav / 하단 foot
.side__brand  .side__mark(30px 라운드 사각, --c-brand 배경, 흰 글자) + 이름 블록
.side__label  섹션 라벨. --fs-2xs, --c-navy-muted, --ls-wide, 위쪽 여백 --sp-6
.nav          블록 링크. 좌우 --sp-3, 라운드 --r-sm, --c-navy-ink
              hover/.is-active → --c-navy-hover 배경 + 흰 글자
.nav__dot     7px 원. 기본 --c-navy-muted, .is-active 일 때 --c-brand-soft
.nav--sub     들여쓰기 --sp-3, --fs-sm, dot 없음
.side__foot   margin-top:auto, 상단 1px 구분선, --fs-xs
.topbar       높이 --h-top, --c-paper, 하단 1px --c-line, 좌우 --sp-9, 양끝 정렬
.crumb        --fs-sm --c-muted, b 는 --c-ink
.topbar__right  gap --sp-3 flex
.topbar__menu   햄버거. 데스크톱에서 숨김
.databar      셸과 콘텐츠 사이 한 줄 띠. data-mode 속성에 따라 색이 바뀐다:
                demo    → --c-brand-tint 배경 / --c-brand-ink 글자
                tds     → --c-ok-tint / --c-ok
                loading → --c-neutral-tint / --c-neutral
                failed  → --c-crit-tint / --c-crit
              .databar__badge 는 알약 모양, .databar__msg 는 --fs-xs
.content      max-width --w-content, 좌우 auto, padding --sp-8 --sp-9 --sp-12
.view-head    아래 정렬 양끝 배치, 아래 여백 --sp-6
.view-head__title  --fs-display/--lh-display, --ls-tight
.view-head__sub    --c-muted, 위 여백 --sp-2
.cols         그리드. --cols--2-1 은 1.55fr 1fr, --cols--1-1 은 1fr 1fr, --cols--1-2 는 1fr 1.55fr. gap --sp-4
.stack        세로 그리드 gap --sp-4
.placeholder  미구현 화면 안내. 점선 테두리 --c-line-strong, 라운드 --r-lg, 가운데 정렬, 세로 여백 --sp-12
.view-error   --c-crit-tint 배경 안내 박스
```

반응형:
- `max-width: 980px` — 사이드바를 화면 밖으로 밀어내고(`transform`) `.side.is-open`이면 오버레이로 슬라이드 인.
  `.topbar__menu` 표시, `.content` 패딩 축소, `.cols`는 1열.
- `max-width: 560px` — `.crumb` 숨김, `.user__name` 숨김(아바타만), `.kpis` 1열.

## components.css — 카드 · KPI · 배지 · 표 · 폼

```
.card            --c-paper, 1px --c-line, --r-lg, --shadow-1
.card__head      좌우 양끝, 아래 여백 --sp-3, .card__title 은 --fs-h2/--fw-bold
.card__body      세로 gap --sp-3 그리드
.card__foot      상단 구분선 + --fs-xs
.kpis            4열 그리드 gap --sp-4 (980px 이하 2열, 560px 이하 1열), 아래 여백 --sp-6
.kpi             .card 와 같은 표면. .kpi__label(--fs-xs --c-muted)
                 .kpi__value(--fs-kpi --fw-bold --ls-tight, tabular-nums)
                 .kpi__note(--fs-xs --c-muted), .kpi__note--crit 는 --c-crit
.badge           알약. --fs-2xs --fw-bold. 변형 --brand/--ok/--warn/--crit/--neutral
                 각각 tint 배경 + 본색 글자
.alert           좌측 3px 색 띠 + tint 배경 + 양끝 배치. --alert--warn/--crit/--ok
.task            [7px 막대 | 텍스트 | 배지] 3열. 행마다 상단 1px 구분선, 첫 행은 없음
                 .task__bar 는 라운드 막대, --crit/--warn/--brand/--ok 변형
                 .task__text b 는 --fs-sm --fw-bold, span 은 --fs-xs --c-muted
                 hover 시 배경 --c-paper-2, 커서 pointer, 키보드 포커스 링
.feed__row       [8px 점 | 텍스트] 2열, 행 구분선. .feed__dot--ok/warn/crit/brand
.progress        높이 8px, --c-line 트랙, --r-full. .progress__fill--brand/ok/warn/crit
.stage           4~6개 세그먼트 가로 배열. .stage__seg 22x5 라운드
                 기본 --c-line, .is-done 은 --c-brand-soft, .is-now 는 --c-warn
.copybox         점선 테두리 --c-line-strong, --c-paper-2 배경, 안에 .copybox__line(--font-mono --fs-xs)
                 버튼은 오른쪽 아래
.btn             1px --c-line, --c-paper, --r-sm, padding --sp-2 --sp-3, --fs-sm
                 .btn--primary 는 --c-brand 배경/--c-on-brand 글자
                 .btn--ghost 는 테두리 없음 + --c-brand-ink 글자
                 :disabled 는 opacity .5, cursor not-allowed
.iconbtn         정사각 32px 버튼
.filebtn         .btn 과 같은 모양의 label. hover 시 --c-brand 테두리
.empty           가운데 정렬 안내, --c-muted, 세로 여백 --sp-8
.skeleton__row   높이 14px, --c-line 배경, --r-sm, 은은한 shimmer 애니메이션
                 (prefers-reduced-motion 이면 애니메이션 끄기)
.table-card      .card 이되 padding 0, overflow hidden
.table-wrap      overflow-x:auto (표가 넘칠 때 페이지 본문이 가로 스크롤되면 안 된다)
table.grid       border-collapse, width 100%
  th             --c-paper-2 배경, --fs-2xs --fw-bold --c-muted, 하단 1px --c-line, 좌우 --sp-4
  td             --fs-sm, 하단 1px --c-line, 좌우 --sp-4, 상하 --sp-3, white-space nowrap
  tbody tr:hover --c-paper-2
  td.is-mono     --font-mono + tabular-nums
  td.is-num      우측 정렬 + tabular-nums
  th.is-sticky, td.is-sticky  좌측 고정(position:sticky; left:0) + 배경 지정
.toolbar         --c-paper 카드형 한 줄. 검색 입력 + select 들 + 우측 정렬 버튼. flex-wrap
.field           label(--fs-xs --c-muted --fw-medium) + 입력. gap --sp-1
.field input, .field select, .field textarea
                 1px --c-line, --r-sm, padding --sp-2, --c-paper 배경, 폰트 상속
                 :focus-visible 은 --c-brand 테두리
.form-grid       2열 그리드 gap --sp-3, .field--full 은 전체 폭 (560px 이하 1열)
.tabs / .tab     하단 1px --c-line 위에 얹힌 탭. .is-active 는 --c-brand 글자 + 2px 밑줄
```

## 확인

```bash
python -m http.server 5173
```
`http://localhost:5173/` 에서 HOME 화면을 열고 다음을 확인한 뒤 보고한다.

- [ ] 사이드바·탑바·KPI·카드 2열이 와이어프레임 v1과 같은 인상으로 보인다
- [ ] 콘솔 에러 없음
- [ ] 980px / 560px 로 줄여도 가로 스크롤이 생기지 않는다
- [ ] `document.documentElement.dataset.theme = 'dark'` 로 바꿔도 글자가 읽힌다
- [ ] 탭 키로 이동할 때 포커스 위치가 항상 보인다
