import {
  GAP_COEFFICIENT,
  GESTURE_REACTION_FRAMES,
  MAX_GAP_COEFFICIENT,
  MAX_OBSTACLE_DUPLICATION,
  MAX_OBSTACLE_LENGTH,
  OBSTACLES,
  WIDTH,
  type ObstacleSpec,
} from './constants'
import type { Box, Placed } from './collision'
import {
  CACTUS_LARGE_HITBOXES,
  CACTUS_SMALL_HITBOXES,
  PTERO_HITBOXES,
} from './sprites'

export type Rng = () => number

function randomInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

function hitboxesFor(spec: ObstacleSpec, size: number): Box[] {
  const base =
    spec.type === 'cactusSmall'
      ? CACTUS_SMALL_HITBOXES
      : spec.type === 'cactusLarge'
        ? CACTUS_LARGE_HITBOXES
        : PTERO_HITBOXES
  // A group is the single cactus repeated side by side, so repeat its boxes too.
  const out: Box[] = []
  for (let i = 0; i < size; i++) {
    for (const box of base) out.push({ ...box, x: box.x + i * spec.width })
  }
  return out
}

export class Obstacle {
  readonly width: number
  readonly y: number
  readonly gap: number
  readonly speedOffset: number
  readonly hitboxes: Box[]
  x = WIDTH
  followingCreated = false
  /** ms, drives the wing flap. */
  animTime = 0

  constructor(
    readonly spec: ObstacleSpec,
    readonly size: number,
    speed: number,
    rng: Rng,
  ) {
    this.width = spec.width * size
    this.y = spec.yPos[randomInt(rng, 0, spec.yPos.length - 1)]
    this.speedOffset = spec.speedOffset ? (rng() > 0.5 ? spec.speedOffset : -spec.speedOffset) : 0
    this.hitboxes = hitboxesFor(spec, size)

    // Chrome's gap: grows with speed so reaction time stays roughly constant, plus a
    // gesture allowance (see GESTURE_REACTION_FRAMES).
    const minGap = Math.round(
      this.width * speed + spec.minGap * GAP_COEFFICIENT + speed * GESTURE_REACTION_FRAMES,
    )
    this.gap = randomInt(rng, minGap, Math.round(minGap * MAX_GAP_COEFFICIENT))
  }

  step(speed: number, stepMs: number): void {
    this.x -= speed + this.speedOffset
    this.animTime += stepMs
  }

  get visible(): boolean {
    return this.x + this.width > 0
  }

  bounds(): Placed {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.spec.height,
      hitboxes: this.hitboxes,
    }
  }
}

/**
 * Spawns and scrolls obstacles. A new one is created once the previous one has moved
 * its own gap clear of the right edge; types are random, but never more than
 * MAX_OBSTACLE_DUPLICATION of the same kind in a row, and never below their minimum speed.
 */
export class ObstacleField {
  obstacles: Obstacle[] = []
  private history: string[] = []

  constructor(private readonly rng: Rng) {}

  reset(): void {
    this.obstacles = []
    this.history = []
  }

  step(speed: number, stepMs: number, spawning: boolean): void {
    for (const obstacle of this.obstacles) obstacle.step(speed, stepMs)
    this.obstacles = this.obstacles.filter((obstacle) => obstacle.visible)

    if (!spawning) return
    const last = this.obstacles[this.obstacles.length - 1]
    if (!last) {
      this.add(speed)
    } else if (!last.followingCreated && last.x + last.width + last.gap < WIDTH) {
      this.add(speed)
      last.followingCreated = true
    }
  }

  private add(speed: number): void {
    const allowed = OBSTACLES.filter(
      (spec) => speed >= spec.minSpeed && !this.isDuplicate(spec.type),
    )
    if (allowed.length === 0) return
    const spec = allowed[randomInt(this.rng, 0, allowed.length - 1)]
    let size = randomInt(this.rng, 1, MAX_OBSTACLE_LENGTH)
    if (size > 1 && spec.multipleSpeed > speed) size = 1

    this.obstacles.push(new Obstacle(spec, size, speed, this.rng))
    this.history.unshift(spec.type)
    this.history.length = Math.min(this.history.length, MAX_OBSTACLE_DUPLICATION)
  }

  private isDuplicate(type: string): boolean {
    return this.history.filter((name) => name === type).length >= MAX_OBSTACLE_DUPLICATION
  }
}
