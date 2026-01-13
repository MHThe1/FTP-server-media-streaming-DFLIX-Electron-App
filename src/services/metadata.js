import { api } from './api';
import { metadataCache } from './storage';
import staticCatalog from '../data/static_catalog.json';

// Build lookup maps for instant matching
const movieLookup = new Map();
const tvLookup = new Map();

// Helper to normalize strings for comparison (remove special chars, lowercase)
const normalize = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

// Initialize static catalog
if (staticCatalog && staticCatalog.items) {
    staticCatalog.items.forEach(item => {
        const key = normalize(item.title || item.name);
        if (key) {
            if (item.media_type === 'movie') movieLookup.set(key, item);
            else if (item.media_type === 'tv') tvLookup.set(key, item);
        }
        
        // Also map original title if different
        const originalKey = normalize(item.original_title || item.original_name);
        if (originalKey && originalKey !== key) {
             if (item.media_type === 'movie') movieLookup.set(originalKey, item);
            else if (item.media_type === 'tv') tvLookup.set(originalKey, item);
        }
    });
    console.log(`Loaded ${movieLookup.size} movies and ${tvLookup.size} TV shows from static catalog.`);
}

// Utilities to parse filenames
const cleanFileName = (fileName) => {
  let name = fileName.replace(/\.[^/.]+$/, "");
  name = name.replace(/\b(1080p|720p|4k|2160p|h264|x265|aac|bluray|web-dl|webrip|hdr)\b/gi, '');
  name = name.replace(/[._]/g, ' ');
  name = name.replace(/[\[\(].*?[\]\)]/g, '');
  return name.trim();
};

