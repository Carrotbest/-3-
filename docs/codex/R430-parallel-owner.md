# R430 — 병행 담당("변재휘/김지현")을 두 사람 각각으로 센다

상태: 미착수

## 증상

DD MASTER 담당 칸에 `변재휘/김지현`처럼 `/`로 두 사람을 적은 행이 있다. 두 사람이 병행해 개발하는 건이다. 전체 미리보기에는 보이는데 **변재휘 탭에도 김지현 탭에도 안 보인다.** 담당 네임카드 건수에도 안 잡힌다. 2026-11-12 박향근 보고.

## 원인 (실측)

담당을 사람별로 묶는 자리가 전부 **문자열 완전일치**다. `변재휘/김지현`은 `김지현`과 같지 않으므로 어느 쪽 묶음에도 안 들어간다. 대신 그 글자 자체가 제3의 담당자처럼 따로 선다.

이미 `/`를 아는 곳도 있다. `ownerDisplayName`(`schema.ts`)은 토큰마다 별칭을 치환하고, `matchesOwnerName`(R319 행 수정 권한)은 토큰마다 본다. **보는 눈은 있는데 세는 손이 없는 상태다.**

## 결정 (2026-11-12 박향근)

- **담당별로 세는 곳 전부에 적용한다.** 화면마다 숫자가 갈리지 않게 한다.
- **병행 건은 두 사람 각각 1건이다.** 주간 보고도 같다. 담당별 줄의 합이 팀 전체보다 커진다. 그것이 의도다.

## 가장 중요한 규칙

> **사람별 묶음은 두 번 세고, 전체 합계는 한 번 센다.**

토큰 루프 안에서 전체 합계를 올리면 병행 건이 팀 전체 건수를 부풀린다. 아래 두 곳이 그 함정이다.

- `DevelopmentMasterSheet.tsx` `ownerStats` 의 `all`
- `derive.ts` 홈 담당자 레인의 `stageTotals`

둘 다 **토큰 루프 밖에서 행마다 한 번만** 올린다.

---

## 1. `src/data/schema.ts` — 공용 헬퍼를 만든다

`ownerDisplayName` 정의 **바로 아래**에 붙인다. 지금 코드는 이렇다.

```ts
export const ownerDisplayName = (name: string): string =>
  (name ?? "")
    .split("/")
    .map((part) => {
      const trimmed = part.trim()
      return OWNER_DISPLAY_ALIASES.get(trimmed) ?? trimmed
    })
    .join("/")
```

그 아래에 더한다.

```ts
/**
 * 담당 값을 사람 단위로 쪼갠다(R430). "변재휘/김지현"은 병행 개발 건이라 두 사람 각각의 것이다.
 * 집계와 필터는 실이름으로 맞추므로 여기서 표시명으로 바꾸지 않는다. 표시명이 필요하면 바깥에서 씌운다.
 * 빈 조각과 중복은 버린다.
 */
export const ownerNames = (value: string | null | undefined): string[] => {
  const seen = new Set<string>()
  for (const part of String(value ?? "").split("/")) {
    const trimmed = part.trim()
    if (trimmed) seen.add(trimmed)
  }
  return [...seen]
}

/** 그 담당 값이 이 사람의 것인지. 공백은 무시한다. 빈 이름은 늘 거짓이다. */
export const ownerIncludes = (value: string | null | undefined, name: string): boolean => {
  const target = String(name ?? "").replace(/\s+/g, "")
  if (!target) return false
  return ownerNames(value).some((part) => part.replace(/\s+/g, "") === target)
}
```

**이 둘이 유일한 판정이다. 각 파일에 `split("/")` 를 따로 쓰지 마라.**

---

## 2. `src/routes/DevelopmentMasterSheet.tsx`

`@/data/schema` 에서 `ownerNames`, `ownerIncludes` 를 가져다 쓴다(이 파일은 이미 `ownerDisplayName` 을 그 모듈에서 가져온다).

### 2-1. 47행 `matchesOwnerName` 은 공용 헬퍼에 넘긴다

현재:

```ts
const matchesOwnerName = (ownerValue: string, userName: string): boolean => {
  const me = userName.replace(/\s+/g, "")
  if (!me) return false
  return ownerValue.split("/").some((part) => part.replace(/\s+/g, "") === me)
}
```

교체:

```ts
const matchesOwnerName = (ownerValue: string, userName: string): boolean => ownerIncludes(ownerValue, userName)
```

**함수 이름과 호출처 다섯 곳은 그대로 둔다.** 판정이 두 벌이면 언젠가 어긋난다.

### 2-2. 1677행 `ownerOptions` 를 토큰으로 만든다

현재:

