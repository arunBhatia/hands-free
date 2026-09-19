import type { Box } from './collision'

/**
 * Original blocky sprites, built from rectangles in each sprite's own coordinates.
 *
 * Sizes match Chrome's sprite boxes (dino 44×47, cacti 17×35 / 25×50, pterodactyl
 * 46×40) so the spawn heights and gap maths port unchanged. Because the art is made of
 * rectangles, the hitboxes are simply the coarse blocks of that art — they cannot drift
 * away from what is drawn.
 */

export type Shape = readonly Box[]

const DINO_HEAD: Shape = [
  { x: 24, y: 0, w: 20, h: 14 },
  { x: 24, y: 14, w: 12, h: 4 },
]
const DINO_BODY: Shape = [
  { x: 22, y: 14, w: 8, h: 8 },
  { x: 6, y: 20, w: 24, h: 16 },
  { x: 30, y: 24, w: 6, h: 3 },
  { x: 34, y: 27, w: 2, h: 3 },
  { x: 0, y: 14, w: 4, h: 12 },
  { x: 2, y: 20, w: 6, h: 10 },
]
const LEGS_STAND: Shape = [
  { x: 10, y: 36, w: 5, h: 11 },
  { x: 15, y: 44, w: 3, h: 3 },
  { x: 20, y: 36, w: 5, h: 11 },
  { x: 25, y: 44, w: 3, h: 3 },
]
const LEGS_RUN_A: Shape = [
  { x: 10, y: 36, w: 5, h: 11 },
  { x: 15, y: 44, w: 3, h: 3 },
  { x: 20, y: 36, w: 5, h: 5 },
  { x: 25, y: 39, w: 3, h: 2 },
]
const LEGS_RUN_B: Shape = [
  { x: 10, y: 36, w: 5, h: 5 },
  { x: 15, y: 39, w: 3, h: 2 },
  { x: 20, y: 36, w: 5, h: 11 },
  { x: 25, y: 44, w: 3, h: 3 },
]

export const DINO_EYE: Box = { x: 28, y: 3, w: 3, h: 3 }

export const DINO_STAND: Shape = [...DINO_HEAD, ...DINO_BODY, ...LEGS_STAND]
export const DINO_RUN: readonly Shape[] = [
  [...DINO_HEAD, ...DINO_BODY, ...LEGS_RUN_A],
  [...DINO_HEAD, ...DINO_BODY, ...LEGS_RUN_B],
]

/** Ducking dino, in a 59×47 box so it shares the standing dino's ground line. */
const DUCK_BODY: Shape = [
  { x: 38, y: 18, w: 20, h: 12 },
  { x: 38, y: 30, w: 10, h: 3 },
  { x: 4, y: 22, w: 34, h: 14 },
  { x: 0, y: 22, w: 6, h: 6 },
]
export const DUCK_EYE: Box = { x: 42, y: 21, w: 3, h: 3 }
export const DINO_DUCK: readonly Shape[] = [
  [...DUCK_BODY, { x: 12, y: 36, w: 5, h: 11 }, { x: 26, y: 36, w: 5, h: 5 }],
  [...DUCK_BODY, { x: 12, y: 36, w: 5, h: 5 }, { x: 26, y: 36, w: 5, h: 11 }],
]

export const DINO_HITBOXES: Shape = [
  { x: 24, y: 1, w: 19, h: 16 },
  { x: 22, y: 14, w: 8, h: 8 },
  { x: 6, y: 20, w: 28, h: 15 },
  { x: 1, y: 15, w: 6, h: 14 },
  { x: 10, y: 35, w: 16, h: 11 },
]
export const DUCK_HITBOXES: Shape = [
  { x: 38, y: 19, w: 20, h: 13 },
  { x: 1, y: 22, w: 37, h: 14 },
  { x: 12, y: 35, w: 19, h: 11 },
]

export const CACTUS_SMALL: Shape = [
  { x: 6, y: 0, w: 5, h: 35 },
  { x: 0, y: 8, w: 3, h: 12 },
  { x: 3, y: 17, w: 3, h: 3 },
  { x: 14, y: 5, w: 3, h: 10 },
  { x: 11, y: 12, w: 3, h: 3 },
]
export const CACTUS_SMALL_HITBOXES: Shape = [
  { x: 5, y: 0, w: 7, h: 35 },
  { x: 0, y: 8, w: 6, h: 12 },
  { x: 11, y: 5, w: 6, h: 10 },
]

export const CACTUS_LARGE: Shape = [
  { x: 9, y: 0, w: 7, h: 50 },
  { x: 0, y: 12, w: 4, h: 18 },
  { x: 4, y: 26, w: 5, h: 4 },
  { x: 21, y: 8, w: 4, h: 16 },
  { x: 16, y: 20, w: 5, h: 4 },
]
export const CACTUS_LARGE_HITBOXES: Shape = [
  { x: 8, y: 0, w: 9, h: 50 },
  { x: 0, y: 12, w: 9, h: 18 },
  { x: 16, y: 8, w: 9, h: 16 },
]

const PTERO_BODY: Shape = [
  { x: 14, y: 16, w: 20, h: 7 },
  { x: 6, y: 12, w: 10, h: 6 },
  { x: 0, y: 15, w: 6, h: 3 },
  { x: 34, y: 18, w: 8, h: 3 },
]
export const PTERO: readonly Shape[] = [
  [...PTERO_BODY, { x: 18, y: 0, w: 6, h: 16 }, { x: 24, y: 4, w: 5, h: 12 }],
  [...PTERO_BODY, { x: 18, y: 23, w: 6, h: 15 }, { x: 24, y: 23, w: 5, h: 11 }],
]
export const PTERO_EYE: Box = { x: 10, y: 13, w: 2, h: 2 }
/** Wings are left out on purpose, as Chrome mostly does: clipping a wingtip feels unfair. */
export const PTERO_HITBOXES: Shape = [
  { x: 15, y: 16, w: 19, h: 7 },
  { x: 6, y: 12, w: 10, h: 6 },
  { x: 1, y: 15, w: 5, h: 3 },
]

export const CLOUD: Shape = [
  { x: 10, y: 0, w: 16, h: 4 },
  { x: 4, y: 4, w: 30, h: 4 },
  { x: 0, y: 8, w: 46, h: 5 },
]
export const CLOUD_WIDTH = 46
