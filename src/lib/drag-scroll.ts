/** 표 드래그 자동 스크롤. 엑셀처럼 가장자리 밖으로 더 밀수록 빨라진다(R453, R454).
 *  속도는 px/초다. **프레임당 px 로 되돌리지 말 것.** 프레임이 늦어지면 스크롤도 같이 느려진다.
 *  DD MASTER·DEVELOPMENT REQUEST·WAREHOUSE 세 표가 이 파일 하나를 쓴다. **파일마다 복사하지 말 것.** */
/** 띠 안쪽 경계를 막 넘어왔을 때. 저속 구간이 있어야 멈추기 쉽다. */
const DRAG_SCROLL_MIN = 400
/** 포인터가 표 가장자리에 닿았을 때. */
const DRAG_SCROLL_EDGE = 1500
/** 포인터가 표 가장자리 밖으로 `DRAG_SCROLL_OUT` 이상 밀렸을 때. */
const DRAG_SCROLL_MAX = 2600
/** 가장자리 밖으로 이만큼만 더 밀면 최고 속도다. */
const DRAG_SCROLL_OUT = 60
/** 한 틱에 반영할 최대 경과 시간(초). 프레임이 길게 멈춰도 한 번에 한 화면씩 튀지 않게 묶는다. */
const DRAG_SCROLL_MAX_STEP = 0.05

/**
 * 초당 스크롤 px. `inside`는 표 가장자리에서 포인터까지의 거리이고 안쪽은 +, 밖은 음수다.
 * `band`는 그 방향에서 자동 스크롤이 걸리는 안쪽 띠 폭이다.
 *
 * **띠 안쪽은 `band`로 나눠 정규화한다. 깊이(px)를 그대로 눈금으로 쓰지 말 것(R455).**
 * 띠 폭이 방향마다 다른 건 왼쪽만 80px 안쪽에서 걸기 때문이고 속도와는 상관없다.
 * 나누지 않으면 포인터가 가장자리에 닿아 있어도 왼쪽은 오른쪽의 1.9배로 굴렀다.
 *
 * 안쪽만 이차 곡선이다. 경계 근처를 천천히 골라 잡는 것이 목적이다.
 * 가장자리 밖은 선형이라 미는 만큼 바로 붙는다.
 */
export function dragScrollSpeed(inside: number, band: number): number {
  const depth = band - inside
  if (depth <= 0) return 0
  if (depth <= band) {
    const ratio = depth / band
    return DRAG_SCROLL_MIN + (DRAG_SCROLL_EDGE - DRAG_SCROLL_MIN) * ratio * ratio
  }
  const out = Math.min((depth - band) / DRAG_SCROLL_OUT, 1)
  return DRAG_SCROLL_EDGE + (DRAG_SCROLL_MAX - DRAG_SCROLL_EDGE) * out
}

/**
 * 이번 프레임에 반영할 경과 시간(초). 속도를 곱해 쓴다.
 *
 * **`Math.max`를 빼지 말 것.** 첫 틱에서 `lastAt`은 마우스 이벤트가 끝나는 중에 `performance.now()`로
 * 잡은 값인 반면 `now`는 그 프레임이 시작된 시각이라, 브라우저가 같은 프레임 안에서 마우스 이벤트를
 * 먼저 돌리면 `now`가 `lastAt`보다 앞선다. 그러면 음수가 되어 첫 프레임에 스크롤이 반대로 간다.
 */
export function dragScrollStep(now: number, lastAt: number): number {
  return Math.min(Math.max(now - lastAt, 0) / 1000, DRAG_SCROLL_MAX_STEP)
}
