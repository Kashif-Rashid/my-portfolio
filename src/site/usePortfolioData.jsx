import { useState, useEffect, createContext, useContext, useRef } from 'react'
import { localContent as defaultContent } from './content'
import { 
  pushContentToCloud, 
  subscribeToCloudContent, 
  getStoredFirebaseConfig, 
  reinitFirebase,
  getDb,
  fetchContentFromCloud,
  saveEnquiryToCloud,
  fetchEnquiriesFromCloud,
  subscribeToCloudEnquiries,
  deleteEnquiryFromCloud,
  updateEnquiryStatusInCloud,
  getLocalEnquiries
} from './firebase'

const STORAGE_KEY = 'portfolio_cms_content_v1'
const ADMIN_PIN_KEY = 'portfolio_admin_pin_v1'
const DEFAULT_PIN = '7253'
const DB_NAME = 'portfolio_cms_db'
const DB_VERSION = 1
const STORE_NAME = 'cms_store'

// Lightweight IndexedDB helper for resilient high-capacity storage
function openDb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function idbGet(key) {
  try {
    const db = await openDb()
    if (!db) return null
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(key)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

async function idbSet(key, value) {
  try {
    const db = await openDb()
    if (!db) return false
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.put(value, key)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

async function idbRemove(key) {
  try {
    const db = await openDb()
    if (!db) return false
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(key)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

const sanitizePhotos = (photos) => {
  return (photos || []).map((p, idx) => ({
    ...p,
    _id: p._id || `photo-${p.categorySlug || 'collection'}-${idx}-${Date.now()}`
  }))
}

const PortfolioContext = createContext(null)

export function PortfolioProvider({ children }) {
  const cloudPushTimer = useRef(null)
  const [cloudSyncStatus, setCloudSyncStatus] = useState('synced')
  const [content, setContent] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          ...defaultContent,
          ...parsed,
          settings: { ...defaultContent.settings, ...(parsed.settings || {}) },
          about: { ...defaultContent.about, ...(parsed.about || {}) },
          contact: { ...defaultContent.contact, ...(parsed.contact || {}) },
          categories: parsed.categories?.length ? parsed.categories : defaultContent.categories,
          photos: sanitizePhotos(parsed.photos?.length ? parsed.photos : defaultContent.photos),
          heroSlides: parsed.heroSlides?.length ? parsed.heroSlides : defaultContent.heroSlides,
        }
      }
    } catch (e) {
      console.warn('Failed to load portfolio storage:', e)
    }
    return {
      ...defaultContent,
      photos: sanitizePhotos(defaultContent.photos)
    }
  })

  const [isAdminOpen, setIsAdminOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Sync from IndexedDB in case it has newer or larger data
  useEffect(() => {
    idbGet(STORAGE_KEY).then(saved => {
      if (saved && saved._lastSavedAt) {
        setContent(prev => {
          if (!prev._lastSavedAt || saved._lastSavedAt > prev._lastSavedAt) {
            return {
              ...defaultContent,
              ...saved,
              settings: { ...defaultContent.settings, ...(saved.settings || {}) },
              about: { ...defaultContent.about, ...(saved.about || {}) },
              contact: { ...defaultContent.contact, ...(saved.contact || {}) },
              categories: saved.categories?.length ? saved.categories : defaultContent.categories,
              photos: sanitizePhotos(saved.photos?.length ? saved.photos : defaultContent.photos),
              heroSlides: saved.heroSlides?.length ? saved.heroSlides : defaultContent.heroSlides,
            }
          }
          return prev
        })
      }
    })
  }, [])

  // Listen for #admin or hash changes and shortcut
  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === '#admin') {
        setIsAdminOpen(true)
      }
    }
    handleHash()
    window.addEventListener('hashchange', handleHash)

    // Keyboard shortcut: Ctrl + Shift + A (or Cmd + Shift + A)
    const handleKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault()
        setIsAdminOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKey)

    return () => {
      window.removeEventListener('hashchange', handleHash)
      window.removeEventListener('keydown', handleKey)
    }
  }, [])

  const [cloudConnected, setCloudConnected] = useState(() => Boolean(getDb()))

  // Subscribe to real-time Cloud updates (Laptop <-> Phone <-> Visitors sync)
  useEffect(() => {
    const unsubscribe = subscribeToCloudContent((cloudData) => {
      if (cloudData && (cloudData.categories?.length || cloudData.photos?.length)) {
        setContent(() => {
          const cloudTime = cloudData._lastSavedAt || cloudData._cloudSyncedAt || Date.now()
          const merged = {
            ...defaultContent,
            ...cloudData,
            settings: { ...defaultContent.settings, ...(cloudData.settings || {}) },
            about: { ...defaultContent.about, ...(cloudData.about || {}) },
            contact: { ...defaultContent.contact, ...(cloudData.contact || {}) },
            categories: cloudData.categories?.length ? cloudData.categories : defaultContent.categories,
            photos: sanitizePhotos(cloudData.photos?.length ? cloudData.photos : defaultContent.photos),
            heroSlides: cloudData.heroSlides?.length ? cloudData.heroSlides : defaultContent.heroSlides,
            _lastSavedAt: cloudTime
          }
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
          } catch (e) { /* ignore */ }
          idbSet(STORAGE_KEY, merged)
          return merged
        })
      }
    })

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [cloudConnected])

  // Initial cloud sync check: if cloud has content, load it into state and cache
  useEffect(() => {
    fetchContentFromCloud().then((cloudData) => {
      if (cloudData && (cloudData.categories?.length || cloudData.photos?.length)) {
        setContent(() => {
          const cloudTime = cloudData._lastSavedAt || cloudData._cloudSyncedAt || Date.now()
          const merged = {
            ...defaultContent,
            ...cloudData,
            settings: { ...defaultContent.settings, ...(cloudData.settings || {}) },
            about: { ...defaultContent.about, ...(cloudData.about || {}) },
            contact: { ...defaultContent.contact, ...(cloudData.contact || {}) },
            categories: cloudData.categories?.length ? cloudData.categories : defaultContent.categories,
            photos: sanitizePhotos(cloudData.photos?.length ? cloudData.photos : defaultContent.photos),
            heroSlides: cloudData.heroSlides?.length ? cloudData.heroSlides : defaultContent.heroSlides,
            _lastSavedAt: cloudTime
          }
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)) } catch (e) {}
          idbSet(STORAGE_KEY, merged)
          return merged
        })
      }
    }).catch(() => {})
  }, [])

  // -----------------------------------------------------------------
  // Client Inquiries (Real-time Cloud Sync + Local Offline Resilience)
  // -----------------------------------------------------------------
  const [enquiries, setEnquiries] = useState(() => getLocalEnquiries())

  useEffect(() => {
    fetchEnquiriesFromCloud().then((cloudEnquiries) => {
      if (cloudEnquiries && Array.isArray(cloudEnquiries)) {
        setEnquiries(cloudEnquiries)
      }
    }).catch(() => {})

    const unsubEnquiries = subscribeToCloudEnquiries((list) => {
      if (list && Array.isArray(list)) {
        setEnquiries(list)
      }
    })

    return () => {
      if (typeof unsubEnquiries === 'function') unsubEnquiries()
    }
  }, [cloudConnected])

  const submitEnquiry = async (enquiryData) => {
    const saved = await saveEnquiryToCloud(enquiryData)
    setEnquiries(prev => [saved, ...prev.filter(e => e.id !== saved.id)])
    return saved
  }

  const deleteEnquiry = async (id) => {
    await deleteEnquiryFromCloud(id)
    setEnquiries(prev => prev.filter(e => e.id !== id))
  }

  const updateEnquiryStatus = async (id, status) => {
    await updateEnquiryStatusInCloud(id, status)
    setEnquiries(prev => prev.map(e => e.id === id ? { ...e, status } : e))
  }

  const syncCurrentContentToCloud = async () => {
    try {
      setCloudSyncStatus('syncing')
      const result = await pushContentToCloud({
        ...content,
        _lastSavedAt: Date.now()
      })
      setCloudSyncStatus(result?.ok ? 'synced' : 'error')
      return result || { ok: false, error: 'Cloud sync failed.' }
    } catch (e) {
      console.error('syncCurrentContentToCloud error:', e)
      setCloudSyncStatus('error')
      return { ok: false, error: e?.message || 'Cloud sync failed.' }
    }
  }

  const saveFirebaseConfig = (config) => {
    reinitFirebase(config)
    const isNowConnected = Boolean(getDb())
    setCloudConnected(isNowConnected)
    if (isNowConnected) {
      pushContentToCloud({ ...content, _lastSavedAt: Date.now() })
      alert('Firebase Cloud Sync connected! All devices (phone & laptop) are now live synchronized.')
      return true
    } else {
      alert('Cloud Sync disconnected. Portfolio is in local device mode.')
      return false
    }
  }

  // Functional saveContent to avoid stale state closures
  const saveContent = (updaterOrContent) => {
    setContent(prevContent => {
      const nextContent = typeof updaterOrContent === 'function' 
        ? updaterOrContent(prevContent) 
        : updaterOrContent

      const finalized = {
        ...nextContent,
        _lastSavedAt: Date.now()
      }

      // 1. Try saving to localStorage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(finalized))
      } catch (e) {
        console.warn('LocalStorage quota or write error, IndexedDB will maintain changes:', e)
      }

      // 2. Save to IndexedDB (asynchronous, virtually unlimited quota for media)
      idbSet(STORAGE_KEY, finalized)

      // 3. Push to Firebase Cloud Firestore for real-time live sync across Laptop & Phone
      // Coalesce rapid edits so uploads don't pile up on mobile connections.
      if (cloudPushTimer.current) clearTimeout(cloudPushTimer.current)
      cloudPushTimer.current = setTimeout(() => {
        setCloudSyncStatus('syncing')
        pushContentToCloud(finalized).then(result => {
          setCloudSyncStatus(result?.ok ? 'synced' : 'error')
        }).catch(() => setCloudSyncStatus('error'))
      }, 600)

      return finalized
    })
  }

  const updateSettings = (newSettings) => {
    saveContent(prev => ({
      ...prev,
      settings: { ...(prev.settings || {}), ...newSettings }
    }))
  }

  const updateAbout = (newAbout) => {
    saveContent(prev => ({
      ...prev,
      about: { ...(prev.about || {}), ...newAbout }
    }))
  }

  const updateContact = (newContact) => {
    saveContent(prev => ({
      ...prev,
      contact: { ...(prev.contact || defaultContent.contact || {}), ...newContact }
    }))
  }

  // Hero Slides management (Home background images)
  const addHeroSlide = (slideData) => {
    saveContent(prev => {
      const currentSlides = prev.heroSlides || []
      return {
        ...prev,
        heroSlides: [...currentSlides, { src: slideData.src, altText: slideData.altText || 'Hero background slide' }]
      }
    })
  }

  const editHeroSlide = (index, slideData) => {
    saveContent(prev => {
      const currentSlides = [...(prev.heroSlides || [])]
      if (index >= 0 && index < currentSlides.length) {
        currentSlides[index] = {
          ...currentSlides[index],
          src: slideData.src || currentSlides[index].src,
          altText: slideData.altText !== undefined ? slideData.altText : currentSlides[index].altText
        }
      }
      return {
        ...prev,
        heroSlides: currentSlides
      }
    })
  }

  const deleteHeroSlide = (index) => {
    saveContent(prev => ({
      ...prev,
      heroSlides: (prev.heroSlides || []).filter((_, i) => i !== index)
    }))
  }

  const setHeroSlides = (slides) => {
    saveContent(prev => ({
      ...prev,
      heroSlides: slides
    }))
  }

  // Photo management
  const addPhoto = (photoData) => {
    const newId = `custom-photo-${Date.now()}`
    const newPhoto = {
      _id: newId,
      categorySlug: photoData.categorySlug,
      src: photoData.src,
      image: { src: photoData.src, alt: photoData.altText || photoData.caption || 'Photograph' },
      altText: photoData.altText || photoData.caption || '',
      caption: photoData.caption || '',
      isFeatured: Boolean(photoData.isFeatured),
    }

    saveContent(prev => ({
      ...prev,
      photos: [newPhoto, ...(prev.photos || [])]
    }))
  }

  const editPhoto = (photoId, updatedFields) => {
    saveContent(prev => {
      const updatedPhotos = (prev.photos || []).map((p) => {
        // Match by _id or image src
        const isMatch = p._id === photoId || (p.image?.src && p.image?.src === photoId)
        if (isMatch) {
          const newSrc = updatedFields.src || p.image?.src || p.src
          const newAlt = updatedFields.altText !== undefined ? updatedFields.altText : (p.altText || p.image?.alt || '')
          const newCaption = updatedFields.caption !== undefined ? updatedFields.caption : (p.caption || '')
          const newCategory = updatedFields.categorySlug || p.categorySlug
          const newFeatured = updatedFields.isFeatured !== undefined ? updatedFields.isFeatured : p.isFeatured

          return {
            ...p,
            ...updatedFields,
            src: newSrc,
            image: {
              ...(p.image || {}),
              src: newSrc,
              alt: newAlt
            },
            altText: newAlt,
            caption: newCaption,
            categorySlug: newCategory,
            isFeatured: newFeatured
          }
        }
        return p
      })

      return {
        ...prev,
        photos: updatedPhotos
      }
    })
  }

  const deletePhoto = (photoId) => {
    saveContent(prev => ({
      ...prev,
      photos: (prev.photos || []).filter(p => p._id !== photoId && p.image?.src !== photoId)
    }))
  }

  // Category management
  const addCategory = (title, coverSrc, description = '') => {
    const slug = title.toLowerCase().trim().replaceAll(' ', '-').replaceAll('&', 'and')
    let exists = false

    saveContent(prev => {
      if ((prev.categories || []).some(c => c.slug === slug)) {
        exists = true
        return prev
      }
      const newCategory = {
        title,
        slug,
        src: coverSrc,
        description,
        coverImage: { src: coverSrc, alt: `${title} portfolio collection` }
      }
      return {
        ...prev,
        categories: [...(prev.categories || []), newCategory]
      }
    })

    if (exists) {
      alert('A category with this name already exists.')
      return false
    }
    return true
  }

  const editCategory = (slug, updatedFields) => {
    saveContent(prev => {
      const updatedCategories = (prev.categories || []).map(c => {
        if (c.slug === slug) {
          const title = updatedFields.title || c.title
          const newSlug = title.toLowerCase().trim().replaceAll(' ', '-').replaceAll('&', 'and')
          const src = updatedFields.src || c.src
          return {
            ...c,
            title,
            slug: newSlug,
            src,
            description: updatedFields.description ?? c.description,
            coverImage: { src, alt: `${title} portfolio collection` }
          }
        }
        return c
      })

      let updatedPhotos = prev.photos || []
      if (updatedFields.title) {
        const newSlug = updatedFields.title.toLowerCase().trim().replaceAll(' ', '-').replaceAll('&', 'and')
        if (newSlug !== slug) {
          updatedPhotos = updatedPhotos.map(p => p.categorySlug === slug ? { ...p, categorySlug: newSlug } : p)
        }
      }

      return {
        ...prev,
        categories: updatedCategories,
        photos: updatedPhotos
      }
    })
  }

  const deleteCategory = (slug) => {
    if (!confirm('Are you sure you want to delete this category? Its photographs will also be deleted.')) return
    saveContent(prev => ({
      ...prev,
      categories: (prev.categories || []).filter(c => c.slug !== slug),
      photos: (prev.photos || []).filter(p => p.categorySlug !== slug)
    }))
  }

  // Reset to original content
  const resetToDefault = () => {
    if (confirm('Are you sure you want to restore original default content? All custom edits will be cleared.')) {
      localStorage.removeItem(STORAGE_KEY)
      idbRemove(STORAGE_KEY)
      setContent({
        ...defaultContent,
        photos: sanitizePhotos(defaultContent.photos)
      })
      alert('Portfolio has been reset to defaults.')
    }
  }

  // Reload default photos from code without wiping categories and settings
  const syncLatestCodePhotos = () => {
    if (confirm('Do you want to reload default photos from project code? Your custom categories and settings will be preserved.')) {
      saveContent(prev => ({
        ...prev,
        photos: sanitizePhotos(defaultContent.photos),
        heroSlides: defaultContent.heroSlides,
      }))
      alert('Photos synchronized from code successfully!')
    }
  }

  // Export JSON backup
  const exportData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(content, null, 2))
    const downloadAnchor = document.createElement('a')
    downloadAnchor.setAttribute("href", dataStr)
    downloadAnchor.setAttribute("download", `portfolio-content-backup-${new Date().toISOString().slice(0, 10)}.json`)
    document.body.appendChild(downloadAnchor)
    downloadAnchor.click()
    downloadAnchor.remove()
  }

  // Import JSON backup
  const importData = (jsonString) => {
    try {
      const parsed = JSON.parse(jsonString)
      saveContent({
        ...defaultContent,
        ...parsed,
        photos: sanitizePhotos(parsed.photos || defaultContent.photos)
      })
      alert('Content imported successfully!')
      return true
    } catch (e) {
      alert('Invalid backup JSON file.')
      return false
    }
  }

  // PIN validation
  const checkPin = (pin) => {
    const savedPin = localStorage.getItem(ADMIN_PIN_KEY) || DEFAULT_PIN
    if (pin === savedPin) {
      setIsAuthenticated(true)
      return true
    }
    return false
  }

  const changePin = (newPin) => {
    if (!newPin || newPin.length < 4) {
      alert('PIN must be at least 4 digits.')
      return false
    }
    localStorage.setItem(ADMIN_PIN_KEY, newPin)
    alert('Admin PIN updated successfully!')
    return true
  }

  const closeAdmin = () => {
    setIsAdminOpen(false)
    if (window.location.hash === '#admin') {
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }

  return (
    <PortfolioContext.Provider value={{
      content,
      isAdminOpen,
      isAuthenticated,
      setIsAdminOpen,
      closeAdmin,
      checkPin,
      changePin,
      updateSettings,
      updateAbout,
      updateContact,
      addHeroSlide,
      editHeroSlide,
      deleteHeroSlide,
      setHeroSlides,
      addPhoto,
      editPhoto,
      deletePhoto,
      addCategory,
      editCategory,
      deleteCategory,
      resetToDefault,
      syncLatestCodePhotos,
      exportData,
      importData,
      saveContent,
      cloudConnected,
      cloudSyncStatus,
      saveFirebaseConfig,
      getStoredFirebaseConfig,
      syncCurrentContentToCloud,
      enquiries,
      submitEnquiry,
      deleteEnquiry,
      updateEnquiryStatus
    }}>
      {children}
    </PortfolioContext.Provider>
  )
}

export function usePortfolio() {
  const context = useContext(PortfolioContext)
  if (!context) {
    throw new Error('usePortfolio must be used within a PortfolioProvider')
  }
  return context
}