```ts
  const ownerOptions = useMemo(() => [...new Set(scoped.map((row) => row.owner).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko-KR")), [scoped])
```

교체:

```ts
  // 담당 드롭다운은 사람 단위다(R430). "변재휘/김지현" 같은 묶음 값은 목록에 세우지 않고 토큰으로 풀어 넣는다.
  const ownerOptions = useMemo(() => [...new Set(scoped.flatMap((row) => ownerNames(row.owner)))].sort((a, b) => a.localeCompare(b, "ko-KR")), [scoped])
```

### 2-3. 1678~1691행 `ownerStats` 를 토큰마다 센다

현재:

```ts
    for (const row of scoped) {
      const active = (row.devStatus || row.stage) === "진행중"
      all.total += 1
      if (active) all.active += 1
      const stat = byOwner.get(row.owner)
      if (!stat) continue
      stat.total += 1
      if (active) stat.active += 1
    }
```

교체:

```ts
    for (const row of scoped) {
      const active = (row.devStatus || row.stage) === "진행중"
      // 전체는 행 수다. 토큰 루프 밖에서 한 번만 올린다(R430).
      all.total += 1
      if (active) all.active += 1
      // 병행 건은 두 사람 각각 1건이다. 그래서 네임카드 합이 전체보다 클 수 있다.
      for (const name of ownerNames(row.owner)) {
        const stat = byOwner.get(name)
        if (!stat) continue
        stat.total += 1
        if (active) stat.active += 1
      }
    }
```

### 2-4. 1745행 담당 탭 필터

현재:

```ts
    if (owner !== ALL && record.owner !== owner) return false
```

교체:

```ts
    if (owner !== ALL && !ownerIncludes(record.owner, owner)) return false
```

### 2-5. 3437, 3443행 엑셀 담당별 시트

현재:

```ts
      const owners = [...new Set(base.map((record) => record.owner).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "ko-KR"))
```

교체:

```ts
      const owners = [...new Set(base.flatMap((record) => ownerNames(record.owner)))]
        .sort((a, b) => a.localeCompare(b, "ko-KR"))
```

현재:

```ts
          const rows = base.filter((record) => record.owner === name)
```

교체:

```ts
          const rows = base.filter((record) => ownerIncludes(record.owner, name))
```

병행 건은 두 사람 시트에 모두 들어간다. 전체현황 시트는 `base` 그대로라 한 번만 들어간다.

### 2-6. 손대지 말 것

- **1709행 `optionsById` 의 `owner` 줄을 토큰으로 바꾸지 마라.**
  ```ts
  owner: union(memberNames, distinct((record) => record.owner)),
  ```
  담당은 선택형 열이고 R280에 따라 **드롭다운 목록과 저장 검증 목록이 같아야 한다.** 여기서 묶음 값을 빼면 `변재휘/김지현` 이 허용 목록에서 사라져 **그 행을 고칠 수 없고 병행 값을 새로 넣을 수도 없다.** 이 줄은 묶음 값을 그대로 품고 있어야 한다.
- 1809행 `editEnabled` 는 그대로다. 탭 값(`owner`)이 이제 늘 사람 하나라 `matchesOwnerName` 이 바로 맞는다.
- 2651, 2805, 2828행 `blankOwner` 는 그대로다. 탭 값이 사람 하나라 새 행 담당이 그 사람으로 들어가는 것이 맞다.

---

## 3. `src/data/derive.ts`

`./schema` 에서 `ownerNames`, `ownerIncludes` 를 가져온다.

### 3-1. 388행 `byOwnerDetailed`

```ts
    const owned = records.filter((record) => record.owner === member.name)
```
를
```ts
    const owned = records.filter((record) => ownerIncludes(record.owner, member.name))
```
로.

### 3-2. 431, 437행 스타일 묶음의 담당 목록

```ts
      if (record.owner && !current.owners.includes(record.owner)) current.owners.push(record.owner)
```
를
```ts
      for (const name of ownerNames(record.owner)) if (!current.owners.includes(name)) current.owners.push(name)
```
로.

```ts
        owners: record.owner ? [record.owner] : [],
```
를
```ts
        owners: ownerNames(record.owner),
```
로.

### 3-3. 560~584행 홈 담당자 레인

`ownerName` 한 개를 토큰 배열로 바꾼다.

```ts
  const ownerName = (record: DevRecord) => record.owner.trim() || "미지정"
```
를
```ts
  // 병행 건은 두 레인에 모두 선다(R430). 담당이 비면 "미지정" 레인 하나다.
  const ownerNamesOf = (record: DevRecord): string[] => {
    const names = ownerNames(record.owner)
    return names.length ? names : ["미지정"]
  }
```
로.

