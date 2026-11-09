# R397 — META 4단계: 아바타 깃발과 방 확대, 시설에서 화면으로 가는 링크

상태: 미착수. R396이 끝난 뒤에 한다. R396이 방 좌표와 크기를 전부 바꾸므로 **그 결과 위에서 작업한다.**

2026-11-06 박향근 지시 둘이다.

1. "각각의 아바타는 머리위에 플래그를 달아서 실시간으로 움직이는 것을 보여줘."
2. "각 룸을 클릭 했을 때 확대하면서 내부 전경을 보여주고 룸 내부의 각 업무 시설들을 표시하고 해당 아이템을 클릭하면 실제 웹 대시보드의 해당화면으로 이동 링크를 걸어주자."

## 대상

`src/components/meta/OfficeScene.tsx`, `src/routes/Meta.tsx` 둘이다. `usePresencePeople.ts`와 `presence.ts`는 건드리지 마라.

## 1. 아바타 머리 위 깃발

사람마다 깃대와 깃발을 하나씩 단다. 지금 이름표(`Sprite`)는 그대로 두고 그 **위에** 올린다.

### 모양

- 깃대: 원기둥 반지름 0.018, 높이 0.62. 머리 꼭대기에서 위로 선다. 선 자세면 `y = 1.62`에서 시작하고 앉은 자세면 `y = 1.39`에서 시작한다. 색은 `--scene-metal`.
- 깃발: `PlaneGeometry(0.44, 0.26, 10, 1)`. 깃대 꼭대기 바로 아래에 깃대 오른쪽으로 붙인다. 색은 그 사람 색(`person.color`)이다. `side: THREE.DoubleSide`로 둬야 뒤에서도 보인다.
- 본인(`isSelf`)의 깃발에는 테두리를 한 줄 두른다(깃발보다 조금 큰 평면을 뒤에 깔고 밝은 색). 발밑 이중 고리와 함께 본인 표시가 둘이 된다.

### 펄럭임

매 프레임 깃발의 정점을 움직인다. `geometry.attributes.position`을 직접 고치고 `needsUpdate = true`를 세운다.

깃대에서 먼 정점일수록 크게 흔들린다. 정점의 로컬 x를 `t`(0이 깃대 쪽, 1이 끝)로 보고 z를 이렇게 준다.

```
z = Math.sin(time * speed + t * 6) * 0.07 * t * amplitude
```

- `speed`와 `amplitude`는 그 사람의 상태로 정한다.
  - `person.ago < 90` (최근 갱신, 지금 활동 중): `speed = 6`, `amplitude = 1`
  - `90 <= ago < 150`: `speed = 3`, `amplitude = 0.55`
  - `ago >= 150` (유휴): `speed = 1.2`, `amplitude = 0.25`
- 사람이 방을 옮겨 **걸어가는 중이면** `speed = 9`, `amplitude = 1.3`으로 올린다. 깃발이 바람을 받는 것처럼 보인다.

**정점 배열을 매 프레임 새로 만들지 마라.** 처음에 원본 좌표를 한 벌 복사해 두고 그것을 기준으로 z만 다시 쓴다.

`prefers-reduced-motion`이 켜져 있으면 펄럭임을 멈추고 깃발을 평평하게 둔다.

### 걸어가는 모습

사람이 보는 화면이 바뀌면 지금은 새 자리로 미끄러진다. 걷는 것으로 바꾼다.

- 목표 자리로 이동하는 동안 다리 두 개를 `rotation.x`로 ±0.4 범위에서 번갈아 흔든다. 주기는 초당 2.5보.
- 몸통을 0.03 범위로 위아래 흔든다.
- 이동 방향을 바라보게 그룹의 `rotation.y`를 돌린다. 급히 꺾이지 않게 각도 보간을 쓴다.
- 도착하면 다리를 제자리로 돌리고, 그 방에 빈 의자가 있으면 앉은 자세로 바꾼다.

## 2. 방을 클릭하면 확대한다

### 동작

방이나 방 이름 바닥 글자를 클릭하면 그 방으로 들어간 것처럼 본다.

- 카메라 `controls.target`을 그 방 중심으로 옮기고 `camera.zoom`을 올린다. 목표 줌은 `Math.min(controls.maxZoom, 46 / Math.max(room.w, room.d))`로 구한다. 방이 작을수록 더 당긴다. 0.4초에 걸쳐 부드럽게 간다.
- 고른 방 **밖의 모든 것을 흐리게** 한다. 다른 방 그룹의 재질 `opacity`를 0.18로 내리고 `transparent = true`로 둔다. 원래 값은 미리 저장해 두고 빠져나올 때 되돌린다. 재질을 공유하고 있으므로 **방마다 재질을 복제하지 말고**, 흐리게 할 대상 그룹에 `traverse`로 일괄 적용하되 원본 값을 `userData`에 담아 둔다.
- 고른 방의 벽 중 **카메라 쪽 두 면(남쪽과 동쪽)을 감춘다.** 안이 보여야 한다. `visible = false`로 하고 빠져나올 때 되돌린다.
- 그 방의 시설 라벨을 띄운다(아래 3절).

### 빠져나오기

- 빈 바닥을 클릭하면 돌아간다.
- `Escape` 키로도 돌아간다.
- `Meta.tsx` 오른쪽 패널에 `전체 보기` 버튼을 띄운다. 방을 고른 동안만 보인다.
- 돌아갈 때 카메라는 R396의 기본 시점(`target (0, 0, -2)`, `zoom 1`)으로 0.4초에 걸쳐 간다.

## 3. 시설을 표시하고 화면으로 보낸다

