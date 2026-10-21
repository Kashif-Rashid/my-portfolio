import { useEffect } from 'react'
import { localImage } from '../site/content'

let motionEnginePromise
const loadMotionEngine = () => motionEnginePromise ??= Promise.all([
  import('gsap'),
  import('gsap/ScrollTrigger.js'),
]).then(([gsapModule, triggerModule]) => ({
  gsap: gsapModule.gsap,
  ScrollTrigger: triggerModule.ScrollTrigger,
}))

// Module-level WeakSet: survives re-renders, cleared only when element is GC'd
const revealedElements = new WeakSet()

export function useSliceReveal(ref, { image, index = 0, sliceCount = 5 } = {}) {
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const updateImageHeight = () => root.style.setProperty('--slice-image-height', `${root.clientHeight}px`)
    updateImageHeight()
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateImageHeight) : null
    resizeObserver?.observe(root)

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      root.classList.add('slice-reduced-motion')
      return () => { root.classList.remove('slice-reduced-motion'); resizeObserver?.disconnect() }
    }

    let active = true
    let context
    const preload = () => {
      const source = localImage(image, 2200)
      if (!source || root.dataset.fullPreloaded) return
      const fullImage = new Image()
      fullImage.src = source
      root.dataset.fullPreloaded = 'true'
    }

    loadMotionEngine().then(({ gsap, ScrollTrigger }) => {
      if (!active) return
      gsap.registerPlugin(ScrollTrigger)
      const strips = root.querySelectorAll('.slice-layer')
      const touchLayout = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 720
      const grid = root.parentElement
      const columnCount = grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 3
      const rowDelay = (index % Math.max(columnCount, 1)) * 0.12

      context = gsap.context(() => {
        // Already animated — snap to final state instantly, no replay
        if (revealedElements.has(root)) {
          if (touchLayout) {
            gsap.set(strips, { y: 0, opacity: 1, scaleY: 1.25 })
          } else {
            gsap.set(strips, { y: 0, opacity: 1 })
          }
          return
        }

        if (touchLayout) {
          gsap.fromTo(strips, { y: 34, opacity: 0, scaleY: 0.92 }, {
            y: 0,
            opacity: 1,
            scaleY: 1.25,
            ease: 'none',
            stagger: 0.1,
            scrollTrigger: {
              trigger: root,
              start: 'top 84%',
              end: 'center center',
              scrub: 0.6,
              onEnter: () => {
                preload()
                revealedElements.add(root)
              },
            },
          })
          return
        }

        gsap.fromTo(strips, { y: 36, opacity: 0 }, {
          y: 0,
          opacity: 1,
          duration: 1.1,
          stagger: 0.1,
          delay: rowDelay,
          ease: 'power4.out',
          scrollTrigger: {
            trigger: root,
            start: 'top 84%',
            once: true,
            onEnter: () => {
              preload()
              revealedElements.add(root)
            },
          },
        })
      }, root)
    }).catch(() => root.classList.add('slice-fallback'))

    return () => {
      active = false
      context?.revert()
      resizeObserver?.disconnect()
    }
  }, [ref, image, index, sliceCount])
}
