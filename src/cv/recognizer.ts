import {
  FilesetResolver,
  GestureRecognizer,
  type GestureRecognizerResult,
} from '@mediapipe/tasks-vision'

const WASM_DIR = '/mediapipe/wasm'
const MODEL_URL = '/models/gesture_recognizer.task'

export interface Recogniser {
  recogniser: GestureRecognizer
  delegate: 'GPU' | 'CPU'
}

/** Streams the model so the onboarding screen can show real progress instead of a spinner. */
async function downloadModel(onProgress: (fraction: number) => void): Promise<Uint8Array> {
  const res = await fetch(MODEL_URL)
  if (!res.ok) {
    throw new Error(
      `Could not load the gesture model (HTTP ${res.status}). Run \`npm run predev\` to stage it.`,
    )
  }
  const total = Number(res.headers.get('content-length') ?? 0)
  if (!res.body || !total) {
    onProgress(0.5)
    const buf = new Uint8Array(await res.arrayBuffer())
    onProgress(1)
    return buf
  }

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.byteLength
    onProgress(Math.min(0.999, received / total))
  }

  const out = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  onProgress(1)
  return out
}

/**
 * Builds the recogniser, preferring the GPU delegate and falling back to CPU.
 *
 * The fallback is not defensive padding. VisionTaskOptions.canvas is documented as
 * initialising its own WebGL context and throwing if that fails, and this page already
 * has a live three.js context — so on machines that are tight on GPU contexts the GPU
 * delegate is exactly the thing that breaks. We hand MediaPipe a dedicated detached
 * canvas so it can never collide with the renderer's, and drop to CPU if it still fails.
 */
export async function createRecogniser(
  onProgress: (fraction: number) => void,
): Promise<Recogniser> {
  const [fileset, modelAssetBuffer] = await Promise.all([
    FilesetResolver.forVisionTasks(WASM_DIR),
    downloadModel(onProgress),
  ])

  const common = {
    runningMode: 'VIDEO' as const,
    numHands: 2,
    // Nudged above the 0.5 default: a demo is better off dropping a marginal frame
    // than acting on a phantom hand in whatever the room's lighting turns out to be.
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
  }

  try {
    const recogniser = await GestureRecognizer.createFromOptions(fileset, {
      ...common,
      baseOptions: { modelAssetBuffer, delegate: 'GPU' },
      canvas: document.createElement('canvas'),
    })
    return { recogniser, delegate: 'GPU' }
  } catch (gpuError) {
    console.warn('[cv] GPU delegate unavailable, retrying on CPU', gpuError)
    const recogniser = await GestureRecognizer.createFromOptions(fileset, {
      ...common,
      baseOptions: { modelAssetBuffer, delegate: 'CPU' },
    })
    return { recogniser, delegate: 'CPU' }
  }
}

/**
 * 480p at 60 fps, not 720p at 30.
 *
 * The model resizes to 192x192 internally, so 720p buys no accuracy at desk distance and
 * costs decode and GPU-upload time on every frame. The frame rate is what players feel:
 * where the webcam can do 60, capture latency halves (33 ms -> 16.7 ms). Both are `ideal`,
 * so a camera that cannot manage either still opens at whatever it has.
 */
export async function openCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 60, max: 60 },
      facingMode: 'user',
    },
    audio: false,
  })
  video.srcObject = stream
  await video.play()
  return stream
}

/**
 * Drives inference off the video's own frame cadence.
 *
 * requestVideoFrameCallback fires once per decoded frame, so we never run inference
 * twice on the same image (which rAF would, at 60 Hz against a 30 fps camera) and never
 * miss one. Timestamps come from performance.now() rather than mediaTime because
 * recognizeForVideo throws on a non-increasing timestamp and performance.now() is
 * monotonic by definition; the guard below covers the coarse-clock edge case.
 */
export function startInferenceLoop(
  video: HTMLVideoElement,
  recogniser: GestureRecognizer,
  onResult: (result: GestureRecognizerResult, timestamp: number) => void,
): () => void {
  let cancelled = false
  let lastTimestamp = -1
  let handle = 0

  const hasFrameCallback = typeof video.requestVideoFrameCallback === 'function'

  const tick = () => {
    if (cancelled) return

    if (video.readyState >= 2 && video.videoWidth > 0) {
      const timestamp = performance.now()
      if (timestamp > lastTimestamp) {
        lastTimestamp = timestamp
        try {
          onResult(recogniser.recognizeForVideo(video, timestamp), timestamp)
        } catch (err) {
          // A single bad frame (e.g. right after the tab regains focus) should not
          // take the loop down with it.
          console.warn('[cv] frame dropped', err)
        }
      }
    }

    schedule()
  }

  const schedule = () => {
    if (cancelled) return
    if (hasFrameCallback) {
      handle = video.requestVideoFrameCallback(tick)
    } else {
      handle = requestAnimationFrame(tick)
    }
  }

  schedule()

  return () => {
    cancelled = true
    if (hasFrameCallback) video.cancelVideoFrameCallback?.(handle)
    else cancelAnimationFrame(handle)
  }
}
