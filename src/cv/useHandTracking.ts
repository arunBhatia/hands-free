import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { ingest } from './gestures'
import { createRecogniser, openCamera, startInferenceLoop } from './recognizer'
import { frame, setUi } from '../state/store'

/**
 * Camera + model lifecycle, shared by every screen that reads `frame.hands`.
 *
 * Start is async and can be overtaken by a stop (or a second start) at any await, so
 * each attempt takes a session number and bails out — releasing whatever it already
 * opened — if it is no longer the current one when it resumes.
 */
export function useHandTracking(videoRef: RefObject<HTMLVideoElement | null>) {
  const cleanupRef = useRef<(() => void) | null>(null)
  const sessionRef = useRef(0)

  const stop = useCallback(() => {
    sessionRef.current += 1
    cleanupRef.current?.()
    cleanupRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    frame.handCount = 0
    frame.mode = 'idle'
    frame.cursorStrength = 0
    frame.cursorPinch = 0
    for (const hand of frame.hands) {
      hand.present = false
      hand.landmarks = null
    }
    setUi({
      status: 'idle',
      error: null,
      progress: 0,
      delegate: '',
      handCount: 0,
      gesture: 'None',
      mode: 'idle',
      cvFps: 0,
    })
  }, [videoRef])

  const start = useCallback(async () => {
    if (!videoRef.current) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setUi({ status: 'unsupported', error: 'This browser does not expose webcam access.' })
      return
    }

    cleanupRef.current?.()
    cleanupRef.current = null
    const session = ++sessionRef.current
    setUi({ status: 'requesting', error: null, progress: 0 })

    try {
      const stream = await openCamera(videoRef.current)
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      setUi({ status: 'loading' })
      const recogniser = await createRecogniser((progress) => setUi({ progress }))
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        recogniser.recogniser.close()
        return
      }
      cleanupRef.current = () => {
        stream.getTracks().forEach((track) => track.stop())
        recogniser.recogniser.close()
      }
      const stopLoop = startInferenceLoop(videoRef.current, recogniser.recogniser, ingest)
      cleanupRef.current = () => {
        stopLoop()
        stream.getTracks().forEach((track) => track.stop())
        recogniser.recogniser.close()
      }
      setUi({ status: 'running', delegate: recogniser.delegate, progress: 1 })
    } catch (err) {
      if (session !== sessionRef.current) return
      cleanupRef.current?.()
      cleanupRef.current = null
      setUi({
        status: 'error',
        error: err instanceof Error ? err.message : 'Camera or model startup failed.',
      })
    }
  }, [videoRef])

  useEffect(() => () => stop(), [stop])

  return { start, stop }
}
