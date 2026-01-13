import React, { useState, useEffect, useRef, useMemo } from 'react';
import Hls from 'hls.js';
import { api } from '../services/api';

const HeroSection = ({ item, onPlay, onInfo, className = '', isActive = true }) => {
  const [videoUrl, setVideoUrl] = useState('');
  const [needsTranscoding, setNeedsTranscoding] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false); // User requested unmuted
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  
  // ... (resolve logic)

  // Determine Stream URL
  useEffect(() => {
    // Only fetch video if active to save resources/bandwidth
    if (!item || !isActive) {
       if (!isActive && !videoUrl) return; 
       if (!item) setVideoUrl('');
       return;
    }
    
    // Use local var to avoid race conditions
    let active = true;
    
    // Internal helper function for this effect
    const resolvePreviewVideo = async (mediaItem) => {
         try {
             let targetPath = null;
             
             if (mediaItem.type === 'file') {
                 targetPath = mediaItem.path;
             } else {
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
                              targetPath = subVideos[0].path;
                              break;
                         }
                     }
                 } else if (candidates.length > 0) {
                     candidates.sort((a,b) => b.name.length - a.name.length); 
                     targetPath = candidates[0].path;
                 }
             }
             
             if (targetPath) {
                 // TV Shows start at 0, Movies start at 5 mins (300s) to skip intros
                 const isTV = mediaItem.mediaType === 'tv' || (mediaItem.path && mediaItem.path.includes('/TV Series/'));
                 const startOffset = isTV ? 0 : 300;
                 
                 const url = api.getStreamUrl(targetPath, startOffset);
                 const needsTranscode = api.needsTranscoding(targetPath);
                 return { url, needsTranscode, startTime: startOffset };
             }
             
         } catch (e) {
             console.error("Hero: Failed to resolve preview", e);
         }
         return null;
    };


    const fetchVideo = async () => {
        const result = await resolvePreviewVideo(item);
        if (active && result && result.url) {
            console.log("Hero: Resolved video url:", result.url, "Transcode:", result.needsTranscode, "Start:", result.startTime);
            setVideoUrl(result.url);
            setNeedsTranscoding(result.needsTranscode);
            setStartTime(result.startTime);
        }
    };
    
    fetchVideo();
    
    return () => { active = false; };
  }, [item, isActive]);

  // Volume Control
  useEffect(() => {
      if (videoRef.current) {
          videoRef.current.volume = 0.3; // User requested 30% volume
          videoRef.current.muted = isMuted;
      }
  }, [isMuted, videoUrl]); // Apply when url loads too

  // Initialize HLS / Video
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    // Reset volume on new src
    video.volume = 0.3;
    video.muted = isMuted;

    if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
    }

    const attemptPlay = () => {
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.warn("Hero autoplay prevented:", error);
                // If unmuted autoplay fails, try muted
                if (!isMuted) {
                    console.log("Trying muted autoplay fallback...");
                    setIsMuted(true);
                    video.muted = true;
                    video.play().catch(e => console.error("Muted autoplay also failed", e));
                }
            });
        }
    };

    if (needsTranscoding) {
        if (Hls.isSupported()) {
            console.log('Hero: Init HLS for', videoUrl);
            const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
            hlsRef.current = hls;
            hls.loadSource(videoUrl);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                attemptPlay();
            });
        }
    } else {
        video.src = videoUrl;
        attemptPlay();
    }

    return () => {
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
    };
  }, [videoUrl, needsTranscoding]);

  if (!item) return null;

  return (
    <div className={`relative h-[60vh] sm:h-[70vh] md:h-[85vh] w-full text-white overflow-hidden group ${className}`}>
      {/* Background Media */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent to-transparent z-10" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f1419] via-transparent to-transparent z-10" />
        
        {/* Video Player */}
        <video 
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${videoUrl ? 'opacity-100' : 'opacity-0'}`}
            muted={isMuted}
            loop
            playsInline
            onLoadedMetadata={(e) => {
                // For direct play, manually seek if needed
                if (!needsTranscoding && startTime > 0 && e.target.duration > (startTime + 5)) {
                    e.target.currentTime = startTime;
                }
            }}
            // Poster fallback handles the initial frame or loading state
            poster={item.backdropPath || item.posterPath} 
        />

        {/* Fallback Image (visible if video not ready or no video) */}
        {(!videoUrl) && (
             <img 
               src={item.backdropPath || item.posterPath} 
               alt={item.title} 
               className="w-full h-full object-cover object-top absolute inset-0 -z-10"
               onError={(e) => e.target.style.display = 'none'} 
             />
        )}
      </div>

      {/* Content */}
      <div className="absolute z-20 top-[30%] left-4 sm:left-8 md:left-12 max-w-xl">
        <h1 className="text-3xl sm:text-4xl md:text-6xl font-extrabold mb-4 filter drop-shadow-lg">
          {item.title || item.name}
        </h1>
        
        <div className="flex items-center gap-4 mb-4 text-sm sm:text-base font-medium">
             <span className="text-green-500 font-bold">{item.rating ? `${item.rating.toFixed(1)} Match` : ''}</span>
             <span className="text-white/80">{item.releaseDate ? new Date(item.releaseDate).getFullYear() : ''}</span>
        </div>

        <p className="text-white/90 text-sm sm:text-base md:text-lg mb-6 line-clamp-3 md:line-clamp-4 max-w-lg drop-shadow-md">
           {item.overview}
        </p>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => onPlay(item)}
            className="flex items-center gap-2 bg-white text-black px-6 py-2 md:py-3 rounded font-bold hover:bg-white/90 transition-colors"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
               <path d="M8 5v14l11-7z" />
            </svg>
            Play
          </button>
          
          <button 
            onClick={() => onInfo(item)}
            className="flex items-center gap-2 bg-gray-500/70 text-white px-6 py-2 md:py-3 rounded font-bold hover:bg-gray-500/50 transition-colors backdrop-blur-sm"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            More Info
          </button>

          {/* Mute Toggle */}
          <button 
            onClick={() => setIsMuted(prev => !prev)}
            className="flex items-center justify-center bg-transparent border border-white/30 hover:bg-white/10 text-white w-10 h-10 md:w-12 md:h-12 rounded-full transition-colors backdrop-blur-sm ml-2"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
             {isMuted ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" stroke="currentColor"/>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
             ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                </svg>
             )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HeroSection;
