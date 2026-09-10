# R116 FL 입력하면 창고 보관 건이 입고 대기로 되돌아가던 문제

상태: 구현 완료, 재현과 수정 확인 완료. 커밋 전.

## 증상

창고 보관 탭에 R&D No.까지 받고 들어가 있던 건을, DD MASTER 에서 FL# 을 적어 완료 처리하자
창고 보관에서 빠져나와 입고 대기로 되돌아갔다. R&D No. 도 사라졌다. 2026-09-10 에 4건 발생.

## 원인

원장 항목의 key 가 FL 유무에 따라 바뀐다. 입고 기록은 그 key 로 저장된다.

- `fabricLedgerKey` 우선순위: `rnd:` > `fl:` > `style:` > `source:`
- FL 이 없는 DD 행은 `ddRowBaseKey(record)` 로 `dd:...` key 를 받는다
- 입고(RECEIVE)하면 `fabricOverrides` 에 그때의 key(`dd:...`)로 상태와 R&D No. 가 저장된다
- **DD 에서 FL# 을 적으면 같은 행의 key 가 `fl:...` 로 바뀐다**
- `resolveStoredKey` 가 예전 `dd:` key 를 못 찾는다. `identityIndex` 에 `dd:` key 를 등록한 적이 없었다
- override 와 이력이 통째로 떨어져 나가고, 항목은 `statusFromRecord` 로 다시 판정되어 READY 가 된다

## 재현 (수정 전)

```
FL 입력 전  | key=dd:박향근|SAM'SSUPIMA|SS'28|... | status=READY     | rnd=(없음)
입고 처리 후 | key=dd:박향근|SAM'SSUPIMA|SS'28|... | status=WAREHOUSE | rnd=0645
FL 입력 후  | key=fl:FL26099024                   | status=READY     | rnd=(없음)
```

## 조치

`src/data/fabric-ledger.ts` 의 records 루프에서, FL 유무와 상관없이 `ddRowBaseKey(record)` 를 계산해
`registerIdentities` 로 색인에 남긴다. 항목 key 자체는 그대로 둔다.

`resolveStoredKey` 는 살아 있는 항목 key 를 먼저 보고 색인은 그 다음에 본다.
그래서 `dd:` key 를 실제로 쓰는 다른 행이 있으면 그쪽이 이긴다. 기존 동작을 덮지 않는다.

`#2` 순번 카운터는 예전처럼 FL 없는 행에서만 올린다. 올리는 조건을 바꾸면 이미 저장된 key 가 밀린다.

## 확인 (수정 후)

```
FL 입력 후  | key=fl:FL26099024 | WAREHOUSE | rnd=0645 | intake=2026-09-05 | 출고1건
```

override 뿐 아니라 `fabricEvents`(입고일, 출고 이력)도 같이 따라온다. 둘 다 `resolveStoredKey` 를 쓴다.

## 데이터는 살아 있다

override 와 이력은 지워진 적이 없다. key 를 못 찾았을 뿐이다.

## 기록이 두 벌인 경우 (2026-09-10 에 실제로 발생)

수정 전에 사용자가 그 4건을 손으로 다시 입고했다. 그래서 한 항목에 기록이 두 벌 붙는다.

- 예전 기록: key `dd:...`, 처음 채번한 R&D No.
- 새 기록: key `fl:...`, 다시 채번한 R&D No.

색인 수정으로 둘 다 같은 항목으로 해석된다. 어느 쪽을 쓸지 정하지 않으면 배열 순서에 따라 값이 흔들린다.
팀 공유 병합이 배열 순서를 바꾸므로 순서에 기대면 안 된다.

**규칙: `updatedAt` 이 늦은 기록이 이긴다.** 마지막에 사람이 한 처리가 화면에 남는다.
그래서 손으로 다시 입고하며 받은 새 번호가 유지되고, 처음 번호는 이력에만 남는다.

항목은 하나로 합쳐지므로 행이 두 줄로 늘어나지는 않는다. 확인한 결과다.

```
배열 순서 예전→새것 | 항목 1개 | WAREHOUSE | rnd=0652 | intake=2026-09-10
배열 순서 새것→예전 | 항목 1개 | WAREHOUSE | rnd=0652 | intake=2026-09-10
```

처음 번호는 창고에 없는 번호가 되어 채번 후보로 돌아간다. 폐기·소진으로 번호가 풀리는 기존 운영과 같다.
실물 라벨이 처음 번호로 붙어 있으면 창고 그리드에서 R&D No. 를 고치면 된다.

## 남은 구멍

값이 완전히 같은 DD 행이 둘 이상이고(담당·Style·Season·Color·Cons.·중량·Dyeing·opt 가 전부 동일)
그중 하나만 FL 을 받으면, 뒤 행의 `#2` 순번이 앞으로 당겨져 서로의 입고 기록이 바뀐다.

옵션 번호(`opt`)까지 같아야 하므로 실제로는 드물다. 이번 범위에서 손대지 않았다.
제대로 막으려면 override 에 `recordIdentity` 를 같이 저장하고 그것으로도 찾게 해야 한다.
데이터 계약과 팀 동기화가 걸리므로 별건으로 설계한다.

## 하지 말 것

- `#2` 순번 카운터를 모든 행에서 올리도록 바꾸지 마라. 이미 저장된 `dd:` key 가 밀린다.
- `fabricLedgerKey` 의 우선순위(`rnd:` > `fl:` > `style:`)를 바꾸지 마라.
- `resolveStoredKey` 가 색인보다 살아 있는 항목 key 를 먼저 보는 순서를 뒤집지 마라.
