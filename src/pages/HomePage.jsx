import React, { useState, useEffect } from 'react';
import { metadataService } from '../services/metadata';
import { metadataCache } from '../services/storage';
import { userContent } from '../services/userContent';
import HeroSection from '../components/HeroSection';
import ContentRow from '../components/ContentRow';
import MediaModal from '../components/MediaModal';

const HomePage = ({ onPlay, onBrowseFiles }) => {
  const [loading, setLoading] = useState(true);
  const [library, setLibrary] = useState([]);
  const [heroItem, setHeroItem] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [isScanning, setIsScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [serverMatches, setServerMatches] = useState([]);

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
          pickHeroItem(cachedItems);
          setLoading(false);
          // Optional: run background update?
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
                         // Try to pick a hero item if we don't have one yet
                         setHeroItem(currentHero => currentHero || pickHeroItem([...cachedItems, ...newItems]));
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

  const pickHeroItem = (items) => {
      const validHeroItems = items.filter(i => i.backdropPath);
      let hero = null;
      if (validHeroItems.length > 0) {
          hero = validHeroItems[Math.floor(Math.random() * validHeroItems.length)];
      } else if (items.length > 0) {
          hero = items[0];
      }
      if (hero) setHeroItem(hero);
      return hero;
  };

  // --- EFFECT: Handle Search ---
  useEffect(() => {
     if (!searchQuery || searchQuery.length < 3) {
        setServerMatches([]); // Clear server matches if query is too short or empty
        return;
     }
     
     const runSearch = async () => {
         // 1. Local Search (already done in getRows, but let's centralize)
         
         // 2. Server Search
         const serverResults = await metadataService.searchServerIndex(searchQuery);
         setServerMatches(serverResults);
     };
     
     const timeoutId = setTimeout(runSearch, 300); // Debounce
     return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // --- User Lists ---
  const [userLists, setUserLists] = useState({
      continueWatching: userContent.getContinueWatching(),
      favorites: userContent.getFavorites(),
      watchLater: userContent.getWatchLater()
  });

  useEffect(() => {
     const handleUpdate = () => {
         setUserLists({
            continueWatching: userContent.getContinueWatching(),
            favorites: userContent.getFavorites(),
            watchLater: userContent.getWatchLater()
         });
     };
     window.addEventListener('user-content-updated', handleUpdate);
     handleUpdate();
     return () => window.removeEventListener('user-content-updated', handleUpdate);
  }, []);

  // Build library lookup map once (for O(1) access)
  const libraryByPath = React.useMemo(() => {
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
      
      return items.map(item => {
          // Fast O(1) lookup
          let libraryItem = libraryByPath.get(item.path);
          
          // If no exact match, try to find parent folder (simpler approach)
          if (!libraryItem && item.path) {
              // Extract show folder from path (e.g., /TV Series/ShowName/Season 1/file.mkv -> /TV Series/ShowName)
              const seasonMatch = item.path.match(/^(.*?\/[^/]+)\/season\s*\d+\//i);
              if (seasonMatch) {
                  libraryItem = libraryByPath.get(seasonMatch[1]) || libraryByPath.get(seasonMatch[1] + '/');
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

  const getRows = () => {
      const continueWatching = hydrateItems(userLists.continueWatching);
      const favorites = hydrateItems(userLists.favorites);
      const watchLater = hydrateItems(userLists.watchLater);

      // Always allow continuing watching even if library empty? 
      if (!library.length && !continueWatching.length && !favorites.length) return [];
      
      if (searchQuery) {
          if (searchQuery.length < 3) return []; 
          
          const lowerQuery = searchQuery.toLowerCase();
          const localMatches = library.filter(i => 
              (i.name && i.name.toLowerCase().includes(lowerQuery)) ||
              (i.title && i.title.toLowerCase().includes(lowerQuery))
          );
          
          const allMatches = [...localMatches, ...(serverMatches || [])];
          const uniqueMatches = Array.from(new Map(allMatches.map(item => [item.path, item])).values());

          return [{ title: `Search Results for "${searchQuery}"`, items: uniqueMatches }];
      }
      
      const movies = library.filter(i => i.mediaType === 'movie' || (!i.mediaType && !i.isUnknown && i.type === 'file'));
      const tvShows = library.filter(i => i.mediaType === 'tv');
      const folders = library.filter(i => i.type === 'directory' && !i.mediaType); 
      const unknownFiles = library.filter(i => i.isUnknown && i.type === 'file');

      const highlyRated = [...library].filter(i => i.rating).sort((a, b) => b.rating - a.rating).slice(0, 20);
      const recentlyAdded = [...library].reverse().slice(0, 20); 
      
      const action = library.filter(i => i.genres && i.genres.includes('Action'));
      const comedy = library.filter(i => i.genres && i.genres.includes('Comedy'));
      const drama = library.filter(i => i.genres && i.genres.includes('Drama'));

      return [
          { title: "Continue Watching", items: continueWatching },
          { title: "Favorites", items: favorites },
          { title: "Watch Later", items: watchLater },
          { title: "Trending Now", items: highlyRated },
          { title: "Movies", items: movies.slice(0, 20) }, 
          { title: "TV Shows", items: tvShows },
          { title: "Folders", items: folders },
          { title: "Files", items: unknownFiles },
          { title: "Action", items: action },
          { title: "Comedy", items: comedy },
          { title: "Drama", items: drama },
          { title: "Recently Added", items: recentlyAdded }
      ].filter(row => row.items.length > 0);
  };

  if (loading || isScanning) {
    return (
      <div className="min-h-screen bg-[#141414] flex flex-col items-center justify-center text-white">
        <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <h2 className="text-xl font-bold mb-2">Building your Library...</h2>
        {scanProgress.total > 0 && (
            <p className="text-gray-400">Found {scanProgress.total} files (Processed {scanProgress.current})</p>
        )}
        <p className="text-xs text-gray-500 mt-4 max-w-md text-center">
            This only happens once. We're scanning your server to fetch posters and details for a premium experience.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#141414] pb-20 overflow-x-hidden">
      {/* Navbar Overlay */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-4 py-4 md:px-12 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-8">
            <h1 className="text-red-600 text-2xl md:text-3xl font-bold uppercase tracking-tighter cursor-pointer">BetterFlix</h1>
            <ul className="hidden md:flex gap-6 text-sm text-gray-300 font-medium">
                <li className="text-white cursor-pointer font-bold">Home</li>
                <li className="hover:text-gray-300 cursor-pointer text-gray-400" onClick={onBrowseFiles}>Browse Files</li>
            </ul>
        </div>
        <div className="flex items-center gap-4">
            <button 
                 onClick={async () => {
                     if (confirm('Rescan Library? This will clear the cache and may take a moment.')) {
                         setLoading(true);
                         await metadataService.clearCache();
                         await loadLibrary();
                         setTimeout(() => setLoading(false), 500);
                     }
                 }}
                 className="hidden md:flex bg-red-600/80 hover:bg-red-600 text-white px-3 py-1 rounded text-xs font-medium transition-colors items-center gap-1"
            >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Rescan
            </button>
            
            <div className={`flex items-center transition-all duration-300 ${isSearchOpen ? 'bg-gray-800 rounded px-2' : ''}`}>
                <input 
                    type="text" 
                    placeholder="Titles, people, genres..." 
                    className={`bg-transparent border-none focus:ring-0 text-white text-sm transition-all duration-300 ${isSearchOpen ? 'w-48 pl-2' : 'w-0 overflow-hidden'}`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                <button 
                    onClick={() => {
                        setIsSearchOpen(!isSearchOpen);
                        if (isSearchOpen) setSearchQuery(''); // Clear logic optionally
                    }}
                    className="text-white hover:text-gray-300 p-1"
                >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                    </svg>
                </button>
            </div>
            
            <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-xs">U</div>
        </div>
      </nav>
      
      {/* Mobile Browse Button (Fixed bottom right or something, or just in header) */}
      
      <HeroSection 
        item={heroItem} 
        onPlay={onPlay} 
        onInfo={setSelectedItem} 
      />
      
      <div className="relative z-10 -mt-20 md:-mt-32 space-y-4 md:space-y-8">
        {getRows().map((row, idx) => (
            <ContentRow 
                key={idx} 
                title={row.title} 
                items={row.items} 
               onCardClick={setSelectedItem}
                onRemove={row.title === "Continue Watching" ? (item) => {
                    // Remove from Continue Watching - use filePath if available
                    const pathToRemove = item.filePath || item.path;
                    userContent.removeContinueWatching(pathToRemove);
                } : undefined}
            />
        ))}
      </div>

      {/* Modal */}
      {selectedItem && (
        <MediaModal 
            item={selectedItem} 
            onClose={() => setSelectedItem(null)} 
            onPlay={(item) => {
                setSelectedItem(null);
                onPlay(item);
            }} 
        />
      )}
    </div>
  );
};

export default HomePage;
