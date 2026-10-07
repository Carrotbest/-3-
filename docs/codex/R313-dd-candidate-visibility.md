# R313 — DD 후보에서 연결 창에 REJECT·DROP 행이 안 보이는 문제

상태: 미착수.

대상 파일 둘이다. 그 밖에는 열지 않는다.

- `src/data/request-link-match.ts`
- `src/components/request/DdCandidateDialog.tsx`

**워킹트리는 깨끗하다.** 직전 작업은 `0f73ff4`(R312)로 커밋했다.

## 왜

박향근이 실제로 쓰는 연결 경로는 **REQUEST 화면 Link 열의 "연결" 버튼**이다(`DdCandidateDialog`).
DD MASTER의 요청 연결 도우미는 보기 어려워 쓰지 않는다(디자인 개선은 나중에 따로 한다).

그 창에서 REJECT로 끝난 DD 행이 안 보인다. R312에서 그 창은 **상태로 거르지 않는다**고 확인했으니
다른 원인이다. 코드에서 둘을 찾았다.

1. **점수를 깎는다.** `scoreRowForOption`이 DROP·REJECT에 **-15점**을 준다.
   문턱(`MATCH_MIN_SCORE` 20점) 바로 위에 있던 행이 아래로 밀려 목록에서 사라진다.
   R312에서 "DROP·REJECT도 연결 대상"으로 정했으므로 이 감점은 그 결정과 어긋난다.
2. **문턱을 못 넘으면 빈 상자를 보여 준다.** 검색어가 없을 때 20점 미만은 전부 숨기고
   "점수가 붙는 후보가 없습니다. 검색해서 찾으세요."만 남는다. 실제 캡처가 후보 0건이었다.
   Garment No.와 Style No. 표기가 다른 건이 많아(`numberHit = false`면 39점으로 눌린다)
   점수가 안 붙는 경우가 흔하고, 그때 빈 목록이 막다른 길이 된다.

## 틀렸던 가설

**"DdCandidateDialog가 DROP·REJECT를 상태로 거른다"는 틀렸다.** 거르지 않는다.
후보 필터는 검색어, `unlinkedOnly`, 점수 문턱 셋뿐이다. 상태 필터를 찾으러 다시 뒤지지 마라.

`scoreRowForOption`은 **이 창에서만 쓴다**(`src/` 전체에서 사용처 1곳). 감점을 없애도
도우미나 다른 화면에 영향이 없다. 확인했다.

## 지금 코드

### `src/data/request-link-match.ts`

**40~43행**
```ts
/** 이 점수 아래는 추천으로 올리지 않는다. 약한 우연 일치 스타일을 도우미로 못 믿는다. */
export const MATCH_MIN_SCORE = 20
/** 검색어 없이 미리 고를 수 있을 만큼 확실한 후보로 본다. */
export const MATCH_STRONG_SCORE = 40
```

**`scoreRowForOption` 안**
```ts
  const status = String(record.devStatus ?? "").replace(/\s+/g, "").toUpperCase()
  if (status === "DROP" || status === "REJECT") { score -= 15; reasons.push(status) }
```

### `src/components/request/DdCandidateDialog.tsx`

**9행**
```ts
import { MATCH_MIN_SCORE, scoreRowForOption } from "@/data/request-link-match"
```

**26행**
```ts
const LIMIT = 60
```

**42~53행**
```ts
  const matches = useMemo(() => {
    if (!style || !option) return []
    const needle = query.trim().toLocaleLowerCase("ko-KR")
    return records
      .filter((record) => !needle || [record.styleNo, record.color, record.dyeing, record.owner, record.buyer, record.flNo, record.tech?.yarnDetail]
        .some((value) => text(value).toLocaleLowerCase("ko-KR").includes(needle)))
      .map((record) => scoreRowForOption(record, style, option))
      .filter((match) => !unlinkedOnly || !match.linkedElsewhere)
      // 검색어가 없으면 점수가 붙은 후보만 보인다. DD 행 전체를 펼쳐 놓으면 고르기 어렵다.
      .filter((match) => Boolean(needle) || match.score >= MATCH_MIN_SCORE)
      .sort((a, b) => b.score - a.score || text(a.record.styleNo).localeCompare(text(b.record.styleNo), "en", { numeric: true }))
      .slice(0, LIMIT)
  }, [option, query, records, style, unlinkedOnly])
```

**73행** — 안내 문구
```tsx
        <p className="text-[11px] text-[var(--muted-foreground)]">검색어가 없으면 {MATCH_MIN_SCORE}점 이상 후보만 보입니다. 찾는 행이 없으면 검색하세요.</p>
```

**91행** — 빈 목록 문구
```tsx
          {!matches.length ? <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">{query.trim() ? "검색에 맞는 DD 행이 없습니다." : "점수가 붙는 후보가 없습니다. 검색해서 찾으세요."}</p> : null}
```

## 할 일

### 1. DROP·REJECT 감점을 없앤다 (`request-link-match.ts`)

근거 표시는 남긴다. 점수만 깎지 않는다.

```ts
  // DROP·REJECT 도 연결 대상이다(R312). 점수를 깎지 않고 근거에만 남긴다.
  // 깎으면 문턱(MATCH_MIN_SCORE) 아래로 밀려 검색 없이는 목록에 뜨지 않는다.
  const status = String(record.devStatus ?? "").replace(/\s+/g, "").toUpperCase()
  if (status === "DROP" || status === "REJECT") reasons.push(status)
```

`linkedElsewhere`의 -25 감점은 **그대로 둔다.** 그건 상태가 아니라 "이미 남이 쓰는 행"이라
뒤로 미는 것이 맞다.

