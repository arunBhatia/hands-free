import type { GestureRecognizerResult } from '@mediapipe/tasks-vision'
import { OneEuro } from './oneEuro'
import { palmCentre, pinchPoint, pinchRatio } from './landmarks'
import { frame, type ControlMode, type GestureName } from '../state/store'

/**
 * Turns raw per-frame model output into something you can actually steer a page with.
 *
 * Three problems sit between the two, and each needs its own fix:
 *
 *   Jitter      — landmarks wander even on a still hand.       → One Euro filter.
 *   Flicker     — the classifier flips Open_Palm/None between  → K-of-N voting window.
 *                 frames, which makes the page stutter.
 *   Scale       — pinch distance depends on how far away you   → ratio against hand size,
 *                 are sitting.                                   see pinchRatio().
 *
 * Thresholds below are starting points, not measurements. They were chosen from the
 * geometry of the landmark topology, not tuned against a camera — press D in the app to
 * see live values and adjust. The two pinch constants are the ones most likely to need it.
 */

/** Pinch ratio below this closes the pinch… */
const PINCH_CLOSE = 0.4
/** …and it only reopens above this. The gap is deliberate: a single threshold chatters. */
const PINCH_OPEN = 0.55

const GESTURE_WINDOW = 5
const GESTURE_QUORUM = 3
const MIN_GESTURE_SCORE = 0.45

/** Full-frame hand travel scrolls this many viewports in grab mode. */
const GRAB_VIEWPORTS = 2.6

const ZOOM_MIN = 0.55
const ZOOM_MAX = 2.6

class HandTracker {
  readonly filterX = new OneEuro()
  readonly filterY = new OneEuro()
  private history: GestureName[] = []
  private confirmed: GestureName = 'None'
  pinching = false
  lastTimestamp = 0

  vote(candidate: GestureName): GestureName {
    this.history.push(candidate)
    if (this.history.length > GESTURE_WINDOW) this.history.shift()

    const counts = new Map<GestureName, number>()
    for (const name of this.history) counts.set(name, (counts.get(name) ?? 0) + 1)

    let best: GestureName = 'None'
    let bestCount = 0
    for (const [name, count] of counts) {
      if (count > bestCount) {
        best = name
        bestCount = count
      }
    }
    // Below quorum we keep whatever was last confirmed rather than falling to None,
    // so a couple of bad frames mid-gesture do not drop the interaction.
    if (bestCount >= GESTURE_QUORUM) this.confirmed = best
    return this.confirmed
  }

  reset() {
    this.filterX.reset()
    this.filterY.reset()
    this.history = []
    this.confirmed = 'None'
    this.pinching = false
  }
}

const trackers: [HandTracker, HandTracker] = [new HandTracker(), new HandTracker()]

// Anchors captured on mode entry, so grab and zoom are both relative gestures.
let grabAnchorY = 0
let grabAnchorScroll = 0
let zoomAnchorDistance = 0
let zoomAnchorValue = 1
let previousMode: ControlMode = 'idle'

let cvFrameCount = 0
let cvWindowStart = 0

/**
 * Vision → state. Called once per decoded camera frame.
 *
 * Hands are keyed to slots by handedness so each One Euro filter stays attached to the
 * same physical hand across frames; swapping them would inject a large false velocity
 * and the filter would smear the two together. (We use the label purely as a stable key
 * — MediaPipe's Left/Right semantics against a mirrored selfie feed are ambiguous, and
 * nothing here depends on which is which.)
 */
