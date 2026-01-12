const STORAGE_KEYS = {
    FAVORITES: 'user_favorites',
    WATCH_LATER: 'user_watch_later',
    CONTINUE_WATCHING: 'user_continue_watching'
};

class UserContentService {
    _get(key) {
        try {
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch {
            return [];
        }
    }

    _set(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
        // Dispatch event for UI updates
        window.dispatchEvent(new Event('user-content-updated'));
    }

    getFavorites() { return this._get(STORAGE_KEYS.FAVORITES); }
    getWatchLater() { return this._get(STORAGE_KEYS.WATCH_LATER); }
    getContinueWatching() { 
        // Sort by last watched timestamp (descending)
        return this._get(STORAGE_KEYS.CONTINUE_WATCHING).sort((a,b) => b.lastWatched - a.lastWatched); 
    }

    isFavorite(item) { return this.getFavorites().some(i => i.path === item.path); }
    isInWatchLater(item) { return this.getWatchLater().some(i => i.path === item.path); }

    toggleFavorite(item) {
        const list = this.getFavorites();
        const idx = list.findIndex(i => i.path === item.path);
        if (idx >= 0) {
            list.splice(idx, 1);
        } else {
            list.unshift({ ...item, addedAt: Date.now() });
        }
        this._set(STORAGE_KEYS.FAVORITES, list);
        return idx === -1; // returns true if added
    }

    toggleWatchLater(item) {
        const list = this.getWatchLater();
        const idx = list.findIndex(i => i.path === item.path);
        if (idx >= 0) {
            list.splice(idx, 1);
        } else {
            list.unshift({ ...item, addedAt: Date.now() });
        }
        this._set(STORAGE_KEYS.WATCH_LATER, list);
        return idx === -1;
    }

    saveProgress(item, currentTime, duration) {
        if (!duration || duration < 10) return; // Ignore very short/broken clips

        const list = this.getContinueWatching();
        const idx = list.findIndex(i => i.path === item.path);
        
        // Progress percentage
        const pct = currentTime / duration;
        
        // If > 95% complete, remove from continue watching (mark as done)
        if (pct > 0.95) {
            if (idx >= 0) {
                list.splice(idx, 1);
                this._set(STORAGE_KEYS.CONTINUE_WATCHING, list);
            }
            return;
        }

        const existing = idx >= 0 ? list[idx] : {};
        
        // Smart Merge: Prefer new data, but keep old metadata (poster/backdrop) if missing in new
        const entry = {
            ...existing, // Keep old stuff (like ID, posterPath)
            ...item,     // Overwrite with new stuff (path, currentTime)
            
            // Explicitly ensure poster/backdrop aren't lost if new item is "bare"
            posterPath: item.posterPath || existing.posterPath,
            backdropPath: item.backdropPath || existing.backdropPath,
            title: item.title || existing.title || item.name,
            
            currentTime,
            duration,
            progress: pct,
            lastWatched: Date.now()
        };

        if (idx >= 0) {
            list[idx] = entry;
        } else {
            list.unshift(entry);
        }
        
        this._set(STORAGE_KEYS.CONTINUE_WATCHING, list);
    }

    removeContinueWatching(itemPath) {
        const list = this.getContinueWatching();
        const idx = list.findIndex(i => i.path === itemPath);
        if (idx >= 0) {
            list.splice(idx, 1);
            this._set(STORAGE_KEYS.CONTINUE_WATCHING, list);
            return true;
        }
        return false;
    }
}

export const userContent = new UserContentService();
