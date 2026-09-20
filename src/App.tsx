import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { AdditiveBlending, Color, InstancedMesh, MathUtils, Object3D, Vector3 } from 'three'
import { CameraLayer } from './components/CameraLayer'
import { KEYBOARD_CONTROLS } from './config'
import { jumpToNextSection, jumpToPreviousSection, updateControl } from './cv/gestures'
import { useHandTracking } from './cv/useHandTracking'
import { frame, getUi, setUi, subscribeUi, type ControlMode, type UiState } from './state/store'

const sections = [
  {
    kicker: '01 / intent',
    title: 'A page that listens to your hands.',
    body: 'Pinch your fingers together and move your hand up or down to scroll. Pinch with both hands and move them apart to zoom the whole composition.',
    accent: 'Two gestures. No keys, no mouse.',
  },
  {
    kicker: '02 / motion',
    title: 'The interface becomes a material.',
    body: 'Scroll is no longer a command hidden inside a wheel. It becomes distance, pressure, and rhythm you can perform in the air.',
    accent: 'Design starts to feel choreographed.',
  },
  {
    kicker: '03 / scale',
    title: 'Zoom as a human-scale gesture.',
    body: 'Two hands create a live lens over the page. The visual system responds with depth, glow, and parallax so the gesture feels visible.',
    accent: 'Pinch with both hands, then pull apart.',
  },
  {
    kicker: '04 / future',
    title: 'Hands-free browsing is a design medium.',
    body: 'The overnight demo is intentionally minimal: robust primitives first, theatrical polish second, and everything running locally in the browser.',
    accent: 'Show the future while it is still small enough to hold.',
  },
]

function useUiStore(): UiState {
  return useSyncExternalStore(subscribeUi, getUi, getUi)
}

function modeLabel(mode: ControlMode): string {
  switch (mode) {
    case 'grab':
      return 'pinch scroll'
    case 'zoom':
      return 'two-hand zoom'
    default:
      return 'waiting'
  }
}

