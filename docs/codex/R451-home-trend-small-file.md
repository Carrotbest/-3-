# R451 — HOME 이 2.7MB 대신 작은 파일을 받는다

상태: 미착수. R446 부터 R450 까지가 커밋 전 워킹트리에 들어 있고 그 위에 얹는다.

| 파일 | 조치 |
|---|---|
| `scripts/build-trend-home.mjs` | 새로 만든다. `feed.json` 에서 HOME 이 쓰는 다섯 건만 뽑아 `home.json` 으로 쓴다 |
| `package.json` | `prebuild` 와 `predev` 를 더한다 |
| `.gitignore` | 만들어지는 `home.json` 을 뺀다 |
| `src/data/trend.ts` | `loadTrendHome` 을 더한다. `home.json` 이 없으면 `feed.json` 으로 떨어진다 |
| `src/routes/Home.tsx` | `loadTrendFeed` 대신 `loadTrendHome` 을 부른다 |

---

## 0. 무엇이 문제인가

`src/routes/Home.tsx` 876행이 첫 화면에서 이렇게 부른다.

```ts
    Promise.all([loadTrendFeed(), loadTrendKpi()])
```

`loadTrendFeed` 는 `public/data/trend/feed.json` 을 받는다. **2.7MB 다.**

그 값을 받는 `HomeTrendSection` 은 이렇게 쓴다(`src/components/dashboard/HomeTrendSection.tsx` 346~349행).

```ts
  const articles = useMemo(() => [...(feed?.articles ?? [])]
    .filter((article) => Boolean(article.i))
    .sort((left, right) => Number(right.h > 1) - Number(left.h > 1) || right.d.localeCompare(left.d))
    .slice(0, 5), [feed])
```

**기사 1,500건 중 5건만 쓴다.** 실측하면 2,084,507자 중 11,009자, 0.5% 다. `feed` 로 쓰는 것은 `articles` 뿐이다. `facets`, `daily`, `momentum` 은 HOME 에서 아무 데도 안 쓴다(`trendFeed` 는 `Home.tsx` 844행에서 만들어 1032행에서 넘기는 것이 전부다).

TREND 화면(`src/routes/TrendFabric.tsx`)은 전체가 필요하다. **그쪽은 그대로 `feed.json` 을 받는다.**

## 1. `scripts/build-trend-home.mjs` (새 파일)

빌드와 개발 서버 시작 전에 돌아서 `public/data/trend/home.json` 을 만든다. 기존 `scripts/export-standalone.mjs` 와 같은 자리, 같은 `.mjs` 꼴이다.

```js
// feed.json(2.7MB) 에서 HOME 이 실제로 그리는 기사 다섯 건만 뽑아 home.json 으로 쓴다.
// 고르는 규칙은 HomeTrendSection 의 것과 **글자 그대로 같아야 한다**(346~349행).
// 다르면 HOME 에 다른 기사가 뜬다.
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { dirname } from "node:path"

const SOURCE = "public/data/trend/feed.json"
const TARGET = "public/data/trend/home.json"
const COUNT = 5

if (!existsSync(SOURCE)) {
  // 수집이 한 번도 안 돌았으면 만들지 않는다. 화면은 feed.json 으로 떨어진다.
  console.log("[trend-home] feed.json 이 없어 건너뜁니다")
  process.exit(0)
}

const feed = JSON.parse(readFileSync(SOURCE, "utf8"))
const articles = [...(feed.articles ?? [])]
  .filter((article) => Boolean(article.i))
  .sort((left, right) => Number(right.h > 1) - Number(left.h > 1) || right.d.localeCompare(left.d))
  .slice(0, COUNT)

// TrendFeed 모양을 지킨 채 HOME 이 안 보는 칸은 비워 둔다.
const home = {
  generated_at: feed.generated_at ?? "",
  window_days: feed.window_days ?? 0,
  total: feed.total ?? 0,
  translated: feed.translated ?? 0,
  filtered_out: feed.filtered_out ?? 0,
  facets: { categories: [], sources: [], tags: [], entities: [] },
  daily: [],
  momentum: [],
  articles,
}

writeFileSync(TARGET, JSON.stringify(home), "utf8")
console.log(`[trend-home] ${TARGET} ${articles.length}건 / ${JSON.stringify(home).length}자`)
```

**기사 객체는 통째로 담는다.** 칸을 골라 담지 마라. 화면이 어느 칸을 그리는지 하나라도 빠뜨리면 그 자리가 빈다. 다섯 건이면 어차피 작다.

`dirname` 을 import 해 놓고 안 쓰면 린트가 걸릴 수 있다. 안 쓰면 그 줄을 지워라.

## 2. `package.json`

`scripts` 에 두 줄을 더한다. 기존 네 줄은 **고치지 마라.**

```json
    "prebuild": "node scripts/build-trend-home.mjs",
    "predev": "node scripts/build-trend-home.mjs",
```

