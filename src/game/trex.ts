import { GROUND_Y, TREX } from './constants'
import { DINO_HITBOXES, DUCK_HITBOXES } from './sprites'
import type { Placed } from './collision'

export type TrexStatus = 'waiting' | 'running' | 'jumping' | 'ducking' | 'crashed'

/**
 * Jump physics ported from Chrome's trex.ts, stepped one 60 Hz frame at a time.
 *
 * Chrome scales each update by elapsed frames and rounds the position every time, so its
 * arc shifts slightly with display refresh rate. Stepping fixed frames removes that.
 */
export class Trex {
  status: TrexStatus = 'waiting'
  y = GROUND_Y
  jumpVelocity = 0
  jumping = false
  ducking = false
  reachedMinHeight = false
  speedDrop = false
  /** ms, drives the leg animation. */
  animTime = 0

  reset(): void {
    this.status = 'running'
    this.y = GROUND_Y
    this.jumpVelocity = 0
    this.jumping = false
    this.ducking = false
    this.reachedMinHeight = false
    this.speedDrop = false
  }

  startJump(speed: number): void {
    if (this.jumping) return
    this.status = 'jumping'
    this.ducking = false
    // Faster runs get a slightly stronger jump, as in Chrome.
    this.jumpVelocity = TREX.initialJumpVelocity - speed / 10
    this.jumping = true
    this.reachedMinHeight = false
    this.speedDrop = false
  }

  /** Released early: cut the rise short, but never below the minimum height. */
  endJump(): void {
    if (this.reachedMinHeight && this.jumpVelocity < TREX.dropVelocity) {
      this.jumpVelocity = TREX.dropVelocity
    }
  }

  /** Duck pressed mid-air: abandon the jump and fall fast. */
  setSpeedDrop(): void {
    this.speedDrop = true
    this.jumpVelocity = 1
  }

  setDuck(ducking: boolean): void {
    if (this.jumping) return
    this.ducking = ducking
    this.status = ducking ? 'ducking' : 'running'
  }

  /** One 60 Hz frame. Returns true on the frame the dino lands. */
  step(stepMs: number): boolean {
    this.animTime += stepMs
    if (!this.jumping) return false

    if (this.speedDrop) {
      this.y += Math.round(this.jumpVelocity * TREX.speedDropCoefficient)
    } else {
      this.y += Math.round(this.jumpVelocity)
    }
    this.jumpVelocity += TREX.gravity

    if (this.y < GROUND_Y - TREX.minJumpHeight || this.speedDrop) this.reachedMinHeight = true
    if (this.y < TREX.maxJumpHeight || this.speedDrop) this.endJump()

    if (this.y > GROUND_Y) {
      this.reset()
      return true
    }
    return false
  }

  bounds(x: number): Placed {
    return {
      x,
      y: this.y,
      width: this.ducking ? TREX.widthDuck : TREX.width,
      height: TREX.height,
      hitboxes: this.ducking ? DUCK_HITBOXES : DINO_HITBOXES,
    }
  }
}
