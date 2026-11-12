# R426 요청 불러오기는 옵션 사양을 가져오지 않는다

상태: 구현 완료, 빌드 통과, 화면 확인 미완. 클로드가 직접 시공했다(2026-11-12).

2026-11-12 박향근 확정이다.

> 신규 작지 접수시 아직까지 request에서 DD로 연결해서 가져오면 옵션이 함께 딸려 온다. 옵션은 작지첨부에서만 파싱해

## 정한 규칙

**옵션 사양의 출처는 작업지시서 하나다.** DEVELOPMENT REQUEST에서 불러오는 것은 스타일 단위 값과 연결뿐이다.

| 요청 불러오기가 넘기는 것 | 넘기지 않는 것 |
|---|---|
| Style No.(Garment No.) | Yarn Detail |
| Buyer | Cons. |
| Planner | T.Weight |
| 담당(개발 담당) | Color |
| ORIGINAL 분석 여섯 칸 | Dyeing Side |
| `tech.requestLink` | FINISH |
| 옵션 수만큼의 행 | Co(개발처) |

행은 고른 옵션 수만큼 그대로 선다. 연결도 그대로다. 사양 칸만 비어 있고 작지를 첨부하면 채워진다(R425).

## 왜 이렇게 하나

DD는 작지가 나온 뒤에 쓴다. 의뢰 사양은 목표이고 작지가 확정이다. 두 값이 다를 때 화면에 먼저 들어와 있는 쪽이 의뢰 값이면, 작지를 안 붙인 행과 붙인 행이 섞여 어느 것이 확정인지 알 수 없다. 칸을 비워 두면 작지를 아직 안 붙였다는 것이 그 자리에서 보인다.

## 되돌린 것

**R422의 CO 전달과 Dyeing 정규화를 이 경로에서 뺐다.** 그 둘은 요청 옵션 값을 DD로 옮기는 코드였는데 이제 옮기는 값 자체가 없다. 개발처는 작지 공통 칸(`z.co`)에서 오고 `fillZajiHeaderBlanks`가 빈 칸일 때 채운다(R425).

**R423의 FINISH 전달도 이 경로에서 뺐다.** FINISH 열과 양식, REQUEST 화면 입력은 그대로다. DD로 가는 길만 막았다.

**R424의 ORIGINAL 분석은 그대로 둔다.** 그것은 옵션 값이 아니라 스타일 단위 분석 결과다.

`matchDyeingSide`와 `companyFieldsOf`는 `applyRequestLinks`의 빈 칸 채우기에서 계속 쓴다. **그 경로는 이번에 손대지 않았다.** REQUEST 화면에서 이미 있는 DD 행에 연결할 때 사람이 「빈 칸 채우기」를 고른 경우이고, 그때 DD 행에는 이미 작지 값이 들어 있어 빈 칸만 채운다. 같은 규칙으로 막을지는 따로 정한다.

## 안내 문구

접수 창에 이렇게 뜬다.

```
옵션 N줄을 만들고 연결했습니다. 원사와 조직, 중량, 염색, FINISH는 작업지시서를 첨부해야 채워집니다.
```

목록 밖 염색과 개발처를 세어 알리던 R422 문구는 뺐다. 넘어가는 값이 없어 뜻이 없다.

## 뒤집지 말 것

- 요청에서 옵션 사양을 다시 가져오지 마라. 출처는 작지 하나다.
- ORIGINAL 분석과 Style No., Buyer, Planner, 담당은 계속 가져온다. 옵션 값이 아니다.
- 행 수와 `tech.requestLink`를 건드리지 마라. 그것이 보드와 DD를 잇는 유일한 고리다.

## 파일

| 파일 | 조치 |
|---|---|
| `src/data/request-link.ts` | `requestToIntakeRecords`에서 옵션 사양 제거 |
| `src/routes/DevelopmentMasterSheet.tsx` | 안내 문구 교체, 안 쓰는 import 둘 제거 |

## 검증

`npm run build` 통과. `tsc --noEmit` 포함이다.

화면 확인은 박향근이 한다. DD MASTER 신규 작지 접수에서 「DEVELOPMENT REQUEST에서 불러오기」로 스타일을 고르면, 옵션 줄은 수대로 서고 Yarn Detail과 Cons., T.Weight, Color, Dyeing Side, Co 칸이 비어 있어야 한다. Style No.와 Buyer, Planner, ORIGINAL 분석은 차 있어야 한다. 그 뒤 작지를 첨부하면 옵션 칸이 작지 값으로 채워진다.
