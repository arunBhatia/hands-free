export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/** A sprite-local box moved to where the sprite is drawn. */
export function place(box: Box, x: number, y: number): Box {
  return { x: box.x + x, y: box.y + y, w: box.w, h: box.h }
}

export interface Placed {
  x: number
  y: number
  width: number
  height: number
  hitboxes: readonly Box[]
}

/**
 * Two-stage test, as in Chrome: a cheap check on the outer bounds (shrunk by a pixel
 * each side, so grazing edges do not count), then the detailed hitboxes only if that
 * passes. Returns the pair that collided, for the debug overlay.
 */
export function collide(a: Placed, b: Placed): [Box, Box] | null {
  const outerA = { x: a.x + 1, y: a.y + 1, w: a.width - 2, h: a.height - 2 }
  const outerB = { x: b.x + 1, y: b.y + 1, w: b.width - 2, h: b.height - 2 }
  if (!overlaps(outerA, outerB)) return null

  for (const boxA of a.hitboxes) {
    const placedA = place(boxA, a.x, a.y)
    for (const boxB of b.hitboxes) {
      const placedB = place(boxB, b.x, b.y)
      if (overlaps(placedA, placedB)) return [placedA, placedB]
    }
  }
  return null
}
