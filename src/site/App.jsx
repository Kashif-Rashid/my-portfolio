import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Menu, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { identity, images, imageUrl, localContent, localImage, localSrcSet } from './content'
import { useSmoothScroll } from '../motion/useSmoothScroll'
import { Preloader } from '../motion/Preloader'
import { motionTokens } from '../motion/tokens'
import { SliceTile, SliceTileBoundary, StaticGalleryTile } from '../motion/SliceTile'
import { FullscreenViewer } from '../motion/FullscreenViewer'
import { contactFormConfigured, hasTurnstile, FORMSPREE_FORM_ID, TURNSTILE_SITE_KEY } from '../config/integrations'
import { usePortfolio } from './usePortfolioData'
import { AdminModal } from './AdminModal'

const usePublicContent = () => {
  const { content } = usePortfolio()
  // Stable references — only identity changes trigger downstream re-renders
  const settings = useMemo(() => content.settings || {}, [content.settings])
  const categories = useMemo(() => content.categories || [], [content.categories])
  const photos = useMemo(() => content.photos || [], [content.photos])
  const heroSlides = useMemo(() => content.heroSlides || [], [content.heroSlides])
  const instagramImages = useMemo(() => content.instagramImages || [], [content.instagramImages])
  const about = useMemo(() => content.about || {}, [content.about])
  const contact = useMemo(() => content.contact || {}, [content.contact])
  return { settings, categories, photos, heroSlides, instagramImages, about, contact }
}

function TurnstileWidget({ onVerify, onExpire }) {
  const container = useRef(null)
  useEffect(() => {
    if (!hasTurnstile || !container.current) return
    const render = () => {
      if (!window.turnstile || !container.current) return
      const widgetId = window.turnstile.render(container.current, { sitekey: TURNSTILE_SITE_KEY, theme: 'light', callback: onVerify, 'expired-callback': onExpire })
      container.current.dataset.widgetId = widgetId
    }
    let script = document.querySelector('script[data-turnstile="true"]')
    if (!script) {
      script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true; script.defer = true; script.dataset.turnstile = 'true'; document.head.append(script)
    }
    script.addEventListener('load', render)
    if (window.turnstile) render()
    return () => { script.removeEventListener('load', render); const id = container.current?.dataset.widgetId; if (id && window.turnstile) window.turnstile.remove(id) }
  }, [onVerify, onExpire])
  return <div className="turnstile-wrap"><div ref={container}/></div>
}

const ease = [0.22, 1, 0.36, 1]
const reveal = { hidden: { opacity: 0, y: 28 }, visible: { opacity: 1, y: 0, transition: { duration: 1, ease } } }

function SEO() {
  const { settings } = usePublicContent()
  useEffect(() => {
    const title = settings.seoTitle || `${settings.logoText || identity.name} | Photography`
    const description = settings.seoDescription || `Photography by ${settings.logoText || identity.name}, based in ${settings.baseCity || identity.city}.`
    document.title = title
    const setMeta = (selector, key, content, attribute = 'name') => {
      let tag = document.head.querySelector(selector)
      if (!tag) { tag = document.createElement('meta'); tag.setAttribute(attribute, key); document.head.append(tag) }
      tag.content = content
    }
    setMeta('meta[name="description"]', 'description', description)
    setMeta('meta[property="og:title"]', 'og:title', title, 'property')
    setMeta('meta[property="og:description"]', 'og:description', description, 'property')
    const shareImage = settings.seoImage ? localImage(settings.seoImage, 1200) : ''
    if (shareImage) setMeta('meta[property="og:image"]', 'og:image', shareImage, 'property')
    const schema = document.createElement('script')
    schema.type = 'application/ld+json'; schema.dataset.siteSchema = 'true'
    schema.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Person', name: settings.logoText || identity.name, jobTitle: 'Photographer', address: { '@type': 'PostalAddress', addressLocality: settings.baseCity || identity.city, addressCountry: 'IN' }, areaServed: { '@type': 'Country', name: 'India' }, sameAs: (settings.socialLinks || []).map(link => link.url).filter(url => url?.startsWith('https://')) })
    document.head.querySelector('[data-site-schema="true"]')?.remove(); document.head.append(schema)
    return () => schema.remove()
  }, [settings])
  return null
}

