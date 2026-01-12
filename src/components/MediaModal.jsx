import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { userContent } from '../services/userContent';

const MediaModal = ({ item, onClose, onPlay }) => {
  const [view, setView] = useState('details'); // 'details' | 'episodes'
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  
  // User Lists State
  const [isFav, setIsFav] = useState(false);
  const [isWatchLater, setIsWatchLater] = useState(false);
  const [playProgress, setPlayProgress] = useState(0);
  
  // Season Support
  const [seasons, setSeasons] = useState([]); // Array of directory objects
  const [selectedSeason, setSelectedSeason] = useState(null); // The currently selected season folder (or null for root)
  const [episodes, setEpisodes] = useState([]);

  // Reset state when item changes
  useEffect(() => {
    setView('details');
    setEpisodes([]);
    setSeasons([]);
    setSelectedSeason(null);
    setLoadingEpisodes(false);
    
    // Check lists & progress
    if (item) {
        setIsFav(userContent.isFavorite(item));
        setIsWatchLater(userContent.isInWatchLater(item));
        
        // Check for progress
        // For Continue Watching items, we track the specific file path in filePath
        const lookupPath = item.filePath || item.path;
        const matches = userContent.getContinueWatching().find(i => i.path === lookupPath);
        if (matches && matches.currentTime) {
            setPlayProgress(matches.currentTime);
        } else {
            setPlayProgress(0);
        }
    }
  }, [item]);

  if (!item) return null;

  // Helper to check if a folder is likely a season
  const isSeasonFolder = (name) => {
      const n = name.toLowerCase();
      return n.includes('season') || n.includes('specials') || /^s\d+/.test(n);
  };

  // 1. Initial Load: Check for Seasons or Root Episodes
  const handleBrowseEpisodes = async () => {
      setView('episodes');
      if (episodes.length > 0 && !seasons.length) return; // Already loaded simple list
      if (seasons.length > 0) return; // Already loaded seasons

      try {
          setLoadingEpisodes(true);
          const files = await api.listFiles(item.path);
          
          // Check for Season folders
          const seasonFolders = files.filter(f => f.type === 'directory' && isSeasonFolder(f.name));
          
          if (seasonFolders.length > 0) {
              // Found seasons!
              // Sort seasons: Specials (Season 0) first, then Season 1, 2...
              seasonFolders.sort((a, b) => {
                  const getNum = (s) => parseInt(s.name.match(/\d+/) || 0);
                  const aNum = getNum(a);
                  const bNum = getNum(b);
                  // Handle specials/season 0
                  if (a.name.toLowerCase().includes('specials')) return -1;
                  if (b.name.toLowerCase().includes('specials')) return 1;
                  return aNum - bNum;
              });
              
              setSeasons(seasonFolders);
              setSelectedSeason(seasonFolders[0]); // This will trigger the useEffect below to load eps
          } else {
              // No seasons, just flat episodes
              setSeasons([]);
              setSelectedSeason(null);
              processEpisodes(files);
          }
      } catch (err) {
          console.error("Failed to load content", err);
          setLoadingEpisodes(false);
      }
  };

  // 2. Load Episodes for Selected Season
  useEffect(() => {
      if (!selectedSeason) return;

      const loadSeason = async () => {
          setLoadingEpisodes(true);
          try {
              console.log(`Loading season: ${selectedSeason.name}`);
              const files = await api.listFiles(selectedSeason.path);
              processEpisodes(files);
          } catch (e) {
              console.error(e);
          } finally {
              setLoadingEpisodes(false);
          }
      };

      loadSeason();
  }, [selectedSeason]);

  // Helper: Filter videos and sort them
  const processEpisodes = (files) => {
      const videoExts = ['mp4', 'webm', 'mkv', 'avi', 'mov'];
      let vids = files.filter(f => {
         if (f.type !== 'file') return false;
         const ext = f.name.split('.').pop().toLowerCase();
         return videoExts.includes(ext);
      });
      
      // Sort safely
      vids.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      
      setEpisodes(vids);
      if (seasons.length === 0) setLoadingEpisodes(false); // Only turn off loading here if not using season effect
  };

  // Helper to extract nice name
  const getEpisodeName = (filename) => {
      let name = filename.replace(/\.[^/.]+$/, ""); // remove extension
      // Try to clean up "Show Name - S01E01 - Title" -> "Title" if possible, or keep as is
      return name;
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-[#181818] rounded-md overflow-hidden max-w-4xl w-full shadow-2xl relative animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-50 bg-[#181818]/50 rounded-full p-2 hover:bg-white/20 transition-colors"
        >
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Backdrop / Header */}
        <div className="relative h-64 sm:h-80 md:h-96 flex-shrink-0">
            <div className="absolute inset-0 bg-gradient-to-t from-[#181818] via-transparent to-transparent z-10" />
             <img 
                src={item.backdropPath || item.posterPath} 
                alt={item.title} 
                className="w-full h-full object-cover"
             />
             
             <div className="absolute bottom-8 left-8 z-20">
                <h2 className="text-3xl font-bold text-white mb-4">{item.title || item.name}</h2>
                <div className="flex items-center gap-4">
                    {/* Primary Action Button */}
                    <button 
                        onClick={() => {
                            if (item.mediaType === 'tv' || (item.type === 'directory' && item.mediaType !== 'movie')) {
                                handleBrowseEpisodes();
                            } else {
                                onPlay(item);
                            }
                        }}
                        className="bg-white text-black px-8 py-2 rounded font-bold hover:bg-white/90 transition-colors flex items-center gap-2"
                    >
                        {(item.mediaType === 'tv' || (item.type === 'directory' && item.mediaType !== 'movie')) ? (
                          <>
                            {view === 'episodes' ? (
                                <>
                                   <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                                   Hide Episodes
                                </>
                            ) : (
                                <>
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
                                    Browse Episodes
                                </>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center gap-3">
                              {/* Resume Button (if progress exists) */}
                              {playProgress > 0 && (
                                  <button 
                                    onClick={() => {
                                        // For Continue Watching items, resume the specific file
                                        const resumeItem = item.filePath 
                                            ? { ...item, path: item.filePath, startTime: playProgress }
                                            : { ...item, startTime: playProgress };
                                        onPlay(resumeItem);
                                    }}
                                    className="bg-white text-black px-6 py-2 rounded font-bold hover:bg-white/90 transition-colors flex items-center gap-2"
                                  >
                                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                      Resume
                                      <span className="text-xs font-normal opacity-70 ml-1">
                                          ({Math.floor(playProgress / 60)}m)
                                      </span>
                                  </button>
                              )}
                              
                              {/* Play / Restart Button */}
                              <button 
                                onClick={() => {
                                    // For Continue Watching, restart the specific file; otherwise play normally
                                    const playItem = item.filePath 
                                        ? { ...item, path: item.filePath, startTime: 0 }
                                        : { ...item, startTime: 0 };
                                    onPlay(playItem);
                                }}
                                className={`${playProgress > 0 ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-white text-black hover:bg-white/90'} px-6 py-2 rounded font-bold transition-colors flex items-center gap-2`}
                              >
                                {playProgress > 0 ? (
                                    <>
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        Restart
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                        Play
                                    </>
                                )}
                              </button>
                          </div>
                        )}
                    </button>
                    
                    {(item.mediaType === 'tv' || (item.type === 'directory' && item.mediaType !== 'movie')) && (
                        <button 
                            onClick={() => setView(view === 'details' ? 'episodes' : 'details')}
                            className="bg-gray-600/60 text-white px-4 py-2 rounded font-semibold hover:bg-gray-600/80 transition-colors"
                        >
                            {view === 'details' ? 'Episodes' : 'Overview'}
                        </button>
                    )}

                    {/* Favorites Toggle */}
                    <button 
                        onClick={() => {
                            userContent.toggleFavorite(item);
                            setIsFav(!isFav);
                        }}
                        className={`p-2 rounded-full border-2 transition-colors ${isFav ? 'bg-red-600 border-red-600 text-white' : 'border-gray-400 text-gray-400 hover:border-white hover:text-white'}`}
                        title={isFav ? "Remove from Favorites" : "Add to Favorites"}
                    >
                         {isFav ? (
                             <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                         ) : (
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                         )}
                    </button>

                    {/* Watch Later Toggle */}
                    <button 
                        onClick={() => {
                            userContent.toggleWatchLater(item);
                            setIsWatchLater(!isWatchLater);
                        }}
                        className={`p-2 rounded-full border-2 transition-colors ${isWatchLater ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-400 text-gray-400 hover:border-white hover:text-white'}`}
                        title={isWatchLater ? "Remove from Watch Later" : "Add to Watch Later"}
                    >
                         {isWatchLater ? (
                             <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>
                         ) : (
                             <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                         )}
                    </button>
                </div>
             </div>
        </div>

        {/* Content Section (Scrollable) */}
        <div className="p-8 overflow-y-auto bg-[#181818]">
            {view === 'episodes' ? (
                <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center justify-between">
                         <h3 className="text-xl font-bold text-white">Episodes</h3>
                         
                         {/* Season Selector */}
                         {seasons.length > 0 && (
                             <select 
                                value={selectedSeason?.name}
                                onChange={(e) => {
                                    const s = seasons.find(seas => seas.name === e.target.value);
                                    setSelectedSeason(s);
                                }}
                                className="bg-[#333] text-white border border-gray-600 rounded px-3 py-1 text-sm focus:outline-none focus:border-white"
                             >
                                 {seasons.map(s => (
                                     <option key={s.path} value={s.name}>{s.name}</option>
                                 ))}
                             </select>
                         )}
                    </div>
                    
                    {loadingEpisodes ? (
                        <div className="text-white/50 flex items-center gap-2 py-8 justify-center">
                             <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        </div>
                    ) : episodes.length === 0 ? (
                        <div className="text-white/50 py-4">No episodes found in this folder.</div>
                    ) : (
                        <div className="grid gap-2">
                            {episodes.map((file, idx) => (
                                <button 
                                    key={file.path}
                                    onClick={() => onPlay(file)}
                                    className="flex items-center gap-4 p-4 hover:bg-white/10 rounded group transition-colors text-left border border-transparent hover:border-white/10"
                                >
                                    <span className="text-xl font-bold text-gray-600 group-hover:text-white transition-colors w-8 text-center">{idx + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-white font-medium truncate group-hover:text-[#00A8E1] transition-colors">{getEpisodeName(file.name)}</div>
                                        <div className="text-xs text-gray-500 mt-1 truncate">
                                            {/* Show duration or size if available, or just nothing for now */}
                                            {selectedSeason ? selectedSeason.name : item.name}
                                        </div>
                                    </div>
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white text-black rounded-full p-2 scale-90 group-hover:scale-100 duration-200">
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                /* Overview View */
                <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-8 animate-in fade-in duration-300">
                    <div>
                        <div className="flex items-center gap-4 mb-4 text-sm text-gray-400">
                            <span className="text-green-500 font-bold">{item.rating ? `${item.rating.toFixed(1)} Match` : 'New'}</span>
                            <span>{item.releaseDate ? new Date(item.releaseDate).getFullYear() : ''}</span>
                            <span className="border border-gray-600 px-1 text-xs rounded">HD</span>
                        </div>
                        <p className="text-white text-sm md:text-base leading-relaxed mb-6">
                            {item.overview || "No description available."}
                        </p>
                    </div>
                    <div className="text-sm text-gray-400">
                        <div className="mb-2"><span className="text-gray-500">Genres:</span> <span className="text-white">{item.genres ? item.genres.join(', ') : 'Unknown'}</span></div>
                        <div className="mb-2"><span className="text-gray-500">Original Language:</span> <span className="text-white uppercase">{item.original_language || 'EN'}</span></div>
                        <div><span className="text-gray-500">Path:</span> <span className="text-white/50 text-xs break-all">{item.path}</span></div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default MediaModal;
