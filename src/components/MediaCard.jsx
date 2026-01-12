import React, { useState, useRef, useEffect } from 'react';
import { api } from '../services/api';

const MediaCard = ({ item, onClick, onRemove }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [videoSrc, setVideoSrc] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem('autoplayMuted') === 'true');
  
  const hoverTimer = useRef(null);
  const videoRef = useRef(null);
  
  const hasPoster = item.posterPath && !imgError;

  useEffect(() => {
      return () => {
          if (hoverTimer.current) clearTimeout(hoverTimer.current);
      };
  }, []);

  useEffect(() => {
      if (videoRef.current) {
          videoRef.current.muted = isMuted;
          videoRef.current.volume = 0.4;
      }
      localStorage.setItem('autoplayMuted', isMuted);
  }, [isMuted, isPlaying]);

  const handleMouseEnter = () => {
      setIsHovered(true);
      hoverTimer.current = setTimeout(async () => {
          if (!videoSrc) {
             const src = await resolvePreviewVideo(item);
             if (src) setVideoSrc(src);
          } else if (videoRef.current) {
              videoRef.current.play().catch(() => {});
          }
      }, 700);
  };

  const handleMouseLeave = () => {
      setIsHovered(false);
      setIsPlaying(false);
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      if (videoRef.current) {
          videoRef.current.pause();
          videoRef.current.currentTime = 0;
      }
  };
  
  const toggleMute = (e) => {
      e.stopPropagation();
      setIsMuted(p => !p);
  };

  const resolvePreviewVideo = async (mediaItem) => {
       try {
           if (mediaItem.type === 'file') return api.getStreamUrl(mediaItem.path);
           const files = await api.listFiles(mediaItem.path);
           const isVideo = (f) => f.type === 'file' && ['mp4', 'mkv', 'webm', 'avi', 'mov'].includes(f.name.split('.').pop().toLowerCase());
           const candidates = files.filter(f => isVideo(f) && !f.name.toLowerCase().includes('sample') && !f.name.toLowerCase().includes('trailer'));

           if (candidates.length === 0 && (mediaItem.mediaType === 'tv' || mediaItem.type === 'directory')) {
               const folders = files.filter(f => f.type === 'directory').sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
               for (const folder of folders.slice(0, 3)) {
                   const subFiles = await api.listFiles(folder.path);
                   const subVideos = subFiles.filter(f => isVideo(f) && !f.name.toLowerCase().includes('sample'));
                   if (subVideos.length > 0) {
                        subVideos.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric: true}));
                        return api.getStreamUrl(subVideos[0].path);
                   }
               }
           } else if (candidates.length > 0) {
               candidates.sort((a,b) => b.name.length - a.name.length); 
               return api.getStreamUrl(candidates[0].path);
           }
       } catch (e) {
           console.error("Failed to resolve preview", e);
       }
       return null;
  };
  
  // Auto-trigger play when source is set
  useEffect(() => {
     if (videoSrc && videoRef.current) {
         videoRef.current.play().catch(e => console.warn("Autoplay blocked/failed", e));
     }
  }, [videoSrc]);

  return (
    <div 
      className="relative flex-shrink-0 w-36 sm:w-44 md:w-56 aspect-[2/3] transition-transform duration-300 origin-center hover:scale-110 hover:z-20 hover:shadow-2xl rounded-md cursor-pointer"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => onClick(item)}
    >
      <div className="w-full h-full rounded-md overflow-hidden bg-[#202020] shadow-lg relative group">
        {/* Remove Button (X) for Continue Watching */}
        {onRemove && isHovered && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(item);
            }}
            className="absolute top-4 right-2 z-50 bg-black/70 hover:bg-red-600 text-white rounded-full p-1.5 transition-colors"
            title="Remove from Continue Watching"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        
        {/* Poster Layer */}
        {hasPoster ? (
          <img 
            src={item.posterPath} 
            alt={item.title || item.name}
            className={`w-full h-full object-cover transition-opacity duration-500 absolute inset-0 ${isPlaying ? 'opacity-0' : 'opacity-100'}`}
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className={`w-full h-full flex items-center justify-center p-4 text-center bg-gray-800 absolute inset-0 transition-opacity duration-500 ${isPlaying ? 'opacity-0' : 'opacity-100'}`}>
             <span className="text-white font-semibold text-sm">{item.title || item.name}</span>
          </div>
        )}

        {/* Video Layer (In-Place) */}
        {videoSrc && (
             <video
                ref={videoRef}
                src={videoSrc}
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isPlaying ? 'opacity-100' : 'opacity-0'}`}
                autoPlay
                muted={isMuted}
                loop
                playsInline
                onLoadedMetadata={(e) => {
                    if (e.target.duration > 305) {
                        e.target.currentTime = 300; 
                    }
                }}
                onPlay={() => setIsPlaying(true)}
                onError={(e) => console.warn("Video load error", e)}
             />
        )}
        
        {/* Mute Button (Bottom Right) */}
        {isPlaying && (
            <button 
                onClick={toggleMute}
                className="absolute top-4 right-2 z-30 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-full border border-white/20 transition-all backdrop-blur-sm"
            >
                {isMuted ? (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                ) : (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                )}
            </button>
        )}
        
        {/* Info Overlay */}
        <div className={`absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent transition-opacity duration-300 flex flex-col justify-end p-3 ${isHovered || isPlaying ? 'opacity-100' : 'opacity-0'}`}>
          <h3 className="text-white font-bold text-sm line-clamp-2 drop-shadow-md">{item.title || item.name}</h3>
          
          <div className="flex items-center gap-2 mt-1">
             <span className="text-green-500 text-xs font-bold drop-shadow-md">{item.rating ? `${item.rating.toFixed(1)} Match` : ''}</span>
             <span className="text-white/90 text-xs font-medium drop-shadow-md">{item.releaseDate ? new Date(item.releaseDate).getFullYear() : ''}</span>
          </div>

          {isPlaying && (
              <div className="w-full h-0.5 bg-gray-600/50 mt-2 rounded overflow-hidden">
                  <div className="h-full bg-red-600 w-1/4 animate-[width_30s_linear_infinite]"></div>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MediaCard;
