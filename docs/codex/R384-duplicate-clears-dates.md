# R384 — 선택 행 복제는 날짜를 가져오지 않는다

대상 파일은 `src/routes/DevelopmentMasterSheet.tsx` 하나다. 다른 파일은 고치지 않는다.

파일은 `Get-Content -Encoding UTF8`로 읽어라. 한글 문구를 영어로 바꾸지 마라. 주석도 한글로 쓴다.

## 배경

R383이 만든 `선택 행 복제`가 공정 목표일과 완료일을 그대로 가져왔다. 실제로 써 보니
**N차 재작업에서 1차 목표일이 따라와 새 일정이 전부 지연으로 찍혔다.**

공정 완료 칸은 목표와 완료가 모두 비어 있을 때 친 첫 날짜만 목표로 받는다(R374).
복제본은 목표일이 이미 차 있어서 새로 친 날짜가 완료일로 들어갔고, 1차 목표와 비교되어
`10-27 (+27)`처럼 괄호가 붙었다. 2026-11-04 실데이터에서 네 공정 모두 그랬다.

따라온 완료일도 문제다. 아직 하지도 않은 공정이 완료로 잡혀 `processReached`와
HOME 공정 카운트, 주간 보고가 그 행을 진행된 것으로 센다.

**신규 작지를 복붙으로 넣는 길은 따로 있다.** 복사해서 붙여넣기와 `복사한 행 삽입`이
그것이고, R383이 완료 칸 복사에 목표일 폴백을 넣어 스케줄이 그대로 따라간다. 새 행은
목표와 완료가 둘 다 비어 있어 그 날짜가 목표일로 들어간다. **그 경로는 건드리지 마라.**
복제는 틀만 뜨는 기능으로 가른다.

## 작업 — `duplicateSelectedRows`가 날짜를 비운다

`duplicateSelectedRows` 함수의 현재 `created` 블록은 이렇다.

```ts
    const created = rows.map((row) => {
      const blank = createBlankDevRecord(row.owner)
      const tech = structuredClone(row.tech ?? {}) as DevTechnical
      // 값 없는 키를 남기지 말고 지운다. Firestore 가 `undefined` 가 든 문서를 거부한다(R340).
      delete tech.requestLink
      delete tech.costRef
      delete tech.sampleDates
      delete tech.optionProgress
      // FDS/YDS 요청서의 BODY 값. 표에 없는 숨은 값이라 사람이 보고 고칠 수 없다.
      // 물려받으면 요청서에 같은 BODY 가 두 줄 나간다. 지우면 `bodyLabel` 이 `opt` 로 다시 만든다.
      delete tech.bodyNo
      delete tech.intakeSource
      return {
        ...row,
        tech,
        flNo: "",
        receivedDate: "",
        devStatus: "진행중",
        // 새 행의 고유 식별자. 원본과 같은 `_src` 를 쓰면 두 행이 한 행으로 취급된다.
        _src: blank._src,
      }
    })
```

`delete tech.intakeSource` 아래에 날짜 비우기 세 줄을 더하고, `return` 객체에
`dueDate`와 `requestDate` 두 줄을 더한다. 바뀐 모습은 이렇다.

```ts
    const created = rows.map((row) => {
      const blank = createBlankDevRecord(row.owner)
      const tech = structuredClone(row.tech ?? {}) as DevTechnical
      // 값 없는 키를 남기지 말고 지운다. Firestore 가 `undefined` 가 든 문서를 거부한다(R340).
      delete tech.requestLink
      delete tech.costRef
      delete tech.sampleDates
      delete tech.optionProgress
      // FDS/YDS 요청서의 BODY 값. 표에 없는 숨은 값이라 사람이 보고 고칠 수 없다.
      // 물려받으면 요청서에 같은 BODY 가 두 줄 나간다. 지우면 `bodyLabel` 이 `opt` 로 다시 만든다.
      delete tech.bodyNo
      delete tech.intakeSource
      // 공정 일정은 가져오지 않는다(R384). 목표일이 따라오면 새로 친 날짜가 완료일로
      // 들어가 1차 목표와 비교되고(R374), 네 공정 전부에 지연 괄호가 붙는다.
      // 완료일은 실적이라 아직 안 한 공정을 완료로 세게 만든다.
      delete tech.targetDates
      delete tech.processDates
      return {
        ...row,
        tech,
        flNo: "",
        receivedDate: "",
        devStatus: "진행중",
        // 납기와 접수일도 새로 받는다. 납기가 비면 원사 입고일 잠금(R376)에도 안 걸려
        // 복제 직후 바로 칠 수 있다.
        dueDate: "",
        requestDate: blank.requestDate,
        // 새 행의 고유 식별자. 원본과 같은 `_src` 를 쓰면 두 행이 한 행으로 취급된다.
        _src: blank._src,
      }
    })
```