레인 목록을 만드는 루프(566행 근처):

```ts
  for (const record of activeRows) {
    const owner = ownerName(record)
    if (!ownerSet.has(owner)) {
      ownerSet.add(owner)
      ownerOrder.push(owner)
    }
  }
```
를
```ts
  for (const record of activeRows) {
    for (const owner of ownerNamesOf(record)) {
      if (!ownerSet.has(owner)) {
        ownerSet.add(owner)
        ownerOrder.push(owner)
      }
    }
  }
```
로.

칸을 채우는 루프(576행 근처). **`stageTotals` 는 토큰 루프 밖이다.**

```ts
  for (const record of activeRows) {
    const owner = ownerName(record)
    const stageIndex = boardStagePosition(record)
    const styleNo = record.styleNo.trim() || "Style 미기재"
    const stageGroups = grouped.get(owner)![stageIndex]
    const styleRecords = stageGroups.get(styleNo)
    if (styleRecords) styleRecords.push(record)
    else stageGroups.set(styleNo, [record])
    stageTotals[stageIndex] += 1
  }
```
를
```ts
  for (const record of activeRows) {
    const stageIndex = boardStagePosition(record)
    const styleNo = record.styleNo.trim() || "Style 미기재"
    for (const owner of ownerNamesOf(record)) {
      const stageGroups = grouped.get(owner)![stageIndex]
      const styleRecords = stageGroups.get(styleNo)
      if (styleRecords) styleRecords.push(record)
      else stageGroups.set(styleNo, [record])
    }
    // 단계 합계는 행 수다. 레인 루프 밖에서 한 번만 올린다(R430).
    stageTotals[stageIndex] += 1
  }
```
로.

### 3-4. 1651행 `byOwner`

```ts
    count: records.filter((record) => record.owner === member.name).length,
```
를
```ts
    count: records.filter((record) => ownerIncludes(record.owner, member.name)).length,
```
로.

### 3-5. 1662행 `myTasks`

```ts
    .filter((record) => record.owner === owner && statusOf(record, today) !== "done")
```
를
```ts
    .filter((record) => ownerIncludes(record.owner, owner) && statusOf(record, today) !== "done")
```
로.

### 3-6. 1345행 `ownerMonthlyFlTrend`

```ts
    if (!ownerSet.has(reg.owner) || !monthSet.has(reg.month)) continue
    const bucket = counts.get(reg.owner)!
    bucket.set(reg.month, (bucket.get(reg.month) ?? 0) + 1)
```
를
```ts
    if (!monthSet.has(reg.month)) continue
    for (const name of ownerNames(reg.owner)) {
      const bucket = counts.get(name)
      if (!bucket) continue
      bucket.set(reg.month, (bucket.get(reg.month) ?? 0) + 1)
    }
```
로. `ownerSet` 이 더 안 쓰이면 선언을 지워도 된다. **쓰이는 곳이 남아 있으면 그대로 둬라.**

### 3-7. 1402행 `ownerFlSources`

```ts
    if (!months.has(reg.month) || !ownerSet.has(reg.owner)) continue
    const bucket = acc.get(reg.owner)
    if (!bucket) continue
    if (reg.type === "gd") bucket.gd += 1
    else if (reg.type === "domestic") bucket.domestic += 1
    else if (reg.type === "production") bucket.production += 1
    else if (reg.type === "purchase") bucket.purchase += 1
    else bucket.etc += 1
```
를
```ts
    if (!months.has(reg.month)) continue
    for (const name of ownerNames(reg.owner)) {
      const bucket = acc.get(name)
      if (!bucket) continue
      if (reg.type === "gd") bucket.gd += 1
      else if (reg.type === "domestic") bucket.domestic += 1
      else if (reg.type === "production") bucket.production += 1
      else if (reg.type === "purchase") bucket.purchase += 1
      else bucket.etc += 1
    }
```
로. 여기도 `ownerSet` 이 안 쓰이게 되면 선언을 지워도 된다.

### 3-8. 손대지 말 것

- 907, 931, 947, 1314, 1322행의 `owner` 는 **값을 나르는 자리**다. 원문 그대로 둔다. 쪼개는 것은 세는 쪽에서 한다.

---

## 4. `src/routes/Development.tsx` 865행

```ts
onOpen={() => setListPopup({ title: `${ownerCardDisplayName(name)} 개발 목록`, description: `진행중 ${active.filter((row) => row.owner === name).length.toLocaleString("ko-KR")}건`, rows: active.filter((row) => row.owner === name) })}
```

`row.owner === name` 두 군데를 `ownerIncludes(row.owner, name)` 로 바꾼다. `@/data/schema` 에서 가져온다. 나머지는 그대로.

