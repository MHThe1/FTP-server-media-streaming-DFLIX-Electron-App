import React, { useState, useEffect } from 'react';
import { useLibrary } from '../hooks/useLibrary';
import { useUserLists } from '../hooks/useUserLists';
import { metadataService } from '../services/metadata';
import { metadataCache } from '../services/storage';
import { userContent } from '../services/userContent';
import HeroSection from '../components/HeroSection';
import ContentRow from '../components/ContentRow';
import MediaModal from '../components/MediaModal';
import { configService } from '../services/config';
import AnnouncementBanner from '../components/AnnouncementBanner';

const HomePage = ({ onPlay, onBrowseFiles, onOpenProfile }) => {
  const { library, loading, isScanning, scanProgress, hydrateItems } = useLibrary();
  const userLists = useUserLists(); // This hook returns the fresh object
  
  const [heroItem, setHeroItem] = useState(null);
  const [heroIndex, setHeroIndex] = useState(() => Math.floor(Math.random() * 20));
  const [trendingPool, setTrendingPool] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [serverMatches, setServerMatches] = useState([]);
  const [remoteConfig, setRemoteConfig] = useState(null);
  const [announcement, setAnnouncement] = useState(null);

  useEffect(() => {
    loadRemoteConfig();
    
    // Shuffle timer
    const interval = setInterval(() => {
        setHeroIndex(prev => prev + 1);
    }, 30000); // 30 seconds per shuffle
    return () => clearInterval(interval);
  }, []);

  // --- EFFECT: Search Server Index ---
  useEffect(() => {
      if (!searchQuery || searchQuery.trim().length < 2) {
          setServerMatches([]);
          return;
      }

      const timer = setTimeout(async () => {
          console.log(`Searching server index for: ${searchQuery}`);
          const matches = await metadataService.searchServerIndex(searchQuery);
          
          // Filter out Season/Specials from server matches too
          const filtered = matches.filter(i => {
             const name = (i.name || '').toLowerCase();
             if (name.includes('season') || name.match(/^s\d+/) || name.includes('specials')) {
                  return false;
             }
             return true;
          });
          
          setServerMatches(filtered);
      }, 500); // Debounce

      return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadRemoteConfig = async () => {
    const config = await configService.fetchConfig();
    if (config) {
        setRemoteConfig(config);
        setAnnouncement(configService.getAnnouncement(config));
    }
  };

  // Pick Hero Item when library loads
  useEffect(() => {
      if (library.length > 0 && !heroItem) {
          const validHeroItems = library.filter(i => i.backdropPath);
          let hero = null;
          if (validHeroItems.length > 0) {
              hero = validHeroItems[Math.floor(Math.random() * validHeroItems.length)];
          } else if (library.length > 0) {
              hero = library[0];
          }
          if (hero) setHeroItem(hero);
      }
  }, [library]); // Only run when library changes
  
  // --- EFFECT: Handle Hero Shuffle ---
  useEffect(() => {
      if (trendingPool.length > 0) {
          const index = heroIndex % trendingPool.length;
          setHeroItem(trendingPool[index]);
      }
  }, [heroIndex, trendingPool]);

  // --- EFFECT: Calculate Trending Pool ---
  useEffect(() => {
      if (!library || library.length === 0) return;

      const highlyRated = [...library].filter(i => i.rating).sort((a, b) => b.rating - a.rating).slice(0, 20);
      let newTrending = highlyRated;

      if (remoteConfig && remoteConfig.trending && remoteConfig.trending.enabled) {
          const remoteTrending = configService.getTrending(remoteConfig);
          if (remoteTrending && remoteTrending.length > 0) {
              const matchedItems = [];
              remoteTrending.forEach(remoteItem => {
                  let match = null;
                  if (remoteItem.tmdbId) {
                      match = library.find(lib => lib.tmdbId == remoteItem.tmdbId);
                  }
                  if (!match && remoteItem.title) {
                      const cleanRemote = remoteItem.title.toLowerCase().trim();
                      match = library.find(lib => {
                         const cleanLib = (lib.title || lib.name || '').toLowerCase().trim();
                         return cleanLib === cleanRemote || cleanLib.includes(cleanRemote);
                      });
                  }
                  if (match) matchedItems.push(match);
              });
              
              if (matchedItems.length > 0) {
                  newTrending = matchedItems;
              }
          }
      }
      
      // Update pool if changed
      setTrendingPool(prev => {
          const prevIds = prev.map(i => i.path).join(',');
          const newIds = newTrending.map(i => i.path).join(',');
          return prevIds !== newIds ? newTrending : prev;
      });

  }, [library, remoteConfig]);



  const getRows = () => {
      const continueWatching = hydrateItems(userLists.continueWatching);
      const favorites = hydrateItems(userLists.favorites);
      const watchLater = hydrateItems(userLists.watchLater);

      // Always allow continuing watching even if library empty? 
      if (!library.length && !continueWatching.length && !favorites.length) return [];
      
      if (searchQuery) {
          if (searchQuery.trim().length === 0) return []; 
          
          const lowerQuery = searchQuery.toLowerCase();
          const localMatches = library.filter(i => {
              // 1. Exclude Season/Specials directories
              if (i.type === 'directory') {
                  const name = (i.name || '').toLowerCase();
                  if (name.includes('season') || name.match(/^s\d+/) || name.includes('specials')) {
                      return false;
                  }
              }
              
              // 2. Match Query
              return (i.name && i.name.toLowerCase().includes(lowerQuery)) ||
                     (i.title && i.title.toLowerCase().includes(lowerQuery));
          });
          
          const allMatches = [...localMatches, ...(serverMatches || [])];
          const uniqueMatches = Array.from(new Map(allMatches.map(item => [item.path, item])).values());

          return [{ title: `Search Results for "${searchQuery}"`, items: uniqueMatches }];
      }
      
      const movies = library.filter(i => i.mediaType === 'movie' || (!i.mediaType && !i.isUnknown && i.type === 'file'));
      const tvShows = library.filter(i => i.mediaType === 'tv');
      const folders = library.filter(i => i.type === 'directory' && !i.mediaType); 
      const unknownFiles = library.filter(i => i.isUnknown && i.type === 'file');


      


      // Update trending pool for hero shuffle if it changed
      // (Using stringify to avoid deep dep cycles, or just rely on length/ids)
      // LOGIC MOVED TO USEEFFECT


      const recentlyAdded = [...library].reverse().slice(0, 20); 
      
      const action = library.filter(i => i.genres && i.genres.includes('Action'));
      const comedy = library.filter(i => i.genres && i.genres.includes('Comedy'));
      const drama = library.filter(i => i.genres && i.genres.includes('Drama'));

      return [
          { title: "Continue Watching", items: continueWatching },
          { title: "Favorites", items: favorites },
          { title: "Watch Later", items: watchLater },
          { title: "Trending Now", items: trendingPool },
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

  const handleResetHome = () => {
      setSearchQuery('');
      setServerMatches([]);
      setIsSearchOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#141414] pb-20 overflow-x-hidden">
      {/* Navbar Overlay */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-4 py-4 md:px-12 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-8">
            <h1 onClick={handleResetHome} className="text-red-600 text-2xl md:text-3xl font-bold uppercase tracking-tighter cursor-pointer">BetterFlix</h1>
            <ul className="hidden md:flex gap-6 text-sm text-gray-300 font-medium">
                <li onClick={handleResetHome} className="text-white cursor-pointer font-bold hover:text-red-500 transition-colors">Home</li>
                <li className="hover:text-gray-300 cursor-pointer text-gray-400" onClick={onBrowseFiles}>Browse Files</li>
            </ul>
        </div>
        <div className="flex items-center gap-4">

            
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
            
            <button 
                onClick={onOpenProfile}
                className="w-9 h-9 rounded-sm bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center text-white shadow-lg hover:shadow-red-500/50 hover:scale-105 transition-all duration-300 border border-white/10 group"
                aria-label="User Profile"
            >
                <svg className="w-5 h-5 group-hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
            </button>
        </div>
      </nav>
      
      {/* Mobile Browse Button (Fixed bottom right or something, or just in header) */}
      
      {/* Hero Section - Hide when searching */}
      {!searchQuery && (
          <HeroSection 
            item={heroItem} 
            onPlay={(item) => {
                // For TV Shows/Directories, "Play" should open the Details/Episodes Modal (like MediaCard)
                // instead of jumping to the File Browser.
                if (item.mediaType === 'tv' || item.type === 'directory') {
                    setSelectedItem(item);
                } else {
                    onPlay(item);
                }
            }}
            onInfo={setSelectedItem} 
          />
      )}
      
      
      <div className={`relative z-10 ${searchQuery ? 'mt-20' : '-mt-20 md:-mt-32'} space-y-4 md:space-y-8`}>
        
        {/* Announcement Banner - Hide when searching */}
        {announcement && !searchQuery && (
            <div className="container mx-auto px-4 md:px-12 pt-4">
                <AnnouncementBanner 
                    announcement={announcement} 
                />
            </div>
        )}

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
