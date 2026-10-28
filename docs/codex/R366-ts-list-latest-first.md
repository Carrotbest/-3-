# R366 — TS 목록을 항상 최근 접수일 순으로 세운다

상태: 미착수. 조사는 끝났고 고칠 자리와 줄 번호를 아래에 적었다.

## 할 일

`/ts` 화면 TS 목록의 기본 행 순서를 **접수일(`receivedAt`) 내림차순**으로 고정한다. 최근 건이 맨 위다. 전체·처리중·완료 세 탭 모두 같다.

## 조사로 확인한 것

- `src/routes/TS.tsx`의 `filteredRows`(427~438행)는 **거르기만 하고 정렬하지 않는다.** 그래서 화면 순서가 원장에 담긴 순서 그대로다.
- 탭 세 개는 같은 `filteredRows` 하나를 쓴다(`activeState`로 거를 뿐이다). 그래서 **여기 한 곳만 정렬하면 세 탭이 모두 따라온다.**
- `DataTable`(`src/components/data-table/DataTable.tsx`)의 정렬 상태(`sort`, 111행)는 처음에 `null`이고, `null`이면 받은 순서를 그대로 쓴다(206~214행). 저장하지도 않는다(`storageKey`는 열 너비만 쓴다). **그래서 넘기는 배열의 순서가 곧 기본 순서다.**
- `receivedAt`은 `string`이고 엑셀에서 들여온 행과 웹에서 넣은 행의 표기가 다를 수 있다. 화면 표시도 `fmtDate`가 `toDate`를 거쳐 만든다. **문자열로 비교하지 말고 `toDate`로 시각을 얻어 비교한다.**
- `toDate`는 `src/data/format.ts`에서 내보낸다. `TS.tsx` 22행이 이미 같은 모듈에서 `fmtDate`, `tsRequester`를 가져온다.

## 파일별 조치

### `src/routes/TS.tsx`

(a) 22행 import에 `toDate`를 더한다.

```ts
import { fmtDate, toDate, tsRequester } from "@/data/format"
```

(b) 컴포넌트 **밖**(파일 위쪽 상수들 옆)에 정렬 키 도우미를 둔다.

```ts
/** 정렬용 접수일. 날짜를 못 읽는 행은 맨 아래로 보낸다(R366). */
function tsReceivedTime(row: TsRecord): number {
  const date = toDate(row.receivedAt)
  return date ? date.getTime() : Number.NEGATIVE_INFINITY
}
```

(c) `filteredRows`(427~438행)를 거른 뒤 정렬하게 바꾼다. 지금은 이렇다.

```ts
  const filteredRows = useMemo(() => {
    const query = search.normalize("NFKC").trim().toLocaleLowerCase("ko-KR")
    return rows.filter((row) => {
      if (activeState && row.state !== activeState) return false
      if (!query) return true
      return [row.subject, row.from, tsRequester(row).dept, row.advisor, row.inquiry]
        .some((value) => value.normalize("NFKC").toLocaleLowerCase("ko-KR").includes(query))
    })
  }, [activeState, rows, search])
```

이렇게 바꾼다.

```ts
  const filteredRows = useMemo(() => {
    const query = search.normalize("NFKC").trim().toLocaleLowerCase("ko-KR")
    const matched = rows.filter((row) => {
      if (activeState && row.state !== activeState) return false
      if (!query) return true
      return [row.subject, row.from, tsRequester(row).dept, row.advisor, row.inquiry]
        .some((value) => value.normalize("NFKC").toLocaleLowerCase("ko-KR").includes(query))
    })
    // 최근 접수일이 맨 위다. 세 탭이 이 배열 하나를 쓴다(R366).
    return matched.sort((left, right) => {
      const gap = tsReceivedTime(right) - tsReceivedTime(left)
      if (gap !== 0) return gap
      // 같은 날이면 번호가 큰 쪽이 위다.
      return right.id.localeCompare(left.id, "en")
    })
  }, [activeState, rows, search])
```

`matched`는 `rows.filter`가 만든 새 배열이라 제자리 `sort`가 원장을 건드리지 않는다. **`rows`를 직접 `sort`하지 말 것.**

`TsRecord` 타입은 `src/data/sample.ts`에서 내보내며 `TS.tsx`가 이미 가져다 쓰고 있다. 새로 import할 것이 있으면 기존 import 줄에 더한다.

### `CLAUDE.md`

「주의(반복 실수 방지)」절에 한 줄 더한다. `- TS 실시간공유 데이터 손실 이력이 있음` 줄 바로 위에 넣는다.

```
- **TS 목록 기본 정렬은 접수일 내림차순이다**(R366). 전체·처리중·완료 세 탭이 `filteredRows` 하나를 쓰므로 거기서 한 번만 정렬한다. 표기가 제각각이라 문자열이 아니라 `toDate`로 비교하고, 날짜를 못 읽는 행은 맨 아래다. 열 머리 클릭 정렬은 그대로 살아 있다.
```

## 하지 말 것

- 열 머리 클릭 정렬을 없애거나 막지 말 것. 기본 순서만 정하는 일이다.
- `DataTable.tsx`를 고치지 말 것. 정렬은 `TS.tsx`에서 한다.
- `receivedAt` 원본 값을 바꾸지 말 것. 표시와 정렬만 한다.
- 탭마다 따로 정렬하는 코드를 만들지 말 것. `filteredRows` 한 곳이다.
- `legacy/`, `legacy-vanilla/`, `backup/`은 읽지 말 것.

## 검증

`npm run build`(= `tsc --noEmit && vite build`)가 통과하면 된다. 수정을 다 마친 뒤 한 번만 돌린다.

화면 확인은 박향근이 한다. 세 탭에서 맨 윗줄이 가장 최근 접수일인지, 검색어를 넣어도 순서가 유지되는지 본다.