### 2. 빈 목록 대신 가까운 후보를 보인다 (`DdCandidateDialog.tsx`)

26행 아래에 더한다.
```ts
/** 문턱을 넘는 후보가 하나도 없을 때 가까운 순으로 보여 줄 수. 빈 상자가 막다른 길이 되는 것을 막는다. */
const WEAK_LIMIT = 20
```

9행 import에 `RowMatch` 타입을 더한다.
```ts
import { MATCH_MIN_SCORE, scoreRowForOption, type RowMatch } from "@/data/request-link-match"
```

42~53행을 바꾼다. **검색어가 있을 때의 동작은 지금과 같다.** 점수와 무관하게 다 보인다.

```ts
  const { matches, weak } = useMemo(() => {
    if (!style || !option) return { matches: [] as RowMatch[], weak: false }
    const needle = query.trim().toLocaleLowerCase("ko-KR")
    const scored = records
      .filter((record) => !needle || [record.styleNo, record.color, record.dyeing, record.owner, record.buyer, record.flNo, record.tech?.yarnDetail]
        .some((value) => text(value).toLocaleLowerCase("ko-KR").includes(needle)))
      .map((record) => scoreRowForOption(record, style, option))
      .filter((match) => !unlinkedOnly || !match.linkedElsewhere)
      .sort((a, b) => b.score - a.score || text(a.record.styleNo).localeCompare(text(b.record.styleNo), "en", { numeric: true }))
    // 검색어가 없으면 점수가 붙은 후보만 보인다. DD 행 전체를 펼쳐 놓으면 고르기 어렵다.
    const strong = needle ? scored : scored.filter((match) => match.score >= MATCH_MIN_SCORE)
    if (strong.length) return { matches: strong.slice(0, LIMIT), weak: false }
    // 하나도 못 넘기면 가까운 순으로 조금만 보인다. Garment No. 표기가 달라 점수가 안 붙는 건이 흔하다.
    return { matches: scored.slice(0, needle ? LIMIT : WEAK_LIMIT), weak: !needle && scored.length > 0 }
  }, [option, query, records, style, unlinkedOnly])
```

### 3. 안내 문구를 상황에 맞춘다

73행을 바꾼다.

```tsx
        <p className="text-[11px] text-[var(--muted-foreground)]">{weak
          ? `${MATCH_MIN_SCORE}점을 넘는 후보가 없어 가까운 순으로 ${WEAK_LIMIT}건까지 보입니다. 번호 표기가 다르면 점수가 안 붙습니다.`
          : `검색어가 없으면 ${MATCH_MIN_SCORE}점 이상 후보만 보입니다. 찾는 행이 없으면 검색하세요.`}</p>
```

91행 빈 목록 문구를 바꾼다. 이제 여기까지 오면 DD 행 자체가 없다는 뜻이다.

```tsx
          {!matches.length ? <p className="py-10 text-center text-sm text-[var(--muted-foreground)]">{query.trim() ? "검색에 맞는 DD 행이 없습니다." : "고를 수 있는 DD 행이 없습니다. 미연결 행만 해제하거나 검색해 보세요."}</p> : null}
```

## 하지 말 것

- **`unlinkedOnly` 필터를 건드리지 마라.** 기본 켜짐 그대로다. 이미 다른 요청에 물린 행을 기본으로 숨기는 것은 맞다.
- **`linkedElsewhere`의 -25 감점을 없애지 마라.** 상태 감점과 다른 이야기다.
- **`MATCH_MIN_SCORE`와 `MATCH_STRONG_SCORE` 값을 바꾸지 마라.** 도우미 추천 탭이 같은 상수를 쓴다. 이번 건은 문턱을 낮추는 것이 아니라 못 넘겼을 때의 대비책을 두는 것이다.
- **점수 산식의 다른 항목(Style No., Buyer, 담당, Yarn, 조직, Color, 중량, 옵션 번호)을 손대지 마라.**
- **`numberHit` 상한(`MATCH_STRONG_SCORE - 1`)을 없애지 마라.** 번호가 안 맞는 건이 자동 선택 문턱 위로 올라가면 엉뚱한 스타일에 붙는다.
- **상태로 거르는 코드를 새로 만들지 마라.** 이 창은 상태를 거르지 않는 것이 결정이다(R312).
- **`suggestStylesForRows`와 `scoreStyleForRows`를 손대지 마라.** 도우미 쪽이다.
- `src/data/request-link.ts`, `src/routes/FabricRequest.tsx`, `src/components/dd/RequestLinkHelperDialog.tsx`는 열지 않는다. R312에서 이미 맞춰 뒀다.
- 새 패키지를 넣지 마라.
- `public/data` 아래 JSON을 열지 마라. `archive.json`이 2.5MB다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset`이나 `git checkout`으로 되돌리지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 검증

`npm run build` 한 번만. 모든 수정을 마친 뒤에 돌린다. 로컬 dev 서버가 5175에서 돌고 있다. 끄지 마라.

그리고 세어라.
- `src/data/request-link-match.ts`에서 `score -= 15`가 **0번**이어야 한다. `score -= 25`는 **1번** 남아야 한다.
- `src/components/request/DdCandidateDialog.tsx`에서 `WEAK_LIMIT` **3번**, `weak` **4번**.
- `git status --short`에 두 파일만 `M`이어야 한다.

## 보고

수정한 파일, `npm run build` 결과, 위 숫자들, 판단이 필요한 지점만. 바꾼 코드를 다시 붙이지 마라.