방 안의 가구 중 몇 개를 **시설**로 삼는다. 방을 확대했을 때만 시설 라벨이 뜨고, 라벨이나 그 가구를 클릭하면 대시보드의 그 화면으로 간다.

### 표

`path`는 이동할 경로다. DD MASTER만 책상마다 하위 화면이 다르다.

| 방 | 시설 이름 | 붙일 가구 | 가는 경로 |
|---|---|---|---|
| `/` | 안내데스크 | 안내데스크 | `/` |
| `/meta` | 오피스 단말 | 책상 1번 | `/meta` |
| `/development/workspace` | 전체 현황 | 책상 1번 | `/development` |
| `/development/workspace` | 개발 현황판 | 화이트보드 1번 | `/development/workspace` |
| `/development/workspace` | EU 보드 | 책상 2번 | `/development/eu` |
| `/development/workspace` | 시즌 보드 | 책상 3번 | `/development/season` |
| `/development/workspace` | 코어 보드 | 책상 4번 | `/development/core` |
| `/development/workspace` | 프로젝트 보드 | 책상 5번 | `/development/project` |
| `/request` | 의뢰 접수대 | 책상 1번 | `/request` |
| `/fabric-analysis` | 분석 작업대 | `labBench` 1번 | `/fabric-analysis` |
| `/cost` | 원가 단말 | 책상 1번 | `/cost` |
| `/warehouse` | 원단 선반 | `fabricRack` 1번 | `/warehouse` |
| `/warehouse` | 검품대 | `labBench` | `/warehouse` |
| `/ts` | TS 접수대 | 책상 1번 | `/ts` |
| `/study` | 자료 서가 | `bookshelf` 1번 | `/study` |
| `/protocol` | 기준표 보드 | 화이트보드 1번 | `/protocol` |
| `/rdda` | 보고 스크린 | 대형 스크린 | `/rdda` |
| `/trend/fabric` | 원단 전시 벽 | 전시 벽 | `/trend/fabric` |
| `/trend/macro` | 티커 보드 | 티커 보드 | `/trend/macro` |
| `/trend/portfolio` | 전시 받침대 | `gallery` 1번 | `/trend/portfolio` |
| `/calendar` | 일정 보드 | 화이트보드 | `/calendar` |
| `/setting` | 서버랙 | `serverRack` 1번 | `/setting` |
| `/process-innovation` | 준비 중 | `underConstruction` | 없음 |

`준비 중`은 클릭해도 이동하지 않는다. 라벨만 띄우고 커서를 바꾸지 마라.

### 라벨 모양

- 아바타 이름표와 **다르게** 생겨야 한다. 시설 라벨은 모서리가 각진 작은 판이고 왼쪽에 그 구역 색 사각 점이 있다. 아바타 이름표는 둥근 알약에 원형 점이다.
- 그 가구 바로 위 0.5미터에 띄운다. `Sprite`를 쓰고 `camera.zoom` 보정을 건다(아바타 이름표와 같은 방식).
- 글자 아래 작은 화살표 기호나 밑줄을 넣어 **누를 수 있는 것**임을 보인다.
- 방을 확대하지 않았을 때는 `visible = false`다.

### 클릭 처리

- `OfficeScene`의 `onPick` 쪽에 `"facility"` 종류를 더하고 가는 경로를 함께 넘긴다.
- `Meta.tsx`가 `react-router-dom`의 `useNavigate`로 그 경로로 보낸다. `window.location`을 직접 만지지 마라. 이 앱은 해시 라우터다.
- 이동하기 전에 오른쪽 패널에 `{시설 이름}으로 이동합니다` 한 줄을 띄울 필요는 없다. 바로 보낸다.
- 시설을 가리키면 커서를 `pointer`로 바꾼다. 캔버스의 `style.cursor`를 `pointerover` 판정으로 바꾸면 된다. 매 프레임 레이캐스트하지 말고 `pointermove`를 150밀리초로 묶어서 처리해라.

## 4. 패널

`Meta.tsx` 오른쪽 패널에 더한다.

- 방을 고른 동안: 맨 위에 방 이름과 `전체 보기` 버튼, 그 아래에 그 방의 시설 목록. 시설 줄을 누르면 3절과 같은 이동을 한다.
- 방을 고르지 않은 동안: 지금 그대로 접속자 개인 목록이다.
- 접속자 목록은 두 경우 모두 남긴다. 방을 고른 동안에는 **그 방에 있는 사람**이 위로 올라온다.

## 하지 말 것

- 담당자 집계나 팀 묶음을 만들지 마라.
- 예시 사람이나 더미 데이터를 만들지 마라.
- 랜덤을 쓰지 마라.
- 외부 3D 파일, 이미지, 폰트를 불러오지 마라. `TextGeometry`와 `FontLoader`를 쓰지 마라.
- 매 프레임 지오메트리나 재질을 새로 만들지 마라. 깃발 정점은 미리 복사해 둔 원본을 기준으로 고친다.
- 흐리게 하려고 재질을 방마다 복제하지 마라. 원래 값을 `userData`에 담고 되돌려라.
- 한글을 영어로 바꾸지 마라. 파일은 UTF-8이다.
- 코드를 한 줄로 눌러 담지 마라.
- 커밋하거나 푸시하지 마라.

## 검증

1. `npm run build` 한 번. 통과해야 한다.
2. `git status --short`로 바뀐 파일이 `OfficeScene.tsx`와 `Meta.tsx` 둘뿐인지 확인해라.

개발 서버를 띄우지 마라. 화면 확인은 박향근이 한다.

보고에는 고친 부분, 깃발과 시설 라벨 개수, 빌드 결과, 판단이 필요했던 지점만 적어라. 코드를 붙이지 마라.
