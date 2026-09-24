import { StrictMode, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { PromoBar } from './components/PromoBar'
import Game from './game/Game'
import './styles.css'

function subscribeHash(listener: () => void): () => void {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

/** Hash routing: `#game` needs no server rewrite on a static host. */
function Root() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash)
  return (
    <>
      <PromoBar />
      {hash === '#game' ? <Game /> : <App />}
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
