import { initializeApp, getApps, getApp } from 'firebase/app'
import { getFirestore, doc, setDoc, onSnapshot, getDoc, collection, getDocs, deleteDoc, updateDoc } from 'firebase/firestore'

const FIREBASE_CONFIG_KEY = 'portfolio_firebase_config_v1'
const COLLECTION_NAME = 'portfolio_cms'
const DOC_ID = 'live_content'

// Project's live Firebase configuration
export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBzHulU6y3UKKk5OpgWLHEKezGMbfmYlfc",
  authDomain: "flashlite-photography.firebaseapp.com",
  projectId: "flashlite-photography",
  storageBucket: "flashlite-photography.firebasestorage.app",
  messagingSenderId: "574386055153",
  appId: "1:574386055153:web:3e733ffdfb2c975ae04650",
  measurementId: "G-QE62V7DC12"
}

// Load saved custom config or default to built-in project config
export function getStoredFirebaseConfig() {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(FIREBASE_CONFIG_KEY)
      if (saved) return JSON.parse(saved)
    }
  } catch (e) {
    console.warn('Error reading stored Firebase config:', e)
  }

  // Fallback to environment variables if provided
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_API_KEY && import.meta.env?.VITE_FIREBASE_PROJECT_ID) {
      return {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebasestorage.app`,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '574386055153',
        appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
      }
    }
  } catch (e) {
    // ignore
  }

  return DEFAULT_FIREBASE_CONFIG
}

export function saveStoredFirebaseConfig(config) {
  try {
    if (typeof localStorage === 'undefined') return
    if (!config) {
      localStorage.removeItem(FIREBASE_CONFIG_KEY)
    } else {
      localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config))
    }
  } catch (e) {
    console.error('Failed to save Firebase config:', e)
  }
}

let firestoreInstance = null

export function getDb() {
  if (firestoreInstance) return firestoreInstance

  const config = getStoredFirebaseConfig()
  if (!config || !config.apiKey || !config.projectId) {
    return null
  }

  try {
    const app = getApps().length ? getApp() : initializeApp(config)
    firestoreInstance = getFirestore(app)
    return firestoreInstance
  } catch (err) {
    console.error('Firebase initialization error:', err)
    return null
  }
}

// Reset instance when config changes
export function reinitFirebase(newConfig) {
  saveStoredFirebaseConfig(newConfig)
  firestoreInstance = null
  return getDb()
}

const CHUNK_SIZE = 700000 // 700KB per Firestore document (safe under 1048487 bytes limit)
const SYNC_TIMEOUT_MS = 20000

// Clean and deduplicate duplicate image data before transmitting to Firestore
function sanitizeContentForUpload(data) {
  const clean = JSON.parse(JSON.stringify(data))
  if (Array.isArray(clean.categories)) {
    clean.categories = clean.categories.map(cat => {
      // If coverImage.src is identical to cat.src, don't duplicate the large data string
      if (cat && cat.coverImage && typeof cat.coverImage === 'object' && cat.coverImage.src === cat.src) {
        return {
          ...cat,
          coverImage: { alt: cat.coverImage.alt || `${cat.title || ''} portfolio collection` }
        }
      }
      return cat
    })
  }
  return clean
}

// Restore any omitted redundant fields after downloading from Firestore
function restoreSanitizedContent(data) {
  if (!data) return data
  if (Array.isArray(data.categories)) {
    data.categories = data.categories.map(cat => {
      if (cat && cat.src && cat.coverImage && !cat.coverImage.src) {
        return {
          ...cat,
          coverImage: { ...cat.coverImage, src: cat.src }
        }
      }
      return cat
    })
  }
  return data
}

// Reconstruct complete JSON content from single payload, chunks, or legacy fields
async function reconstructContent(docData, db) {
  if (!docData) return null

  // 1. Chunked documents (fetch concurrently in parallel)
  if (docData.isChunked && docData.chunkCount) {
    try {
      const chunkPromises = Array.from({ length: docData.chunkCount }, (_, i) => 
        getDoc(doc(db, COLLECTION_NAME, `chunk_${i}`))
      )
      const chunkSnaps = await Promise.all(chunkPromises)
      const combined = chunkSnaps.map(snap => snap.exists() ? (snap.data()?.data || '') : '').join('')
      if (combined) {
        return restoreSanitizedContent(JSON.parse(combined))
      }
    } catch (e) {
      console.error('Error reconstructing chunked Firestore content:', e)
    }
  }

  // 2. Single payload string
  if (docData.payload) {
    try {
      return restoreSanitizedContent(JSON.parse(docData.payload))
    } catch (e) {
      console.error('Error parsing Firestore payload:', e)
    }
  }

  // 3. Direct document fields (legacy fallback)
  return restoreSanitizedContent(docData)
}

const withTimeout = (promise, ms = SYNC_TIMEOUT_MS) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Cloud request timed out')), ms))
  ])
}

// Push latest portfolio content to cloud Firestore (with deduplication, parallel upload, and retry)
export async function pushContentToCloud(contentData, maxRetries = 2) {
  const db = getDb()
  if (!db) {
    console.warn('Firebase DB not initialized, cannot push')
    return false
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Strip any undefined fields and deduplicate large identical media strings
      const cleanData = sanitizeContentForUpload(contentData)
      cleanData._lastSavedAt = cleanData._lastSavedAt || Date.now()
      cleanData._cloudSyncedAt = Date.now()
      const jsonStr = JSON.stringify(cleanData)

      const docRef = doc(db, COLLECTION_NAME, DOC_ID)

      if (jsonStr.length < CHUNK_SIZE) {
        // Safe in a single document - fast sub-second upload
        await withTimeout(setDoc(docRef, {
          isChunked: false,
          payload: jsonStr,
          _lastSavedAt: cleanData._lastSavedAt,
          _cloudSyncedAt: cleanData._cloudSyncedAt
        }), SYNC_TIMEOUT_MS)
      } else {
        // Chunk across multiple documents to never exceed Firestore 1MB limits
        const totalChunks = Math.ceil(jsonStr.length / CHUNK_SIZE)
        // Upload chunks concurrently in parallel
        const uploadChunks = Array.from({ length: totalChunks }, (_, i) => {
          const chunkPart = jsonStr.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
          return withTimeout(setDoc(doc(db, COLLECTION_NAME, `chunk_${i}`), {
            data: chunkPart,
            index: i,
            updatedAt: Date.now()
          }), SYNC_TIMEOUT_MS)
        })
        await Promise.all(uploadChunks)
        await withTimeout(setDoc(docRef, {
          isChunked: true,
          chunkCount: totalChunks,
          _lastSavedAt: cleanData._lastSavedAt,
          _cloudSyncedAt: cleanData._cloudSyncedAt
        }), SYNC_TIMEOUT_MS)
      }

      console.log(`Successfully synced content to Firebase cloud (attempt ${attempt})!`)
      return true
    } catch (err) {
      console.warn(`Cloud sync attempt ${attempt} failed:`, err?.message || err)
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 800))
      } else {
        console.error('Failed to sync content to Firebase cloud after retries:', err)
        return false
      }
    }
  }
  return false
}

// Pull content once
export async function fetchContentFromCloud() {
  const db = getDb()
  if (!db) return null

  try {
    const docRef = doc(db, COLLECTION_NAME, DOC_ID)
    const snap = await getDoc(docRef)
    if (snap.exists()) {
      return await reconstructContent(snap.data(), db)
    }
  } catch (err) {
    console.warn('Error fetching cloud content:', err)
  }
  return null
}

// Real-time listener: triggers whenever laptop or phone updates content
export function subscribeToCloudContent(onUpdate) {
  const db = getDb()
  if (!db) return () => {}

  try {
    const docRef = doc(db, COLLECTION_NAME, DOC_ID)
    const unsubscribe = onSnapshot(docRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = await reconstructContent(docSnap.data(), db)
        if (data) {
          onUpdate(data)
        }
      }
    }, (error) => {
      console.warn('Firebase snapshot listener error:', error)
    })
    return unsubscribe
  } catch (e) {
    console.warn('Failed to subscribe to cloud content:', e)
    return () => {}
  }
}

// ----------------------------------------------------
// Real-time Client Inquiries / Booking Messages (Firestore)
// ----------------------------------------------------
const ENQUIRIES_COLLECTION = 'portfolio_enquiries'
const ENQUIRIES_CACHE_KEY = 'portfolio_enquiries_cache_v1'

export function getLocalEnquiries() {
  try {
    const raw = localStorage.getItem(ENQUIRIES_CACHE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveLocalEnquiries(list) {
  try {
    localStorage.setItem(ENQUIRIES_CACHE_KEY, JSON.stringify(list))
  } catch {}
}

export async function saveEnquiryToCloud(enquiryData) {
  const enquiryId = 'enquiry_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)
  const fullEnquiry = {
    id: enquiryId,
    ...enquiryData,
    status: enquiryData.status || 'new',
    createdAt: Date.now()
  }

  // 1. Instantly save to local cache
  const existing = getLocalEnquiries()
  const updated = [fullEnquiry, ...existing.filter(e => e.id !== enquiryId)]
  saveLocalEnquiries(updated)

  // 2. Persist to Firestore
  const db = getDb()
  if (db) {
    try {
      await withTimeout(setDoc(doc(db, ENQUIRIES_COLLECTION, enquiryId), fullEnquiry), 12000)
    } catch (err) {
      console.warn('Firestore enquiry push error (kept safe locally):', err?.message || err)
    }
  }

  return fullEnquiry
}

export async function fetchEnquiriesFromCloud() {
  const local = getLocalEnquiries()
  const db = getDb()
  if (!db) return local

  try {
    const snap = await withTimeout(getDocs(collection(db, ENQUIRIES_COLLECTION)), 12000)
    const remoteList = []
    snap.forEach(docSnap => {
      remoteList.push(docSnap.data())
    })
    const map = new Map()
    local.forEach(e => map.set(e.id, e))
    remoteList.forEach(e => map.set(e.id, e))
    const merged = Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    saveLocalEnquiries(merged)
    return merged
  } catch (err) {
    console.warn('Error fetching cloud enquiries:', err?.message || err)
    return local
  }
}

export function subscribeToCloudEnquiries(onUpdate) {
  const db = getDb()
  if (!db) return () => {}

  try {
    const unsubscribe = onSnapshot(collection(db, ENQUIRIES_COLLECTION), (snapshot) => {
      const list = []
      snapshot.forEach(docSnap => {
        list.push(docSnap.data())
      })
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      saveLocalEnquiries(list)
      onUpdate(list)
    }, (err) => {
      console.warn('Firestore enquiries subscription notice:', err?.message || err)
    })
    return unsubscribe
  } catch (err) {
    console.warn('Failed to subscribe to cloud enquiries:', err)
    return () => {}
  }
}

export async function deleteEnquiryFromCloud(enquiryId) {
  const local = getLocalEnquiries().filter(e => e.id !== enquiryId)
  saveLocalEnquiries(local)

  const db = getDb()
  if (db) {
    try {
      await deleteDoc(doc(db, ENQUIRIES_COLLECTION, enquiryId))
    } catch (err) {
      console.warn('Failed to delete enquiry from Firestore:', err)
    }
  }
}

export async function updateEnquiryStatusInCloud(enquiryId, status) {
  const local = getLocalEnquiries().map(e => e.id === enquiryId ? { ...e, status } : e)
  saveLocalEnquiries(local)

  const db = getDb()
  if (db) {
    try {
      await updateDoc(doc(db, ENQUIRIES_COLLECTION, enquiryId), { status })
    } catch (err) {
      console.warn('Failed to update enquiry status in Firestore:', err)
    }
  }
}