export function ingest(result: GestureRecognizerResult, timestamp: number): void {
  cvFrameCount++
  if (cvWindowStart === 0) cvWindowStart = timestamp
  else if (timestamp - cvWindowStart >= 500) {
    frame.cvFps = Math.round((cvFrameCount * 1000) / (timestamp - cvWindowStart))
    cvFrameCount = 0
    cvWindowStart = timestamp
  }

  const detected = result.landmarks?.length ?? 0
  const slotTaken = [false, false]

  for (let i = 0; i < detected; i++) {
    const landmarks = result.landmarks[i]
    if (!landmarks || landmarks.length < 21) continue

    const label = result.handedness?.[i]?.[0]?.categoryName ?? ''
    let slot = label === 'Left' ? 0 : 1
    if (slotTaken[slot]) slot = slot === 0 ? 1 : 0
    if (slotTaken[slot]) continue
    slotTaken[slot] = true

    const tracker = trackers[slot]
    const hand = frame.hands[slot]

    // A hand that has been away for a while is a new hand; a stale filter state would
    // otherwise drag the cursor in from wherever it last saw one.
    const gap = timestamp - tracker.lastTimestamp
    if (!hand.present || gap > 300) tracker.reset()
    const dt = gap > 0 && gap < 300 ? gap / 1000 : 1 / 30
    tracker.lastTimestamp = timestamp

    const ratio = pinchRatio(landmarks)
    tracker.pinching = tracker.pinching ? ratio < PINCH_OPEN : ratio < PINCH_CLOSE

    // Pinching: track where the fingers meet — that is where the user thinks they are
    // holding the page. Open hand: track the palm, which is far steadier than any tip.
    const anchor = tracker.pinching ? pinchPoint(landmarks) : palmCentre(landmarks)

    const top = result.gestures?.[i]?.[0]
    const candidate: GestureName =
      top && top.score >= MIN_GESTURE_SCORE ? (top.categoryName as GestureName) : 'None'

    hand.present = true
    // Mirror x: the preview is flipped, so without this moving your hand right moves
    // the scene left and the whole thing feels broken.
    hand.x = tracker.filterX.filter(1 - anchor.x, dt)
    hand.y = tracker.filterY.filter(anchor.y, dt)
    hand.pinch = ratio
    hand.pinching = tracker.pinching
    hand.gesture = tracker.vote(candidate)
    hand.score = top?.score ?? 0
    hand.handedness = label
    hand.landmarks = landmarks
  }

  for (let slot = 0; slot < 2; slot++) {
    if (slotTaken[slot]) continue
    const hand = frame.hands[slot]
    if (hand.present) {
      hand.present = false
      hand.landmarks = null
      hand.gesture = 'None'
      hand.pinching = false
      trackers[slot].reset()
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** Frame-rate independent exponential approach. */
function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt))
}

function distanceBetween(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by)
}

/**
 * State → scroll and zoom. Called once per animation frame.
 *
 * Two gestures, both relative to where the pinch started: one pinch drags the page,
 * two pinches scale it. Everything else the recogniser can name is ignored here — the
 * demo is easier to walk up to with one thing to learn per hand.
 */
export function updateControl(dt: number, viewportHeight: number): void {
  const hands = frame.hands.filter((hand) => hand.present)
  frame.handCount = hands.length

  const pinching = hands.filter((hand) => hand.pinching)

  let mode: ControlMode = 'idle'
  if (pinching.length >= 2) mode = 'zoom'
  else if (pinching.length === 1) mode = 'grab'

  // The hand the 3D scene follows: whichever one is doing the work.
  const driver = pinching[0] ?? hands[0] ?? null

  if (mode !== previousMode) {
    if (mode === 'grab' && driver) {
      grabAnchorY = driver.y
      grabAnchorScroll = frame.scrollTarget
    }
    if (mode === 'zoom' && pinching.length >= 2) {
      zoomAnchorDistance = distanceBetween(
        pinching[0].x,
        pinching[0].y,
        pinching[1].x,
        pinching[1].y,
      )
      zoomAnchorValue = frame.zoomTarget
    }
    previousMode = mode
  }

  switch (mode) {
    case 'grab': {
      if (driver) {
        // Hand up → scroll down, matching the touchscreen drag metaphor.
        frame.scrollTarget = grabAnchorScroll - (driver.y - grabAnchorY) * viewportHeight * GRAB_VIEWPORTS
      }
      break
    }
    case 'zoom': {
      if (pinching.length >= 2 && zoomAnchorDistance > 1e-3) {
        const current = distanceBetween(
          pinching[0].x,
          pinching[0].y,
          pinching[1].x,
          pinching[1].y,
        )
        frame.zoomTarget = clamp(
          zoomAnchorValue * (current / zoomAnchorDistance),
          ZOOM_MIN,
          ZOOM_MAX,
        )
      }
      break
    }
    case 'idle':
      break
  }

  frame.scrollTarget = clamp(frame.scrollTarget, 0, frame.maxScroll)

  frame.mode = mode

  // Cursor for the 3D scene. Strength ramps so the particle field does not pop.
  if (driver) {
    frame.cursorX = driver.x
    frame.cursorY = driver.y
    frame.cursorStrength = approach(frame.cursorStrength, 1, 7, dt)
    frame.cursorPinch = approach(frame.cursorPinch, driver.pinching ? 1 : 0, 8, dt)
  } else {
    frame.cursorStrength = approach(frame.cursorStrength, 0, 4, dt)
    frame.cursorPinch = approach(frame.cursorPinch, 0, 4, dt)
  }
}

export function jumpToNextSection(): void {
  const offsets = frame.sectionOffsets
  const next = offsets.find((offset) => offset > frame.scrollTarget + 24)
  frame.scrollTarget = clamp(next ?? frame.maxScroll, 0, frame.maxScroll)
}

export function jumpToPreviousSection(): void {
  const offsets = frame.sectionOffsets
  let previous = 0
  for (const offset of offsets) {
    if (offset < frame.scrollTarget - 24) previous = offset
  }
  frame.scrollTarget = previous
}

export const tuning = { PINCH_CLOSE, PINCH_OPEN }
