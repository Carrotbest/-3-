# R331 홈 TREND 기사 카드: 클릭하면 요약 팝업, 넘기기 버튼 키우기

상태: 미착수.

## 인코딩 주의
파일은 반드시 `Get-Content -Encoding UTF8`로 읽어라. 한글 문구를 영어로 바꾸지 마라. 아래 한글 문구를 글자 그대로 쓴다.

## 현재 동작
`src/components/dashboard/HomeTrendSection.tsx`의 `FabricTrendStack`. 맨 앞 카드 `<button onClick={() => active && move(1)}>`이 다음 기사로 넘긴다. 하단 넘기기 버튼은 `variant="ghost" size="icon" className="size-8"` 아이콘 두 개라 잘 안 보인다. 카운터 `{activeIndex + 1} / {articles.length}`는 머리말 오른쪽에 있다.

요약 팝업은 `src/routes/TrendFabric.tsx` 163행 `ExcerptDialog`(트리거형)와 67~75행 `ArticleExcerpt` 타입, `ArticleThumbnail`이 화면 파일 안에만 있다.

## 파일별 조치

### 1. 새 파일 `src/components/trend/ArticleExcerptDialog.tsx`
`TrendFabric.tsx`의 `ArticleExcerpt` 타입, `ArticleThumbnail`, `ExcerptDialog`를 이 파일로 옮겨 export 한다. 내용과 문구는 그대로다.
추가로 제어형 팝업을 export 한다.
```tsx
export function ArticleExcerptModal({ article, onOpenChange }: { article: ArticleExcerpt | null; onOpenChange: (open: boolean) => void })
```
`<Dialog open={Boolean(article)} onOpenChange={onOpenChange}>` 안에 `ExcerptDialog`와 같은 `DialogContent` 본문을 그린다. 본문 마크업은 한 함수(`ExcerptBody`)로 빼서 두 컴포넌트가 같이 쓴다. `DialogContent`에 `relative`, `absolute`, `static` 넘기지 말 것.

### 2. `src/routes/TrendFabric.tsx`
옮긴 세 가지를 지우고 새 파일에서 import 한다. 화면 동작은 그대로여야 한다.

### 3. `src/components/dashboard/HomeTrendSection.tsx` `FabricTrendStack`
- 상태 `openArticle: TrendArticle | null` 추가. 맨 앞 카드 클릭은 `setOpenArticle(article)`. 뒤 카드는 지금처럼 무반응. `aria-label`은 `` `요약 보기: ${article.t}` ``.
- 팝업이 열려 있는 동안 자동 넘김을 멈춘다(자동 넘김 effect 조건에 `openArticle` 추가).
- 카드 오른쪽 글 영역 맨 아래, 날짜 줄 오른쪽에 작은 표시 `요약 보기`(`Maximize2` 아이콘 size-3.5, `text-xs font-medium text-[var(--foreground)]/70`, 카드 hover 시 `text-[var(--foreground)]`). 날짜 줄과 같은 줄에 `justify-between`으로 둔다.
- 컴포넌트 끝에 `<ArticleExcerptModal article={openArticle} onOpenChange={(open) => { if (!open) setOpenArticle(null) }} />`.
- 머리말 오른쪽의 카운터 span을 지운다(아래 넘기기 바로 옮긴다).
- 하단 넘기기 바를 다시 만든다.
  - 왼쪽: 기존 점 표시 유지. 점 크기만 `size-2.5`에서 `h-2 w-2`, 활성 `w-6` 그대로.
  - 오른쪽: 한 덩어리 알약 컨트롤. 바깥 `inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--card)] p-1 shadow-sm`.
    - `이전` 버튼: `ChevronLeft` + 글자 `이전`, `h-9 rounded-full px-3 text-sm font-medium`, hover `bg-[var(--muted)]`.
    - 가운데 카운터: `{activeIndex + 1} / {articles.length}`, `min-w-[3.5rem] text-center text-sm tabular-nums text-[var(--muted-foreground)]`.
    - `다음` 버튼: 글자 `다음` + `ChevronRight`, 같은 크기. 이쪽만 강조 `bg-[var(--foreground)] text-[var(--background)] hover:opacity-90`.
    - 아이콘은 `size-4`. `aria-label`은 `이전 기사`, `다음 기사` 유지. 포커스 링 `focus-visible:ring-2 focus-visible:ring-[var(--ring)]`.
  - 바의 위 여백 `mt-3`.
- `backdrop-blur`, 번짐 그림자, 상시 애니메이션 추가 금지.

## 하지 말 것
- `MacroTrendTicker`, `HomeTrendSection`의 기사 선별 로직, `src/data/trend.ts`, `public/data` 를 고치지 말 것.
- 이번 작업과 무관한 워킹트리 변경(`src/data/inbound-request-mail.ts`, references 관련 파일, `BuyerProtocols.tsx`)을 건드리지 말 것.

## 검증
- `npm run build` exit 0 한 번.
- `git status --short`에 삭제 없음.
