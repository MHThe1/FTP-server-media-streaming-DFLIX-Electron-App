import React, { useState, useEffect, useRef, useMemo } from 'react';
import Hls from 'hls.js'; // Import HLS
import { api } from '../services/api';
import './MediaPlayer.css';

const MediaPlayer = ({ file, onEnded, autoplayNext, autostart = true, onProgress }) => {
  const [playing, setPlaying] = useState(autostart);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem('mediaPlayerVolume');
    return saved !== null ? parseFloat(saved) : 1.0;
  });
  const [muted, setMuted] = useState(false);
  const [played, setPlayed] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const playerRef = useRef(null);
  const containerRef = useRef(null); // For fullscreen
  const hlsRef = useRef(null); // Ref for HLS instance
  
  // Transcoding State
  const [seekOffset, setSeekOffset] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const needsTranscoding = useMemo(() => file ? api.needsTranscoding(file.path) : false, [file]);

  // Stream URL
  const streamUrl = useMemo(() => {
    if (!file) return '';
    // If transcoding, we append seekOffset as startTime to trigger new HLS session
    return api.getStreamUrl(file.path, needsTranscoding ? seekOffset : 0);
  }, [file?.path, seekOffset, needsTranscoding]);

  // Save volume
  useEffect(() => {
    localStorage.setItem('mediaPlayerVolume', volume.toString());
  }, [volume]);

  // Intro State
  const [showIntro, setShowIntro] = useState(false);
  const introVideoRef = useRef(null);

  // Initialize HLS when streamUrl changes (including for seeking)
  useEffect(() => {
    // Reset intro state when file changes (only if starting from beginning)
    // We check this via file prop change in separate effect, but here we handle stream init
  }, [streamUrl]);
  
  // Handle File Change & Intro Logic
  useEffect(() => {
    setPlayed(0);
    setSeekOffset(0);
    setDuration(0);
    setPlaying(autostart);

    // Initial Intro Check
    // If starting from 0 (or very close), play intro
    const startTime = file?.startTime || file?.currentTime || 0;
    if (startTime < 5) { // 5s tolerance
        setShowIntro(true);
    } else {
        setShowIntro(false);
    }

    // Fetch metadata for duration
    if (file && needsTranscoding) {
        api.getMediaMetadata(file.path).then(meta => {
            if (meta && meta.format && meta.format.duration) {
                setDuration(parseFloat(meta.format.duration));
            }
        });
    }
  }, [file]);

  const onIntroEnded = () => {
      console.log('Intro ended, starting main content');
      setShowIntro(false);
      // Main video will autoPlay if autostart is true because of dependency chain
      // We might need to force play though
      if (playerRef.current && autostart) {
          playerRef.current.play().catch(e => console.log('Autoplay catch', e));
      }
  };

  const skipIntro = (e) => {
      e.stopPropagation();
      onIntroEnded();
  };
  
  // HLS Effect (Modified to respect intro)
  useEffect(() => {
    // We NO LONGER return if showIntro is true. We want to init HLS so it buffers/transcodes.
    // if (showIntro) return; 

    const video = playerRef.current;
    if (!video || !streamUrl) return;

    // Cleanup previous HLS
    if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
    }

    if (needsTranscoding) {
        if (Hls.isSupported()) {
            console.log('Initializing HLS for:', streamUrl);
            setIsBuffering(true); // Show loading indicator
            const hls = new Hls({
                debug: false,
                enableWorker: true,
                lowLatencyMode: true,
                autoStartLoad: true, // Start loading immediately
            });
            hlsRef.current = hls;

            hls.loadSource(streamUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                setIsBuffering(false); // Hide loading
                // ONLY play if intro is NOT showing.
                // If intro is showing, we just let it buffer.
                // We access the ref value directly or local variable, but creating a closure here is tricky with state.
                // Instead, rely on ref check or variable.
                // Since this effect depends on showIntro, looking at closure variable showIntro is safe.
                if (!showIntro) {
                    video.play().catch(e => console.error("Autoplay failed", e));
                } else {
                    console.log('HLS ready, waiting for intro to finish...');
                }
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                   switch (data.type) {
                       case Hls.ErrorTypes.NETWORK_ERROR:
                           hls.startLoad();
                           break;
                       case Hls.ErrorTypes.MEDIA_ERROR:
                           hls.recoverMediaError();
                           break;
                       default:
                           // hls.destroy(); // Don't destroy immediately on recovery
                           break;
                   }
                }
            });
        }
    } else {
        video.src = streamUrl;
        // Non-HLS (Direct file):
        // If intro is showing, DO NOT play.
        if (autostart && !showIntro) video.play();
    }

    return () => {
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
    };
  }, [streamUrl, needsTranscoding, showIntro]); // Added showIntro dep


  // Handlers
  const handleSeekMouseUp = (e) => {
    setSeeking(false);
    const video = playerRef.current;
    
    const effectiveDuration = duration || (video ? video.duration : 0);
    
    if (effectiveDuration) {
      const seekToTime = parseFloat(e.target.value) * effectiveDuration;
      
      if (needsTranscoding) {
          console.log(`Seek to ${seekToTime}s (HLS Mode)`);
          setSeekOffset(seekToTime); // Triggers streamUrl update -> new HLS session
          setPlaying(true);
      } else {
          if (video) video.currentTime = seekToTime;
      }
    }
  };

  const onTimeUpdateHandler = (e) => {
      if (!seeking) {
         const vidTime = e.target.currentTime;
         const effectiveTime = vidTime + seekOffset;
         
         const currentDuration = duration || e.target.duration;
         if (!duration && e.target.duration && e.target.duration !== Infinity) {
             setDuration(e.target.duration);
         }

         if (currentDuration && currentDuration !== Infinity) {
            setPlayed(effectiveTime / currentDuration);
            if (onProgress) onProgress(effectiveTime, currentDuration);
         }
      }
  };


  // Handle keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // Empty dependency array as handlePlayPause reads from ref

  if (!file) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black">
        <div className="text-center text-white/70 p-10">
          <p className="text-base my-2.5">Select a media file to start streaming</p>
        </div>
      </div>
    );
  }
  
  const handleProgress = (state) => {
    if (!seeking) {
      setPlayed(state.played);
    }
  };

  const handleSeekChange = (e) => {
    setPlayed(parseFloat(e.target.value));
  };

  const handleSeekMouseDown = () => {
    setSeeking(true);
  };



  const handlePlayPause = () => {
    const video = playerRef.current;
    if (!video) return;
    
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (playerRef.current) {
      playerRef.current.volume = newVolume;
    }
  };

  const toggleMute = () => {
    const newMuted = !muted;
    setMuted(newMuted);
    if (playerRef.current) {
      playerRef.current.muted = newMuted;
    }
  };
  
  // If we are transcoding, we might need to resume play after source change
  useEffect(() => {
      // Auto-play when streamUrl changes if it was initiated by seeking?
      // Actually autoPlay prop on video tag handles initial. 
      // But if we seek (change src), we usually want to keep playing.
      if (needsTranscoding && seekOffset > 0 && playerRef.current) {
          // Play handled by autoPlay={true} or explicit play?
          // We set autoPlay={autostart} which might be true/false.
          // Force play if we just seeked.
          // playerRef.current.play() might effectively work on loadedmetadata
      }
  }, [streamUrl, needsTranscoding, seekOffset]);

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch(err => console.error('Fullscreen error:', err));
    } else {
      document.exitFullscreen();
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-black relative netflix-player">
      {/* Loading Overlay - positioned above controls */}
      {isBuffering && (
        <div className="absolute inset-x-0 top-0 bottom-20 z-10 flex items-center justify-center bg-black/50">
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-white text-sm">Preparing stream...</span>
          </div>
        </div>
      )}
      
      {showIntro && (
          <div className="absolute inset-0 z-50 bg-black flex items-center justify-center">
              <video 
                  ref={introVideoRef}
                  src="intro.mp4" 
                  autoPlay 
                  onEnded={onIntroEnded}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onLoadedMetadata={(e) => {
                      e.target.volume = volume;
                      e.target.muted = muted;
                  }}
              />
              <button 
                  onClick={skipIntro}
                  className="absolute bottom-10 right-10 bg-white/10 hover:bg-white/30 text-white border border-white/20 px-6 py-2 rounded uppercase font-bold text-sm tracking-widest transition-all z-50 backdrop-blur-sm"
              >
                  Skip Intro
              </button>
          </div>
      )}
      
      <video 
        ref={playerRef}
        src={streamUrl}
        autoPlay={!showIntro && (autostart || (needsTranscoding && seekOffset > 0))} // BLOCK Autoplay if intro is showing
        controls={false}
        onClick={handlePlayPause}
        style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer' }}
        onLoadedMetadata={(e) => {
          console.log(`✅ Video metadata loaded. Duration: ${e.target.duration}, SeekOffset: ${seekOffset}`);
          // Apply stored volume
          e.target.volume = volume;
          e.target.muted = muted;
          
          // resume playback if requested (initial load)
          if (seekOffset === 0) {
              if (file.startTime && file.startTime > 0) {
                   if (needsTranscoding) {
                       setSeekOffset(file.startTime); // Trigger reload with offset
                       return;
                   } else {
                       e.target.currentTime = file.startTime;
                   }
              } else if (file.currentTime && file.currentTime > 0) {
                  if (needsTranscoding) {
                      setSeekOffset(file.currentTime);
                      return;
                  } else {
                      e.target.currentTime = file.currentTime;
                  }
              }
          }
          
          // If not transcoding, set duration from video tag if we don't have it
          if (!needsTranscoding) {
              setDuration(e.target.duration);
          }
        }}
        onCanPlay={() => console.log('✅ Video can play')}
        onPlay={() => {
          console.log('▶️ Video playing');
          setPlaying(true);
        }}
        onPause={() => {
          console.log('⏸️ Video paused');
          setPlaying(false);
        }}
        onTimeUpdate={onTimeUpdateHandler}
        onEnded={() => {
          console.log('🏁 Video ended');
          setPlaying(false);
          // Only trigger onEnded if we really reached the end (total duration)
          // For transcoded, the stream ends, which usually means end of file.
          if (onEnded) onEnded();
        }}
        onError={(e) => {
            const err = e.target.error;
            console.error('❌ Video error:', err);
            if (err) {
                console.error('Error Code:', err.code);
                console.error('Error Message:', err.message);
            }
        }}
      />

      
      
      {/* Custom Controls Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 space-y-2">
        {/* Progress Bar */}
        <input
          type="range"
          min={0}
          max={0.999999}
          step="any"
          value={played}
          onMouseDown={handleSeekMouseDown}
          onChange={handleSeekChange}
          onMouseUp={handleSeekMouseUp}
          className="w-full h-1 bg-white/30 rounded-lg appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #e50914 0%, #e50914 ${played * 100}%, rgba(255,255,255,0.3) ${played * 100}%, rgba(255,255,255,0.3) 100%)`,
          }}
        />
        
        {/* Control Buttons */}
        <div className="flex items-center gap-4">
          {/* Play/Pause */}
          <button
            onClick={handlePlayPause}
            className="text-white hover:text-gray-300 transition-colors"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Volume */}
          <div className="flex items-center gap-2">
            <button onClick={toggleMute} className="text-white hover:text-gray-300" aria-label="Toggle mute">
              {muted || volume === 0 ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-24 h-1 bg-white/30 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, white 0%, white ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.3) ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.3) 100%)`,
              }}
            />
          </div>

          {/* Timestamp Display */}
          <div className="text-white text-xs font-medium">
             {(() => {
                 const current = (played * (duration || 0));
                 const total = duration || 0;
                 const format = (s) => {
                     if (isNaN(s)) return '0:00';
                     const m = Math.floor(s / 60);
                     const sec = Math.floor(s % 60);
                     return `${m}:${sec.toString().padStart(2, '0')}`;
                 }
                 return `${format(current)} / ${format(total)}`;
             })()}
          </div>

          {/* File Name */}
          <div className="flex-1 text-white text-sm font-medium truncate ml-4 opacity-80">
            {file.name}
            {needsTranscoding && <span className="ml-2 px-1.5 py-0.5 rounded bg-yellow-600/50 text-[10px] text-white tracking-wider">TRANSCODED</span>}
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="text-white hover:text-gray-300 transition-colors ml-4"
            aria-label="Toggle fullscreen"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MediaPlayer;
