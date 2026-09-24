import { describe, expect, it } from 'vitest'
import { collide, overlaps } from './collision'
import {
  GAME_OVER_CLEAR_MS,
  GROUND_Y,
  MAX_SPEED,
  OBSTACLES,
  START_SPEED,
  STEP_MS,
  TREX,
} from './constants'
import { Obstacle, ObstacleField } from './obstacles'
import { Runner, type GameInput } from './runner'
import { Trex } from './trex'

const idle: GameInput = { jumpPressed: false, jumpHeld: false, duck: false }
const press: GameInput = { jumpPressed: true, jumpHeld: true, duck: false }
const hold: GameInput = { jumpPressed: false, jumpHeld: true, duck: false }

/** Runs one jump to landing; `held` decides how many frames the button stays down. */
function jump(speed: number, held: number, duckAt = Infinity) {
  const trex = new Trex()
  trex.reset()
  trex.startJump(speed)
  let peak = trex.y
  let frames = 0
  while (trex.jumping && frames < 500) {
    frames++
    if (frames >= duckAt && !trex.speedDrop) trex.setSpeedDrop()
    else if (frames > held) trex.endJump()
    trex.step(STEP_MS)
    peak = Math.min(peak, trex.y)
  }
  return { peak, frames, y: trex.y }
}

function spec(type: string) {
  return OBSTACLES.find((s) => s.type === type)!
}

/** An obstacle pinned at a chosen height and position, for collision checks. */
function obstacleAt(type: string, x: number, y: number) {
  const obstacle = new Obstacle(spec(type), 1, START_SPEED, () => 0)
  return { ...obstacle.bounds(), x, y }
}

describe('jump', () => {
  it('stays on the canvas and lands back on the ground at every speed', () => {
    for (const speed of [START_SPEED, MAX_SPEED]) {
      const { peak, frames, y } = jump(speed, Infinity)
      expect(peak).toBeGreaterThanOrEqual(0)
      expect(y).toBe(GROUND_Y)
      expect(frames).toBeGreaterThan(25)
      expect(frames).toBeLessThan(45)
    }
  })

  it('goes higher while the pinch is held', () => {
    const tap = jump(START_SPEED, 1)
    const held = jump(START_SPEED, Infinity)
    expect(held.peak).toBeLessThan(tap.peak)
    // Even a tap clears the minimum height.
    expect(tap.peak).toBeLessThanOrEqual(GROUND_Y - TREX.minJumpHeight)
  })

  it('falls fast when ducking mid-air', () => {
    const normal = jump(START_SPEED, Infinity)
    const dropped = jump(START_SPEED, Infinity, 8)
    expect(dropped.frames).toBeLessThan(normal.frames)
    expect(dropped.y).toBe(GROUND_Y)
  })
})

describe('collision', () => {
  it('overlaps only when boxes share area', () => {
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 5, h: 5 })).toBe(true)
    expect(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBe(false)
  })

  it('lets a cactus pass under a jumping dino and hits a running one', () => {
    const trex = new Trex()
    trex.reset()
    const cactus = obstacleAt('cactusLarge', TREX.startX + 10, 90)
    expect(collide(trex.bounds(TREX.startX), cactus)).not.toBeNull()
    trex.y = 20
    expect(collide(trex.bounds(TREX.startX), cactus)).toBeNull()
  })

  it('does not count the empty corners of the bounding boxes', () => {
    const trex = new Trex()
    trex.reset()
    // Top-left of the dino's box is empty air behind its head.
    const bird = obstacleAt('pterodactyl', TREX.startX - 40, GROUND_Y - 28)
    expect(collide(trex.bounds(TREX.startX), bird)).toBeNull()
  })

  it('gives each pterodactyl height the response it is meant to demand', () => {
    const [low, middle, high] = spec('pterodactyl').yPos
    const running = new Trex()
    running.reset()
    const ducking = new Trex()
    ducking.reset()
    ducking.setDuck(true)
    const x = TREX.startX + 10
    const hits = (trex: Trex, y: number) =>
      collide(trex.bounds(TREX.startX), obstacleAt('pterodactyl', x, y)) !== null

    // Low: ducking does not help — jump it.
    expect(hits(running, low)).toBe(true)
    expect(hits(ducking, low)).toBe(true)
    // Middle: duck under it.
    expect(hits(running, middle)).toBe(true)
    expect(hits(ducking, middle)).toBe(false)
    // High: just keep running.
    expect(hits(running, high)).toBe(false)
  })

  it('sends duck-height birds from the starting speed', () => {
    let seed = 1
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
    const field = new ObstacleField(rng)
    const middle = spec('pterodactyl').yPos[1]
    const seen = new Set<string>()
    for (let i = 0; i < 60 * 60; i++) {
      field.step(START_SPEED, STEP_MS, true)
      for (const o of field.obstacles) seen.add(`${o.spec.type}@${o.y}`)
    }
    expect(seen.has(`pterodactyl@${middle}`)).toBe(true)
  })
})

