// Storage service for favorites and watch later
// Uses localStorage to persist data

const STORAGE_KEYS = {
  FAVORITES: 'betterflix_favorites',
  WATCH_LATER: 'betterflix_watch_later'
};

// Helper to get items from localStorage
const getItems = (key) => {
  try {
    const items = localStorage.getItem(key);
    return items ? JSON.parse(items) : [];
  } catch (error) {
    console.error(`Error reading ${key} from localStorage:`, error);
    return [];
  }
};

// Helper to save items to localStorage
const saveItems = (key, items) => {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch (error) {
    console.error(`Error saving ${key} to localStorage:`, error);
  }
};

// Helper to fix image URLs in stored items
const fixImageUrls = (items) => {
  return items.map(item => {
    const fixed = { ...item };
    if (fixed.posterPath && fixed.posterPath.startsWith('/')) {
      fixed.posterPath = `https://image.tmdb.org/t/p/w500${fixed.posterPath}`;
    }
    if (fixed.backdropPath && fixed.backdropPath.startsWith('/')) {
      fixed.backdropPath = `https://image.tmdb.org/t/p/w1280${fixed.backdropPath}`;
    }
    return fixed;
  });
};

// Favorites API
export const favoritesService = {
  getAll() {
    const items = getItems(STORAGE_KEYS.FAVORITES);
    return fixImageUrls(items);
  },

  add(file) {
    const favorites = this.getAll();
    // Check if already exists
    if (!favorites.find(f => f.path === file.path)) {
      favorites.push({
        ...file,
        addedAt: new Date().toISOString()
      });
      saveItems(STORAGE_KEYS.FAVORITES, favorites);
    }
    return favorites;
  },

  remove(filePath) {
    const favorites = this.getAll();
    const filtered = favorites.filter(f => f.path !== filePath);
    saveItems(STORAGE_KEYS.FAVORITES, filtered);
    return filtered;
  },

  isFavorite(filePath) {
    const favorites = this.getAll();
    return favorites.some(f => f.path === filePath);
  },

  toggle(file) {
    if (this.isFavorite(file.path)) {
      this.remove(file.path);
      return false;
    } else {
      this.add(file);
      return true;
    }
  }
};

// Watch Later API
export const watchLaterService = {
  getAll() {
    const items = getItems(STORAGE_KEYS.WATCH_LATER);
    return fixImageUrls(items);
  },

  add(file) {
    const watchLater = this.getAll();
    // Check if already exists
    if (!watchLater.find(f => f.path === file.path)) {
      watchLater.push({
        ...file,
        addedAt: new Date().toISOString()
      });
      saveItems(STORAGE_KEYS.WATCH_LATER, watchLater);
    }
    return watchLater;
  },

  remove(filePath) {
    const watchLater = this.getAll();
    const filtered = watchLater.filter(f => f.path !== filePath);
    saveItems(STORAGE_KEYS.WATCH_LATER, filtered);
    return filtered;
  },

  isInWatchLater(filePath) {
    const watchLater = this.getAll();
    return watchLater.some(f => f.path === filePath);
  },

  toggle(file) {
    if (this.isInWatchLater(file.path)) {
      this.remove(file.path);
      return false;
    } else {
      this.add(file);
      return true;
    }
  }
};

// Metadata Cache (IndexedDB)
const DB_NAME = 'betterflix-db';
const DB_VERSION = 1;
const STORE_NAME = 'media_metadata';

const getDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = (event) => {
            console.error("IndexedDB error:", event.target.error);
            reject(event.target.error);
        };
        
        request.onsuccess = (event) => {
            resolve(event.target.result);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'path' });
            }
        };
    });
};

export const metadataCache = {
  async set(fileData) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(fileData);
        
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });
  },

  async get(path) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(path);
        
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
  },

  async getAll() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
  },
  
  async setMany(files) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
        
        files.forEach(file => {
            store.put(file);
        });
    });
  },

  async clear() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();
        
        req.onsuccess = () => resolve();
        req.onerror = (e) => reject(e.target.error);
    });
  }
};
