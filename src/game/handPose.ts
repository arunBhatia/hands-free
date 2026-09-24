import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { middleExtension, pinchRatio } from '../cv/landmarks'
import type { GestureName } from '../state/store'

/**
 * A pinch only counts as a jump while the middle finger is straight — the OK-sign pinch.
 *
 * Why the guard exists: on MediaPipe's own fist photo the thumb rests on the curled index
 * finger and pinchRatio() reads 0.16, far inside the pinch threshold. Without this check
 * every fist would be a jump. A hand that trips the guard is a fist, and is reported as
 * one straight away — waiting for the classifier's voted Closed_Fist label costs 100-166 ms
 * on a duck, which is most of the lag players feel.
 *
 * Why 1.4, measured on the real hands in fixtures/ (photos run through this app's model):
 *   real pinches (7 OK signs)        middle 1.76–2.01, pinch ratio 0.02–0.13
 *   straight-fingered non-pinches    middle 1.93–2.32
 *   curled (fist, thumb up, point)   middle 0.68–0.80
 * 1.4 leaves at least 0.36 either side. handPose.test.ts enforces a 0.25 margin against
 * every sample, including webcam sessions recorded in-game (D panel, P/F/O, S) and saved
 * into fixtures/ — which is how to extend this to your own camera and hands.
 */
export const MIN_MIDDLE_EXTENSION = 1.4

export type HandPose = 'pinch' | 'fist' | 'none'

export interface PoseReading {
  pose: HandPose
  pinchRatio: number
  middleExtension: number
  /**
   * Pinch-shaped, but the middle finger was curled: a fist, read from geometry alone
   * rather than from the voted label. Callers debounce this — see FIST_HOLD_MS.
   */
  guarded: boolean
}

/**
 * One hand → the game's view of it. Pure, so the fist-vs-pinch boundary is testable
 * against recorded landmarks.
 *
 * `pinching` is the hysteresis state from ingest(); `gesture` is the voted label.
 */
export function classifyHand(
  landmarks: NormalizedLandmark[] | null,
  pinching: boolean,
  gesture: GestureName,
): PoseReading {
  const ratio = landmarks ? pinchRatio(landmarks) : 1
  const extension = landmarks ? middleExtension(landmarks) : 0
  const guarded = pinching && extension < MIN_MIDDLE_EXTENSION

  let pose: HandPose = 'none'
  if (pinching && !guarded) pose = 'pinch'
  else if (guarded || gesture === 'Closed_Fist') pose = 'fist'

  return { pose, pinchRatio: ratio, middleExtension: extension, guarded }
}
