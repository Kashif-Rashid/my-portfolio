import { Component, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { localImage } from '../site/content'
import { useSliceReveal } from './useSliceReveal'

export class SliceTileBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) return this.props.fallback
    return this.props.children
  }
}

export function SliceTile({ image, title, index, onOpen, sliceCount = 5, layoutId, revealed = false }) {
  const buttonRef = useRef(null)
  const timerRef = useRef(null)
  const [closing, setClosing] = useState(false)
  const src = localImage(image, 900)
  const id = layoutId || `slice-tile-${index}`
  useSliceReveal(buttonRef, { image, index, sliceCount })
  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const prefetch = () => {
    const full = localImage(image, 2200)
    if (!full || buttonRef.current?.dataset.fullPreloaded) return
    const preloadImage = new Image()
    preloadImage.src = full
    if (buttonRef.current) buttonRef.current.dataset.fullPreloaded = 'true'
  }

  const open = event => {
    event.preventDefault()
    if (closing) return
    setClosing(true)
    prefetch()
    const opener = buttonRef.current
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    timerRef.current = window.setTimeout(() => onOpen?.({ opener, layoutId: id, resetTile: () => setClosing(false) }), reduced || revealed ? 0 : 600)
  }

  return <button
    ref={buttonRef}
    type="button"
    className={`slice-tile${closing ? ' is-closing' : ''}${revealed ? ' is-revealed' : ''}`}
    aria-label={`Open ${title}`}
    onClick={open}
    onMouseEnter={prefetch}
    onFocus={prefetch}
  >
    <span className="slice-tile-image" aria-hidden="true">
      <motion.img className="slice-full-image" layoutId={id} src={src} alt="" draggable="false" />
      {Array.from({ length: sliceCount }, (_, sliceIndex) => {
        const peekBand = 60 / sliceCount
        const openBand = 80 / sliceCount
        const peekGap = 8
        const openGap = 14
        const peekTop = `calc(${20 + peekBand * sliceIndex}% + ${peekGap * sliceIndex - peekGap * (sliceCount - 1) / 2}px)`
        const openTop = `calc(${10 + openBand * sliceIndex}% + ${openGap * sliceIndex - openGap * (sliceCount - 1) / 2}px)`
        const backgroundPositionY = sliceCount === 1 ? '0%' : `${sliceIndex / (sliceCount - 1) * 100}%`
        return <span
          key={sliceIndex}
          className="slice-layer"
          style={{
            '--peek-top': peekTop,
            '--open-top': openTop,
            '--peek-band': `${peekBand}%`,
            '--open-band': `${openBand}%`,
            '--background-fallback': `${10000 / peekBand}%`,
            backgroundImage: `url("${src}")`,
            backgroundPosition: `center ${backgroundPositionY}`,
            '--hover-shift': sliceIndex % 2 ? '-3px' : '3px',
          }}
        />
      })}
      <span className="slice-veil" />
      <span className="slice-open-label">OPEN</span>
    </span>
    <span className="slice-tile-title">{title}</span>
  </button>
}

// Plain gallery tiles for collection pages. Homepage tiles keep the slice reveal.
export function StaticGalleryTile({ image, title, onOpen }) {
  const src = localImage(image, 900)
  const buttonRef = useRef(null)
  const [loaded, setLoaded] = useState(false)

  return <button
    ref={buttonRef}
    type="button"
    className="static-gallery-tile"
    aria-label={`Open ${title}`}
    onClick={() => onOpen?.({ opener: buttonRef.current })}
  >
    <span className="static-gallery-image">
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.55s ease' }}
      />
    </span>
    <span className="static-gallery-title">{title}</span>
  </button>
}
