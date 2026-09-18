/**
 * Puts the MediaPipe runtime next to our own bundle instead of loading it from a CDN.
 *
 * Two things get staged into public/:
 *   1. public/mediapipe/wasm/  — copied out of the installed @mediapipe/tasks-vision.
 *      Copying (rather than pointing FilesetResolver at jsdelivr @latest) guarantees the
 *      wasm and the JS API are the same version. Version skew between the two is the
 *      classic silent failure here: the loader resolves, then blows up on a missing export.
 *   2. public/models/gesture_recognizer.task — the 8.4 MB float16 model, from a *pinned*
 *      Google Storage path.
 *
 * Both are gitignored and re-staged by predev/prebuild, so they exist in CI and in the
 * Vercel build without living in the repo. Runs are idempotent: existing files of the
 * right size are left alone.
 */
import { createWriteStream } from 'node:fs'
import { mkdir, readdir, copyFile, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WASM_SRC = join(ROOT, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const WASM_DEST = join(ROOT, 'public', 'mediapipe', 'wasm')
const MODEL_DEST = join(ROOT, 'public', 'models', 'gesture_recognizer.task')
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'

async function sizeOf(path) {
  try {
    return (await stat(path)).size
  } catch {
    return -1
  }
}

async function copyWasm() {
  const files = await readdir(WASM_SRC).catch(() => {
    throw new Error(
      `Could not read ${WASM_SRC}. Run \`npm install\` first — the wasm ships inside the ` +
        `@mediapipe/tasks-vision package.`,
    )
  })
  await mkdir(WASM_DEST, { recursive: true })
  let copied = 0
  for (const f of files) {
    const from = join(WASM_SRC, f)
    const to = join(WASM_DEST, f)
    const [a, b] = await Promise.all([sizeOf(from), sizeOf(to)])
    if (a === b) continue
    await copyFile(from, to)
    copied++
  }
  console.log(
    copied === 0
      ? `[assets] wasm already staged (${files.length} files)`
      : `[assets] staged ${copied}/${files.length} wasm files -> public/mediapipe/wasm`,
  )
}

async function fetchModel() {
  const existing = await sizeOf(MODEL_DEST)
  if (existing > 1_000_000) {
    console.log(`[assets] model already present (${(existing / 1e6).toFixed(1)} MB)`)
    return
  }
  await mkdir(dirname(MODEL_DEST), { recursive: true })
  console.log('[assets] downloading gesture_recognizer.task (~8.4 MB)…')
  const res = await fetch(MODEL_URL)
  if (!res.ok || !res.body) throw new Error(`Model download failed: HTTP ${res.status}`)
  // Stream straight to disk rather than buffering 8 MB in memory.
  await pipeline(Readable.fromWeb(res.body), createWriteStream(MODEL_DEST))
  const got = await sizeOf(MODEL_DEST)
  if (got < 1_000_000) throw new Error(`Model download looks truncated (${got} bytes)`)
  console.log(`[assets] model ready (${(got / 1e6).toFixed(1)} MB)`)
}

try {
  await copyWasm()
  await fetchModel()
} catch (err) {
  console.error(`\n[assets] ${err.message}\n`)
  process.exit(1)
}
