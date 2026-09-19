import { frame } from '../state/store'
import { classifyHand } from './handPose'
import type { GameInput } from './runner'

export interface InputDebug {
  pinchRatio: number
  middleExtension: number
  pinching: boolean
  fist: boolean
  /** Pinches rejected by the fist guard since the page opened. */
  guarded: number
}

/**
 * Hands → one GameInput per animation frame.
 *
 * Jump reads the pinch state straight from ingest(), which sets it from the raw pinch
 * ratio with hysteresis and no voting window — it is the lowest-latency signal we have.
 * Duck reads the voted gesture label: slower to confirm, but it is held, not tapped.
 */
export class HandInput {
  private wasPinching = false
  private wasGuarded = false
  readonly debug: InputDebug = {
    pinchRatio: 1,
    middleExtension: 0,
    pinching: false,
    fist: false,
    guarded: 0,
  }

  poll(): GameInput {
    let pinching = false
    let fist = false
    let guarded = false
    let closest = { pinchRatio: 1, middleExtension: 0 }

    for (const hand of frame.hands) {
      if (!hand.present) continue
      const reading = classifyHand(hand.landmarks, hand.pinching, hand.gesture)
      if (reading.pose === 'pinch') pinching = true
      if (reading.pose === 'fist') fist = true
      if (reading.guarded) guarded = true
      if (reading.pinchRatio < closest.pinchRatio) closest = reading
    }

    // Rising edge only: holding a pinch is holding the jump button, not mashing it.
    const pinchPressed = pinching && !this.wasPinching
    this.wasPinching = pinching
    if (guarded && !this.wasGuarded) this.debug.guarded++
    this.wasGuarded = guarded

    const input: GameInput = {
      jumpPressed: pinchPressed,
      jumpHeld: pinching,
      duck: fist && !pinching,
    }

    this.debug.pinchRatio = closest.pinchRatio
    this.debug.middleExtension = closest.middleExtension
    this.debug.pinching = pinching
    this.debug.fist = fist
    return input
  }
}
