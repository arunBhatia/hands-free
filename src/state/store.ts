import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

/**
 * Two stores, deliberately split by update frequency.
 *
 *   `frame` — mutated 30-60x/second by the CV loop and read directly inside
 *             requestAnimationFrame / useFrame. Plain mutable object, no reactivity.
 *   `ui`    — low-frequency discrete state (permission, load progress, the name of the
 *             active gesture), exposed to React via useSyncExternalStore.
 *
 * The split is the single most important decision in this codebase. Routing per-frame
 * landmark or scroll values through useState re-renders the tree 60x/second and the
 * whole thing visibly stutters — which, in a demo whose entire point is that the
 * interaction feels effortless, is fatal.
 */

export type GestureName =
  | 'None'
  | 'Closed_Fist'
  | 'Open_Palm'
  | 'Pointing_Up'
  | 'Thumb_Down'
  | 'Thumb_Up'
  | 'Victory'
  | 'ILoveYou'

/** Which gesture currently owns the scroll/zoom value. */
export type ControlMode = 'idle' | 'grab' | 'zoom'

export interface HandFrame {
  present: boolean
  /** Smoothed, mirrored, 0..1 in image space. Origin top-left. */
  x: number
  y: number
  /** Scale-invariant pinch openness; see pinchRatio(). */
  pinch: number
  /** Debounced pinch state, with hysteresis. */
  pinching: boolean
  /** Debounced canned gesture. */
  gesture: GestureName
  score: number
  /** 'Left' | 'Right' as reported (already accounts for the mirrored preview). */
  handedness: string
  /** Raw landmarks for the skeleton overlay — NOT mirrored, drawn into a flipped canvas. */
  landmarks: NormalizedLandmark[] | null
}

function emptyHand(): HandFrame {
  return {
    present: false,
    x: 0.5,
    y: 0.5,
    pinch: 1,
    pinching: false,
    gesture: 'None',
    score: 0,
    handedness: '',
    landmarks: null,
  }
}

export const frame = {
  /** Damped current scroll offset in px. What the DOM actually renders at. */
  scroll: 0,
  /** Where scroll is heading. Gestures write here; the motion loop chases it. */
  scrollTarget: 0,
  maxScroll: 1,

  zoom: 1,
  zoomTarget: 1,

  /** Scroll offset of the top of each section, filled in by the layout on resize. */
  sectionOffsets: [] as number[],

  hands: [emptyHand(), emptyHand()] as [HandFrame, HandFrame],
  handCount: 0,
  mode: 'idle' as ControlMode,

  /** Cursor the 3D scene reacts to, in 0..1 image space, already mirrored. */
  cursorX: 0.5,
  cursorY: 0.5,
  /** 0..1 — fades the scene's hand interaction in and out instead of popping. */
  cursorStrength: 0,
  /** 0..1 — how closed the driving hand's pinch is. Tightens the particle repulsion. */
  cursorPinch: 0,

  renderFps: 0,
  cvFps: 0,
}

export type Frame = typeof frame

// ---------------------------------------------------------------------------
// Low-frequency React-facing store
// ---------------------------------------------------------------------------

export type Status = 'idle' | 'requesting' | 'loading' | 'running' | 'error' | 'unsupported'

export interface UiState {
  status: Status
  /** 0..1 while the model downloads. */
  progress: number
  error: string | null
  /** 'GPU' | 'CPU' — which MediaPipe delegate we ended up on. */
  delegate: string
  handCount: number
  gesture: GestureName
  mode: ControlMode
  renderFps: number
  cvFps: number
  /** Index of the section currently filling the viewport. */
  section: number
  showDebug: boolean
  /** True once the user has driven anything with a gesture — used to retire the hint. */
  hasGestured: boolean
}

let uiState: UiState = {
  status: 'idle',
  progress: 0,
  error: null,
  delegate: '',
  handCount: 0,
  gesture: 'None',
  mode: 'idle',
  renderFps: 0,
  cvFps: 0,
  section: 0,
  showDebug: false,
  hasGestured: false,
}

const listeners = new Set<() => void>()

export function subscribeUi(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getUi(): UiState {
  return uiState
}

/**
 * Replaces the snapshot only when a value actually changed, so useSyncExternalStore
 * does not re-render on every call. The motion loop pushes fps/mode here every frame
 * and the vast majority of those calls are no-ops.
 */
export function setUi(patch: Partial<UiState>): void {
  let changed = false
  for (const key of Object.keys(patch) as Array<keyof UiState>) {
    if (patch[key] !== undefined && uiState[key] !== patch[key]) {
      changed = true
      break
    }
  }
  if (!changed) return
  uiState = { ...uiState, ...patch }
  for (const listener of listeners) listener()
}