함수 맨 끝 `notify` 문구도 바꾼다. 현재는 이렇다.

```ts
    notify(`${created.length}개 행을 복제했습니다. FL#과 수취일은 비웁니다.`)
```

이것으로 바꾼다.

```ts
    notify(`${created.length}개 행을 복제했습니다. 날짜는 새로 적습니다.`)
```

함수 위 주석 블록에서 다음 한 줄을

```
   * 업체·목표일·완료일·납기·스펙은 남기고 **결과 RESULT 그룹만 비운다.**
```

이것으로 바꾼다.

```
   * 업체와 스펙은 남기고 **날짜와 결과는 비운다.** 무엇을 만드는지만 가져오는 것이다.
```

## 작업 B — 두 메뉴의 힌트를 가른다

우클릭 메뉴에서 `선택 행 복제`와 `복사한 행 삽입`의 힌트가 둘 다 `아래에 추가`라
어느 쪽이 날짜를 가져오는지 알 수 없다. 힌트만 바꾼다. 라벨과 순서는 그대로 둔다.

현재:

```tsx
            { key: "duplicate", label: "선택 행 복제", hint: "아래에 추가", icon: <Rows3 className="size-3.5" />, run: () => void duplicateSelectedRows(), disabled: !editEnabled },
            { key: "insert", label: "복사한 행 삽입", hint: "아래에 추가", icon: <Rows3 className="size-3.5" />, run: () => void insertCopiedRows(), disabled: !editEnabled },
```

바꾼 뒤:

```tsx
            { key: "duplicate", label: "선택 행 복제", hint: "날짜 빼고", icon: <Rows3 className="size-3.5" />, run: () => void duplicateSelectedRows(), disabled: !editEnabled },
            { key: "insert", label: "복사한 행 삽입", hint: "복사한 값 그대로", icon: <Rows3 className="size-3.5" />, run: () => void insertCopiedRows(), disabled: !editEnabled },
```

## 하지 말 것

- `insertCopiedRows`를 건드리지 마라. 신규 작지를 복붙으로 넣는 길이고 스케줄이 그대로
  따라가야 한다.
- `rawCellText`와 `scopeIdsOf`를 건드리지 마라. R383이 넣은 복사 쪽 폴백이다.
- `updateRecordCell`의 목표/완료 순서 판정을 건드리지 마라.
- `tech.mills`(공정 업체)는 지우지 마라. 같은 업체로 재작업하는 것이 보통이다.
- 새 메뉴 항목을 더하지 마라. 길은 두 개로 충분하다.
- 새 파일을 만들지 마라. 커밋하지 마라. 푸시하지 마라. 어떤 파일도 지우지 마라.
- `git reset --hard`나 `git checkout --`를 쓰지 마라.
- 명세에 적힌 파일 하나만 고쳐라.

## 성공 기준

1. `npm run build`가 통과한다.
2. `git status --short`에 `src/routes/DevelopmentMasterSheet.tsx` 한 줄만 뜬다(문서 제외).
3. `duplicateSelectedRows`가 `targetDates`와 `processDates`를 지우고 `dueDate`를 비우며
   `requestDate`를 오늘로 넣는다.
4. 우클릭 메뉴 두 항목의 힌트가 서로 다르다.
5. 화면 문구가 영어로 바뀐 곳이 없다.
