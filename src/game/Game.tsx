import { useEffect, useRef, useSyncExternalStore } from 'react'
import { CameraLayer } from '../components/CameraLayer'
import { KEYBOARD_CONTROLS } from '../config'
import { useHandTracking } from '../cv/useHandTracking'
import { frame, getUi, setUi, subscribeUi, type UiState } from '../state/store'
import { HandInput } from './input'
import { RECORDER_KEYS, SampleRecorder } from './recorder'
import { draw } from './render'
import { Runner } from './runner'

const HIGH_SCORE_KEY = 'hands-free:trex-high-score'

function useUiStore(): UiState {
  return useSyncExternalStore(subscribeUi, getUi, getUi)
}

function loadHighScore(): number {
  try {
    return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0
  } catch {
    return 0
  }
}

function saveHighScore(score: number): void {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(score))
  } catch {
    // Private mode or storage disabled: the high score just does not persist.
  }
}

/**
 * Runs the game loop outside React: input is polled, the runner advanced and the canvas
 * drawn once per animation frame. React only renders the frame around it.
 */
function GameCanvas({ debugRef }: { debugRef: React.RefObject<HTMLPreElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const runner = new Runner(Math.random, loadHighScore())
    const input = new HandInput()
    const detach = input.attach()
    let savedHigh = runner.highScore
    let raf = 0
    let last = performance.now()
    let fpsFrames = 0
    let fpsStart = last
    let debugAt = 0

    const recorder = new SampleRecorder()
    const onKey = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (key === 'd') setUi({ showDebug: !getUi().showDebug })
      if (!getUi().showDebug || event.repeat) return
      // Calibration capture, see recorder.ts.
      if (key in RECORDER_KEYS) recorder.record(RECORDER_KEYS[key])
      if (key === 's') recorder.download()
    }
    window.addEventListener('keydown', onKey)

    const tick = (now: number) => {
      const elapsed = now - last
      last = now
      runner.advance(elapsed, input.poll())

      if (runner.highScore > savedHigh) {
        savedHigh = runner.highScore
        saveHighScore(savedHigh)
      }

      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        const rect = canvas.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        const width = Math.round(rect.width * dpr)
        const height = Math.round(rect.height * dpr)
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
        }
        const handsOn = getUi().status === 'running'
        draw(ctx, runner, {
          showHitboxes: getUi().showDebug,
          startHint: handsOn
            ? 'pinch to start'
            : KEYBOARD_CONTROLS
              ? 'start the camera, or press space'
              : 'start the camera to play',
          restartHint: handsOn || !KEYBOARD_CONTROLS ? 'pinch to restart' : 'press space to restart',
        })
      }

      fpsFrames++
      if (now - fpsStart > 500) {
        frame.renderFps = Math.round((fpsFrames * 1000) / (now - fpsStart))
        fpsStart = now
        fpsFrames = 0
      }

      // Live tuning values change every frame; write them straight to the DOM a few
      // times a second rather than routing them through React.
      const debug = debugRef.current
      if (debug && now - debugAt > 100) {
        debugAt = now
        const d = input.debug
        const hands = frame.hands.filter((hand) => hand.present)
        debug.textContent = [
          `hands ${hands.length}`,
          `gesture ${hands.map((hand) => hand.gesture).join('/') || '-'}`,
          `pinch ${d.pinchRatio.toFixed(2)}`,
          `middle ${d.middleExtension.toFixed(2)}`,
          `guard ${d.guarded}`,
          d.pinching ? 'JUMP' : d.fist ? 'DUCK' : 'run',
          `speed ${runner.speed.toFixed(2)}`,
          `cv ${frame.cvFps} fps`,
          `render ${frame.renderFps} fps`,
          `delegate ${getUi().delegate || '-'}`,
          `rec pinch ${recorder.count('pinch')} fist ${recorder.count('fist')} other ${recorder.count('other')} (P/F/O, S saves)`,
        ].join('   ')
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      detach()
      window.removeEventListener('keydown', onKey)
    }
  }, [debugRef])

  return <canvas ref={canvasRef} className="game-canvas" aria-label="T-Rex runner" />
}

function GamePanel({ onStart, onStop }: { onStart: () => void; onStop: () => void }) {
  const ui = useUiStore()
  const canStart = ui.status === 'idle' || ui.status === 'error' || ui.status === 'unsupported'
  const canStop = ui.status === 'requesting' || ui.status === 'loading' || ui.status === 'running'
  return (
    <aside className="control-panel">
      <div className="brand">Hands Free</div>
      <div className="status-row">
        <span className={`status-dot ${ui.status}`} />
        <span>{ui.status === 'running' ? 'hands tracking' : ui.status}</span>
      </div>
      {canStart ? (
        <button className="start-button" onClick={onStart}>
          Start camera
        </button>
      ) : null}
      {canStop ? (
        <button className="stop-button" onClick={onStop}>
          Stop camera
        </button>
      ) : null}
      {ui.status === 'loading' ? (
        <div className="meter" aria-label="Model loading progress">
          <span style={{ width: `${Math.round(ui.progress * 100)}%` }} />
        </div>
      ) : null}
      <div className="gesture-grid">
        <span>pinch</span>
        <b>jump</b>
        <span>hold pinch</span>
        <b>jump higher</b>
        <span>fist</span>
        <b>duck</b>
        <span>pinch after crash</span>
        <b>restart</b>
        {KEYBOARD_CONTROLS ? (
          <>
            <span>keys</span>
            <b>space / ↓</b>
          </>
        ) : null}
      </div>
      <p className="panel-note">Pinch thumb to index with your other fingers straight, like an OK sign.</p>
      <a className="switch-link" href="#">
        ← Scroll demo
      </a>
      {ui.error ? <p className="error">{ui.error}</p> : null}
    </aside>
  )
}

export default function Game() {
  const ui = useUiStore()
  const videoRef = useRef<HTMLVideoElement>(null)
  const debugRef = useRef<HTMLPreElement>(null)
  const { start, stop } = useHandTracking(videoRef)

  return (
    <div className="game">
      <div className="game-stage">
        <p className="kicker">hands-free / t-rex</p>
        <GameCanvas debugRef={debugRef} />
        <pre ref={debugRef} className={ui.showDebug ? 'game-debug' : 'game-debug hidden'} />
      </div>
      <CameraLayer videoRef={videoRef} />
      <GamePanel onStart={start} onStop={stop} />
    </div>
  )
}