---

## 5. `src/components/charts/StyleTimeline.tsx` 101행

```ts
    (owner === ALL || (owner === EMPTY ? !row.owner : row.owner === owner))
```
를
```ts
    (owner === ALL || (owner === EMPTY ? !row.owner : ownerIncludes(row.owner, owner)))
```
로. `ownerIncludes` 를 `@/data/schema` 에서 가져온다.

**97행 `owners` 목록과 220, 221행 묶음 머리는 건드리지 마라.** 그 둘은 줄을 세로로 묶는 시각적 구획이라 한 줄이 두 묶음에 들 수 없다. 필터만 사람 단위로 보면 병행 스타일이 그 사람 화면에 나타나고, 그 안에서 `변재휘/김지현` 머리로 한 번 더 묶여 보인다. 그것으로 충분하다.

---

## 6. `src/data/weekly-report.ts`

**여기는 표시명 기준이다.** 69행 `ownerOf` 가 `ownerDisplayName` 을 거치고 담당 탭 목록(`weeklyReportOwners`)과 필터가 모두 그 값으로 돈다. 그러니 **표시명을 쪼갠다.**

### 6-1. 69행

```ts
const ownerOf = (record: DevRecord): string => ownerDisplayName(record.owner).trim() || "담당 미지정"
```
를
```ts
/**
 * 담당 표시명을 사람 단위로 쪼갠다(R430). "변재휘/김지현"은 병행 건이라 두 사람 각각 1건으로 센다.
 * 담당별 줄의 합이 팀 전체 건수보다 커진다. 2026-11-12 박향근 확정이다.
 * 표시명 기준인 것은 담당 탭 목록과 필터가 전부 표시명으로 돌기 때문이다.
 */
const ownersOf = (record: DevRecord): string[] => {
  const names = ownerNames(ownerDisplayName(record.owner))
  return names.length ? names : ["담당 미지정"]
}
```
로. `ownerNames` 를 `./schema` 에서 가져온다(이 파일은 이미 그 모듈에서 `ownerDisplayName` 을 가져온다).

### 6-2. 273행 담당 거르기

```ts
    .filter((record) => !owner || ownerOf(record) === owner)
```
를
```ts
    .filter((record) => !owner || ownersOf(record).includes(owner))
```
로.

### 6-3. 296~301행 담당별 줄

```ts
  const bump = (record: DevRecord, field: "progress" | "done") => {
    const name = ownerOf(record)
    const row = ownerMap.get(name) ?? { owner: name, progress: 0, done: 0 }
    row[field] += 1
    ownerMap.set(name, row)
  }
```
를
```ts
  const bump = (record: DevRecord, field: "progress" | "done") => {
    for (const name of ownersOf(record)) {
      const row = ownerMap.get(name) ?? { owner: name, progress: 0, done: 0 }
      row[field] += 1
      ownerMap.set(name, row)
    }
  }
```
로.

### 6-4. 손대지 말 것

- `progress`, `fresh`, `ongoing`, `done`, `categories` 는 **행 수 그대로다.** 전부 `progressRows.length` 꼴이라 저절로 한 번만 센다. 여기에 토큰 루프를 넣지 마라.
- `ownerOf` 를 쓰는 다른 자리가 남아 있으면 `ownersOf(record)[0]` 로 때우지 말고 그 자리도 목적에 맞게 고쳐라. 남지 않으면 `ownerOf` 선언을 지운다.

---

## 하지 말 것 (정리)

- **전체 합계를 토큰 루프 안에서 올리지 마라.** `ownerStats.all`, `stageTotals`, 주간 보고의 `progress`/`done` 이 그 자리다.
- **각 파일에서 `split("/")` 를 새로 쓰지 마라.** `ownerNames`, `ownerIncludes` 둘만 쓴다.
- **`optionsById.owner`(DD 1709행)를 토큰으로 바꾸지 마라.** R280 검증 목록이라 묶음 값이 빠지면 그 행을 못 고친다.
- `ownerDisplayName` 을 집계 키로 쓰지 마라. 주간 보고만 예외이고 그 파일은 원래 표시명 기준이다.
- 표시명으로 비교하지 마라. `진영은` 은 `J` 로 표시된다.
- DD MASTER 행 드래그 순서(`sortOrder`)와 `recordIdentity` 는 건드리지 마라.

## 검증

`npm run build` 한 번만 돌린다. 화면 확인은 사용자가 한다.

`git diff --stat` 가 **6 파일**이면 맞다. `schema.ts`, `DevelopmentMasterSheet.tsx`, `derive.ts`, `Development.tsx`, `StyleTimeline.tsx`, `weekly-report.ts`.
