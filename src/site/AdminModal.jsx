import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X, Plus, Trash2, Edit3, Image as ImageIcon, Settings, User, 
  FolderPlus, Upload, Download, RefreshCw, Key, Check, AlertCircle, Eye, Layers, Loader2, Cloud, Globe,
  MessageSquare, Phone, Mail, Calendar, MapPin, Clock, MessageCircle, ExternalLink, CheckCircle
} from 'lucide-react'
import { usePortfolio } from './usePortfolioData'
import { imageUrl } from './content'

// Automatically compress device images client-side before Base64 storage
const compressImage = (file, maxWidth = 1600, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      return reject(new Error('Selected file is not an image'))
    }
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
      return
    }
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        let width = img.width
        let height = img.height
        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width)
            width = maxWidth
          } else {
            width = Math.round((width * maxWidth) / height)
            height = maxWidth
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('Image compression failed'))
          const output = new FileReader()
          output.onload = event => resolve(event.target.result)
          output.onerror = reject
          output.readAsDataURL(blob)
        }, 'image/jpeg', quality)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

// Automatically compresses uncompressed/large Base64 data URLs before storage
const compressDataUrl = (dataUrl, maxWidth = 1400, quality = 0.78) => {
  return new Promise((resolve) => {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/') || dataUrl.length < 50000) {
      return resolve(dataUrl)
    }
    const img = new Image()
    img.onload = () => {
      let width = img.width
      let height = img.height
      if (width > maxWidth || height > maxWidth) {
        if (width > height) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        } else {
          width = Math.round((width * maxWidth) / height)
          height = maxWidth
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      try {
        canvas.toBlob(blob => {
          if (!blob) return resolve(dataUrl)
          const output = new FileReader()
          output.onload = event => resolve(event.target.result)
          output.onerror = () => resolve(dataUrl)
          output.readAsDataURL(blob)
        }, 'image/jpeg', quality)
      } catch {
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

export function AdminModal() {
  const {
    content,
    isAdminOpen,
    isAuthenticated,
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
    cloudConnected,
    cloudSyncStatus,
    saveFirebaseConfig,
    getStoredFirebaseConfig,
    syncCurrentContentToCloud,
    enquiries = [],
    deleteEnquiry,
    updateEnquiryStatus
  } = usePortfolio()

  // Cloud Config state
  const [firebaseConfigInput, setFirebaseConfigInput] = useState(() => {
    const current = getStoredFirebaseConfig?.()
    return current ? JSON.stringify(current, null, 2) : ''
  })
  const [showCloudConfig, setShowCloudConfig] = useState(false)
  const [cloudSyncing, setCloudSyncing] = useState(false)
  const [cloudSyncFeedback, setCloudSyncFeedback] = useState(null)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)

  const handlePushToCloud = async () => {
    if (cloudSyncing) return
    
    // If just synced in the last 2.5 seconds, don't spam Firestore document write limit
    if (lastSyncedAt && Date.now() - lastSyncedAt < 2500) {
      setCloudSyncFeedback({ type: 'success', text: 'Cloud is already 100% updated with your latest changes.' })
      return
    }

    setCloudSyncing(true)
    setCloudSyncFeedback(null)
    try {
      const result = await syncCurrentContentToCloud()
      if (result?.ok) {
        setLastSyncedAt(Date.now())
        setCloudSyncFeedback({ type: 'success', text: 'Cloud sync successful! Phone & laptop are now 100% updated.' })
      } else {
        setCloudSyncFeedback({ type: 'error', text: `Cloud sync failed: ${result?.error || 'Unknown Firebase error'}` })
      }
    } catch (err) {
      setCloudSyncFeedback({ type: 'error', text: 'Sync error: ' + (err?.message || 'Network busy') })
    } finally {
      setCloudSyncing(false)
      setTimeout(() => setCloudSyncFeedback(null), 5000)
    }
  }

  // PIN login state
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')

  // Active Tab: 'photos' | 'categories' | 'banners' | 'profile' | 'settings' | 'enquiries'
  const [activeTab, setActiveTab] = useState('photos')
  const [enquiryFilter, setEnquiryFilter] = useState('all')
  const [enquirySearch, setEnquirySearch] = useState('')

  // Photo Filter & Form States
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all')
  const [isAddingPhoto, setIsAddingPhoto] = useState(false)
  const [editingPhotoId, setEditingPhotoId] = useState(null)
  const [photoForm, setPhotoForm] = useState({
    src: '',
    caption: '',
    altText: '',
    categorySlug: '',
    isFeatured: false
  })

  // Category Form State
  const [isAddingCategory, setIsAddingCategory] = useState(false)
  const [editingCategorySlug, setEditingCategorySlug] = useState(null)
  const [categoryForm, setCategoryForm] = useState({
    title: '',
    src: '',
    description: ''
  })

  // Home Background Hero Slides State
  const [isAddingSlide, setIsAddingSlide] = useState(false)
  const [editingSlideIndex, setEditingSlideIndex] = useState(null)
  const [slideForm, setSlideForm] = useState({
    src: '',
    altText: ''
  })

  // Banner forms for About & Contact
  const [aboutBannerSrc, setAboutBannerSrc] = useState(content.about?.heroImage?.src || 'photo-1523438885200-e635ba2c371e')
  const [aboutBannerAlt, setAboutBannerAlt] = useState(content.about?.heroImage?.alt || 'About Kashif hero banner')

  const [contactBannerSrc, setContactBannerSrc] = useState(content.contact?.heroImage?.src || 'photo-1511795409834-ef04bbd61622')
  const [contactBannerAlt, setContactBannerAlt] = useState(content.contact?.heroImage?.alt || 'Work with Kashif hero banner')

  // Settings / Profile Form States
  const [settingsForm, setSettingsForm] = useState({ ...content.settings })
  const [aboutForm, setAboutForm] = useState({
    heading: content.about?.heading || '',
    teaser: content.settings?.aboutTeaser || '',
    pullQuote: content.settings?.pullQuote || '',
    portraitSrc: content.about?.portrait?.src || '',
    heroImageSrc: content.about?.heroImage?.src || ''
  })

  // Sync state whenever content changes
  useEffect(() => {
    if (content) {
      setAboutBannerSrc(content.about?.heroImage?.src || 'photo-1523438885200-e635ba2c371e')
      setAboutBannerAlt(content.about?.heroImage?.alt || 'About Kashif hero banner')
      setContactBannerSrc(content.contact?.heroImage?.src || 'photo-1511795409834-ef04bbd61622')
      setContactBannerAlt(content.contact?.heroImage?.alt || 'Work with Kashif hero banner')
      setSettingsForm({ ...content.settings })
      setAboutForm({
        heading: content.about?.heading || '',
        teaser: content.settings?.aboutTeaser || '',
        pullQuote: content.settings?.pullQuote || '',
        portraitSrc: content.about?.portrait?.src || '',
        heroImageSrc: content.about?.heroImage?.src || ''
      })
    }
  }, [content])

  // Compression & file upload status
  const [isUploading, setIsUploading] = useState(false)

  // PIN change state
  const [newPin, setNewPin] = useState('')
  const fileInputRef = useRef(null)
  const categoryFileInputRef = useRef(null)
  const backupInputRef = useRef(null)
  const slideFileRef = useRef(null)
  const aboutBannerFileRef = useRef(null)
  const contactBannerFileRef = useRef(null)
  const portraitFileRef = useRef(null)
  const photoFormRef = useRef(null)

  const filteredEnquiries = (enquiries || []).filter(item => {
    const matchesFilter = enquiryFilter === 'all' || (item.status || 'new') === enquiryFilter
    if (!matchesFilter) return false
    if (!enquirySearch.trim()) return true
    const q = enquirySearch.toLowerCase()
    return (
      (item.name || '').toLowerCase().includes(q) ||
      (item.email || '').toLowerCase().includes(q) ||
      (item.phone || '').toLowerCase().includes(q) ||
      (item.location || '').toLowerCase().includes(q) ||
      (item.interest || '').toLowerCase().includes(q) ||
      (item.note || '').toLowerCase().includes(q)
    )
  })

  if (!isAdminOpen) return null

  // Handle PIN submission
  const handlePinSubmit = (e) => {
    e.preventDefault()
    if (checkPin(pinInput)) {
      setPinError('')
      setPinInput('')
    } else {
      setPinError('Incorrect PIN. Please try again.')
    }
  }

  // Handle file upload with automatic client-side compression
  const handleFileUpload = async (e, callback) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const compressedData = await compressImage(file, 1400, 0.76)
      callback(compressedData)
    } catch (err) {
      console.warn('Compression failed, using standard reader:', err)
      const reader = new FileReader()
      reader.onload = (event) => callback(event.target.result)
      reader.readAsDataURL(file)
    } finally {
      setIsUploading(false)
      if (e.target) e.target.value = ''
    }
  }

  // Open Edit Photo Modal and auto-scroll to form
  const startEditPhoto = (photo) => {
    setEditingPhotoId(photo._id)
    setPhotoForm({
      src: photo.image?.src || photo.src || '',
      caption: photo.caption || '',
      altText: photo.altText || photo.image?.alt || '',
      categorySlug: photo.categorySlug || content.categories[0]?.slug || '',
      isFeatured: Boolean(photo.isFeatured)
    })
    setIsAddingPhoto(true)
    setTimeout(() => {
      photoFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  const handleSavePhoto = async (e) => {
    e.preventDefault()
    if (!photoForm.src.trim()) {
      alert('Please provide an image link or upload an image file.')
      return
    }
    const slug = photoForm.categorySlug || content.categories[0]?.slug
    if (!slug) {
      alert('Please create at least one category before adding photos.')
      return
    }

    const compressedSrc = await compressDataUrl(photoForm.src.trim(), 1200, 0.72)

    if (editingPhotoId) {
      editPhoto(editingPhotoId, {
        ...photoForm,
        src: compressedSrc,
        categorySlug: slug
      })
      alert('Photograph updated successfully!')
    } else {
      addPhoto({
        ...photoForm,
        src: compressedSrc,
        categorySlug: slug
      })
      alert('New photograph added successfully!')
    }

    setIsAddingPhoto(false)
    setEditingPhotoId(null)
    setPhotoForm({ src: '', caption: '', altText: '', categorySlug: '', isFeatured: false })
  }

  // Handle Category Save
  const startEditCategory = (cat) => {
    setEditingCategorySlug(cat.slug)
    setCategoryForm({
      title: cat.title,
      src: cat.src || cat.coverImage?.src || '',
      description: cat.description || ''
    })
    setIsAddingCategory(true)
  }

  const handleSaveCategory = async (e) => {
    e.preventDefault()
    if (!categoryForm.title.trim() || !categoryForm.src.trim()) {
      alert('Please fill in category title and cover image.')
      return
    }

    const compressedSrc = await compressDataUrl(categoryForm.src.trim(), 900, 0.72)

    if (editingCategorySlug) {
      editCategory(editingCategorySlug, {
        ...categoryForm,
        src: compressedSrc
      })
      alert('Category updated successfully!')
    } else {
      addCategory(categoryForm.title, compressedSrc, categoryForm.description)
      alert('New category created successfully!')
    }

    setIsAddingCategory(false)
    setEditingCategorySlug(null)
    setCategoryForm({ title: '', src: '', description: '' })
  }

  // Save Settings
  const handleSaveSettings = (e) => {
    e.preventDefault()
    updateSettings(settingsForm)
    alert('General settings updated successfully!')
  }

  // Save About page
  const handleSaveAbout = async (e) => {
    e.preventDefault()
    const portraitSrc = aboutForm.portraitSrc ? await compressDataUrl(aboutForm.portraitSrc.trim()) : ''
    updateSettings({
      aboutTeaser: aboutForm.teaser,
      pullQuote: aboutForm.pullQuote
    })
    updateAbout({
      heading: aboutForm.heading,
      portrait: { src: portraitSrc, alt: 'Photographer Portrait' },
      heroImage: { src: aboutForm.heroImageSrc, alt: 'About Hero Image' }
    })
    alert('About page details updated successfully!')
  }

  // Save Home Slide
  const handleSaveSlide = async (e) => {
    e.preventDefault()
    if (!slideForm.src.trim()) {
      alert('Please specify an image URL or upload an image file.')
      return
    }
    const compressedSrc = await compressDataUrl(slideForm.src.trim())
    if (editingSlideIndex !== null) {
      editHeroSlide(editingSlideIndex, { ...slideForm, src: compressedSrc })
      alert(`Home background slide #${editingSlideIndex + 1} updated!`)
    } else {
      addHeroSlide({ ...slideForm, src: compressedSrc })
      alert('New Home background slide added!')
    }
    setIsAddingSlide(false)
    setEditingSlideIndex(null)
    setSlideForm({ src: '', altText: '' })
  }

  // Save About Banner
  const handleSaveAboutHero = async () => {
    if (!aboutBannerSrc.trim()) {
      alert('Please enter an image URL or upload an image.')
      return
    }
    const compressedSrc = await compressDataUrl(aboutBannerSrc.trim())
    updateAbout({
      heroImage: { src: compressedSrc, alt: aboutBannerAlt.trim() || 'About hero banner' }
    })
    alert('About page banner image updated successfully!')
  }

  // Save Contact Banner
  const handleSaveContactHero = async () => {
    if (!contactBannerSrc.trim()) {
      alert('Please enter an image URL or upload an image.')
      return
    }
    const compressedSrc = await compressDataUrl(contactBannerSrc.trim())
    updateContact({
      heroImage: { src: compressedSrc, alt: contactBannerAlt.trim() || 'Contact hero banner' }
    })
    alert('Contact page banner image updated successfully!')
  }

  // Filtered photos
  const filteredPhotos = selectedCategoryFilter === 'all'
    ? content.photos
    : content.photos.filter(p => p.categorySlug === selectedCategoryFilter)

  return (
    <div className="admin-overlay" role="dialog" aria-modal="true" aria-label="Admin Control Panel">
      <div className="admin-container">
        
        {/* Header */}
        <div className="admin-header">
          <div className="admin-title-area">
            <span className="admin-badge">Admin Studio</span>
            <h2>Portfolio Management</h2>
          </div>
          <button className="admin-close-btn" onClick={closeAdmin} aria-label="Close admin panel">
            <X size={20} />
          </button>
        </div>

        {/* PIN Screen */}
        {!isAuthenticated ? (
          <div className="admin-pin-screen">
            <div className="admin-pin-card">
              <div className="admin-pin-icon">
                <Key size={32} />
              </div>
              <h3>Enter Admin PIN</h3>
              <p>Enter your security PIN to access portfolio management.</p>
              
              <form onSubmit={handlePinSubmit}>
                <input 
                  type="password" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10} 
                  value={pinInput} 
                  onChange={e => setPinInput(e.target.value)} 
                  placeholder="PIN" 
                  autoFocus
                  className="admin-input admin-pin-input"
                />
                {pinError && <div className="admin-error"><AlertCircle size={14}/> {pinError}</div>}
                <button type="submit" className="admin-btn admin-btn-primary">Unlock Panel</button>
              </form>
            </div>
          </div>
        ) : (
          /* Main Dashboard */
          <div className="admin-body">
            {/* Sidebar Navigation */}
            <aside className="admin-sidebar">
              <button 
                className={`admin-nav-item ${activeTab === 'enquiries' ? 'active' : ''}`}
                onClick={() => setActiveTab('enquiries')}
              >
                <MessageSquare size={18} /> Client Inquiries ({enquiries.length})
                {enquiries.filter(e => (e.status || 'new') === 'new').length > 0 && (
                  <span className="admin-badge-count">
                    {enquiries.filter(e => (e.status || 'new') === 'new').length} new
                  </span>
                )}
              </button>
              <button 
                className={`admin-nav-item ${activeTab === 'photos' ? 'active' : ''}`}
                onClick={() => { setActiveTab('photos'); setIsAddingPhoto(false); }}
              >
                <ImageIcon size={18} /> Photographs ({content.photos.length})
              </button>
              <button 
                className={`admin-nav-item ${activeTab === 'categories' ? 'active' : ''}`}
                onClick={() => { setActiveTab('categories'); setIsAddingCategory(false); }}
              >
                <FolderPlus size={18} /> Categories ({content.categories.length})
              </button>
              <button 
                className={`admin-nav-item ${activeTab === 'banners' ? 'active' : ''}`}
                onClick={() => { setActiveTab('banners'); setIsAddingSlide(false); }}
              >
                <Layers size={18} /> Hero &amp; Banners
              </button>
              <button 
                className={`admin-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
                onClick={() => setActiveTab('profile')}
              >
                <User size={18} /> Profile & Bio
              </button>
              <button 
                className={`admin-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                <Settings size={18} /> Settings & Backup
              </button>

              <div className="admin-sidebar-footer">
                <button className="admin-btn-secondary admin-btn-sm" onClick={exportData}>
                  <Download size={14}/> Export Backup
                </button>
                <button className="admin-btn-secondary admin-btn-sm" onClick={() => backupInputRef.current?.click()}>
                  <Upload size={14}/> Import Backup
                </button>
                <input 
                  type="file" 
                  ref={backupInputRef} 
                  style={{ display: 'none' }} 
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onload = (evt) => importData(evt.target.result)
                      reader.readAsText(file)
                    }
                  }} 
                />
              </div>
            </aside>

            {/* Main Content Area */}
            <main className="admin-main">
              
              {/* TAB 1: PHOTOGRAPHS */}
              {activeTab === 'photos' && (
                <div className="admin-section">
                  <div className="admin-section-header">
                    <div>
                      <h3>Manage Photographs</h3>
                      <p>Add, edit captions, switch categories, or delete images.</p>
                    </div>
                    {!isAddingPhoto && (
                      <button 
                        className="admin-btn admin-btn-primary" 
                        onClick={() => {
                          setEditingPhotoId(null)
                          setPhotoForm({
                            src: '',
                            caption: '',
                            altText: '',
                            categorySlug: content.categories[0]?.slug || '',
                            isFeatured: false
                          })
                          setIsAddingPhoto(true)
                        }}
                      >
                        <Plus size={16} /> Add Photograph
                      </button>
                    )}
                  </div>

                  {/* Add / Edit Photo Form */}
                  {isAddingPhoto ? (
                    <div className="admin-card form-card" ref={photoFormRef}>
                      <h4>{editingPhotoId ? 'Edit Photograph' : 'Add New Photograph'}</h4>
                      <form onSubmit={handleSavePhoto}>
                        <div className="admin-form-group">
                          <label>Image Source (URL or Upload File)</label>
                          <div className="admin-input-upload">
                            <input 
                              type="text" 
                              className="admin-input" 
                              placeholder="Enter image URL (Unsplash, Cloudinary, etc.)"
                              value={photoForm.src}
                              onChange={e => setPhotoForm({ ...photoForm, src: e.target.value })}
                            />
                            <button 
                              type="button" 
                              className="admin-btn admin-btn-secondary"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={isUploading}
                            >
                              <Upload size={14} /> {isUploading ? 'Compressing...' : 'Upload Device File'}
                            </button>
                            <input 
                              type="file" 
                              ref={fileInputRef} 
                              accept="image/*" 
                              style={{ display: 'none' }}
                              onChange={(e) => handleFileUpload(e, (dataUrl) => setPhotoForm(prev => ({ ...prev, src: dataUrl })))}
                            />
                          </div>
                          {photoForm.src && (
                            <div className="admin-preview-box">
                              <img src={imageUrl(photoForm.src, 400)} alt="Preview" />
                            </div>
                          )}
                        </div>

                        <div className="admin-form-row">
                          <div className="admin-form-group">
                            <label>Category</label>
                            <select 
                              className="admin-input"
                              value={photoForm.categorySlug}
                              onChange={e => setPhotoForm({ ...photoForm, categorySlug: e.target.value })}
                              required
                            >
                              {content.categories.map(c => (
                                <option key={c.slug} value={c.slug}>{c.title}</option>
                              ))}
                            </select>
                          </div>
                          <div className="admin-form-group">
                            <label>Caption / Title</label>
                            <input 
                              type="text" 
                              className="admin-input" 
                              placeholder="e.g. An Evening in the Mountains"
                              value={photoForm.caption}
                              onChange={e => setPhotoForm({ ...photoForm, caption: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="admin-form-actions">
                          <button type="submit" className="admin-btn admin-btn-primary">
                            <Check size={16} /> Save Photograph
                          </button>
                          <button 
                            type="button" 
                            className="admin-btn admin-btn-secondary" 
                            onClick={() => { setIsAddingPhoto(false); setEditingPhotoId(null); }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  ) : null}

                  {/* Filter by Category */}
                  <div className="admin-filters">
                    <span>Filter:</span>
                    <button 
                      className={`admin-filter-pill ${selectedCategoryFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setSelectedCategoryFilter('all')}
                    >
                      All ({content.photos.length})
                    </button>
                    {content.categories.map(c => (
                      <button 
                        key={c.slug}
                        className={`admin-filter-pill ${selectedCategoryFilter === c.slug ? 'active' : ''}`}
                        onClick={() => setSelectedCategoryFilter(c.slug)}
                      >
                        {c.title} ({content.photos.filter(p => p.categorySlug === c.slug).length})
                      </button>
                    ))}
                  </div>

                  {/* Photo Grid */}
                  <div className="admin-photo-grid">
                    {filteredPhotos.map((photo) => (
                      <div key={photo._id} className="admin-photo-card">
                        <div className="admin-photo-thumb">
                          <img src={imageUrl(photo.image?.src || photo.src, 300)} alt={photo.caption || 'Thumbnail'} />
                          <span className="admin-photo-category">
                            {content.categories.find(c => c.slug === photo.categorySlug)?.title || photo.categorySlug}
                          </span>
                        </div>
                        <div className="admin-photo-details">
                          <p className="admin-photo-title">{photo.caption || 'Untitled Photograph'}</p>
                          <div className="admin-photo-actions">
                            <button 
                              className="admin-action-btn edit" 
                              onClick={() => startEditPhoto(photo)}
                              title="Edit photograph"
                            >
                              <Edit3 size={14} /> Edit
                            </button>
                            <button 
                              className="admin-action-btn delete" 
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this photograph?')) {
                                  deletePhoto(photo._id)
                                }
                              }}
                              title="Delete photograph"
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredPhotos.length === 0 && (
                      <div className="admin-empty-state">
                        <p>No photographs found in this category.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: CATEGORIES */}
              {activeTab === 'categories' && (
                <div className="admin-section">
                  <div className="admin-section-header">
                    <div>
                      <h3>Manage Categories</h3>
                      <p>Create new collections or edit cover images and titles.</p>
                    </div>
                    {!isAddingCategory && (
                      <button 
                        className="admin-btn admin-btn-primary" 
                        onClick={() => {
                          setEditingCategorySlug(null)
                          setCategoryForm({ title: '', src: '', description: '' })
                          setIsAddingCategory(true)
                        }}
                      >
                        <Plus size={16} /> Add Category
                      </button>
                    )}
                  </div>

                  {/* Add / Edit Category Form */}
                  {isAddingCategory && (
                    <div className="admin-card form-card">
                      <h4>{editingCategorySlug ? 'Edit Category' : 'Create New Category'}</h4>
                      <form onSubmit={handleSaveCategory}>
                        <div className="admin-form-row">
                          <div className="admin-form-group">
                            <label>Category Title</label>
                            <input 
                              type="text" 
                              className="admin-input" 
                              placeholder="e.g. Wildlife, Fashion, Studio"
                              value={categoryForm.title}
                              onChange={e => setCategoryForm({ ...categoryForm, title: e.target.value })}
                              required
                            />
                          </div>
                          <div className="admin-form-group">
                            <label>Description / Tagline</label>
                            <input 
                              type="text" 
                              className="admin-input" 
                              placeholder="e.g. Stories in raw landscapes"
                              value={categoryForm.description}
                              onChange={e => setCategoryForm({ ...categoryForm, description: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="admin-form-group">
                          <label>Cover Image (URL or Upload)</label>
                          <div className="admin-input-upload">
                            <input 
                              type="text" 
                              className="admin-input" 
                              placeholder="Unsplash ID, URL or uploaded image"
                              value={categoryForm.src}
                              onChange={e => setCategoryForm({ ...categoryForm, src: e.target.value })}
                              required
                            />
                            <button 
                              type="button" 
                              className="admin-btn admin-btn-secondary"
                              onClick={() => categoryFileInputRef.current?.click()}
                              disabled={isUploading}
                            >
                              <Upload size={14} /> {isUploading ? 'Compressing...' : 'Upload'}
                            </button>
                            <input 
                              type="file" 
                              ref={categoryFileInputRef} 
                              accept="image/*" 
                              style={{ display: 'none' }}
                              onChange={(e) => handleFileUpload(e, (dataUrl) => setCategoryForm(prev => ({ ...prev, src: dataUrl })))}
                            />
                          </div>
                          {categoryForm.src && (
                            <div className="admin-preview-box">
                              <img src={imageUrl(categoryForm.src, 400)} alt="Cover preview" />
                            </div>
                          )}
                        </div>

                        <div className="admin-form-actions">
                          <button type="submit" className="admin-btn admin-btn-primary">
                            <Check size={16} /> Save Category
                          </button>
                          <button 
                            type="button" 
                            className="admin-btn admin-btn-secondary" 
                            onClick={() => { setIsAddingCategory(false); setEditingCategorySlug(null); }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Categories List */}
                  <div className="admin-category-list">
                    {content.categories.map((category) => {
                      const count = content.photos.filter(p => p.categorySlug === category.slug).length
                      return (
                        <div key={category.slug} className="admin-category-card">
                          <div className="admin-cat-thumb">
                            <img src={imageUrl(category.src || category.coverImage?.src, 250)} alt={category.title} />
                          </div>
                          <div className="admin-cat-info">
                            <h4>{category.title}</h4>
                            <p>{category.description || 'No description provided'}</p>
                            <span className="admin-cat-count">{count} {count === 1 ? 'photograph' : 'photographs'}</span>
                          </div>
                          <div className="admin-cat-actions">
                            <a 
                              href={`/portfolio/${category.slug}`} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="admin-action-btn"
                              title="View Collection Page"
                              style={{ color: '#1a1a1a', textDecoration: 'none' }}
                            >
                              <Eye size={15}/> View Page
                            </a>
                            <button className="admin-action-btn edit" onClick={() => startEditCategory(category)}>
                              <Edit3 size={15}/> Edit
                            </button>
                            <button className="admin-action-btn delete" onClick={() => deleteCategory(category.slug)}>
                              <Trash2 size={15}/> Delete
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* TAB: HERO & PAGE BANNERS */}
              {activeTab === 'banners' && (
                <div className="admin-section">
                  <div className="admin-section-header">
                    <div>
                      <h3>Hero Slides &amp; Page Banners</h3>
                      <p>Modify, upload, edit, or delete background images for the Home screen, About banner, and Contact banner.</p>
                    </div>
                  </div>

                  {/* Section 1: Home Screen Background Slides */}
                  <div className="admin-card" style={{ marginBottom: '28px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <h4 style={{ margin: 0 }}>Home Background Slides ({content.heroSlides?.length || 0})</h4>
                        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#666' }}>Images that cycle in the background behind "Captured in Light".</p>
                      </div>
                      {!isAddingSlide && (
                        <button 
                          type="button" 
                          className="admin-btn admin-btn-primary admin-btn-sm"
                          onClick={() => {
                            setSlideForm({ src: '', altText: '' })
                            setEditingSlideIndex(null)
                            setIsAddingSlide(true)
                          }}
                        >
                          <Plus size={15}/> Add New Slide
                        </button>
                      )}
                    </div>

                    {/* Slide Add/Edit Form */}
                    {isAddingSlide && (
                      <form onSubmit={handleSaveSlide} style={{ background: '#fcfcfc', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
                        <h5 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600 }}>
                          {editingSlideIndex !== null ? `Edit Slide #${editingSlideIndex + 1}` : 'Add New Home Background Slide'}
                        </h5>

                        <div className="admin-form-group">
                          <label>Image URL or Device Upload</label>
                          <div className="admin-input-upload">
                            <input 
                              type="text" 
                              className="admin-input" 
                              placeholder="Unsplash ID, https://..., or upload image below" 
                              value={slideForm.src}
                              onChange={e => setSlideForm({ ...slideForm, src: e.target.value })}
                              required
                            />
                            <button 
                              type="button" 
                              className="admin-btn-secondary" 
                              onClick={() => slideFileRef.current?.click()}
                            >
                              <Upload size={14}/> Upload
                            </button>
                            <input 
                              type="file" 
                              ref={slideFileRef} 
                              accept="image/*" 
                              style={{ display: 'none' }} 
                              onChange={e => handleFileUpload(e, base64 => setSlideForm(f => ({ ...f, src: base64 })))} 
                            />
                          </div>
                        </div>

                        <div className="admin-form-group">
                          <label>Slide Label / Description (optional)</label>
                          <input 
                            type="text" 
                            className="admin-input" 
                            placeholder="e.g. Wedding golden hour moments" 
                            value={slideForm.altText}
                            onChange={e => setSlideForm({ ...slideForm, altText: e.target.value })}
                          />
                        </div>

                        {slideForm.src && (
                          <div className="admin-preview-box" style={{ maxHeight: '180px', overflow: 'hidden', borderRadius: '6px', marginBottom: '14px' }}>
                            <img src={imageUrl(slideForm.src, 600)} alt="Preview" style={{ width: '100%', height: '180px', objectFit: 'cover' }} />
                          </div>
                        )}

                        <div className="admin-form-actions">
                          <button type="submit" className="admin-btn admin-btn-primary">
                            <Check size={15}/> {editingSlideIndex !== null ? 'Update Slide' : 'Save Slide'}
                          </button>
                          <button 
                            type="button" 
                            className="admin-btn admin-btn-secondary" 
                            onClick={() => { setIsAddingSlide(false); setEditingSlideIndex(null); }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Hero Slides List */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
                      {(content.heroSlides || []).map((s, idx) => (
                        <div key={idx} style={{ border: '1px solid #ebebeb', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
                          <div style={{ height: '130px', position: 'relative', background: '#111' }}>
                            <img src={imageUrl(s.src, 400)} alt={s.altText || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <span style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '10px', padding: '3px 7px', borderRadius: '4px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                              Slide {String(idx + 1).padStart(2, '0')}
                            </span>
                          </div>
                          <div style={{ padding: '10px 12px' }}>
                            <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.altText || 'Hero background slide'}
                            </p>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <button 
                                type="button" 
                                className="admin-action-btn edit" 
                                style={{ flex: 1, justifyContent: 'center' }}
                                onClick={() => {
                                  setSlideForm({ src: s.src, altText: s.altText || '' })
                                  setEditingSlideIndex(idx)
                                  setIsAddingSlide(true)
                                }}
                              >
                                <Edit3 size={13}/> Edit
                              </button>
                              <button 
                                type="button" 
                                className="admin-action-btn delete" 
                                style={{ flex: 1, justifyContent: 'center' }}
                                onClick={() => {
                                  if (confirm(`Delete slide ${idx + 1}?`)) {
                                    deleteHeroSlide(idx)
                                  }
                                }}
                              >
                                <Trash2 size={13}/> Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {(!content.heroSlides || content.heroSlides.length === 0) && (
                      <div style={{ textAlign: 'center', padding: '30px', color: '#888', fontSize: '13px' }}>
                        No custom slides. Click "+ Add New Slide" to add a background image.
                      </div>
                    )}
                  </div>

                  {/* Section 2: About Page Hero Banner */}
                  <div className="admin-card" style={{ marginBottom: '28px' }}>
                    <h4>About Page Banner Image ("About Kashif")</h4>
                    <p style={{ margin: '4px 0 16px', fontSize: '13px', color: '#666' }}>
                      Large background photo appearing behind the "ABOUT KASHIF" heading.
                    </p>

                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                      <div style={{ width: '220px', height: '130px', borderRadius: '8px', overflow: 'hidden', background: '#222', flexShrink: 0 }}>
                        <img 
                          src={imageUrl(aboutBannerSrc || content.about?.heroImage?.src, 400)} 
                          alt="About Banner Preview" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                      </div>
                      <div style={{ flex: '1 1 300px' }}>
                        <div className="admin-form-group">
                          <label>Image URL or Device Upload</label>
                          <div className="admin-input-upload">
                            <input 
                              type="text" 
                              className="admin-input" 
                              placeholder="Unsplash ID, https://..., or upload image" 
                              value={aboutBannerSrc}
                              onChange={e => setAboutBannerSrc(e.target.value)}
                            />
                            <button 
                              type="button" 
                              className="admin-btn-secondary" 
                              onClick={() => aboutBannerFileRef.current?.click()}
                            >
                              <Upload size={14}/> Upload
                            </button>
                            <input 
                              type="file" 
                              ref={aboutBannerFileRef} 
                              accept="image/*" 
                              style={{ display: 'none' }} 
                              onChange={e => handleFileUpload(e, base64 => setAboutBannerSrc(base64))} 
                            />
                          </div>
                        </div>

                        <div className="admin-form-group">
                          <label>Banner Alt Text / Description</label>
                          <input 
                            type="text" 
                            className="admin-input" 
                            value={aboutBannerAlt} 
                            onChange={e => setAboutBannerAlt(e.target.value)}
                            placeholder="e.g. About Kashif floral canopy"
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                          <button 
                            type="button" 
                            className="admin-btn admin-btn-primary admin-btn-sm"
                            onClick={handleSaveAboutHero}
                          >
                            <Check size={14}/> Save About Banner
                          </button>
                          <button 
                            type="button" 
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            onClick={() => {
                              if (confirm('Reset About banner to original default photo?')) {
                                setAboutBannerSrc('photo-1523438885200-e635ba2c371e')
                                updateAbout({ heroImage: { src: 'photo-1523438885200-e635ba2c371e', alt: 'About Kashif hero banner' } })
                              }
                            }}
                          >
                            Reset to Default
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Contact Page Hero Banner */}
                  <div className="admin-card">
                    <h4>Contact Page Banner Image ("Work with Kashif")</h4>
                    <p style={{ margin: '4px 0 16px', fontSize: '13px', color: '#666' }}>
                      Large background photo appearing behind the "WORK WITH KASHIF" heading.
                    </p>

                    <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                      <div style={{ width: '220px', height: '130px', borderRadius: '8px', overflow: 'hidden', background: '#222', flexShrink: 0 }}>
                        <img 
                          src={imageUrl(contactBannerSrc || content.contact?.heroImage?.src, 400)} 
                          alt="Contact Banner Preview" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                      </div>
                      <div style={{ flex: '1 1 300px' }}>
                        <div className="admin-form-group">
                          <label>Image URL or Device Upload</label>
                          <div className="admin-input-upload">
                            <input 
                              type="text" 
                              className="admin-input" 
                              placeholder="Unsplash ID, https://..., or upload image" 
                              value={contactBannerSrc}
                              onChange={e => setContactBannerSrc(e.target.value)}
                            />
                            <button 
                              type="button" 
                              className="admin-btn-secondary" 
                              onClick={() => contactBannerFileRef.current?.click()}
                            >
                              <Upload size={14}/> Upload
                            </button>
                            <input 
                              type="file" 
                              ref={contactBannerFileRef} 
                              accept="image/*" 
                              style={{ display: 'none' }} 
                              onChange={e => handleFileUpload(e, base64 => setContactBannerSrc(base64))} 
                            />
                          </div>
                        </div>

                        <div className="admin-form-group">
                          <label>Banner Alt Text / Description</label>
                          <input 
                            type="text" 
                            className="admin-input" 
                            value={contactBannerAlt} 
                            onChange={e => setContactBannerAlt(e.target.value)}
                            placeholder="e.g. Wedding celebration reception table"
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
                          <button 
                            type="button" 
                            className="admin-btn admin-btn-primary admin-btn-sm"
                            onClick={handleSaveContactHero}
                          >
                            <Check size={14}/> Save Contact Banner
                          </button>
                          <button 
                            type="button" 
                            className="admin-btn admin-btn-secondary admin-btn-sm"
                            onClick={() => {
                              if (confirm('Reset Contact banner to original default photo?')) {
                                setContactBannerSrc('photo-1511795409834-ef04bbd61622')
                                updateContact({ heroImage: { src: 'photo-1511795409834-ef04bbd61622', alt: 'Contact hero banner' } })
                              }
                            }}
                          >
                            Reset to Default
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: PROFILE & BIO */}
              {activeTab === 'profile' && (
                <div className="admin-section">
                  <div className="admin-section-header">
                    <div>
                      <h3>Profile &amp; Biography Details</h3>
                      <p>Update personal information, location, role, and text without touching code.</p>
                    </div>
                  </div>

                  <div className="admin-card">
                    <h4>Primary Information</h4>
                    <form onSubmit={handleSaveSettings}>
                      <div className="admin-form-row">
                        <div className="admin-form-group">
                          <label>Full Name</label>
                          <input 
                            type="text" 
                            className="admin-input"
                            value={settingsForm.name || ''} 
                            onChange={e => setSettingsForm({ ...settingsForm, name: e.target.value, logoText: e.target.value })} 
                          />
                        </div>
                        <div className="admin-form-group">
                          <label>Studio Brand / Position</label>
                          <input 
                            type="text" 
                            className="admin-input"
                            value={settingsForm.position || ''} 
                            onChange={e => setSettingsForm({ ...settingsForm, position: e.target.value, tagline: e.target.value })} 
                          />
                        </div>
                      </div>

                      <div className="admin-form-row">
                        <div className="admin-form-group">
                          <label>City / Location</label>
                          <input 
                            type="text" 
                            className="admin-input"
                            value={settingsForm.city || ''} 
                            onChange={e => setSettingsForm({ ...settingsForm, city: e.target.value, baseCity: e.target.value })} 
                          />
                        </div>
                        <div className="admin-form-group">
                          <label>Hero Subtitle / Genres</label>
                          <input 
                            type="text" 
                            className="admin-input"
                            value={settingsForm.subline || ''} 
                            onChange={e => setSettingsForm({ ...settingsForm, subline: e.target.value, subtitle: e.target.value })} 
                          />
                        </div>
                      </div>

                      <div className="admin-form-row">
                        <div className="admin-form-group">
                          <label>Email Address</label>
                          <input 
                            type="email" 
                            className="admin-input"
                            value={settingsForm.email || ''} 
                            onChange={e => setSettingsForm({ ...settingsForm, email: e.target.value })} 
                          />
                        </div>
                        <div className="admin-form-group">
                          <label>WhatsApp Phone Number</label>
                          <input 
                            type="tel" 
                            className="admin-input"
                            placeholder="+91 98765 43210"
                            value={settingsForm.whatsapp || settingsForm.phone || ''} 
                            onChange={e => setSettingsForm({ ...settingsForm, whatsapp: e.target.value, phone: e.target.value })} 
                          />
                        </div>
                      </div>

                      <div className="admin-form-row">
                        <div className="admin-form-group">
                          <label>Instagram Handle</label>
                          <input 
                            type="text" 
                            className="admin-input"
                            value={settingsForm.instagram || ''} 
                            onChange={e => setSettingsForm({ ...settingsForm, instagram: e.target.value, instagramHandle: e.target.value })} 
                          />
                        </div>
                        <div className="admin-form-group">
                          <label>Availability Line</label>
                          <input 
                            type="text" 
                            className="admin-input"
                            value={settingsForm.availabilityLine || ''} 
                            onChange={e => setSettingsForm({ ...settingsForm, availabilityLine: e.target.value })} 
                          />
                        </div>
                      </div>

                      <div className="admin-form-actions">
                        <button type="submit" className="admin-btn admin-btn-primary">
                          <Check size={16}/> Save Profile Details
                        </button>
                      </div>
                    </form>
                  </div>

                  <div className="admin-card" style={{ marginTop: '24px' }}>
                    <h4>About Page Copy &amp; Imagery</h4>
                    <form onSubmit={handleSaveAbout}>
                      <div className="admin-form-group">
                        <label>About Heading</label>
                        <input 
                          type="text" 
                          className="admin-input"
                          value={aboutForm.heading} 
                          onChange={e => setAboutForm({ ...aboutForm, heading: e.target.value })} 
                        />
                      </div>
                      <div className="admin-form-group">
                        <label>Short Bio Teaser</label>
                        <textarea 
                          className="admin-input" 
                          rows={3}
                          value={aboutForm.teaser}
                          onChange={e => setAboutForm({ ...aboutForm, teaser: e.target.value })}
                        />
                      </div>
                      <div className="admin-form-group">
                        <label>Pull Quote</label>
                        <input 
                          type="text" 
                          className="admin-input"
                          value={aboutForm.pullQuote} 
                          onChange={e => setAboutForm({ ...aboutForm, pullQuote: e.target.value })} 
                        />
                      </div>

                      <div className="admin-form-group">
                        <label>Photographer Portrait Photo (Homepage Teaser)</label>
                        <div className="admin-input-upload">
                          <input 
                            type="text" 
                            className="admin-input"
                            value={aboutForm.portraitSrc} 
                            onChange={e => setAboutForm({ ...aboutForm, portraitSrc: e.target.value })} 
                            placeholder="Unsplash ID, URL, or upload photo"
                          />
                          <button 
                            type="button" 
                            className="admin-btn-secondary"
                            onClick={() => portraitFileRef.current?.click()}
                            disabled={isUploading}
                          >
                            <Upload size={14}/> {isUploading ? 'Compressing...' : 'Upload Portrait'}
                          </button>
                          <input 
                            type="file" 
                            ref={portraitFileRef} 
                            accept="image/*" 
                            style={{ display: 'none' }} 
                            onChange={e => handleFileUpload(e, base64 => setAboutForm(prev => ({ ...prev, portraitSrc: base64 })))} 
                          />
                        </div>
                        {aboutForm.portraitSrc && (
                          <div className="admin-preview-box" style={{ width: '90px', height: '90px', borderRadius: '50%', overflow: 'hidden', marginTop: '10px' }}>
                            <img src={imageUrl(aboutForm.portraitSrc, 200)} alt="Portrait Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        )}
                      </div>

                      <div className="admin-form-actions">
                        <button type="submit" className="admin-btn admin-btn-primary">
                          <Check size={16}/> Save About Information
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* TAB 4: SETTINGS & BACKUP */}
              {activeTab === 'settings' && (
                <div className="admin-section">
                  <div className="admin-section-header">
                    <div>
                      <h3>System &amp; Security Settings</h3>
                      <p>Manage security PIN, export/import backups, and reset options.</p>
                    </div>
                  </div>

                  {/* Change PIN */}
                  <div className="admin-card">
                    <h4>Change Admin PIN</h4>
                    <form onSubmit={(e) => {
                      e.preventDefault()
                      changePin(newPin)
                      setNewPin('')
                    }}>
                      <div className="admin-form-group" style={{ maxWidth: '300px' }}>
                        <label>New PIN (Minimum 4 digits)</label>
                        <input 
                          type="password" 
                          className="admin-input"
                          value={newPin}
                          onChange={e => setNewPin(e.target.value)}
                          placeholder="Enter new PIN..."
                          required
                        />
                      </div>
                      <button type="submit" className="admin-btn admin-btn-primary">
                        Update PIN
                      </button>
                    </form>
                  </div>

                  {/* Backup & Restore */}
                  <div className="admin-card" style={{ marginTop: '24px' }}>
                    <h4>Backup &amp; Export Data</h4>
                    <p>Download a JSON backup of all your content, categories, and photographs. You can use this file anytime to restore your website data.</p>
                    <div style={{ display: 'flex', gap: '14px', marginTop: '16px' }}>
                      <button className="admin-btn admin-btn-secondary" onClick={exportData}>
                        <Download size={16}/> Download Content Backup (.json)
                      </button>
                      <button className="admin-btn admin-btn-secondary" onClick={() => backupInputRef.current?.click()}>
                        <Upload size={16}/> Restore from Backup File
                      </button>
                    </div>
                  </div>

                  {/* Cross-Device Cloud Sync Section */}
                  <div className="admin-card" style={{ marginTop: '24px', borderLeft: cloudConnected ? '4px solid #10b981' : '4px solid #f59e0b' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                      <div>
                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                          <Cloud size={18} color={cloudConnected ? '#10b981' : '#f59e0b'} />
                          Cross-Device Cloud Sync (Laptop &amp; Phone)
                        </h4>
                        <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#666' }}>
                          {cloudConnected
                            ? cloudSyncStatus === 'error'
                              ? '🔴 Cloud sync failed. This device has local changes that may not be visible elsewhere.'
                              : cloudSyncStatus === 'syncing'
                                ? '🟡 Syncing latest changes to the cloud…'
                                : '🟢 Cloud connected. Changes sync across devices after they are saved.'
                            : '⚪ Local Mode: Edits are currently saved only in this browser. Connect Firebase below to enable cross-device live sync.'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {cloudConnected && (
                          <button 
                            type="button"
                            className="admin-btn admin-btn-primary admin-btn-sm"
                            onClick={handlePushToCloud}
                            disabled={cloudSyncing}
                            title="Force sync current laptop data to cloud"
                            style={{ opacity: cloudSyncing ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            <Cloud size={14} /> 
                            {cloudSyncing ? 'Syncing to Cloud...' : 'Push Current Content to Cloud'}
                          </button>
                        )}
                        <button 
                          type="button"
                          className="admin-btn admin-btn-secondary admin-btn-sm"
                          onClick={() => setShowCloudConfig(prev => !prev)}
                        >
                          {showCloudConfig ? 'Hide Config' : cloudConnected ? 'Edit Cloud Settings' : 'Connect Cloud Database'}
                        </button>
                      </div>
                    </div>

                    {cloudSyncFeedback && (
                      <div style={{
                        marginTop: '12px',
                        padding: '10px 14px',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: 500,
                        background: cloudSyncFeedback.type === 'success' ? '#ecfdf5' : '#fef2f2',
                        color: cloudSyncFeedback.type === 'success' ? '#065f46' : '#991b1b',
                        border: `1px solid ${cloudSyncFeedback.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        {cloudSyncFeedback.type === 'success' ? '✅' : '❌'} {cloudSyncFeedback.text}
                      </div>
                    )}

                    {showCloudConfig && (
                      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #eee' }}>
                        <div className="admin-form-group">
                          <label style={{ fontSize: '12px', fontWeight: 600 }}>Paste Firebase Config (JSON format):</label>
                          <textarea 
                            className="admin-input" 
                            rows={6}
                            style={{ fontFamily: 'monospace', fontSize: '12px' }}
                            placeholder={`{\n  "apiKey": "AIzaSy...",\n  "projectId": "your-portfolio",\n  "appId": "1:1234..."\n}`}
                            value={firebaseConfigInput}
                            onChange={(e) => setFirebaseConfigInput(e.target.value)}
                          />
                        </div>

                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                          <button 
                            className="admin-btn admin-btn-primary admin-btn-sm"
                            onClick={() => {
                              try {
                                const parsed = JSON.parse(firebaseConfigInput.trim())
                                saveFirebaseConfig(parsed)
                                setShowCloudConfig(false)
                              } catch (e) {
                                alert('Please enter valid Firebase JSON config.')
                              }
                            }}
                          >
                            <Check size={14} /> Save &amp; Connect Live Sync
                          </button>
                          {cloudConnected && (
                            <button 
                              className="admin-btn admin-btn-secondary admin-btn-sm"
                              onClick={() => {
                                if (confirm('Disconnect Firebase cloud sync? Website will revert to local browser storage.')) {
                                  saveFirebaseConfig(null)
                                  setFirebaseConfigInput('')
                                  setShowCloudConfig(false)
                                }
                              }}
                            >
                              Disconnect Cloud
                            </button>
                          )}
                        </div>

                        <div style={{ marginTop: '14px', background: '#f8f9fa', padding: '12px', borderRadius: '6px', fontSize: '12px', color: '#555', lineHeight: '1.6' }}>
                          <strong>How to connect free Firebase in 2 minutes:</strong>
                          <ol style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
                            <li>Go to <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer" style={{ color: '#0066cc', textDecoration: 'underline' }}>console.firebase.google.com</a> and click <strong>"Create a project"</strong> (100% Free).</li>
                            <li>From the left menu, select <strong>Build &gt; Firestore Database &gt; Create Database</strong> (Start in <em>test mode</em>).</li>
                            <li>Click Project Overview gear icon &gt; Project Settings &gt; General &gt; <strong>"Add Web app" (&lt;/&gt;)</strong>, copy the <code>firebaseConfig</code> object, paste it above, and click Save.</li>
                          </ol>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Reload Latest Photos from Code */}
                  <div className="admin-card" style={{ marginTop: '24px' }}>
                    <h4>Reload Latest Photos from Code</h4>
                    <p>If you modified photography collections or images in the code, click here to reload them into the portfolio without losing your settings or categories.</p>
                    <button className="admin-btn admin-btn-secondary" onClick={syncLatestCodePhotos} style={{ marginTop: '14px' }}>
                      <RefreshCw size={15}/> Reload Photos from Code
                    </button>
                  </div>

                  {/* Factory Reset */}
                  <div className="admin-card admin-danger-card" style={{ marginTop: '24px' }}>
                    <h4 style={{ color: '#d32f2f' }}>Reset to Default Factory Content</h4>
                    <p>This will erase any custom additions made in the browser and restore original website data.</p>
                    <button className="admin-btn admin-btn-danger" onClick={resetToDefault} style={{ marginTop: '14px' }}>
                      <RefreshCw size={15}/> Reset Everything to Defaults
                    </button>
                  </div>
                </div>
              )}

              {/* TAB: CLIENT INQUIRIES & BOOKING MESSAGES */}
              {activeTab === 'enquiries' && (
                <div className="admin-section">
                  <div className="admin-section-header">
                    <div>
                      <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        Client Inquiries &amp; Booking Requests
                        {enquiries.length > 0 && (
                          <span className="admin-chip-badge">{enquiries.length} total</span>
                        )}
                      </h3>
                      <p>All contact submissions are automatically saved to your cloud database in real time.</p>
                    </div>
                  </div>

                  {/* Filter & Search Bar */}
                  <div className="admin-inbox-toolbar">
                    <div className="admin-filter-pills">
                      <button 
                        className={`admin-filter-pill ${enquiryFilter === 'all' ? 'active' : ''}`}
                        onClick={() => setEnquiryFilter('all')}
                      >
                        All ({enquiries.length})
                      </button>
                      <button 
                        className={`admin-filter-pill ${enquiryFilter === 'new' ? 'active' : ''}`}
                        onClick={() => setEnquiryFilter('new')}
                      >
                        New ({(enquiries || []).filter(e => (e.status || 'new') === 'new').length})
                      </button>
                      <button 
                        className={`admin-filter-pill ${enquiryFilter === 'contacted' ? 'active' : ''}`}
                        onClick={() => setEnquiryFilter('contacted')}
                      >
                        Contacted ({(enquiries || []).filter(e => e.status === 'contacted').length})
                      </button>
                      <button 
                        className={`admin-filter-pill ${enquiryFilter === 'booked' ? 'active' : ''}`}
                        onClick={() => setEnquiryFilter('booked')}
                      >
                        Booked ({(enquiries || []).filter(e => e.status === 'booked').length})
                      </button>
                    </div>

                    <div className="admin-search-wrap">
                      <input 
                        type="text" 
                        className="admin-input admin-search-input"
                        placeholder="Search by name, event, city..."
                        value={enquirySearch}
                        onChange={e => setEnquirySearch(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Enquiries List */}
                  {filteredEnquiries.length === 0 ? (
                    <div className="admin-empty-inbox">
                      <MessageSquare size={44} strokeWidth={1.2} color="#aaa" />
                      <h4>No inquiries found</h4>
                      <p>
                        {enquiries.length === 0 
                          ? "When visitors submit your website's contact form, their requests will appear here instantly." 
                          : "No inquiries match your current filter or search criteria."}
                      </p>
                    </div>
                  ) : (
                    <div className="admin-enquiries-list">
                      {filteredEnquiries.map((item) => {
                        const cleanPhone = (item.phone || '').replace(/[^\d]/g, '')
                        const formattedPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone
                        const waReplyText = `Hi ${item.name}! Thank you for getting in touch through Flashlite Photography regarding your ${item.interest || 'booking'} on ${item.date || 'your upcoming date'}.`
                        const waLink = cleanPhone ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(waReplyText)}` : null

                        return (
                          <div key={item.id} className={`admin-enquiry-card status-${item.status || 'new'}`}>
                            <div className="admin-enquiry-top">
                              <div className="admin-enquiry-person">
                                <div className="admin-enquiry-avatar">
                                  {item.name ? item.name.charAt(0).toUpperCase() : 'C'}
                                </div>
                                <div>
                                  <h4>{item.name || 'Anonymous Client'}</h4>
                                  <div className="admin-enquiry-meta">
                                    <Clock size={12} /> 
                                    <span>{item.createdAt ? new Date(item.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Recently'}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="admin-enquiry-top-right">
                                <span className={`admin-status-badge status-${item.status || 'new'}`}>
                                  <span className="status-dot"></span>
                                  {item.status === 'booked' ? 'Booked' : item.status === 'contacted' ? 'Contacted' : 'New Lead'}
                                </span>
                              </div>
                            </div>

                            {/* Details Grid */}
                            <div className="admin-enquiry-grid">
                              <div className="enquiry-grid-col">
                                <span className="grid-label">Requested Genre</span>
                                <span className="grid-value highlight">{item.interest || 'General'}</span>
                              </div>
                              <div className="enquiry-grid-col">
                                <span className="grid-label">Event Date</span>
                                <span className="grid-value">
                                  <Calendar size={13} style={{ display: 'inline', marginRight: '4px' }} />
                                  {item.date || 'Flexible'}
                                </span>
                              </div>
                              <div className="enquiry-grid-col">
                                <span className="grid-label">Location</span>
                                <span className="grid-value">
                                  <MapPin size={13} style={{ display: 'inline', marginRight: '4px' }} />
                                  {item.location || 'Not specified'}
                                </span>
                              </div>
                              <div className="enquiry-grid-col">
                                <span className="grid-label">Phone</span>
                                <span className="grid-value">
                                  {item.phone ? (
                                    <a href={`tel:${item.phone}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                                      {item.phone}
                                    </a>
                                  ) : '—'}
                                </span>
                              </div>
                              <div className="enquiry-grid-col">
                                <span className="grid-label">Email</span>
                                <span className="grid-value">
                                  {item.email ? (
                                    <a href={`mailto:${item.email}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
                                      {item.email}
                                    </a>
                                  ) : '—'}
                                </span>
                              </div>
                            </div>

                            {/* Note / Message */}
                            {item.note && (
                              <div className="admin-enquiry-note">
                                <span className="note-label">Client's Note:</span>
                                <p>"{item.note}"</p>
                              </div>
                            )}

                            {/* Actions Bar */}
                            <div className="admin-enquiry-actions">
                              <div className="enquiry-contact-btns">
                                {waLink && (
                                  <a 
                                    href={waLink} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="admin-btn-wa"
                                    title="Open WhatsApp chat with client"
                                  >
                                    <MessageCircle size={15} /> Chat on WhatsApp
                                  </a>
                                )}
                                {item.phone && (
                                  <a href={`tel:${item.phone}`} className="admin-btn admin-btn-secondary admin-btn-sm">
                                    <Phone size={13} /> Call
                                  </a>
                                )}
                                {item.email && (
                                  <a href={`mailto:${item.email}`} className="admin-btn admin-btn-secondary admin-btn-sm">
                                    <Mail size={13} /> Email
                                  </a>
                                )}
                              </div>

                              <div className="enquiry-status-btns">
                                <select 
                                  className="admin-status-select"
                                  value={item.status || 'new'}
                                  onChange={e => updateEnquiryStatus(item.id, e.target.value)}
                                >
                                  <option value="new">Mark: New</option>
                                  <option value="contacted">Mark: Contacted</option>
                                  <option value="booked">Mark: Booked</option>
                                </select>
                                <button 
                                  className="admin-btn-icon-danger"
                                  title="Delete inquiry"
                                  onClick={() => {
                                    if (confirm(`Delete inquiry from ${item.name || 'this client'}?`)) {
                                      deleteEnquiry(item.id)
                                    }
                                  }}
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

            </main>
          </div>
        )}

      </div>
    </div>
  )
}