describe('gesture reaction budget', () => {
  /** The tightest gap the field can roll for a single small cactus, in ms of travel. */
  const clearMsAt = (speed: number) =>
    (new Obstacle(spec('cactusSmall'), 1, speed, () => 0).gap / speed) * STEP_MS

  it('leaves a hand enough clear ground between obstacles', () => {
    // A pinch reaches the game ~80-130 ms after the hand moves, and re-arming a jump
    // means opening past the hysteresis band and closing again. Below roughly 0.9 s at
    // the starting speed the run stops being playable by gesture at all — which is what
    // GESTURE_REACTION_FRAMES buys back, and why it is the knob to move, not the speed.
    expect(clearMsAt(START_SPEED)).toBeGreaterThan(900)
    expect(clearMsAt(MAX_SPEED)).toBeGreaterThan(700)
  })
})

describe('runner', () => {
  it('starts on the first press with a jump', () => {
    const runner = new Runner(() => 0.5)
    runner.step(idle)
    expect(runner.status).toBe('waiting')
    runner.step(press)
    expect(runner.status).toBe('running')
    expect(runner.trex.jumping).toBe(true)
  })

  it('ignores restart until the game-over pause has passed', () => {
    const runner = new Runner(() => 0)
    runner.step(press)
    let guard = 0
    while (runner.status === 'running' && guard++ < 60 * 60) runner.step(idle)
    expect(runner.status).toBe('crashed')
    expect(runner.score).toBeGreaterThan(0)
    expect(runner.highScore).toBe(runner.score)

    runner.step(press)
    expect(runner.status).toBe('crashed')
    for (let t = 0; t < GAME_OVER_CLEAR_MS; t += STEP_MS) runner.step(idle)
    runner.step(press)
    expect(runner.status).toBe('running')
    expect(runner.score).toBe(0)
  })

  it('buffers a press made just before landing', () => {
    const runner = new Runner(() => 0.5)
    runner.step(press)
    while (runner.trex.jumpVelocity < 0 || runner.trex.y < GROUND_Y - 12) runner.step(hold)
    runner.step(press)
    let relanded = false
    for (let i = 0; i < 20 && !relanded; i++) {
      runner.step(hold)
      if (runner.trex.jumping && runner.trex.jumpVelocity < 0) relanded = true
    }
    expect(relanded).toBe(true)
  })

  it('plays the same on a 120 Hz display as on 60 Hz', () => {
    const at60 = new Runner(() => 0.3)
    const at120 = new Runner(() => 0.3)
    at60.advance(STEP_MS, press)
    at120.advance(STEP_MS / 2, press)
    at120.advance(STEP_MS / 2, hold)
    for (let i = 0; i < 300; i++) {
      at60.advance(STEP_MS, i < 10 ? hold : idle)
      at120.advance(STEP_MS / 2, i < 10 ? hold : idle)
      at120.advance(STEP_MS / 2, i < 10 ? hold : idle)
    }
    expect(at120.trex.y).toBe(at60.trex.y)
    expect(at120.distance).toBeCloseTo(at60.distance, 6)
  })
})
