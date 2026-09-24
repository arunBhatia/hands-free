/**
 * Credit bar for offrun.dev, shared by both routes.
 *
 * Fixed rather than sticky: this page never scrolls. The document is pinned (`overflow:
 * hidden` on #root) and the story plane is translated behind it, so `position: sticky`
 * would have no scroll container to stick to and would simply sit in the flow.
 *
 * One centred line and nothing else — the bar sits over a demo whose whole point is the
 * scene behind it, so it earns its 44 px by being quiet. What it does spend is on being
 * obviously clickable: the sparkle gives it a little lift, the wordmark is underlined in
 * the accent colour, and the box-and-arrow is the standard "opens in a new tab" glyph.
 */
export function PromoBar() {
  return (
    <a className="promo-bar" href="https://www.offrun.dev" target="_blank" rel="noreferrer">
      {/* One element, not bare text: a flex container makes a text node its own flex item
          and drops the space before <b>, so the line reads "built withoffrun.dev". */}
      <span className="promo-label">
        <span className="promo-emoji" aria-hidden="true">
          ✨
        </span>
        Built with <b>offrun.dev</b>
        <svg className="promo-external" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M5 7 L10.5 1.5" />
          <path d="M7 1.5 H10.5 V5" />
          <path d="M9 7 V10.5 H1.5 V3 H5" />
        </svg>
      </span>
    </a>
  )
}
