import { KEYBOARD_CONTROLS } from '../config'
import { frame } from '../state/store'
import { classifyHand } from './handPose'
import type { GameInput } from './runner'

export interface InputDebug {
  pinchRatio: number
  middleExtension: number
  pinching: boolean
  fist: boolean
  /** Pinch-shaped hands the guard took as fists rather than jumps, since the page opened. */
  guarded: number
}

const INTERACTIVE = 'button, a[href], input, textarea, select, summary, [contenteditable="true"]'

/**
 * How long a geometrically-read fist (see PoseReading.guarded) must hold before it ducks.
 *
 * It is read per frame with no voting, so a hand passing through a fist shape on its way
 * somewhere else would otherwise reach trex.setSpeedDrop() and slam a jump into the ground.
 * ~3 camera frames at 60 fps, and still far quicker than the 100-166 ms the voted label costs.
 */
const FIST_HOLD_MS = 50

/**
 * Whether the game should take this key. Only ever consulted when KEYBOARD_CONTROLS
 * is on; with the flag off the listeners are never attached.
 * Space on a focused button or link belongs to
 * that control — otherwise a keyboard user could never press Start camera.
 */
export function isGameKey(event: Pick<KeyboardEvent, 'code' | 'target'>): boolean {
  const target = event.target as { closest?: (selector: string) => unknown } | null
  const onControl = typeof target?.closest === 'function' && target.closest(INTERACTIVE) != null
  if (event.code === 'Space') return !onControl
  return event.code === 'ArrowUp' || event.code === 'ArrowDown'
}

/**
 * Hands (and a keyboard fallback) → one GameInput per animation frame.
 *
 * Jump reads the pinch state straight from ingest(), which sets it from the raw pinch
 * ratio with hysteresis and no voting window — it is the lowest-latency signal we have.
 * Duck takes whichever arrives first: the fist shape after FIST_HOLD_MS, or the voted
 * Closed_Fist label, which needs no extra debounce because voting already is one.
 */
export class HandInput {
  private wasPinching = false
  private wasGuarded = false
  /** When the current run of geometric fist frames began; null when there is none. */
  private fistSince: number | null = null
  private keyJump = false
  private keyJumpPressed = false
  private keyDuck = false
  readonly debug: InputDebug = {
    pinchRatio: 1,
    middleExtension: 0,
    pinching: false,
    fist: false,
    guarded: 0,
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (!isGameKey(event)) return
    event.preventDefault()
    if (event.code === 'ArrowDown') {
      this.keyDuck = true
    } else {
      if (!event.repeat) this.keyJumpPressed = true
      this.keyJump = true
    }
  }

  private readonly onKeyUp = (event: KeyboardEvent) => {
    if (event.code === 'Space' || event.code === 'ArrowUp') this.keyJump = false
    else if (event.code === 'ArrowDown') this.keyDuck = false
  }

  /** No-op unless KEYBOARD_CONTROLS is on. */
  attach(): () => void {
    if (!KEYBOARD_CONTROLS) return () => {}
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    return () => {
      window.removeEventListener('keydown', this.onKeyDown)
      window.removeEventListener('keyup', this.onKeyUp)
    }
  }

  /** `now` is injectable so the fist hold can be tested without a real clock. */
  poll(now: number = performance.now()): GameInput {
    let pinching = false
    let votedFist = false
    let shapedFist = false
    let closest = { pinchRatio: 1, middleExtension: 0 }

    for (const hand of frame.hands) {
      if (!hand.present) continue
      const reading = classifyHand(hand.landmarks, hand.pinching, hand.gesture)
      if (reading.pose === 'pinch') pinching = true
      if (reading.pose === 'fist') {
        if (reading.guarded) shapedFist = true
        else votedFist = true
      }
      if (reading.pinchRatio < closest.pinchRatio) closest = reading
    }

    if (!shapedFist) this.fistSince = null
    else if (this.fistSince === null) this.fistSince = now
    const fist = votedFist || (this.fistSince !== null && now - this.fistSince >= FIST_HOLD_MS)

    // Rising edge only: holding a pinch is holding the jump button, not mashing it.
    const pinchPressed = pinching && !this.wasPinching
    this.wasPinching = pinching
    if (shapedFist && !this.wasGuarded) this.debug.guarded++
    this.wasGuarded = shapedFist

    const input: GameInput = {
      jumpPressed: pinchPressed || this.keyJumpPressed,
      jumpHeld: pinching || this.keyJump,
      duck: (fist && !pinching) || this.keyDuck,
    }
    this.keyJumpPressed = false

    this.debug.pinchRatio = closest.pinchRatio
    this.debug.middleExtension = closest.middleExtension
    this.debug.pinching = pinching
    this.debug.fist = fist
    return input
  }
}
