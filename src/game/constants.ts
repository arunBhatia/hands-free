// Game rules and tuning ported from Chromium's offline dino game
// (components/neterror/resources/dino_game/). Only logic and numbers are ported —
// the sprites in sprites.ts are original.
//
// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found at https://chromium.googlesource.com/chromium/src/+/main/LICENSE

/** Logical canvas size. Everything below is in these pixels; the view scales it up. */
export const WIDTH = 600
export const HEIGHT = 150
export const BOTTOM_PAD = 10

/** The simulation runs in fixed steps of one 60 Hz frame, as Chrome's constants assume. */
export const FPS = 60
export const STEP_MS = 1000 / FPS

/**
 * Speed comes from Chrome's slow mode (offline.ts `slowModeConfig`) rather than the
 * default. A gesture reaches the game roughly 100 ms after the hand moves — camera
 * exposure, inference and pinch hysteresis — and at Chrome's normal pace that lag
 * alone costs the jump.
 */
export const START_SPEED = 4.2
export const MAX_SPEED = 9
export const ACCELERATION = 0.0005
export const GAP_COEFFICIENT = 0.6
export const MAX_GAP_COEFFICIENT = 1.5

/**
 * Extra clear ground after every obstacle, in frames of travel. A keyboard can re-jump
 * the instant the dino lands; a hand has to open the pinch past the hysteresis band and
 * close it again, which takes a few frames Chrome's gap formula never budgeted for.
 */
export const GESTURE_REACTION_FRAMES = 12

/** No obstacles for this long after the start, so the first one is never a surprise. */
export const CLEAR_TIME_MS = 3000
/** Restart is ignored for this long after a crash, so the fatal pinch does not restart. */
export const GAME_OVER_CLEAR_MS = 1200
/** A jump pressed this close before landing fires on landing instead of being lost. */
export const JUMP_BUFFER_MS = 150

export const MAX_OBSTACLE_LENGTH = 3
export const MAX_OBSTACLE_DUPLICATION = 2

export const CLOUD_SPEED = 0.2
export const CLOUD_FREQUENCY = 0.5
export const MAX_CLOUDS = 6

/** distance → score, as in Chrome's DistanceMeter. */
export const SCORE_COEFFICIENT = 0.025
export const ACHIEVEMENT_DISTANCE = 100
export const FLASH_MS = 750

/**
 * T-rex jump. This is Chrome's normal jump (`normalJumpConfig`), not the slow-mode one:
 * slow mode's jump peaks about 17 px above the top of a 150 px canvas.
 */
export const TREX = {
  width: 44,
  widthDuck: 59,
  height: 47,
  startX: 50,
  gravity: 0.6,
  initialJumpVelocity: -10,
  /** Absolute y the jump is cut at once the minimum height has been reached. */
  maxJumpHeight: 30,
  /** Height above the ground the jump always reaches, however short the press. */
  minJumpHeight: 30,
  dropVelocity: -5,
  speedDropCoefficient: 3,
} as const

export const GROUND_Y = HEIGHT - TREX.height - BOTTOM_PAD

export type ObstacleType = 'cactusSmall' | 'cactusLarge' | 'pterodactyl'

export interface ObstacleSpec {
  type: ObstacleType
  width: number
  height: number
  /** Top edge; the pterodactyl picks one of several heights. */
  yPos: readonly number[]
  /** Groups of several are allowed from this speed. */
  multipleSpeed: number
  /** Chrome's per-type gap term, scaled by GAP_COEFFICIENT. */
  minGap: number
  /** Does not appear below this speed. */
  minSpeed: number
  /** Moves this much faster or slower than the ground, randomly signed. */
  speedOffset: number
}

export const OBSTACLES: readonly ObstacleSpec[] = [
  {
    type: 'cactusSmall',
    width: 17,
    height: 35,
    yPos: [105],
    multipleSpeed: 4,
    minGap: 120,
    minSpeed: 0,
    speedOffset: 0,
  },
  {
    type: 'cactusLarge',
    width: 25,
    height: 50,
    yPos: [90],
    multipleSpeed: 7,
    minGap: 120,
    minSpeed: 0,
    speedOffset: 0,
  },
  {
    type: 'pterodactyl',
    width: 46,
    height: 40,
    // Low: jump it. Middle: duck under it. High: run under it.
    yPos: [100, 75, 50],
    multipleSpeed: 999,
    minGap: 150,
    // Chrome holds birds back until 8.5. Here they come from the start, so the
    // duck gesture is part of play from the first run, not only after a long one.
    minSpeed: 0,
    speedOffset: 0.8,
  },
]
