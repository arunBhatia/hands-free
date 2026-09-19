import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

/**
 * @mediapipe/tasks-vision@1.0.1 does not export a HandLandmark index enum, so the
 * indices we need are named here. Order is MediaPipe's fixed 21-point hand topology.
 */
export const WRIST = 0
export const THUMB_TIP = 4
export const INDEX_MCP = 5
export const INDEX_TIP = 8
export const MIDDLE_MCP = 9
export const MIDDLE_TIP = 12
export const RING_MCP = 13
export const PINKY_MCP = 17

/** MediaPipe's HAND_CONNECTIONS, inlined for the skeleton overlay. */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
]

export function dist2(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Pinch openness, normalised by hand size so it does not depend on distance to camera.
 *
 * This normalisation is the whole trick. The raw thumb-tip-to-index-tip distance in
 * normalised image coords shrinks as you lean back, so a fixed threshold on it only
 * works at the one distance you tuned it at. Dividing by the wrist-to-middle-MCP
 * length (a rigid bone that scales identically with apparent hand size) makes the
 * ratio hold from roughly 40 cm to 150 cm from the lens.
 *
 * Returns ~0.15 when pinched shut, ~1.1+ when the hand is open.
 */
export function pinchRatio(lm: NormalizedLandmark[]): number {
  const handSpan = dist2(lm[WRIST], lm[MIDDLE_MCP])
  if (handSpan < 1e-5) return 1
  return dist2(lm[THUMB_TIP], lm[INDEX_TIP]) / handSpan
}

/** Midpoint of the pinch, i.e. where the fingers actually meet. Used as the cursor. */
export function pinchPoint(lm: NormalizedLandmark[]): { x: number; y: number } {
  return {
    x: (lm[THUMB_TIP].x + lm[INDEX_TIP].x) / 2,
    y: (lm[THUMB_TIP].y + lm[INDEX_TIP].y) / 2,
  }
}

/** Palm centre — steadier than any fingertip, so it is the anchor for open-palm steering. */
export function palmCentre(lm: NormalizedLandmark[]): { x: number; y: number } {
  const ids = [WRIST, INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP]
  let x = 0
  let y = 0
  for (const i of ids) {
    x += lm[i].x
    y += lm[i].y
  }
  return { x: x / ids.length, y: y / ids.length }
}

/**
 * How far the middle fingertip reaches from the wrist, relative to the wrist-to-knuckle
 * length. ~1.9 with the finger straight, ~1 curled into a fist.
 *
 * Used to tell a pinch from a fist: in a fist the thumb tip rests on the curled index
 * finger, close enough to its tip that pinchRatio alone reads it as a pinch.
 */
export function middleExtension(lm: NormalizedLandmark[]): number {
  const handSpan = dist2(lm[WRIST], lm[MIDDLE_MCP])
  if (handSpan < 1e-5) return 0
  return dist2(lm[WRIST], lm[MIDDLE_TIP]) / handSpan
}
