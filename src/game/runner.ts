import {
  ACCELERATION,
  ACHIEVEMENT_DISTANCE,
  CLEAR_TIME_MS,
  FLASH_MS,
  GAME_OVER_CLEAR_MS,
  JUMP_BUFFER_MS,
  MAX_SPEED,
  SCORE_COEFFICIENT,
  START_SPEED,
  STEP_MS,
  TREX,
} from './constants'
import { collide, type Box } from './collision'
import { Horizon } from './horizon'
import { ObstacleField, type Rng } from './obstacles'
import { Trex } from './trex'

export type RunnerStatus = 'waiting' | 'running' | 'crashed'

export interface GameInput {
  /** Rising edge: a pinch just closed, or the jump key just went down. */
  jumpPressed: boolean
  /** Pinch still closed / key still down. Letting go early gives a shorter hop. */
  jumpHeld: boolean
  duck: boolean
}

/** Longest real-time gap simulated in one go; a backgrounded tab should pause, not warp. */
const MAX_ELAPSED_MS = 250

/**
 * The whole game, with no DOM in it: state advances in fixed 60 Hz steps from whatever
 * real time has passed, so the same inputs give the same run on any display.
 */
export class Runner {
  status: RunnerStatus = 'waiting'
  speed = START_SPEED
  distance = 0
  runningTime = 0
  /** Simulated ms since the page opened; the clock for buffers and cooldowns. */
  time = 0
  crashedAt = -Infinity
  highScore: number
  flashUntil = -Infinity
  /** The two boxes that touched, kept for the debug overlay. */
  lastCollision: [Box, Box] | null = null

  readonly trex = new Trex()
  readonly field: ObstacleField
  readonly horizon: Horizon

  private accumulator = 0
  private pendingPress = false
  private jumpBufferUntil = -Infinity
  private lastAchievement = 0

  constructor(rng: Rng = Math.random, highScore = 0) {
    this.field = new ObstacleField(rng)
    this.horizon = new Horizon(rng)
    this.highScore = highScore
  }

  get score(): number {
    return Math.round(this.distance * SCORE_COEFFICIENT)
  }

  get canRestart(): boolean {
    return this.status === 'crashed' && this.time - this.crashedAt >= GAME_OVER_CLEAR_MS
  }

  /** Advances by real elapsed time. The press edge is applied to the first step only. */
  advance(elapsedMs: number, input: GameInput): void {
    this.accumulator += Math.min(elapsedMs, MAX_ELAPSED_MS)
    let pressed = input.jumpPressed || this.pendingPress
    while (this.accumulator >= STEP_MS) {
      this.accumulator -= STEP_MS
      this.step({ ...input, jumpPressed: pressed })
      pressed = false
    }
    // A press on a display faster than 60 Hz can land between steps; keep it for the next.
    this.pendingPress = pressed
  }

  step(input: GameInput): void {
    this.time += STEP_MS

    if (this.status === 'waiting') {
      if (input.jumpPressed) {
        this.start()
        this.trex.startJump(this.speed)
      }
      this.trex.animTime += STEP_MS
      return
    }

    if (this.status === 'crashed') {
      if (input.jumpPressed && this.canRestart) this.start()
      return
    }

    this.runningTime += STEP_MS
    this.control(input)
    this.trex.step(STEP_MS)

    if (this.speed < MAX_SPEED) this.speed = Math.min(MAX_SPEED, this.speed + ACCELERATION)
    this.distance += this.speed
    this.checkAchievement()

    this.horizon.step(this.speed)
    this.field.step(this.speed, STEP_MS, this.runningTime > CLEAR_TIME_MS)

    const dino = this.trex.bounds(TREX.startX)
    for (const obstacle of this.field.obstacles) {
      const hit = collide(dino, obstacle.bounds())
      if (hit) {
        this.crash(hit)
        break
      }
    }
  }

  private control(input: GameInput): void {
    const trex = this.trex

    if (input.jumpPressed) this.jumpBufferUntil = this.time + JUMP_BUFFER_MS
    if (!trex.jumping && !trex.ducking && this.time <= this.jumpBufferUntil) {
      trex.startJump(this.speed)
      this.jumpBufferUntil = -Infinity
    }

    if (trex.jumping) {
      if (input.duck && !trex.speedDrop) trex.setSpeedDrop()
      else if (!input.jumpHeld) trex.endJump()
    } else {
      trex.setDuck(input.duck)
    }
  }

  private checkAchievement(): void {
    const score = this.score
    if (score > 0 && score % ACHIEVEMENT_DISTANCE === 0 && score !== this.lastAchievement) {
      this.lastAchievement = score
      this.flashUntil = this.time + FLASH_MS
    }
  }

  private crash(hit: [Box, Box]): void {
    this.status = 'crashed'
    this.trex.status = 'crashed'
    this.crashedAt = this.time
    this.lastCollision = hit
    this.highScore = Math.max(this.highScore, this.score)
  }

  private start(): void {
    this.status = 'running'
    this.speed = START_SPEED
    this.distance = 0
    this.runningTime = 0
    this.lastAchievement = 0
    this.flashUntil = -Infinity
    this.jumpBufferUntil = -Infinity
    this.lastCollision = null
    this.trex.reset()
    this.field.reset()
    this.horizon.reset()
  }
}
