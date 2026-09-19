import { useEffect, useRef, type RefObject } from 'react'
import { HAND_CONNECTIONS } from '../cv/landmarks'
import { frame } from '../state/store'

export function CameraLayer({ videoRef }: { videoRef: RefObject<HTMLVideoElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let raf = 0
    const draw = () => {
      const canvas = canvasRef.current
      const video = videoRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && video && ctx) {
        const rect = canvas.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        const width = Math.round(rect.width * dpr)
        const height = Math.round(rect.height * dpr)
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
        }
        ctx.save()
        ctx.clearRect(0, 0, width, height)
        ctx.scale(dpr, dpr)
        ctx.translate(rect.width, 0)
        ctx.scale(-1, 1)
        if (video.readyState >= 2) ctx.drawImage(video, 0, 0, rect.width, rect.height)
        ctx.lineWidth = 2
        ctx.strokeStyle = 'rgba(111, 255, 204, 0.9)'
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
        for (const hand of frame.hands) {
          if (!hand.present || !hand.landmarks) continue
          ctx.beginPath()
          for (const [a, b] of HAND_CONNECTIONS) {
            ctx.moveTo(hand.landmarks[a].x * rect.width, hand.landmarks[a].y * rect.height)
            ctx.lineTo(hand.landmarks[b].x * rect.width, hand.landmarks[b].y * rect.height)
          }
          ctx.stroke()
          for (const point of hand.landmarks) {
            ctx.beginPath()
            ctx.arc(point.x * rect.width, point.y * rect.height, 2.8, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        ctx.restore()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [videoRef])

  return (
    <div className="camera">
      <video ref={videoRef} playsInline muted />
      <canvas ref={canvasRef} />
    </div>
  )
}
