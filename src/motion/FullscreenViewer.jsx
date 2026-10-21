import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { localImage } from '../site/content'
import { motionTokens } from './tokens'

const formatCount = value => String(value).padStart(2, '0')

export function FullscreenViewer({ category, photos, initialIndex = 0, onClose, opener, resetTile, animateTransition = true }) {
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const [switching, setSwitching] = useState(false)
  const switchingRef = useRef(false)
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const touchStart = useRef(null)
  const wheelLock = useRef(false)
  const transitionTimer = useRef(null)
  const photo = photos[activeIndex]
  const largeSrc = localImage(photo?.image, 2200)
  const sharedLayoutId = photo ? `gallery-${category.slug}-${photo._id}` : undefined

  const changePhoto = useCallback(direction => {
    if (photos.length < 2 || switchingRef.current) return
    if (!animateTransition) {
      setActiveIndex(index => (index + direction + photos.length) % photos.length)
      return
    }
    switchingRef.current = true
    setSwitching(true)
    transitionTimer.current = window.setTimeout(() => {
      setActiveIndex(index => (index + direction + photos.length) % photos.length)
      switchingRef.current = false
      setSwitching(false)
    }, 500)
  }, [animateTransition, photos.length])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKeyDown = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (event.key === 'ArrowRight') { event.preventDefault(); changePhoto(1) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); changePhoto(-1) }
      if (event.key === 'Tab' && dialogRef.current) {
        const controls = [...dialogRef.current.querySelectorAll('button:not([disabled]), a[href]')]
        if (!controls.length) return
        const first = controls[0]
        const last = controls[controls.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(transitionTimer.current)
      touchStart.current = null
      resetTile?.()
      opener?.focus({ preventScroll: true })
    }
  }, [changePhoto, onClose, opener, resetTile])

  useEffect(() => {
    for (const item of [photos[(activeIndex + 1) % photos.length], photos[(activeIndex - 1 + photos.length) % photos.length]]) {
      if (!item) continue
      const preload = new Image()
      preload.src = localImage(item.image, 2200)
    }
  }, [activeIndex, photos])

  const handleWheel = event => {
    if (Math.abs(event.deltaY) < 35 || wheelLock.current) return
    event.preventDefault()
    wheelLock.current = true
    changePhoto(event.deltaY > 0 ? 1 : -1)
    window.setTimeout(() => { wheelLock.current = false }, 750)
  }

  const handleTouchEnd = event => {
    if (!touchStart.current) return
    const dx = event.changedTouches[0].clientX - touchStart.current.x
    const dy = event.changedTouches[0].clientY - touchStart.current.y
    touchStart.current = null
    if (dy > 90 && Math.abs(dy) > Math.abs(dx)) onClose()
    else if (Math.abs(dx) > 55) changePhoto(dx < 0 ? 1 : -1)
  }

  return <motion.div className="fullscreen-viewer" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.55 }} onClick={onClose}>
    <section className="fullscreen-viewer-dialog" role="dialog" aria-modal="true" aria-label={`${category.title} photographs`} tabIndex={-1} ref={dialogRef} onClick={event => event.stopPropagation()} onWheel={handleWheel} onTouchStart={event => { touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY } }} onTouchEnd={handleTouchEnd}>
      <button ref={closeRef} type="button" className="viewer-close" aria-label="Close photograph viewer" onClick={onClose}><X size={21} strokeWidth={1}/></button>
      <button type="button" className="viewer-arrow viewer-previous" aria-label="Previous photograph" onClick={() => changePhoto(-1)}><ArrowLeft size={21} strokeWidth={1}/></button>
      <div className={`viewer-media${switching ? ' is-switching' : ''}${animateTransition ? '' : ' viewer-media-static'}`}>
        <AnimatePresence mode="wait">
          {!switching && photo && (animateTransition ? <motion.img
            key={photo._id}
            className="viewer-image"
            layoutId={sharedLayoutId}
            src={largeSrc}
            alt={photo.altText || photo.image?.alt || ''}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3, ease: motionTokens.easing.silk } }}
            transition={{ duration: 0.55, ease: motionTokens.easing.silk, layout: { duration: 0.8, ease: motionTokens.easing.luxury } }}
            draggable="false"
            loading="eager"
          /> : <img key={photo._id} className="viewer-image" src={largeSrc} alt={photo.altText || photo.image?.alt || ''} draggable="false" loading="eager" />)}
        </AnimatePresence>
        {animateTransition && switching && <div className="viewer-slice-close" aria-hidden="true">{Array.from({ length: 5 }, (_, strip) => <span key={strip} style={{ '--strip-index': strip, top: `${strip * 20}%`, backgroundImage: `url("${largeSrc}")`, backgroundSize: '100% 500%', backgroundPosition: `center ${strip * 25}%` }} />)}</div>}
      </div>
      <button type="button" className="viewer-arrow viewer-next" aria-label="Next photograph" onClick={() => changePhoto(1)}><ArrowRight size={21} strokeWidth={1}/></button>
      <div className="viewer-caption"><span className="viewer-category">{category.title}</span><p>{photo?.caption || photo?.altText}</p><span className="viewer-counter">{formatCount(activeIndex + 1)} <i/> {formatCount(photos.length)}</span><Link className="viewer-view-category" to={`/portfolio/${category.slug}`} onClick={onClose}>VIEW FULL COLLECTION <ArrowRight size={12}/></Link></div>
    </section>
  </motion.div>
}
