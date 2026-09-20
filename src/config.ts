/**
 * Build-time switches, read from Vite env vars (see .env.example).
 *
 * Keyboard controls are off by default: the point of the demo is that the page and the
 * game are driven by hands. Turn them on to work on either one without a camera.
 */
export const KEYBOARD_CONTROLS = import.meta.env.VITE_KEYBOARD_CONTROLS === 'true'