function useSecretAdminTap(requiredTaps = 3) {
  const { setIsAdminOpen } = usePortfolio()
  const tapCount = useRef(0)
  const timer = useRef(null)
  return (e) => {
    if (e && e.preventDefault && e.type === 'touchstart') {
      // prevent zoom on rapid mobile touch
      e.preventDefault()
    }
    tapCount.current += 1
    if (timer.current) clearTimeout(timer.current)
    if (tapCount.current >= requiredTaps) {
      tapCount.current = 0
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try { navigator.vibrate([30, 40, 50]) } catch { /* ignore */ }
      }
      setIsAdminOpen(true)
    } else {
      timer.current = setTimeout(() => {
        tapCount.current = 0
      }, 1000)
    }
  }
}

function MobilePortfolioAccordion({ categories, onClose }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mobile-accordion">
      <button
        className="mobile-accordion-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        Portfolio
        <span className={`mobile-accordion-arrow${open ? ' open' : ''}`}>▾</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="mobile-accordion-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            {categories.map(category => (
              <Link
                key={category.slug}
                to={`/portfolio/${category.slug}`}
                className="mobile-accordion-item"
                onClick={() => { setOpen(false); onClose() }}
              >
                {category.title}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Header() {
  const { settings, categories } = usePublicContent()
  const triggerAdmin = useSecretAdminTap(3)
  const handle = settings.instagramHandle || identity.instagram
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)
  const [mobile, setMobile] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48)
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const close = () => setMobile(false)
  return <>
    <header className={`site-header ${scrolled ? 'is-scrolled' : ''}`}>
      <Link className="wordmark" to="/" onClick={close}>{settings.logoText || identity.name}<span>PHOTOGRAPHY</span></Link>
      <nav className="desktop-nav" aria-label="Main navigation">
        <div className="nav-dropdown" onMouseEnter={() => setMenu(true)} onMouseLeave={() => setMenu(false)}>
          <Link to="/#portfolio">Portfolio</Link>
          {menu && <div className="dropdown-panel">{categories.map(category => <Link to={`/portfolio/${category.slug}`} key={category.slug} onClick={() => setMenu(false)}>{category.title}</Link>)}</div>}
        </div>
        <a href={`https://instagram.com/${handle.replace('@','')}`} target="_blank" rel="noreferrer">Instagram <ArrowUpRight size={11}/></a>
        <Link to="/about">About</Link><Link to="/contact">Contact</Link>
      </nav>
      <button className="menu-toggle" aria-label={mobile ? 'Close menu' : 'Open menu'} onClick={() => setMobile(!mobile)}>{mobile ? <X/> : <Menu/>}</button>
    </header>
    <AnimatePresence>{mobile && <motion.nav className="mobile-menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .35 }} aria-label="Mobile navigation">
      <MobilePortfolioAccordion categories={categories} onClose={close} />
      <Link onClick={close} to="/about">About</Link>
      <Link onClick={close} to="/contact">Contact</Link>
      <a onClick={close} href={`https://instagram.com/${handle.replace('@','')}`}>Instagram</a>
      <small onClick={triggerAdmin} style={{ cursor: 'pointer', userSelect: 'none' }}>BASED IN {identity.city.toUpperCase()}, INDIA</small>
    </motion.nav>}</AnimatePresence>
  </>
}

