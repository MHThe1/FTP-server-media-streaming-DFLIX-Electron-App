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
        let list = this._get(STORAGE_KEYS.CONTINUE_WATCHING);
        
        // Deduplicate: Keep only the most recent episode per TV series
        const showMap = new Map();
        const deduped = [];
        
        // Sort by lastWatched desc first
        list.sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0));
        
        for (const entry of list) {
            // Check if this is a TV episode (has /Season X/ in path)
            const seasonMatch = entry.path?.match(/^(.*?\/[^/]+)\/season\s*\d+\//i);
            
            if (seasonMatch) {
                const showPath = seasonMatch[1].toLowerCase();
                if (!showMap.has(showPath)) {
                    showMap.set(showPath, true);
                    deduped.push(entry);
                }
            } else {
                // Not a TV episode, keep it
                deduped.push(entry);
            }
        }
        
        return deduped;
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

        let list = this.getContinueWatching();
        
        // Progress percentage
        const pct = currentTime / duration;
        
        // If > 95% complete, remove from continue watching (mark as done)
        if (pct > 0.95) {
            const idx = list.findIndex(i => i.path === item.path);
            if (idx >= 0) {
                list.splice(idx, 1);
                this._set(STORAGE_KEYS.CONTINUE_WATCHING, list);
            }
            return;
        }

        // Detect TV series episodes (path contains /Season X/ or episode pattern S01E01)
        const isTvEpisode = /\/season\s*\d+\//i.test(item.path) || /s\d{1,2}e\d{1,2}/i.test(item.path || item.name);
        
        // Extract show folder path (e.g., /TV Series/Severance/) from episode path
        let showPath = null;
        if (isTvEpisode) {
            // Find the show's root folder by looking for "Season" in path
            const seasonMatch = item.path.match(/^(.*?\/[^/]+)\/season\s*\d+\//i);
            if (seasonMatch) {
                showPath = seasonMatch[1].toLowerCase(); // e.g., "/tv series/severance"
            }
        }

        // Find existing entry for this exact episode OR any episode from the same show
        let existingIdx = list.findIndex(i => i.path === item.path);
        let existingEntry = existingIdx >= 0 ? list[existingIdx] : {};
        
        // If this is a TV episode, remove any OTHER episodes from the same show
        if (showPath) {
            list = list.filter((entry, idx) => {
                if (idx === existingIdx) return true; // Keep the current entry (will be updated)
                const entryShowMatch = entry.path?.match(/^(.*?\/[^/]+)\/season\s*\d+\//i);
                if (entryShowMatch && entryShowMatch[1].toLowerCase() === showPath) {
                    return false; // Remove this old episode from same show
                }
                return true;
            });
            // Recalculate existingIdx after filter
            existingIdx = list.findIndex(i => i.path === item.path);
            existingEntry = existingIdx >= 0 ? list[existingIdx] : {};
        }

        // Smart Merge: Prefer new data, but keep old metadata (poster/backdrop) if missing
        const entry = {
            ...existingEntry,
            ...item,
            posterPath: item.posterPath || existingEntry.posterPath,
            backdropPath: item.backdropPath || existingEntry.backdropPath,
            title: item.title || existingEntry.title || item.name,
            currentTime,
            duration,
            progress: pct,
            lastWatched: Date.now(),
            // Store the episode file path for resume
            filePath: item.path
        };

        if (existingIdx >= 0) {
            list[existingIdx] = entry;
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
