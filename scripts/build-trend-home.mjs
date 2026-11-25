// feed.json(2.7MB) 에서 HOME 이 실제로 그리는 기사 다섯 건만 뽑아 home.json 으로 쓴다.
// 고르는 규칙은 HomeTrendSection 346~349행의 것과 글자 그대로 같아야 한다.
// 다르면 HOME 에 다른 기사가 뜬다.
import { readFileSync, writeFileSync, existsSync } from "node:fs"

const SOURCE = "public/data/trend/feed.json"
const TARGET = "public/data/trend/home.json"
const COUNT = 5

if (!existsSync(SOURCE)) {
  console.log("[trend-home] feed.json이 없어 건너뜁니다")
  process.exit(0)
}

const feed = JSON.parse(readFileSync(SOURCE, "utf8"))
const articles = [...(feed.articles ?? [])]
  .filter((article) => Boolean(article.i))
  .sort((left, right) => Number(right.h > 1) - Number(left.h > 1) || right.d.localeCompare(left.d))
  .slice(0, COUNT)

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