function Footer() {
  const { settings, instagramImages } = usePublicContent()
  const triggerAdmin = useSecretAdminTap(3)
  const handle = settings.instagramHandle || identity.instagram
  const email = settings.email || identity.email
  return <footer className="footer">
    <div className="footer-columns">
      <div><span className="eyebrow">Email</span><a href={`mailto:${email}`}>{email}</a></div>
      <div><span className="eyebrow">Instagram</span>{settings.socialLinks?.length ? settings.socialLinks.map(link => <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer">{handle}</a>) : <a href={`https://instagram.com/${handle.replace('@','')}`}>{handle}</a>}</div>
      <div><span className="eyebrow">Contact</span><Link to="/contact">Get in touch</Link></div>
    </div>
    <p className="footer-location">Based in {settings.baseCity || identity.city}, India · {settings.availabilityLine}</p>
    <div className="instagram-strip">{instagramImages.map((item, i) => <a key={i} href={`https://instagram.com/${handle.replace('@','')}`} aria-label={`Instagram photograph ${i + 1}`}><img loading="lazy" src={localImage(item.image, 300)} srcSet={localSrcSet(item.image,[240,360,540])} sizes="(max-width: 640px) 25vw, 12vw" alt={item.image?.alt || `Instagram photograph ${i + 1}`} /></a>)}</div>
    <a className="instagram-bar" href={`https://instagram.com/${handle.replace('@','')}`}>INSTAGRAM {handle} <ArrowUpRight size={12}/></a>
    <div className="footer-bottom"><nav><Link to="/">Home</Link><a href="/#portfolio">Portfolio</a><a href={`https://instagram.com/${handle.replace('@','')}`}>Instagram</a><Link to="/about">About</Link><Link to="/contact">Contact</Link></nav><span className="footer-copyright-trigger" onClick={triggerAdmin}>{settings.footerText || `© 2026 ${settings.logoText || identity.name}`}</span><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top"><ArrowUpRight size={16}/></button></div>
  </footer>
}

function Home({ intro, onOpenViewer }) {
  const { settings, heroSlides, categories: cmsCategories, photos, about } = usePublicContent()
  const [slide, setSlide] = useState(0)
  const slides = heroSlides.length ? heroSlides : images.hero.map(item => ({ src: item.src, altText: item.alt }))
  const categories = cmsCategories.length ? cmsCategories : []
  const current = slides[slide % slides.length] || images.hero[0]
  const heroTouchX = useRef(null)

  const change = useCallback((direction) => {
    setSlide(i => (i + direction + slides.length) % slides.length)
  }, [slides.length])

  // Preload adjacent slides so transitions are instant
  useEffect(() => {
    const next = slides[(slide + 1) % slides.length]
    const prev = slides[(slide - 1 + slides.length) % slides.length]
    ;[next, prev].forEach(s => {
      if (!s?.src) return
      const img = new Image()
      img.src = imageUrl(s.src, 2200)
    })
  }, [slide, slides])

  useEffect(() => {
    const timer = window.setInterval(() => setSlide(i => (i + 1) % slides.length), 7500)
    return () => window.clearInterval(timer)
  }, [slides.length])

  useEffect(() => {
    const key = e => {
      if (e.key === 'ArrowRight') change(1)
      if (e.key === 'ArrowLeft') change(-1)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [change])

  return <>
    <section
      className="hero"
      aria-label="Featured photography"
      onTouchStart={e => { heroTouchX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        if (heroTouchX.current === null) return
        const dx = e.changedTouches[0].clientX - heroTouchX.current
        heroTouchX.current = null
        if (Math.abs(dx) > 55) change(dx < 0 ? 1 : -1)
      }}
    >
      <AnimatePresence mode="wait">
        <motion.img
          key={current.src}
          className="hero-image"
          src={imageUrl(current.src, 2200)}
          sizes="100vw"
          alt={current.altText || current.alt || ''}
          initial={intro.show ? { opacity: 1, scale: 1.15 } : { opacity: 0, scale: 1.04 }}
          animate={intro.ready ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1.15 }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 1.2 }, scale: { duration: intro.show ? 1.6 : 8, ease: 'linear' } }}
        />
      </AnimatePresence>
      <div className="hero-shade" />
      <motion.div className="hero-copy" initial={{ opacity: 0, y: 18 }} animate={intro.ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }} transition={{ duration: 1.05, delay: intro.show ? 0.2 : 0.1, ease: motionTokens.easing.luxury }}><span className="eyebrow">{settings.tagline || identity.position}</span><h1>{settings.heroHeading || <>The art of<br/>being here</>}</h1><p>{settings.subtitle || identity.subline}</p></motion.div>
      <button className="hero-arrow hero-prev" onClick={() => change(-1)} aria-label="Previous photograph"><ArrowLeft/></button>
      <div className="hero-next-wrap"><span className="slide-count">{String(slide + 1).padStart(2, '0')} <i/> {String(slides.length).padStart(2, '0')}</span><button className="hero-arrow" onClick={() => change(1)} aria-label="Next photograph"><ArrowRight/></button></div>
      <a className="hero-scroll" href="#portfolio"><span>SCROLL TO EXPLORE</span><ArrowDown size={13}/></a>
    </section>
    <section className="portfolio section-wrap" id="portfolio">
      <motion.div className="section-heading" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: .2 }}><span className="eyebrow">A considered collection</span><h2>Stories, in their own light</h2></motion.div>
      <div className="category-grid">{categories.map((category, i) => {
        const fallback = <a className="category-card slice-fallback-card" href={`/portfolio/${category.slug}`} key={category.slug}><img src={localImage(category.coverImage, 900)} alt={category.coverImage.alt}/><h3>{category.title}</h3></a>
        return <SliceTileBoundary fallback={fallback} key={category.slug}><SliceTile image={category.coverImage} title={category.title} index={i} sliceCount={5} layoutId={`gallery-${category.slug}`} onOpen={details => onOpenViewer(category, 0, details)}/></SliceTileBoundary>
      })}</div>
    </section>
    <section className="about-teaser section-wrap">
      <motion.div className="teaser-image" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: .2 }}><img loading="lazy" src={localImage(about.portrait, 1200)} srcSet={localSrcSet(about.portrait)} sizes="(max-width: 640px) 90vw, 42vw" alt={about.portrait.alt} /></motion.div>
      <motion.div className="teaser-copy" variants={reveal} initial="hidden" whileInView="visible" viewport={{ once: true, amount: .2 }}><span className="eyebrow">A little about the person behind the lens</span><h2>Looking closer,<br/>feeling more</h2><p>{settings.aboutTeaser}</p><Link className="outline-button" to="/about">Read more <ArrowUpRight size={13}/></Link></motion.div>
    </section>
  </>
}

