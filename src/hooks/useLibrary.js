import { useState, useEffect, useMemo } from 'react';
import { metadataService } from '../services/metadata';

export const useLibrary = () => {
    const [loading, setLoading] = useState(true);
    const [library, setLibrary] = useState([]);
    const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
    const [isScanning, setIsScanning] = useState(false);

    useEffect(() => {
        loadLibrary();
    }, []);

    const loadLibrary = async () => {
        try {
            setLoading(true);
            // Check cache first (using service to get hotfixes)
            let cachedItems = await metadataService.getLibrary();
            
            // If we have a decent cache, show it immediately
            if (cachedItems.length > 0) {
                setLibrary(cachedItems);
                setLoading(false);
            }

            // If cache is empty or very small, trigger scan
            if (cachedItems.length < 50) { 
                setIsScanning(true);
                const newItems = [];
                
                await metadataService.buildLibraryIndex((current, total, newItem) => {
                    setScanProgress({ current, total });
                    
                    // Progressive Update: Add item to library state live
                    if (newItem) {
                        newItems.push(newItem);
                        
                        // Batch updates to avoid too many re-renders (every 10 items)
                        if (newItems.length % 10 === 0) {
                            setLibrary(prev => {
                                const combined = [...prev, ...newItems];
                                // De-dup by path just in case
                                return Array.from(new Map(combined.map(item => [item.path, item])).values());
                            });
                            
                            // If we have enough items, stop showing the loading spinner!
                            if (newItems.length >= 20) {
                                setLoading(false);
                            }
                        }
                    }
                });
                
                setIsScanning(false);
                // Final consistency set
                const finalLibrary = await metadataService.getLibrary();
                setLibrary(finalLibrary);
            }
            
        } catch (err) {
            console.error("Failed to load library:", err);
            setLoading(false);
        }
    };

    // Build library lookup map once (for O(1) access)
    const libraryByPath = useMemo(() => {
        const map = new Map();
        library.forEach(lib => {
            // Store by both encoded and decoded path for flexibility
            map.set(lib.path, lib);
            try {
                map.set(decodeURIComponent(lib.path), lib);
            } catch {}
        });
        return map;
    }, [library]);

    // Helper to hydrate user list items with full metadata from library
    const hydrateItems = (items) => {
        if (!items || !items.length) return [];
        
        const hydrated = items.map(item => {
            // Fast O(1) lookup
            let libraryItem = libraryByPath.get(item.path);
            
            // If no exact match, try to find parent folder (simpler approach)
            if (!libraryItem && item.path) {
                // 1. Try TV Season pattern (e.g., /TV Series/ShowName/Season 1/file.mkv -> /TV Series/ShowName)
                const seasonMatch = item.path.match(/^(.*?\/[^/]+)\/season\s*\d+\//i);
                if (seasonMatch) {
                    libraryItem = libraryByPath.get(seasonMatch[1]) || libraryByPath.get(seasonMatch[1] + '/');
                }

                // 2. Try immediate parent (Movies in folders, e.g. /Movies/Inception/Inception.mkv -> /Movies/Inception)
                if (!libraryItem) {
                        const lastSlash = item.path.lastIndexOf('/');
                        if (lastSlash > 0) {
                            const parentPath = item.path.substring(0, lastSlash);
                            libraryItem = libraryByPath.get(parentPath) || libraryByPath.get(parentPath + '/');
                        }
                }
            }

            if (libraryItem) {
                // CRITICAL: Use parent folder for DISPLAY, but keep file tracking for PLAYBACK
                return { 
                    // Start with library parent metadata (title, poster, etc.)
                    ...libraryItem,
                    
                    // Override with file-specific tracking data
                    filePath: item.path,        // Preserve actual file path for playback
                    currentTime: item.currentTime,
                    duration: item.duration,
                    progress: item.progress,
                    lastWatched: item.lastWatched,
                    
                    // Use parent's path for deduplication, but store file path for playback
                    parentPath: libraryItem.path,
                    path: libraryItem.path,  // Display card uses parent path (for onclick to work with modal)
                    
                    // Explicitly use parent metadata for display
                    title: libraryItem.title || libraryItem.name,
                    name: libraryItem.name || libraryItem.title,
                    posterPath: libraryItem.posterPath,
                    backdropPath: libraryItem.backdropPath,
                    mediaType: libraryItem.mediaType,
                    tmdbId: libraryItem.tmdbId,
                };
            }
            return item;
        });
        
        // Deduplicate by parent path (keep most recent)
        const byParent = new Map();
        hydrated.forEach(item => {
            const key = item.parentPath || item.path;
            const existing = byParent.get(key);
            if (!existing || item.lastWatched > existing.lastWatched) {
                byParent.set(key, item);
            }
        });
        
        return Array.from(byParent.values()).sort((a, b) => b.lastWatched - a.lastWatched);
    };

    return {
        loading,
        library,
        scanProgress,
        isScanning,
        hydrateItems,
        loadLibrary // Exported in case manual reload is needed (removed from UI but useful logic)
    };
};
