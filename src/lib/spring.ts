/**
 * 아주 가벼운 스프링 물리 + 공용 rAF 루프.
 *
 * CSS transition 은 hover on/off 를 두 상태 사이의 "구간 이동"으로만 다루기 때문에
 * 커서가 들어오고 나가는 순간마다 속도가 끊긴다. 스프링은 현재 속도를 유지한 채
 * 목표값만 갈아끼우므로, 커서를 빠르게 훑고 지나가도 이어지는 움직임이 나온다.
 */

export interface SpringOptions {
  /** 강성. 클수록 목표에 빨리 닿는다. */
  stiffness?: number
  /** 감쇠. 클수록 출렁임이 줄어든다. */
  damping?: number
  /** 이 값보다 작은 오차·속도는 정지로 본다. */
  precision?: number
}

export class Spring {
  value: number
  target: number
  velocity = 0
  stiffness: number
  damping: number
  precision: number

  constructor(initial = 0, { stiffness = 80, damping = 15, precision = 0.004 }: SpringOptions = {}) {
    this.value = initial
    this.target = initial
    this.stiffness = stiffness
    this.damping = damping
    this.precision = precision
  }

  /** 목표값 변경. 현재 속도는 그대로 이어진다. */
  to(target: number) {
    this.target = target
  }

  /** 애니메이션 없이 즉시 이동. */
  snap(value: number) {
    this.value = value
    this.target = value
    this.velocity = 0
  }

  /** dt(초)만큼 적분. 아직 움직이는 중이면 true. */
  step(dt: number): boolean {
    const delta = this.target - this.value
    if (Math.abs(delta) < this.precision && Math.abs(this.velocity) < this.precision) {
      this.value = this.target
      this.velocity = 0
      return false
    }
    this.velocity += (delta * this.stiffness - this.velocity * this.damping) * dt
    this.value += this.velocity * dt
    return true
  }
}

type FrameCallback = (dt: number) => boolean

const callbacks = new Set<FrameCallback>()
let rafId = 0
let lastTime = 0

function loop(now: number) {
  // 탭 전환 등으로 프레임이 길게 비면 dt 가 커져 스프링이 발산한다. 상한을 둔다.
  const dt = Math.min((now - lastTime) / 1000, 1 / 30)
  lastTime = now
  for (const callback of [...callbacks]) {
    if (!callback(dt)) callbacks.delete(callback)
  }
  rafId = callbacks.size > 0 ? requestAnimationFrame(loop) : 0
}

/** 스프링이 멈출 때까지 프레임마다 호출한다. 이미 등록돼 있으면 무시된다. */
export function startFrameLoop(callback: FrameCallback) {
  if (callbacks.has(callback)) return
  callbacks.add(callback)
  if (rafId === 0) {
    lastTime = performance.now()
    rafId = requestAnimationFrame(loop)
  }
}

export function stopFrameLoop(callback: FrameCallback) {
  callbacks.delete(callback)
  if (callbacks.size === 0 && rafId !== 0) {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
}
