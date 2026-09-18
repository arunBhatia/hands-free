/**
 * One Euro filter — the standard low-latency jitter filter for noisy pointer signals.
 *
 * Why not a plain exponential smooth: a fixed alpha forces a choice between a shaky
 * cursor when the hand is still and a laggy one when it moves. One Euro adapts the
 * cutoff to the observed speed, so slow movement is smoothed hard and fast movement
 * is barely smoothed at all. Raw MediaPipe landmarks wander a few pixels per frame
 * even on a motionless hand, which is very visible once you drive a camera with them.
 *
 * Casiez, Roussel & Vogel (CHI 2012).
 */

class LowPass {
  private initialised = false
  private value = 0

  filter(x: number, alpha: number): number {
    if (!this.initialised) {
      this.initialised = true
      this.value = x
      return x
    }
    this.value = alpha * x + (1 - alpha) * this.value
    return this.value
  }

  reset() {
    this.initialised = false
  }
}

export class OneEuro {
  private xFilter = new LowPass()
  private dxFilter = new LowPass()
  private lastRaw: number | null = null

  /**
   * @param minCutoff lower = smoother when still (Hz)
   * @param beta      higher = more responsive when moving fast
   * @param dCutoff   cutoff for the derivative estimate (Hz)
   */
  constructor(
    private readonly minCutoff = 1.1,
    private readonly beta = 0.02,
    private readonly dCutoff = 1.0,
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  filter(x: number, dt: number): number {
    const step = dt > 0 ? dt : 1 / 30
    const dx = this.lastRaw === null ? 0 : (x - this.lastRaw) / step
    this.lastRaw = x

    const edx = this.dxFilter.filter(dx, this.alpha(this.dCutoff, step))
    const cutoff = this.minCutoff + this.beta * Math.abs(edx)
    return this.xFilter.filter(x, this.alpha(cutoff, step))
  }

  reset() {
    this.xFilter.reset()
    this.dxFilter.reset()
    this.lastRaw = null
  }
}
