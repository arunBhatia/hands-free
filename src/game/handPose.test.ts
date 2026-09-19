import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { describe, expect, it } from 'vitest'
import { tuning } from '../cv/gestures'
import { middleExtension, pinchRatio } from '../cv/landmarks'
import { frame, type GestureName } from '../state/store'
import { MIN_MIDDLE_EXTENSION, classifyHand } from './handPose'
import { isGameKey } from './input'
import { SampleRecorder, type SampleLabel } from './recorder'

interface Sample {
  label: SampleLabel
  source: string
  note?: string
  gesture: GestureName
  landmarks: NormalizedLandmark[]
}

/** Every labelled hand in fixtures/: photos, plus any webcam sessions recorded in-game. */
const files = import.meta.glob<{ samples: Sample[] }>('./fixtures/*.json', {
  eager: true,
  import: 'default',
})
const samples = Object.values(files).flatMap((file) =>
  file.samples.map((sample) => ({
    ...sample,
    landmarks: sample.landmarks.map((p) => ({ ...p, visibility: p.visibility ?? 0 })),
  })),
)
const byLabel = (label: SampleLabel) => samples.filter((sample) => sample.label === label)
const name = (sample: Sample) => `${sample.source} (${sample.note ?? sample.gesture})`

/** What ingest() decides from a still hand: closed below PINCH_CLOSE. */
const pinchingFor = (landmarks: NormalizedLandmark[]) => pinchRatio(landmarks) < tuning.PINCH_CLOSE

/** Required distance between the threshold and the nearest real sample on either side. */
const MARGIN = 0.25

describe('fist vs pinch, on real recorded hands', () => {
  it('has real samples of every kind', () => {
    expect(byLabel('pinch').length).toBeGreaterThanOrEqual(5)
    expect(byLabel('fist').length).toBeGreaterThanOrEqual(1)
    expect(byLabel('other').length).toBeGreaterThanOrEqual(5)
  })

  it('jumps on every real pinch', () => {
    for (const sample of byLabel('pinch')) {
      const reading = classifyHand(sample.landmarks, pinchingFor(sample.landmarks), sample.gesture)
      expect(reading.pose, name(sample)).toBe('pinch')
    }
  })

  it('never jumps on a real fist, even though it reads as pinch-closed', () => {
    for (const sample of byLabel('fist')) {
      // The reason the guard exists: the thumb rests on the curled index finger.
      expect(pinchingFor(sample.landmarks), name(sample)).toBe(true)
      const reading = classifyHand(sample.landmarks, true, sample.gesture)
      expect(reading.pose, name(sample)).not.toBe('pinch')
      // Before the voted label arrives it must still not jump.
      expect(classifyHand(sample.landmarks, true, 'None').pose, name(sample)).toBe('none')
    }
  })

  it('never jumps on any other real hand', () => {
    for (const sample of byLabel('other')) {
      const reading = classifyHand(sample.landmarks, pinchingFor(sample.landmarks), sample.gesture)
      expect(reading.pose, name(sample)).not.toBe('pinch')
    }
  })

  it('keeps the guard threshold clear of real pinches and real fists', () => {
    for (const sample of byLabel('pinch')) {
      expect(middleExtension(sample.landmarks), name(sample)).toBeGreaterThan(
        MIN_MIDDLE_EXTENSION + MARGIN,
      )
    }
    for (const sample of byLabel('fist')) {
      expect(middleExtension(sample.landmarks), name(sample)).toBeLessThan(
        MIN_MIDDLE_EXTENSION - MARGIN,
      )
    }
  })

  it('treats a missing hand as neither', () => {
    expect(classifyHand(null, false, 'None').pose).toBe('none')
  })
})

describe('webcam recorder', () => {
  it('writes files the fixture tests can read back', () => {
    const pinch = byLabel('pinch')[0]
    const hand = frame.hands[0]
    Object.assign(hand, { present: true, landmarks: pinch.landmarks, gesture: 'None' })
    try {
      const recorder = new SampleRecorder()
      expect(recorder.record('pinch')).toBe(1)
      const [saved] = (JSON.parse(recorder.toJSON()) as { samples: Sample[] }).samples
      expect(saved.label).toBe('pinch')
      expect(classifyHand(saved.landmarks, pinchingFor(saved.landmarks), saved.gesture).pose).toBe(
        'pinch',
      )
    } finally {
      Object.assign(hand, { present: false, landmarks: null })
    }
  })
})

describe('keyboard', () => {
  const onButton = { closest: (selector: string) => (selector.includes('button') ? {} : null) }
  const onPage = { closest: () => null }

  it('leaves Space to a focused button', () => {
    expect(isGameKey({ code: 'Space', target: onButton as unknown as EventTarget })).toBe(false)
    expect(isGameKey({ code: 'Space', target: onPage as unknown as EventTarget })).toBe(true)
    expect(isGameKey({ code: 'Space', target: null })).toBe(true)
  })

  it('still takes the arrow keys anywhere', () => {
    expect(isGameKey({ code: 'ArrowUp', target: onButton as unknown as EventTarget })).toBe(true)
    expect(isGameKey({ code: 'ArrowDown', target: onButton as unknown as EventTarget })).toBe(true)
    expect(isGameKey({ code: 'KeyA', target: onPage as unknown as EventTarget })).toBe(false)
  })
})