`npm` 이 `build` 와 `dev` 앞에서 자동으로 돌린다. 배포(`.github/workflows/deploy.yml`)도 `npm run build` 를 부르므로 그대로 걸린다. 워크플로 파일은 고치지 마라.

## 3. `.gitignore`

만들어지는 파일이라 저장소에 넣지 않는다. TREND 수집이 돌 때마다 바뀌어 커밋이 지저분해진다.

```
public/data/trend/home.json
```

`public/data/trend/feed.json`, `kpi.json`, `status.json` 은 **추적하는 파일이다. 건드리지 마라.**

## 4. `src/data/trend.ts`

142행 `loadTrendKpi` 아래에 더한다. 기존 `loadTrendFeed`, `loadTrendKpi`, `loadTrendStatus`, `readJson` 은 고치지 마라.

```ts
/**
 * HOME 전용. 기사 다섯 건만 담은 작은 파일을 읽는다(R451).
 * `home.json` 은 빌드 때 만들어지는 파일이라 없을 수 있다. 그때는 feed.json 으로 떨어진다.
 */
export const loadTrendHome = async (): Promise<TrendFeed | null> => {
  const small = await readJson<TrendFeed>("home.json")
  return small ?? loadTrendFeed()
}
```

## 5. `src/routes/Home.tsx`

47행 import 에서 `loadTrendFeed` 를 `loadTrendHome` 으로 바꾼다. `loadTrendKpi` 와 타입 import 는 그대로 둔다.

876행:

```ts
    Promise.all([loadTrendHome(), loadTrendKpi()])
```

**그 아래 `.then`, `.catch`, `.finally` 와 `setTrendFeed` 는 하나도 고치지 마라.** 받는 모양이 같다.

`src/components/dashboard/HomeTrendSection.tsx` 는 **열지 마라.** 고를 다섯 건을 미리 골라 주는 것이라, 그쪽 `filter`·`sort`·`slice` 가 다섯 건 위에서 다시 돌아도 같은 다섯 건이 나온다.

## 6. 하지 말 것

- **TREND 화면을 건드리지 마라.** `src/routes/TrendFabric.tsx` 와 `TrendMacro.tsx` 는 `loadTrendFeed`·`loadTrendKpi` 를 그대로 쓴다. 전체 자료가 필요한 화면이다.
- `src/components/dashboard/HomeTrendSection.tsx` 를 고치지 마라.
- 고르는 규칙을 "개선"하지 마라. `HomeTrendSection` 346~349행과 글자 그대로 같아야 한다.
- 기사 객체의 칸을 골라 담지 마라. 통째로 담는다.
- `feed.json`, `kpi.json`, `status.json` 을 고치거나 지우지 마라.
- `public/data` 아래 JSON 을 **읽지 마라.** 스크립트가 읽는 것이지 네가 열어 볼 일이 아니다. `archive.json` 은 2.5MB 다.
- `tools/trend` 의 수집기(파이썬)를 고치지 마라.
- `.github/workflows/` 를 고치지 마라.
- `src/data/nav-badges.ts` 를 고치지 마라. 거기 주석대로 `feed.json` 을 안 건드리는 것이 맞다.
- 커밋하거나 푸시하지 마라. 워킹트리 변경까지만 한다.
- 사용자가 만든 기존 변경을 `git reset` 이나 `git checkout` 으로 되돌리지 마라. R446 부터 R450 변경이 워킹트리에 들어 있다.
- 파일을 삭제하지 마라.
- 이 저장소는 공개 저장소다. 실데이터, 단가, 협력사명, 개인 메일을 코드나 문서에 넣지 마라.
- 외부 자격증명이 필요한 명령을 돌리지 마라.
- `npm run build` 는 모든 수정을 마친 뒤 한 번만 돌려라.
- 같은 오류를 두 번 고쳐 실패하면 멈추고 보고해라.

## 7. 성공 기준

- `node scripts/build-trend-home.mjs` 가 혼자 돌아가고 `public/data/trend/home.json` 을 만든다.
- 그 파일이 20,000자 아래다.
- `npm run build` 가 통과한다(`tsc --noEmit` 포함). `prebuild` 가 먼저 도는 것이 로그에 보인다.
- `git status --short` 에 `scripts/build-trend-home.mjs`(새 파일), `package.json`, `.gitignore`, `src/data/trend.ts`, `src/routes/Home.tsx` 가 뜬다. `public/data/trend/home.json` 은 **뜨지 않는다**(`.gitignore` 로 빠진다).
- `src/routes/Home.tsx` 에 `loadTrendFeed` 가 없다.
- `src/routes/TrendFabric.tsx` 에는 `loadTrendFeed` 가 그대로 있다.

보고에 `node scripts/build-trend-home.mjs` 가 찍은 줄과 `home.json` 의 글자 수를 적어라. 그 밖에는 수정 파일, 빌드 결과, 판단이 필요한 지점만 적어라. 바꾼 코드를 다시 붙이지 마라.
