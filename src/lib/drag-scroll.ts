/** 표 드래그 자동 스크롤. 엑셀처럼 가장자리 밖으로 더 밀수록 빨라진다(R453, R454).
 *  속도는 px/초다. **프레임당 px 로 되돌리지 말 것.** 프레임이 늦어지면 스크롤도 같이 느려진다.
 *  DD MASTER·DEVELOPMENT REQUEST·WAREHOUSE 세 표가 이 파일 하나를 쓴다. **파일마다 복사하지 말 것.** */
const DRAG_SCROLL_MIN = 400
const DRAG_SCROLL_MAX = 2600
/** 띠 안쪽 경계에서 이만큼 더 밀면 최고 속도다. */
const DRAG_SCROLL_RAMP = 110
/** 한 틱에 반영할 최대 경과 시간(초). 프레임이 길게 멈춰도 한 번에 한 화면씩 튀지 않게 묶는다. */
const DRAG_SCROLL_MAX_STEP = 0.05

/** 띠 안쪽 경계에서 얼마나 더 깊이 들어갔는지(px)로 초당 속도를 낸다. */
export function dragScrollSpeed(depth: number): number {
  if (depth <= 0) return 0
  const ratio = Math.min(depth / DRAG_SCROLL_RAMP, 1)
  return DRAG_SCROLL_MIN + (DRAG_SCROLL_MAX - DRAG_SCROLL_MIN) * ratio * ratio
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
