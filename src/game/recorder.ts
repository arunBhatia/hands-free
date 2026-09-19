import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { middleExtension, pinchRatio } from '../cv/landmarks'
import { frame, type GestureName } from '../state/store'

export type SampleLabel = 'pinch' | 'fist' | 'other'

/** One labelled hand. Same shape as the files in fixtures/, so a recording drops straight in. */
export interface HandSample {
  label: SampleLabel
  note: string
  source: string
  gesture: GestureName
  landmarks: NormalizedLandmark[]
  /** Informational: what the app measured at capture time. Tests recompute from landmarks. */
  pinchRatio: number
  middleExtension: number
}

export const RECORDER_KEYS: Record<string, SampleLabel> = { p: 'pinch', f: 'fist', o: 'other' }

/**
 * Captures real webcam hands for the fist-vs-pinch tests.
 *
 * With the D panel open: hold a pose with one hand and press P (pinch), F (fist) or
 * O (anything that must not jump — half-curled grips, relaxed hands) with the other.
 * S downloads the samples; save the file into src/game/fixtures/ and `npm test` checks
 * every sample against the current thresholds.
 */
export class SampleRecorder {
  samples: HandSample[] = []
  private readonly session = new Date().toISOString()

  /** Records every hand currently in view. Returns how many were captured. */
  record(label: SampleLabel): number {
    let added = 0
    for (const hand of frame.hands) {
      if (!hand.present || !hand.landmarks) continue
      const landmarks = hand.landmarks.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: 0 }))
      this.samples.push({
        label,
        note: `webcam, ${hand.handedness || 'unknown'} hand`,
        source: `webcam session ${this.session}`,
        gesture: hand.gesture,
        landmarks,
        pinchRatio: +pinchRatio(landmarks).toFixed(3),
        middleExtension: +middleExtension(landmarks).toFixed(3),
      })
      added++
    }
    return added
  }

  count(label: SampleLabel): number {
    return this.samples.filter((sample) => sample.label === label).length
  }

  toJSON(): string {
    return JSON.stringify(
      {
        _about:
          'Real webcam hands recorded in the game (D panel, P/F/O). Landmarks are exactly what the app received from the camera.',
        samples: this.samples,
      },
      null,
      1,
    )
  }

  download(): void {
    if (this.samples.length === 0) return
    const blob = new Blob([this.toJSON()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `webcam-hands-${this.session.replace(/[:.]/g, '-')}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
}
