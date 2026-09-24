import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { describe, expect, it } from 'vitest'
import { tuning } from '../cv/gestures'
import { middleExtension, pinchRatio } from '../cv/landmarks'
import { frame, type GestureName } from '../state/store'
import { MIN_MIDDLE_EXTENSION, classifyHand } from './handPose'
import { HandInput, isGameKey } from './input'
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
      // And it ducks on the shape alone: waiting for the voted Closed_Fist label is
      // where most of the duck latency used to go.
      expect(classifyHand(sample.landmarks, true, 'None').pose, name(sample)).toBe('fist')
    }
  })

  it('neither jumps nor ducks on any other real hand', () => {
    for (const sample of byLabel('other')) {
      const reading = classifyHand(sample.landmarks, pinchingFor(sample.landmarks), sample.gesture)
      // Not merely 'not a pinch': now that a guarded pinch ducks, a curled non-fist
      // (pointing, thumbs up) drifting into the fist path would drop the dino mid-jump.
      expect(reading.pose, name(sample)).toBe('none')
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

describe('duck input', () => {
  const fistSample = byLabel('fist')[0]
  const pinchSample = byLabel('pinch')[0]

  /** Puts one hand in the shared frame for the body of a test, then clears it. */
  function withHand(
    sample: Sample,
    pinching: boolean,
    gesture: GestureName,
    body: (input: HandInput) => void,
  ) {
    const hand = frame.hands[0]
    Object.assign(hand, { present: true, landmarks: sample.landmarks, pinching, gesture })
    try {
      body(new HandInput())
    } finally {
      Object.assign(hand, { present: false, landmarks: null, pinching: false, gesture: 'None' })
    }
  }

  it('ducks on the fist shape after a short hold, with no voted label', () => {
    withHand(fistSample, true, 'None', (input) => {
      // The hold is there so a hand passing through a fist shape cannot drop a jump,
      // but it has to be short enough to beat the ~100-166 ms the vote would cost.
      expect(input.poll(0).duck).toBe(false)
      expect(input.poll(30).duck).toBe(false)
      expect(input.poll(50).duck).toBe(true)
      expect(input.poll(200).duck).toBe(true)
    })
  })

  it('takes a voted Closed_Fist immediately — voting is already the debounce', () => {
    withHand(fistSample, false, 'Closed_Fist', (input) => {
      expect(input.poll(0).duck).toBe(true)
    })
  })

  it('forgets the hold as soon as the fist opens', () => {
    const hand = frame.hands[0]
    const input = new HandInput()
    try {
      Object.assign(hand, {
        present: true,
        landmarks: fistSample.landmarks,
        pinching: true,
        gesture: 'None',
      })
      expect(input.poll(0).duck).toBe(false)
      // A flicker of fist, then an open hand: the hold restarts rather than carrying on.
      Object.assign(hand, { landmarks: pinchSample.landmarks, pinching: false })
      expect(input.poll(30).duck).toBe(false)
      Object.assign(hand, { landmarks: fistSample.landmarks, pinching: true })
      expect(input.poll(60).duck).toBe(false)
      expect(input.poll(110).duck).toBe(true)
    } finally {
      Object.assign(hand, { present: false, landmarks: null, pinching: false, gesture: 'None' })
    }
  })

  it('never ducks while the hand is pinching — a jump outranks it', () => {
    withHand(pinchSample, true, 'Closed_Fist', (input) => {
      const held = input.poll(0)
      expect(held.jumpPressed).toBe(true)
      expect(held.duck).toBe(false)
    })
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

  it('attaches nothing while KEYBOARD_CONTROLS is off', () => {
    // No window in this environment, so a listener would throw.
    expect(() => new HandInput().attach()()).not.toThrow()
  })
})
