import { CLOUD_FREQUENCY, CLOUD_SPEED, MAX_CLOUDS, WIDTH } from './constants'
import { CLOUD_WIDTH } from './sprites'
import type { Rng } from './obstacles'

export interface Cloud {
  x: number
  y: number
  gap: number
}

/** Ground scroll and background clouds. Purely decorative: nothing here collides. */
export class Horizon {
  groundOffset = 0
  clouds: Cloud[] = []

  constructor(private readonly rng: Rng) {}

  reset(): void {
    this.groundOffset = 0
    this.clouds = []
  }

  step(speed: number): void {
    this.groundOffset += speed

    for (const cloud of this.clouds) cloud.x -= speed * CLOUD_SPEED
    this.clouds = this.clouds.filter((cloud) => cloud.x + CLOUD_WIDTH > 0)

    const last = this.clouds[this.clouds.length - 1]
    const roomForNext = !last || last.x + CLOUD_WIDTH + last.gap < WIDTH
    if (this.clouds.length < MAX_CLOUDS && roomForNext && this.rng() < CLOUD_FREQUENCY) {
      this.clouds.push({
        x: WIDTH,
        y: 30 + Math.floor(this.rng() * 42),
        gap: 100 + Math.floor(this.rng() * 300),
      })
    }
  }
}
