# R428 — GD 작지 파서 옵션 배수 수정

상태: 미착수

## 증상

신규 작지 접수 창에서 `Fabric sample request report_FSR261102125` 를 첨부하면 옵션이 **25건**으로 들어온다. 작지의 실제 의뢰는 **5건**이다. 정확히 Part 수(5) 곱하기 Color 수(5) 라서 배수로 불어난다.

## 원인

GD 양식 `Colors and quantity` 표는 색상마다 Part 목록 **전체**를 깔아 두고, 실제로 의뢰하는 조합에만 `Quantity` 를 적는다. 파서는 `Quantity` 를 안 보고 Part 칸이 채워진 행을 전부 옵션으로 만든다.

FSR261102125 실측:

| 행 | Color | Part | Quantity |
|---|---|---|---|
| 19 | TBA1 | B01 | 40 |
| 20~23 | (TBA1) | B02~B05 | 빈칸 |
| 24 | TBA2 | B01 | 빈칸 |
| 25 | (TBA2) | B02 | 40 |
| 26~28 | (TBA2) | B03~B05 | 빈칸 |

이하 TBA3=B03, TBA4=B04, TBA5=B05 로 같은 꼴이다. 수량이 적힌 조합은 5건뿐이다.

## 틀린 가설 (다시 시도하지 말 것)

- **"색상 번호(No)로 접으면 된다"** — 아니다. 그러면 BODY 6개 x 2색 작지가 2건으로 줄어든다. R114 사고다. `zaji.ts` 273~276행 주석에 적혀 있다. **옵션 단위는 Part+Color 그대로 둔다.**
- **"Part 목록 전체가 들어오는 것이 정상이고 접수 창에서 지우면 된다"** — 아니다. 25건 중 20건을 사람이 지우는 길을 남기지 않는다.

## 조치

파일: `src/data/zaji.ts` — `parseGd` 안 `Colors and quantity` 루프 하나만 고친다.

**현재 코드 (277~288행):**

```ts
      const seen = new Set<string>()
      let lastColor = ""
      for (let r = header + 1; r < limit; r++) {
        const color = g.at(r, cols["Color"])
        if (color) lastColor = color
        const part = g.at(r, cols["Part"])
        if (!part) continue
        const key = `${part}::${lastColor}`
        if (seen.has(key)) { z.dupRemoved += 1; continue }
        seen.add(key)
        rawOpts.push({ part, color: lastColor, remark: g.at(r, cols["Remark"]) })
      }
```

**교체 후:**

```ts
      // 색상마다 Part 목록 전체를 깔아 두고 실제 의뢰 조합에만 Quantity 를 적는 양식이 있다.
      // 그 경우 수량 칸이 곧 의뢰 여부다. 수량이 한 건도 없는 작지는 예전처럼 Part+Color 를 모두 받는다.
      let hasQuantity = false
      for (let r = header + 1; r < limit; r++) {
        if (g.at(r, cols["Part"]) && g.at(r, cols["Quantity"])) { hasQuantity = true; break }
      }
      const seen = new Set<string>()
      let lastColor = ""
      for (let r = header + 1; r < limit; r++) {
        const color = g.at(r, cols["Color"])
        if (color) lastColor = color
        const part = g.at(r, cols["Part"])
        if (!part) continue
        if (hasQuantity && !g.at(r, cols["Quantity"])) continue
        const key = `${part}::${lastColor}`
        if (seen.has(key)) { z.dupRemoved += 1; continue }
        seen.add(key)
        rawOpts.push({ part, color: lastColor, remark: g.at(r, cols["Remark"]) })
      }
```

바뀌는 것은 두 가지뿐이다. 루프 앞에 `hasQuantity` 선검사 한 덩이를 넣는 것과, 본 루프에 `if (hasQuantity && !g.at(r, cols["Quantity"])) continue` 한 줄을 넣는 것이다. 나머지 줄은 그대로다.

## 하지 말 것

- `z.dupRemoved` 를 수량 없는 행에 더하지 마라. 그 값은 병합 셀 중복 건수이고 뜻이 다르다.
- `cols["Quantity"]` 를 두 번째 수량 열(T열)까지 보도록 넓히지 마라. 현재 `headerMap` 이 같은 이름의 첫 열만 잡는데 그 동작은 Part 열도 같고, 손에 있는 작지 3건 모두 두 번째 블록이 비어 있다.
- `parseDomestic`(국내 양식)은 건드리지 마라.
- `matchDyeing`, `splitYarn`, 시즌 변환, 조직명 최장일치는 건드리지 마라.

## 검증

`npm run build` 한 번만 돌린다. 화면 확인은 사용자가 한다.

### 근거 수치 (이미 실측함, Codex가 다시 돌릴 필요 없음)

같은 규칙을 적용했을 때 현재 손에 있는 GD 작지 3건의 옵션 수다.

| 파일 | 현재 | 수정 후 |
|---|---|---|
| FSR260801240 | 5 | 5 (수량 5행 전부 채워져 있음) |
| FSR260901207 (Centric French Terry) | 2 | 2 (수량 2행 전부 채워져 있음) |
| FSR261102125 | 25 | **5** |

옛 작지 두 건은 수량이 모든 행에 적혀 있어 결과가 바뀌지 않는다. 그것이 이 수정이 회귀가 아닌 근거다.
