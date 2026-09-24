import { HEIGHT, TREX, WIDTH } from './constants'
import type { Box } from './collision'
import type { Runner } from './runner'
import {
  CACTUS_LARGE,
  CACTUS_SMALL,
  CLOUD,
  DINO_DUCK,
  DINO_EYE,
  DINO_RUN,
  DINO_STAND,
  DUCK_EYE,
  PTERO,
  PTERO_EYE,
  type Shape,
} from './sprites'

const COLORS = {
  background: '#080a0f',
  dino: '#f3f6ef',
  crashed: '#ff6f8c',
  cactus: '#6fffcc',
  ptero: '#ffe08a',
  ground: 'rgba(243, 246, 239, 0.62)',
  cloud: 'rgba(243, 246, 239, 0.14)',
  text: 'rgba(243, 246, 239, 0.86)',
  dim: 'rgba(243, 246, 239, 0.5)',
}

const RUN_FRAME_MS = 1000 / 12
const DUCK_FRAME_MS = 1000 / 8
const FLAP_FRAME_MS = 1000 / 6

function fillShape(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number): void {
  const ox = Math.round(x)
  const oy = Math.round(y)
  for (const box of shape) ctx.fillRect(ox + box.x, oy + box.y, box.w, box.h)
}

function strokeBoxes(ctx: CanvasRenderingContext2D, boxes: readonly Box[], x: number, y: number) {
  for (const box of boxes) ctx.strokeRect(x + box.x + 0.5, y + box.y + 0.5, box.w - 1, box.h - 1)
}

/** Deterministic 0..1 from an integer, so ground pebbles stay put as they scroll. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453
  return s - Math.floor(s)
}

function drawGround(ctx: CanvasRenderingContext2D, offset: number): void {
  const lineY = HEIGHT - 12
  ctx.fillStyle = COLORS.ground
  ctx.fillRect(0, lineY, WIDTH, 1)
  const cell = 9
  const first = Math.floor(offset / cell)
  for (let i = first; i < first + WIDTH / cell + 2; i++) {
    const r = hash(i)
    if (r > 0.34) continue
    const x = Math.round(i * cell - offset + hash(i + 7) * cell)
    const y = lineY + 3 + Math.floor(hash(i + 13) * 6)
    ctx.fillRect(x, y, r < 0.1 ? 3 : 1, 1)
  }
}

function drawDino(ctx: CanvasRenderingContext2D, runner: Runner): void {
  const trex = runner.trex
  const x = TREX.startX
  const y = trex.y
  const crashed = runner.status === 'crashed'
  ctx.fillStyle = crashed ? COLORS.crashed : COLORS.dino

  let eye = DINO_EYE
  if (trex.ducking) {
    fillShape(ctx, DINO_DUCK[Math.floor(trex.animTime / DUCK_FRAME_MS) % 2], x, y)
    eye = DUCK_EYE
  } else if (runner.status === 'running' && !trex.jumping) {
    fillShape(ctx, DINO_RUN[Math.floor(trex.animTime / RUN_FRAME_MS) % 2], x, y)
  } else {
    fillShape(ctx, DINO_STAND, x, y)
  }

  ctx.fillStyle = COLORS.background
  const ex = Math.round(x) + eye.x
  const ey = Math.round(y) + eye.y
  if (crashed) {
    // X-eyes.
    ctx.fillRect(ex - 1, ey - 1, 1, 1)
    ctx.fillRect(ex + eye.w, ey - 1, 1, 1)
    ctx.fillRect(ex - 1, ey + eye.h, 1, 1)
    ctx.fillRect(ex + eye.w, ey + eye.h, 1, 1)
  }
  ctx.fillRect(ex, ey, eye.w, eye.h)
}

function drawObstacles(ctx: CanvasRenderingContext2D, runner: Runner): void {
  for (const obstacle of runner.field.obstacles) {
    const { spec, size, x, y } = obstacle
    if (spec.type === 'pterodactyl') {
      ctx.fillStyle = COLORS.ptero
      fillShape(ctx, PTERO[Math.floor(obstacle.animTime / FLAP_FRAME_MS) % 2], x, y)
      ctx.fillStyle = COLORS.background
      ctx.fillRect(Math.round(x) + PTERO_EYE.x, y + PTERO_EYE.y, PTERO_EYE.w, PTERO_EYE.h)
      continue
    }
    ctx.fillStyle = COLORS.cactus
    const shape = spec.type === 'cactusSmall' ? CACTUS_SMALL : CACTUS_LARGE
    for (let i = 0; i < size; i++) fillShape(ctx, shape, x + i * spec.width, y)
  }
}

function pad(score: number): string {
  return String(Math.min(score, 99999)).padStart(5, '0')
}

function drawScore(ctx: CanvasRenderingContext2D, runner: Runner): void {
  ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  const flashing = runner.time < runner.flashUntil
  const blinkOff = flashing && Math.floor((runner.flashUntil - runner.time) / 125) % 2 === 1
  if (!blinkOff) {
    ctx.fillStyle = COLORS.text
    ctx.fillText(pad(runner.score), WIDTH - 10, 8)
  }
  if (runner.highScore > 0) {
    ctx.fillStyle = COLORS.dim
    ctx.fillText(`HI ${pad(runner.highScore)}`, WIDTH - 62, 8)
  }
}

function drawMessage(ctx: CanvasRenderingContext2D, title: string, hint: string | null): void {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = COLORS.text
  ctx.font = '500 13px "JetBrains Mono", ui-monospace, monospace'
  ctx.fillText(title, WIDTH / 2, 52)
  if (hint) {
    ctx.fillStyle = COLORS.dim
    ctx.font = '400 10px "JetBrains Mono", ui-monospace, monospace'
    ctx.fillText(hint, WIDTH / 2, 72)
  }
}

function drawHitboxes(ctx: CanvasRenderingContext2D, runner: Runner): void {
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(111, 255, 204, 0.9)'
  const dino = runner.trex.bounds(TREX.startX)
  strokeBoxes(ctx, dino.hitboxes, Math.round(dino.x), Math.round(dino.y))
  ctx.strokeStyle = 'rgba(255, 224, 138, 0.9)'
  for (const obstacle of runner.field.obstacles) {
    strokeBoxes(ctx, obstacle.hitboxes, Math.round(obstacle.x), obstacle.y)
  }
  if (runner.lastCollision) {
    ctx.fillStyle = 'rgba(255, 111, 140, 0.7)'
    for (const box of runner.lastCollision) ctx.fillRect(box.x, box.y, box.w, box.h)
  }
}

/** Draws the runner into a canvas sized in device pixels, scaling the 800×150 world to fit. */
export function draw(
  ctx: CanvasRenderingContext2D,
  runner: Runner,
  options: { showHitboxes: boolean; startHint: string; restartHint: string },
): void {
  const scale = ctx.canvas.width / WIDTH
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.fillStyle = COLORS.background
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  ctx.fillStyle = COLORS.cloud
  for (const cloud of runner.horizon.clouds) fillShape(ctx, CLOUD, cloud.x, cloud.y)

  drawGround(ctx, runner.horizon.groundOffset)
  drawObstacles(ctx, runner)
  drawDino(ctx, runner)
  drawScore(ctx, runner)

  if (runner.status === 'waiting') drawMessage(ctx, 'READY', options.startHint)
  if (runner.status === 'crashed') {
    drawMessage(ctx, 'G A M E   O V E R', runner.canRestart ? options.restartHint : null)
  }
  if (options.showHitboxes) drawHitboxes(ctx, runner)
}
