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

        let list = this._get(STORAGE_KEYS.CONTINUE_WATCHING); // Get raw list, not deduplicated
        
        // Progress percentage
        const pct = currentTime / duration;

        // Detect TV series episodes (path contains /Season X/ or episode pattern S01E01)
        const isTvEpisode = /\/season\s*\d+\//i.test(item.path) || /s\d{1,2}e\d{1,2}/i.test(item.path || item.name);
        
        // Extract show folder path (e.g., /TV Series/Breaking Bad/) from episode path
        let showPathForStorage = null; // Original case, for storage
        let showPathLower = null;      // Lowercase, for comparison
        if (isTvEpisode) {
            const seasonMatch = item.path.match(/^(.*?\/[^/]+)\/season\s*\d+\//i);
            if (seasonMatch) {
                showPathForStorage = seasonMatch[1] + '/'; // e.g., "/TV Series/Breaking Bad/"
                showPathLower = seasonMatch[1].toLowerCase();
            }
        }

        // The "key" path for this entry (series folder for TV, file path for movies)
        const entryKeyPath = showPathForStorage || item.path;
        
        // If > 95% complete, remove from continue watching (mark as done)
        if (pct > 0.95) {
            const idx = list.findIndex(i => {
                if (showPathLower) {
                    // For TV, match by series folder
                    const m = i.path?.match(/^(.*?\/[^/]+)\/season\s*\d+\//i);
                    return m && m[1].toLowerCase() === showPathLower;
                }
                return i.path === item.path || i.filePath === item.path;
            });
            if (idx >= 0) {
                list.splice(idx, 1);
                this._set(STORAGE_KEYS.CONTINUE_WATCHING, list);
            }
            return;
        }

        // Find existing entry for this show (by series path) or this exact file
        let existingIdx = list.findIndex(i => {
            if (showPathLower) {
                // For TV, match by series folder path (compare lowercase)
                const m = i.path?.match(/^(.*?\/[^/]+)\/?$/i);
                if (m && m[1].toLowerCase() === showPathLower) return true;
                // Also check if it's an old-format entry with episode path
                const mOld = i.path?.match(/^(.*?\/[^/]+)\/season\s*\d+\//i);
                return mOld && mOld[1].toLowerCase() === showPathLower;
            }
            return i.path === item.path;
        });
        
        let existingEntry = existingIdx >= 0 ? list[existingIdx] : {};

        // Build the new entry, explicitly controlling each property
        const entry = {
            // Preserve existing metadata if available
            id: existingEntry.id || item.id,
            title: existingEntry.title || item.title || item.name,
            name: existingEntry.name || item.name,
            overview: existingEntry.overview || item.overview,
            posterPath: item.posterPath || existingEntry.posterPath,
            backdropPath: item.backdropPath || existingEntry.backdropPath,
            rating: existingEntry.rating || item.rating,
            releaseDate: existingEntry.releaseDate || item.releaseDate,
            genres: existingEntry.genres || item.genres,
            mediaType: isTvEpisode ? 'tv' : (existingEntry.mediaType || item.mediaType || 'movie'),
            type: isTvEpisode ? 'directory' : (existingEntry.type || item.type),
            
            // THE KEY FIX: path is the SERIES folder for TV shows, not the episode file
            path: entryKeyPath,
            
            // Progress data
            currentTime,
            duration,
            progress: pct,
            lastWatched: Date.now(),
            
            // Episode-specific data for resume
            filePath: item.path,
            episodeName: item.name
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

    clearAllData() {
        Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
        window.dispatchEvent(new Event('user-content-updated'));
    }
}

export const userContent = new UserContentService();