function ContactPage() {
  const { settings, contact } = usePublicContent()
  const { submitEnquiry } = usePortfolio()
  const [status, setStatus] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', interest: '', date: '', location: '', note: '' })
  const update = e => setForm({ ...form, [e.target.name]: e.target.value })
  const onVerify = useCallback(token => setTurnstileToken(token), [])
  const onExpire = useCallback(() => setTurnstileToken(''), [])

  const targetPhone = settings.whatsapp || settings.phone || identity.whatsapp || identity.phone || '919876543210'
  const cleanPhone = String(targetPhone).replace(/[^\d]/g, '')
  const formattedPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone

  const submit = async e => {
    e.preventDefault()
    const payload = new FormData(e.currentTarget)
    if (payload.get('_gotcha')) return
    if (hasTurnstile && !turnstileToken) { 
      setStatus({ text: 'Please complete the verification before sending your enquiry.', type: 'error' })
      return 
    }

    setSubmitting(true)
    setStatus(null)

    const waText = `Hi Kashif! I would like to book a photography session.

• Name: ${form.name}
• Interested in: ${form.interest}
• Date: ${form.date}
• Location: ${form.location}
• Phone: ${form.phone || 'Not provided'}
• Email: ${form.email}
• Note: ${form.note}`
    const waUrl = `https://wa.me/${formattedPhone}?text=${encodeURIComponent(waText)}`

    try {
      // 1. Save directly into Firebase Cloud Firestore & local Admin inbox
      if (typeof submitEnquiry === 'function') {
        await submitEnquiry({
          name: form.name,
          email: form.email,
          phone: form.phone,
          interest: form.interest,
          date: form.date,
          location: form.location,
          note: form.note,
          status: 'new'
        })
      }

      // 2. Also send in background via Formspree or email endpoint if available
      try {
        const recipientEmail = settings.email || identity.email
        const endpoint = contactFormConfigured
          ? `https://formspree.io/f/${FORMSPREE_FORM_ID}`
          : `https://formsubmit.co/ajax/${recipientEmail}`
        if (!contactFormConfigured) payload.set('_captcha', 'false')
        if (turnstileToken) payload.set('cf-turnstile-response', turnstileToken)
        payload.set('_replyto', form.email)
        payload.set('_subject', `Photography enquiry - ${form.name}`)
        fetch(endpoint, { method: 'POST', body: payload, headers: { Accept: 'application/json' } }).catch(() => {})
      } catch {}

      // 3. Open WhatsApp in new window
      try {
        window.open(waUrl, '_blank')
      } catch {}

      setStatus({
        text: 'Thank you! Your enquiry has been saved and sent to Kashif. Starting WhatsApp chat...',
        type: 'success',
        waUrl
      })
      setForm({ name: '', email: '', phone: '', interest: '', date: '', location: '', note: '' })
      setTurnstileToken('')
      window.turnstile?.reset()
    } catch (err) {
      setStatus({
        text: 'Thank you! You can connect with Kashif directly on WhatsApp:',
        type: 'success',
        waUrl
      })
    } finally {
      setSubmitting(false)
    }
  }

  const contactHeroSrc = contact?.heroImage?.src || 'photo-1511795409834-ef04bbd61622'
  return <main className="contact-page">
    <section className="contact-hero" aria-label="Contact hero">
      <img src={imageUrl(contactHeroSrc, 2200)} alt={contact?.heroImage?.alt || 'Work with Kashif'} />
      <div className="contact-hero-shade" />
      <div className="contact-hero-copy"><h1>{contact?.heading || `Work with ${identity.firstName}`}</h1><p>{contact?.subheading || 'Photography for people, places and moments'}</p></div>
    </section>
    <section className="contact-form-section">
      <p className="contact-intro">For celebrations, portraits and thoughtful collaborations.<br/>I would love to hear what you are planning.</p>
      
      <div className="contact-quick-whatsapp">
        <span>Looking for an instant reply?</span>
        <a 
          href={`https://wa.me/${formattedPhone}?text=${encodeURIComponent('Hi Kashif, I would like to enquire about photography bookings.')}`}
          target="_blank" 
          rel="noopener noreferrer"
          className="contact-wa-link"
        >
          Chat on WhatsApp <ArrowUpRight size={13}/>
        </a>
      </div>

      <form className="contact-form" onSubmit={submit}>
        <label className="honeypot" aria-hidden="true">Leave this field empty<input name="_gotcha" tabIndex="-1" autoComplete="off" /></label>
        <label className="form-field"><span>Name *</span><input name="name" autoComplete="name" value={form.name} onChange={update} required /></label>
        <label className="form-field"><span>Email address *</span><input type="email" name="email" autoComplete="email" value={form.email} onChange={update} required /></label>
        <label className="form-field"><span>Phone</span><input type="tel" name="phone" autoComplete="tel" value={form.phone} onChange={update} placeholder="Optional, for WhatsApp / Call" /></label>
        <label className="form-field"><span>Interested in *</span><select name="interest" value={form.interest} onChange={update} required><option value="" disabled></option><option>Weddings</option><option>Club &amp; Gigs</option><option>Event Photography</option><option>Models &amp; Fashion</option><option>Cultural Events</option><option>Concerts &amp; Shows</option><option>Content Creation</option><option>Other</option></select></label>
        <label className="form-field"><span>Date *</span><input type="date" name="date" value={form.date} onChange={update} required /></label>
        <label className="form-field"><span>Location *</span><input name="location" autoComplete="address-level2" value={form.location} onChange={update} placeholder="City, country" required /></label>
        <label className="form-field form-note"><span>Leave a note *</span><textarea name="note" value={form.note} onChange={update} rows="5" required /></label>
        {hasTurnstile && <TurnstileWidget onVerify={onVerify} onExpire={onExpire}/>}
        <button className="outline-button form-submit" type="submit" disabled={submitting}>{submitting ? 'Sending...' : 'Submit form'} <ArrowUpRight size={13}/></button>
        {status && (
          <div className={`form-status-wrap ${status.type}`}>
            <p className="form-status" role="status" aria-live="polite">{status.text}</p>
            {status.waUrl && (
              <a 
                href={status.waUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="outline-button wa-open-btn"
              >
                Open WhatsApp Chat <ArrowUpRight size={13}/>
              </a>
            )}
          </div>
        )}
        <p className="contact-availability">Based in {settings.baseCity || identity.city}, India · {settings.availabilityLine}</p>
      </form>
    </section>
  </main>
}
function AboutPage() {
  const { about, settings, categories } = usePublicContent()
  return <main className="about-page">
    <section className="about-hero">
      <img src={localImage(about.heroImage, 2200)} srcSet={localSrcSet(about.heroImage,[1000,1600,2200])} sizes="100vw" alt={about.heroImage.alt} />
      <div className="about-hero-shade" />
      <h1>{about.heading}</h1>
    </section>
    <section className="about-biography">
      <span className="eyebrow">Behind Flashlite Photography</span>
      <p>Kashif Rashid Khan creates photography that holds onto the atmosphere, feeling and movement of a moment.</p>
      <p>From intimate celebrations to the energy of a live crowd, each image is made with an attentive eye for the details that make an occasion its own.</p>
      <div className="about-services">
        <span className="eyebrow">Photography I do</span>
        <ul>{categories.map(category => <li key={category.slug}>{category.title}</li>)}</ul>
      </div>
    </section>
    <p className="about-availability">{settings.availabilityLine}</p>
  </main>
}

function CategoryPage({ onOpenViewer }) {
  const { slug } = useParams()
  const { categories, photos } = usePublicContent()
  const category = categories.find(item => item.slug === slug)
  const gallery = photos.filter(photo => photo.categorySlug === slug)
  
  if (!category) {
    return (
      <main className="placeholder-page">
        <span className="eyebrow">Portfolio</span>
        <h1>Collection not found</h1>
        <p>This collection may have moved or is not yet published.</p>
        <Link className="outline-button" to="/#portfolio">Explore Collections</Link>
      </main>
    )
  }

  return (
    <main className="category-page">
      <header className="category-page-heading">
        <Link to="/#portfolio" className="category-back-link" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#888', marginBottom: '22px' }}>
          <ArrowLeft size={13}/> Back to all collections
        </Link>
        <span className="eyebrow" style={{ display: 'block' }}>Selected stories</span>
        <h1>{category.title}</h1>
        {category.description && <p>{category.description}</p>}
      </header>
      {gallery.length ? (
        <div className="gallery-grid">
          {gallery.map((photo, i) => {
            const title = photo.caption || `${category.title} · Photograph ${String(i + 1).padStart(2, '0')}`
            const fallback = (
              <a className="gallery-fallback" href={localImage(photo.image, 2200)} target="_blank" rel="noreferrer" key={photo._id}>
                <img src={localImage(photo.image, 900)} alt={photo.altText || ''}/>
                <span>{title}</span>
              </a>
            )
            return (
              <SliceTileBoundary fallback={fallback} key={photo._id}>
                <StaticGalleryTile
                  image={photo.image}
                  title={title}
                  onOpen={details => onOpenViewer(category, i, { ...details, animateTransition: false })}
                />
              </SliceTileBoundary>
            )
          })}
        </div>
      ) : (
        <p className="empty-gallery">This collection is being prepared. Please return soon.</p>
      )}
    </main>
  )
}
function PlaceholderPage({ title }) {
  return <main className="placeholder-page"><span className="eyebrow">An invitation to begin</span><h1>{title}</h1><Link className="outline-button" to="/">Return home <ArrowUpRight size={13}/></Link></main>
}
function readInitialIntroState() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return { show: false, ready: true }
  try {
    const show = window.sessionStorage.getItem('portfolio-intro-shown') !== 'true'
    return { show, ready: !show }
  } catch {
    return { show: false, ready: true }
  }
}
function App() {
  const location = useLocation()
  const { content, setIsAdminOpen } = usePortfolio()
  const [intro, setIntro] = useState(readInitialIntroState)
  const [viewer, setViewer] = useState(null)
  const lenisRef = useSmoothScroll()
  const openViewer = useCallback((category, initialIndex, details = {}) => {
    const album = (content?.photos || []).filter(photo => photo.categorySlug === category.slug)
    if (!album.length) return
    setViewer({ category, photos: album, initialIndex, opener: details.opener, resetTile: details.resetTile, animateTransition: details.animateTransition !== false })
  }, [content?.photos])
  const closeViewer = useCallback(() => setViewer(null), [])
  useEffect(() => {
    if (intro.show) {
      try { window.sessionStorage.setItem('portfolio-intro-shown', 'true') } catch { /* Session storage may be unavailable. */ }
    }
  }, [intro.show])
  useEffect(() => {
    if (location.hash && location.hash !== '#admin') {
      const target = document.querySelector(location.hash)
      if (target && lenisRef.current) lenisRef.current.scrollTo(target, { offset: -80, duration: 1.1 })
      else target?.scrollIntoView({ behavior: 'smooth' })
    } else if (lenisRef.current && location.hash !== '#admin') {
      lenisRef.current.scrollTo(0, { immediate: true })
    } else if (location.hash !== '#admin') {
      window.scrollTo(0, 0)
    }
  }, [location.pathname, location.hash, lenisRef])
  return <>
    <SEO/>
    <Header/>
    <AnimatePresence mode="wait">
      <motion.div key={location.pathname} className="page-shell" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .3 }}>
        <Routes location={location}>
          <Route path="/" element={<Home intro={intro} onOpenViewer={openViewer}/>}/>
          <Route path="/about" element={<AboutPage/>}/>
          <Route path="/contact" element={<ContactPage/>}/>
          <Route path="/portfolio/:slug" element={<CategoryPage onOpenViewer={openViewer}/>}/>
          <Route path="*" element={<PlaceholderPage title="Page not found"/>}/>
        </Routes>
        <Footer/>
      </motion.div>
    </AnimatePresence>
    <AnimatePresence>
      {viewer && <FullscreenViewer category={viewer.category} photos={viewer.photos} initialIndex={viewer.initialIndex} onClose={closeViewer} opener={viewer.opener} resetTile={viewer.resetTile} animateTransition={viewer.animateTransition}/>}
    </AnimatePresence>
    {intro.show && <Preloader onReveal={() => setIntro(state => ({ ...state, ready: true }))} onComplete={() => setIntro({ show: false, ready: true })}/>}
    <AdminModal/>
  </>
}

export default App