export const metadataService = {
  // Recursively scan directory and return all media files
  // Iterative scan to prevent stack overflow and OOM
  async scanDirectory(startPath = '/') {
    const collected = [];
    const queue = [startPath];
    const visited = new Set();
    
    // Initial visit check
    visited.add(startPath);
    
    // Safety limit to prevent infinite run during dev/debug?
    // Let's rely on visited set correctness.
    
    console.log(`Starting iterative scan from ${startPath}`);
    
    while (queue.length > 0) {
        const currentPath = queue.shift(); // BFS (use pop() for DFS)
        
        try {
            const items = await api.listFiles(currentPath);
            
            // Optimization: Detect if we are in a TV Root folder
            // If yes, the directories we find are "Shows" -> Collect them and STOP recursion.
            const lowerPath = currentPath.toLowerCase();
            const tvRoots = ['/tv series', '/tv series anime', '/tv series dubbed', '/tv series hindi'];
            
            // Refined Check: Are we scanning a TV Root?
            const scanningTvRoot = tvRoots.some(root => {
                // EXCLUDE Dubbed content as requested
                if (currentPath.toLowerCase().includes('dubbed')) return false;

                // Check if currentPath is exactly the root (normalized)
                const normCurrent = currentPath.endsWith('/') ? currentPath.toLowerCase() : currentPath.toLowerCase() + '/';
                const normRoot = root.endsWith('/') ? root : root + '/';
                return normCurrent === normRoot || normCurrent === '/' + normRoot; 
            });

            console.log(`Scanning ${currentPath}. scanningTvRoot=${scanningTvRoot}`);

            for (const item of items) {
                const itemPath = item.path;
                
                if (item.type === 'directory') {
                    if (scanningTvRoot) {
                        // This item IS A TV SHOW (e.g. "Breaking Bad")
                        // 1. Collect it
                        collected.push({
                            ...item,
                            name: item.name, // Keep name
                            type: 'directory', // It is a directory
                            mediaType: 'tv'    // Force type
                        });
                        
                        // 2. STOP RECURSION (Do not add to queue/visited)
                        // identifying it as visited ensures we don't process it if we see it again
                        visited.add(itemPath); 
                        
                    } else {
                        // Normal recursion for Movies / subfolders
                        if (!visited.has(itemPath)) {
                            // COLLECT THIS FOLDER TOO (for generic browsing/search)
                            collected.push({
                                ...item,
                                name: item.name,
                                type: 'directory'
                                // No specific mediaType, handled as folder
                            });

                            visited.add(itemPath);
                            queue.push(itemPath);
                        }
                    }
                } else {
                    const ext = item.name.split('.').pop().toLowerCase();
                    const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'webm'];
                    if (videoExts.includes(ext)) {
                        collected.push(item);
                    }
                }
            }
        } catch (error) {
            console.error(`Error scanning ${currentPath}:`, error);
        }
        
        // Optional: yield to event loop if queue is huge? 
        // await new Promise(r => setTimeout(r, 0));
    }
    
    return collected;
  },

  // Match a single file to TMDB data
  // Match a single file to TMDB data
  async matchFile(file, showCache = null) {
    // Check cache first
    const cached = await metadataCache.get(file.path);
    if (cached && cached.tmdbId) {
      // HOTFIX: Fix broken relative image paths in cache
      if (cached.posterPath && cached.posterPath.startsWith('/')) {
        cached.posterPath = `https://image.tmdb.org/t/p/w500${cached.posterPath}`;
      }
      if (cached.backdropPath && cached.backdropPath.startsWith('/')) {
        cached.backdropPath = `https://image.tmdb.org/t/p/w1280${cached.backdropPath}`;
      }
      
      // CRITICAL FIX: Trust the scanner's mediaType over the cache if specified
      if (file.mediaType) {
          cached.mediaType = file.mediaType;
      }
      
      return cached;
    }

    const cleanName = cleanFileName(file.name);
    // Determine type: Trust mediaType if set (from scanDirectory), otherwise check regex
    const isTvShow = file.mediaType === 'tv' || /s\d{1,2}e\d{1,2}/i.test(file.name);
    const searchType = isTvShow ? 'tv' : 'movie';
    
    // For TV shows, we want to search for the SHOW name, not the episode name
    // Extract show name: "Show.Name.S01E01..." -> "Show Name"
    let searchTerm = cleanName;
    if (isTvShow) {
      const parts = file.name.split(/s\d{1,2}e\d{1,2}/i);
      if (parts.length > 0) {
        searchTerm = cleanFileName(parts[0]);
      }
    }
    
    // --- OPTIMIZATION: Check Baked-In Catalog ---
    const normalizedTerm = normalize(searchTerm);
    let staticMatch = null;
    
    if (isTvShow) {
        staticMatch = tvLookup.get(normalizedTerm);
    } else {
        staticMatch = movieLookup.get(normalizedTerm);
    }
    
    if (staticMatch) {
         // Construct metadata from static item
          const metadata = {
            ...file,
            tmdbId: staticMatch.id,
            title: staticMatch.title || staticMatch.name,
            overview: staticMatch.overview,
            posterPath: staticMatch.poster_path ? `https://image.tmdb.org/t/p/w500${staticMatch.poster_path}` : null,
            backdropPath: staticMatch.backdrop_path ? `https://image.tmdb.org/t/p/w1280${staticMatch.backdrop_path}` : null,
            releaseDate: staticMatch.release_date || staticMatch.release_date, 
            rating: staticMatch.vote_average,
            mediaType: staticMatch.media_type
        };
        
        // Save to local cache so next time it's even faster (skips normalization)
        await metadataCache.set(metadata);
        
        // Cache show if applicable
        if (isTvShow && showCache) {
             showCache.set(searchTerm, {
                 id: staticMatch.id,
                 title: staticMatch.name,
                 name: staticMatch.name,
                 overview: staticMatch.overview,
                 poster_path: staticMatch.poster_path,
                 backdrop_path: staticMatch.backdrop_path,
                 first_air_date: staticMatch.first_air_date,
                 vote_average: staticMatch.vote_average
             });
        }
        
        return metadata;
    }
    // ---------------------------------------------

    // STRICT MODE: If not in static catalog, DO NOT fetch from API.
    // Return basic file info. User will fetch on demand via search.
    return {
        ...file,
        title: cleanName, // Use cleaned name for display
        isUnknown: true,
        // Optional: Keep tmdbId null so we know it's raw
    };
    
    /* 
    // OLD LOGIC: Fallback to API (Disabled per user request)
    try {
      const searchRes = await api.searchMedia(searchTerm, searchType);
      // ...
    } catch (err) { ... }
    */
  },

  // Main entry: Scan entire library, match everything, and cache.
  // Returns a progress callback
  async buildLibraryIndex(onProgress) {
    console.log('Starting library scan...');
    const allFiles = await this.scanDirectory('/');
    console.log(`Found ${allFiles.length} files. Matching metadata...`);
    
    let processed = 0;
    const results = [];
    
    // Cache for identifying TV shows to avoid N requests for N episodes
    const showCache = new Map(); // "Show Name" -> TMDB Metadata
    
    // Sort files to process TV shows together? Might help but not strictly necessary with a map.
    // Actually, sorting by name helps to hit the cache for sequential episodes immediately.
    allFiles.sort((a, b) => a.name.localeCompare(b.name));

    for (const file of allFiles) {
      // Pass showCache to matchFile
      const meta = await this.matchFile(file, showCache);
      results.push(meta);
      processed++;
      
      // PROGRESSIVE LOADING: Pass the new item back to the UI immediately
      if (onProgress) onProgress(processed, allFiles.length, meta);
    }
    
    return results;
  },
  
  // --- Full Server Search ---
  async searchServerIndex(query) {
      if (!query || query.length < 3) return [];
      
      try {
          // Lazy load the index
          if (!this.serverIndex) {
              console.log('Loading full server index...');
              try {
                  // Use a specific Vite glob import or ensure file is included in build assets
                  // For now, dynamic import should work if file exists in src
                  const m = await import('../data/server_index.json');
                  this.serverIndex = m.default || m;
              } catch (e) {
                  console.warn('Server index not found. Run generate_catalog.js');
                  this.serverIndex = [];
              }
          }

          const q = query.toLowerCase();
          
          // Filter matches from the 17k+ list
          // Item format: { n: "Name", p: "/path/" }
          const matches = this.serverIndex.filter(item => 
              item.n.toLowerCase().includes(q)
          );

          // Get top 5 matches to enrich
          const topMatches = matches.slice(0, 5);
          const remainingMatches = matches.slice(5);

          // Enrich top 5 with TMDB data
          const enrichedTop = await Promise.all(topMatches.map(async (item) => {
              const isMovie = item.p.includes('/Movies/');
              const type = isMovie ? 'movie' : 'tv';
              
              // Try to find on TMDB
              try {
                  const cleanName = cleanFileName(item.n);
                  const tmdbData = await api.searchMedia(cleanName, type);
                  if (tmdbData.results && tmdbData.results.length > 0) {
                      // Find best match (exact title match preferred) or just take first
                      const best = tmdbData.results.find(r => r.title.toLowerCase() === item.n.toLowerCase()) || tmdbData.results[0];
                      
                      return {
                          ...best,
                          name: item.n, // Ensure name matches server folder
                          title: best.title || item.n,
                          path: item.p,
                          mediaType: type,
                          type: 'directory',
                          isServerMatch: true,
                          // Ensure we use TMDB images if available
                          posterPath: best.posterPath,
                          backdropPath: best.backdropPath,
                          tmdbId: best.id,
                          overview: best.overview,
                          rating: best.rating,
                          releaseDate: best.releaseDate,
                          addedAt: new Date().toISOString() // Mark when it was discovered
                      };
                  }
              } catch (e) {
                  // Ignore TMDB error
              }

              // Fallback if no TMDB data
              return {
                  name: item.n,
                  title: item.n,
                  path: item.p,
                  mediaType: type,
                  type: 'directory',
                  isServerMatch: true,
                  posterPath: null,
                  backdropPath: null
              };
          }));
          
          // CACHE UPDATE: Save successful matches to local library immediately!
          // We only save items that successfully got TMDB data to avoid polluting cache with junk
          const validDiscoveries = enrichedTop.filter(item => item.tmdbId && item.posterPath);
          if (validDiscoveries.length > 0) {
             // Run in background so we don't block search UI
             metadataCache.setMany(validDiscoveries).catch(err => console.error("Failed to cache search results:", err));
          }

          // Convert remaining raw matches (no TMDB calls)
          const rawRemaining = remainingMatches.map(item => ({
              name: item.n,
              title: item.n,
              path: item.p,
              mediaType: item.p.includes('/Movies/') ? 'movie' : 'tv',
              type: 'directory',
              isServerMatch: true, 
              posterPath: null,
              backdropPath: null
          }));

          return [...enrichedTop, ...rawRemaining];
          
      } catch (err) {
          console.error('Search index error:', err);
          return [];
      }
  },

  // Get all content from cache
  async getLibrary() {
    let items = await metadataCache.getAll();
    
    // STRATEGY: Bake in Static Catalog items if they aren't in the cache
    if (items.length < 50) {
        // Import strictly inside function or top level? 
        // Dynamic import to avoid cycles or top level? 
        // Assuming top level import is fine, but for safety in this big file patch:
        const staticCatalog = await import('../data/static_catalog.json').then(m => m.default || m);
        
        const staticItems = staticCatalog.items
            .filter(item => item.server_path) // ONLY include items with real paths
            .map(item => ({
                name: item.title,
                title: item.title,
                path: item.server_path, // USE REAL PATH FROM SERVER SCAN
                posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
                overview: item.overview,
                tmdbId: item.id,
                mediaType: item.media_type,
                releaseDate: item.release_date,
                rating: item.vote_average,
                genres: [], // TODO: map genre ids if needed
                type: 'directory', // Treat as browseable
                isStatic: true // Flag to know it's "baked in"
            }));
        
        // Merge: prefer scanned items (cached), but fallback to static
        // Actually, just append static ones that aren't in cache (by tmdbId)
        const cachedIds = new Set(items.map(i => i.tmdbId));
        const missingStatic = staticItems.filter(i => !cachedIds.has(i.tmdbId));
        
        items = [...items, ...missingStatic];
    }

    // Apply HOTFIX to all items on read
    return items.map((item) => {
      // Create copy to avoid mutating cache reference directly (optional, but safer)
      const fixed = { ...item };
      
      // FIX 1: Broken Image URLs
      if (fixed.posterPath && fixed.posterPath.startsWith('/')) {
        fixed.posterPath = `https://image.tmdb.org/t/p/w500${fixed.posterPath}`;
      }
      if (fixed.backdropPath && fixed.backdropPath.startsWith('/')) {
        fixed.backdropPath = `https://image.tmdb.org/t/p/w1280${fixed.backdropPath}`;
      }

      // FIX 2: Stale TV Show Classification
      // If item is in a TV folder but not marked as TV, fix it.
      const lowerPath = fixed.path ? fixed.path.toLowerCase() : '';
      const tvRoots = ['/tv series', '/tv series anime', '/tv series dubbed', '/tv series hindi'];
      // Check if path indicates it IS a TV show (child of a TV root)
      const isTvContext = tvRoots.some(root => lowerPath.startsWith(root));
      
      if (isTvContext) {
          // If explicitly TV or matches generic tv patterns
          if (fixed.mediaType === 'tv' || fixed.type === 'directory') {
             fixed.mediaType = 'tv';
          }
      }

      return fixed;
    });
  },

  async clearCache() {
      await metadataCache.clear();
      console.log('Metadata cache cleared.');
  }
};