function SceneParticles() {
  const mesh = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const color = useMemo(() => new Color(), [])
  const points = useMemo(() => {
    const out: Array<{ base: Vector3; phase: number; size: number; tint: number }> = []
    for (let i = 0; i < 760; i++) {
      const ring = Math.sqrt(Math.random()) * 7.2
      const theta = Math.random() * Math.PI * 2
      out.push({
        base: new Vector3(Math.cos(theta) * ring, (Math.random() - 0.5) * 5.2, Math.sin(theta) * ring),
        phase: Math.random() * Math.PI * 2,
        size: MathUtils.randFloat(0.018, 0.072),
        tint: Math.random(),
      })
    }
    return out
  }, [])

  useEffect(() => {
    if (!mesh.current) return
    points.forEach((point, i) => {
      color.setHSL(0.45 + point.tint * 0.2, 0.72, 0.58)
      mesh.current!.setColorAt(i, color)
    })
    mesh.current.instanceColor!.needsUpdate = true
  }, [color, points])

  useFrame(({ clock, camera }) => {
    if (!mesh.current) return
    const t = clock.elapsedTime
    const cx = (frame.cursorX - 0.5) * 8
    const cy = (0.5 - frame.cursorY) * 5
    const strength = frame.cursorStrength
    const pinch = frame.cursorPinch
    const scroll = frame.scroll / Math.max(frame.maxScroll, 1)
    const zoom = frame.zoom

    camera.position.x = MathUtils.lerp(camera.position.x, (frame.cursorX - 0.5) * 1.1 * strength, 0.05)
    camera.position.y = MathUtils.lerp(camera.position.y, (0.5 - frame.cursorY) * 0.7 * strength, 0.05)
    camera.position.z = MathUtils.lerp(camera.position.z, 8.2 / zoom, 0.04)
    camera.lookAt(0, 0, 0)

    points.forEach((point, i) => {
      const wave = Math.sin(t * 0.55 + point.phase + scroll * 5)
      const x = point.base.x + Math.sin(t * 0.23 + point.phase) * 0.22
      const y = point.base.y + wave * 0.18
      const z = point.base.z + Math.cos(t * 0.31 + point.phase) * 0.35 + scroll * 2.6
      const dx = x - cx
      const dy = y - cy
      const dist = Math.max(Math.hypot(dx, dy), 0.001)
      const repel = strength * (0.55 + pinch * 1.3) / (dist * dist + 0.25)

      dummy.position.set(x + (dx / dist) * repel, y + (dy / dist) * repel, z)
      dummy.rotation.set(t * 0.12 + point.phase, t * 0.2, point.phase)
      dummy.scale.setScalar(point.size * (1 + strength * 1.6 + pinch * 1.2))
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, points.length]}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshBasicMaterial transparent opacity={0.68} blending={AdditiveBlending} depthWrite={false} />
    </instancedMesh>
  )
}

function Stage() {
  return (
    <Canvas camera={{ position: [0, 0, 8.2], fov: 46 }} dpr={[1, 1.8]} gl={{ antialias: true, alpha: true }}>
      <color attach="background" args={['#05060a']} />
      <SceneParticles />
      <EffectComposer multisampling={0}>
        <Bloom intensity={0.72} luminanceThreshold={0.08} luminanceSmoothing={0.8} mipmapBlur />
        <Vignette offset={0.18} darkness={0.64} />
      </EffectComposer>
    </Canvas>
  )
}

function MotionRuntime({ contentRef }: { contentRef: React.RefObject<HTMLDivElement | null> }) {
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    let fpsFrames = 0
    let fpsStart = last

    const measure = () => {
      const root = contentRef.current
      if (!root) return
      const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-section]'))
      frame.sectionOffsets = cards.map((el) => el.offsetTop)
      frame.maxScroll = Math.max(root.scrollHeight - window.innerHeight, 1)
      frame.scrollTarget = Math.min(frame.scrollTarget, frame.maxScroll)
    }

    const onResize = () => measure()
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'd') setUi({ showDebug: !getUi().showDebug })
      if (!KEYBOARD_CONTROLS) return
      if (event.key === 'ArrowDown') jumpToNextSection()
      if (event.key === 'ArrowUp') jumpToPreviousSection()
    }

    measure()
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKey)

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      updateControl(dt, window.innerHeight)
      frame.scroll += (frame.scrollTarget - frame.scroll) * (1 - Math.exp(-9 * dt))
      frame.zoom += (frame.zoomTarget - frame.zoom) * (1 - Math.exp(-7 * dt))

      const root = contentRef.current
      if (root) {
        root.style.setProperty('--scroll-y', `${-frame.scroll}px`)
        root.style.setProperty('--page-zoom', `${frame.zoom}`)
      }

      fpsFrames++
      if (now - fpsStart > 500) {
        frame.renderFps = Math.round((fpsFrames * 1000) / (now - fpsStart))
        fpsStart = now
        fpsFrames = 0
      }

      const section = Math.max(
        0,
        frame.sectionOffsets.findIndex((offset, i, arr) => {
          const next = arr[i + 1] ?? Infinity
          return frame.scroll >= offset - window.innerHeight * 0.35 && frame.scroll < next - window.innerHeight * 0.35
        }),
      )
      const gestures = frame.hands.filter((h) => h.present).map((h) => h.gesture)
      const gesture = gestures.find((name) => name !== 'None') ?? 'None'
      const active = frame.mode !== 'idle'
      setUi({
        handCount: frame.handCount,
        gesture,
        mode: frame.mode,
        renderFps: frame.renderFps,
        cvFps: frame.cvFps,
        section,
        hasGestured: getUi().hasGestured || active,
      })

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    }
  }, [contentRef])

  return null
}

function ControlsPanel({ onStart, onStop }: { onStart: () => void; onStop: () => void }) {
  const ui = useUiStore()
  const canStart = ui.status === 'idle' || ui.status === 'error' || ui.status === 'unsupported'
  const canStop = ui.status === 'requesting' || ui.status === 'loading' || ui.status === 'running'
  return (
    <aside className="control-panel">
      <div className="brand">Hands Free</div>
      <div className="status-row">
        <span className={`status-dot ${ui.status}`} />
        <span>{ui.status === 'running' ? `${modeLabel(ui.mode)} active` : ui.status}</span>
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
        <span>pinch + move up/down</span>
        <b>scroll</b>
        <span>2 pinches, apart or together</span>
        <b>zoom</b>
      </div>
      <a className="switch-link" href="#game">
        Play T-Rex with your hands →
      </a>
      {ui.error ? <p className="error">{ui.error}</p> : null}
    </aside>
  )
}

function DebugPanel() {
  const ui = useUiStore()
  if (!ui.showDebug) return null
  return (
    <div className="debug">
      <span>mode {ui.mode}</span>
      <span>gesture {ui.gesture}</span>
      <span>hands {ui.handCount}</span>
      <span>cv {ui.cvFps} fps</span>
      <span>render {ui.renderFps} fps</span>
      <span>zoom {frame.zoom.toFixed(2)}x</span>
      <span>delegate {ui.delegate || '-'}</span>
    </div>
  )
}

function Content({ contentRef }: { contentRef: React.RefObject<HTMLDivElement | null> }) {
  const ui = useUiStore()
  return (
    <main ref={contentRef} className="content">
      <div className="scroll-plane">
        {sections.map((section, index) => (
          <section className="story-section" data-section key={section.kicker}>
            <p className="kicker">{section.kicker}</p>
            <h1>{section.title}</h1>
            <p className="body">{section.body}</p>
            <p className="accent">{section.accent}</p>
            <span className={ui.section === index ? 'section-mark active' : 'section-mark'}>{index + 1}</span>
          </section>
        ))}
      </div>
    </main>
  )
}

/**
 * Loops a pinching hand swiping down the track and back. It replaces the sentence that
 * used to sit here: a moving picture of the gesture is quicker to read than a line of
 * copy, and it leaves the page uncluttered. The label lives on the wrapper.
 */
function PinchScrollGlyph() {
  return (
    <span className="hint-glyph hint-glyph-scroll" role="img" aria-label="Pinch your fingers and move your hand up or down to scroll">
      <svg className="hint-rail" viewBox="0 0 24 48" aria-hidden="true">
        <path className="hint-arrow" d="M7 5 L12 0.5 L17 5" />
        <line className="hint-track" x1="12" y1="8" x2="12" y2="40" />
        <path className="hint-arrow" d="M7 43 L12 47.5 L17 43" />
      </svg>
      <span className="hint-pinch">🤏</span>
    </span>
  )
}

/**
 * The same idea turned on its side for zoom: two pinching hands that drift apart along a
 * horizontal track and come back together. They share one keyframe timeline so the pull
 * always reads as a single two-handed gesture rather than two hands acting alone.
 *
 * Zoom runs on the ratio between the two pinches, so apart and together are equally real
 * controls. Each end therefore carries a chevron pointing out and one pointing in, and
 * each pair brightens on the half of the loop it describes — outward while the hands
 * spread, inward while they close — so the glyph teaches both directions, not just one.
 */
function PinchZoomGlyph() {
  return (
    <span
      className="hint-glyph hint-glyph-zoom"
      role="img"
      aria-label="Pinch with both hands and move them apart to zoom in, or together to zoom out"
    >
      <svg className="hint-rail" viewBox="0 0 76 24" aria-hidden="true">
        <path className="hint-arrow hint-arrow-out" d="M5 7 L0.5 12 L5 17" />
        <path className="hint-arrow hint-arrow-in" d="M8.5 7 L13 12 L8.5 17" />
        <line className="hint-track" x1="16" y1="12" x2="60" y2="12" />
        <path className="hint-arrow hint-arrow-in" d="M67.5 7 L63 12 L67.5 17" />
        <path className="hint-arrow hint-arrow-out" d="M71 7 L75.5 12 L71 17" />
      </svg>
      <span className="hint-pinch hint-pinch-left">🤏</span>
      <span className="hint-pinch hint-pinch-right">🤏</span>
    </span>
  )
}

export default function App() {
  const ui = useUiStore()
  const videoRef = useRef<HTMLVideoElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const { start, stop } = useHandTracking(videoRef)

  return (
    <>
      <Stage />
      <Content contentRef={contentRef} />
      <MotionRuntime contentRef={contentRef} />
      <CameraLayer videoRef={videoRef} />
      <ControlsPanel onStart={start} onStop={stop} />
      <DebugPanel />
      <div className={ui.hasGestured ? 'hint hidden' : 'hint'}>
        <PinchScrollGlyph />
        <PinchZoomGlyph />
      </div>
    </>
  )
}
