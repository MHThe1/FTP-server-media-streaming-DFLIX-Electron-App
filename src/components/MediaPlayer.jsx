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
  const playPendingRef = useRef(false); // Track if a play() is pending
  
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

  
  // Speed State
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Subtitle State
  const [subTracks, setSubTracks] = useState([]); // Array of { id, label, src, index }
  const [currentSubTrack, setCurrentSubTrack] = useState(-1); // -1 = off, >=0 = index in subTracks
  const [showSubMenu, setShowSubMenu] = useState(false);
  const [subtitleCues, setSubtitleCues] = useState([]); // Parsed VTT cues: { start, end, text }
  const [currentCue, setCurrentCue] = useState(''); // Currently displayed subtitle text
  const subtitleFileRef = useRef(null); // Hidden file input for subtitle upload
  
  // Controls visibility state
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideControlsTimer = useRef(null);
  
  // Mouse movement detection for auto-hiding controls
  useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      
      const showControls = () => {
          setControlsVisible(true);
          
          // Clear existing timer
          if (hideControlsTimer.current) {
              clearTimeout(hideControlsTimer.current);
          }
          
          // Only auto-hide if playing
          if (playing) {
              hideControlsTimer.current = setTimeout(() => {
                  setControlsVisible(false);
              }, 3000); // 3 seconds
          }
      };
      
      const handleMouseMove = () => showControls();
      const handleMouseLeave = () => {
          if (playing) {
              hideControlsTimer.current = setTimeout(() => {
                  setControlsVisible(false);
              }, 1000);
          }
      };
      const handleMouseEnter = () => showControls();
      
      container.addEventListener('mousemove', handleMouseMove);
      container.addEventListener('mouseleave', handleMouseLeave);
      container.addEventListener('mouseenter', handleMouseEnter);
      
      // Show controls initially
      showControls();
      
      return () => {
          container.removeEventListener('mousemove', handleMouseMove);
          container.removeEventListener('mouseleave', handleMouseLeave);
          container.removeEventListener('mouseenter', handleMouseEnter);
          if (hideControlsTimer.current) {
              clearTimeout(hideControlsTimer.current);
          }
      };
  }, [playing]);

  // Initialize HLS when streamUrl changes (including for seeking)
  useEffect(() => {
    // Reset intro state when file changes (only if starting from beginning)
    // We check this via file prop change in separate effect, but here we handle stream init
  }, [streamUrl]);
  
  // Handle File Change & Intro Logic
  useEffect(() => {
    setPlayed(0);
    // Initialize seekOffset using logical start time to avoid double-load in HLS
    const start = file?.startTime || file?.currentTime || 0;
    setSeekOffset(needsTranscoding ? start : 0);
    
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

    // Fetch metadata for duration AND subtitles
    if (file && needsTranscoding) {
        api.getMediaMetadata(file.path).then(meta => {
            if (meta && meta.format && meta.format.duration) {
                setDuration(parseFloat(meta.format.duration));
            }
            
            // Parse streams for subtitles
            if (meta && meta.streams) {
                const subs = meta.streams
                    .map((s, idx) => ({ ...s, originalIndex: idx })) // Keep original index for ffmpeg map
                    .filter(s => s.codec_type === 'subtitle')
                    .map((s, i) => {
                        const lang = s.tags?.language || 'und';
                        const title = s.tags?.title || lang;
                        return {
                            id: i,
                            index: s.originalIndex,
                            label: `${title.toUpperCase()} (${s.codec_name})`,
                            src: api.getSubtitleUrl(file.path, s.originalIndex),
                            lang: lang
                        };
                    });
                
                if (subs.length > 0) {
                    setSubTracks(subs);
                    console.log('Found subtitle tracks:', subs);
                    // Default to first English track if available
                    const engTrack = subs.find(s => s.lang?.toLowerCase().includes('eng') || s.label?.toLowerCase().includes('english'));
                    if (engTrack) {
                        setCurrentSubTrack(engTrack.id);
                    }
                } else {
                    setSubTracks([]);
                }
            }
        });
    } else {
        setSubTracks([]);
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
                backBufferLength: 20, // Keep 20s of back buffer
                maxBufferLength: 120, // Target 120s (2m) of forward buffer
                maxMaxBufferLength: 180, // Allow up to 3m if needed
            });
            hlsRef.current = hls;

            hls.loadSource(streamUrl);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                setIsBuffering(false); // Hide loading
                
                // Handle HLS subtitle tracks
                if (data.subtitleTracks && data.subtitleTracks.length > 0) {
                    console.log('HLS subtitle tracks found:', data.subtitleTracks);
                    const hlsSubs = data.subtitleTracks.map((t, i) => ({
                        id: i,
                        index: i,
                        label: t.name || t.lang || `Track ${i + 1}`,
                        lang: t.lang,
                        isHls: true // Mark as HLS-managed
                    }));
                    // Merge with ffprobe subs if no HLS subs, or prefer HLS subs
                    if (hlsSubs.length > 0) {
                        setSubTracks(hlsSubs);
                    }
                }
                
                // Only autoplay if not showing intro and no play is pending
                if (!showIntro && !playPendingRef.current) { 
                    playPendingRef.current = true;
                    video.play()
                        .then(() => { playPendingRef.current = false; })
                        .catch(e => {
                            playPendingRef.current = false;
                            // Only log if it's not an abort error (which is expected during seeks)
                            if (e.name !== 'AbortError') {
                                console.error("Autoplay failed", e);
                            }
                        });
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
        if (autostart && !showIntro) {
            video.play().catch(e => {
                if (e.name !== 'AbortError') {
                    console.error('Non-HLS autoplay failed:', e);
                }
            });
        }
    }

    return () => {
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
    };
  }, [streamUrl, needsTranscoding]); // REMOVED showIntro dep to prevent reload on intro end


  // Handlers
  const handleSeekMouseUp = (e) => {
    setSeeking(false);
    const video = playerRef.current;
    
    const effectiveDuration = duration || (video ? video.duration : 0);
    
    if (effectiveDuration) {
      const seekToTime = parseFloat(e.target.value) * effectiveDuration;
      
      if (needsTranscoding) {
          console.log(`Seek to ${seekToTime}s (HLS Mode)`);
          
          const video = playerRef.current;
          // Optimistic Seeking Logic:
          // Check if we can seek locally without reloading the stream (preserving buffer).
          // Local seek is possible IF:
          // 1. Target time is reachable within current stream (time >= seekOffset)
          // 2. AND (Target is backwards OR Target is close forwards)
          // If we jump too far forward, server seek (new stream) is usually faster/safer than waiting for linear transcode.
          
          const currentStreamTime = video ? video.currentTime : 0;
          const targetLocalTime = seekToTime - seekOffset;
          
          const isBackwards = targetLocalTime < currentStreamTime;
          const forwardDelta = targetLocalTime - currentStreamTime;
          const isSmallJump = forwardDelta < 60; // 60s threshold for forward local seek?
          
          // We can't seek locally if target is before the start of this stream section
          if (targetLocalTime >= 0 && (isBackwards || isSmallJump)) {
               console.log('↳ Local HLS Seek (Preserving Buffer)');
               if (video) video.currentTime = targetLocalTime;
               setPlaying(true);
          } else {
               console.log('↳ Server HLS Seek (Reloading Stream)');
               // Cancel any pending play before reloading
               playPendingRef.current = false;
               if (video) video.pause();
               setSeekOffset(seekToTime); 
               setPlaying(true);
          }
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

  // Seek helper
  const seekRelative = (seconds) => {
      const video = playerRef.current;
      if (!video) return;

      const current = video.currentTime;
      const effectiveDuration = duration || video.duration;
      
      let targetForCalculation = current;
      if (needsTranscoding) {
          // Smart Seek: Prefer local seeking to keep buffer active.
          
          const actualPosition = seekOffset + current;
          const newPosition = actualPosition + seconds;
          
          // Clamp
          const clamped = Math.max(0, Math.min(newPosition, effectiveDuration));
          
          // Can we seek locally?
          const targetLocalTime = clamped - seekOffset;
          
          if (targetLocalTime >= 0) {
              // Yes! We are within the current stream session or future of it.
              // For small relative jumps (10s), we should ALWAYS try local seek first.
              console.log(`Seeking relative ${seconds}s LOCALLY. New Local: ${targetLocalTime}`);
              video.currentTime = targetLocalTime;
          } else {
              // No, we need to go back before the current stream start.
              console.log(`Seeking relative ${seconds}s SERVER. New Abs: ${clamped}`);
              // Cancel any pending play before reloading
              playPendingRef.current = false;
              video.pause();
              setSeekOffset(clamped);
              setPlaying(true);
          }
      } else {
        const newTime = current + seconds;
        video.currentTime = Math.max(0, Math.min(newTime, effectiveDuration));
      }
  };

  const handleRewind = () => seekRelative(-10);
  const handleForward = () => seekRelative(10);

  // Handle keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in an input
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      switch(e.code) {
        case 'Space':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'KeyM':
          e.preventDefault();
          toggleMute();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handleRewind();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(v => Math.min(1, v + 0.05));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(v => Math.max(0, v - 0.05));
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [needsTranscoding, seekOffset, duration]); // Re-bind when dependencies for seek change

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

  const handleSpeedChange = (rate) => {
      setPlaybackRate(rate);
      if (playerRef.current) {
          playerRef.current.playbackRate = rate;
      }
      setShowSpeedMenu(false);
  };
  
  // Parse VTT/SRT content into cues array
  const parseVTT = (text) => {
      const cues = [];
      // Handle both VTT and SRT formats
      const lines = text.replace(/\r/g, '').split('\n');
      let i = 0;
      
      // Skip WEBVTT header if present
      if (lines[0]?.startsWith('WEBVTT')) i = 1;
      
      while (i < lines.length) {
          // Skip empty lines and cue numbers (lines that are just digits)
          while (i < lines.length && !lines[i].includes('-->')) i++;
          if (i >= lines.length) break;
          
          // Parse timestamp line - handles multiple formats:
          // VTT: 00:00:00.000 --> 00:00:00.000
          // SRT: 00:00:00,000 --> 00:00:00,000
          // Short: 00:00.000 --> 00:00.000
          const timeLine = lines[i];
          
          // More flexible regex for timestamp parsing
          const timeMatch = timeLine.match(
              /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[.,](\d{3})/
          ) || timeLine.match(
              /(\d{2}):(\d{2})[.,](\d{3})\s*-->\s*(\d{2}):(\d{2})[.,](\d{3})/
          );
          
          if (timeMatch) {
              let start, end;
              
              if (timeMatch.length === 9) {
                  // Full format: HH:MM:SS,mmm
                  start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3]) + parseInt(timeMatch[4]) / 1000;
                  end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7]) + parseInt(timeMatch[8]) / 1000;
              } else if (timeMatch.length === 7) {
                  // Short format: MM:SS,mmm
                  start = parseInt(timeMatch[1]) * 60 + parseInt(timeMatch[2]) + parseInt(timeMatch[3]) / 1000;
                  end = parseInt(timeMatch[4]) * 60 + parseInt(timeMatch[5]) + parseInt(timeMatch[6]) / 1000;
              }
              
              i++;
              // Collect text lines until empty line
              const textLines = [];
              while (i < lines.length && lines[i].trim() !== '') {
                  textLines.push(lines[i]);
                  i++;
              }
              
              // Strip HTML/ASS tags
              const cueText = textLines.join('\n')
                  .replace(/<[^>]*>/g, '')  // HTML tags
                  .replace(/\{[^}]*\}/g, ''); // ASS tags
              
              if (cueText.trim()) {
                  cues.push({ start, end, text: cueText.trim() });
              }
          } else {
              i++;
          }
      }
      
      // Debug: log first few cues
      if (cues.length > 0) {
          console.log(`Subtitle parsing complete. First cue: "${cues[0].text}" at ${cues[0].start}s`);
      }
      
      return cues;
  };

  // Handle subtitle track change - fetch and parse VTT
  const handleSubTrackChange = async (trackId) => {
      setCurrentSubTrack(trackId);
      setShowSubMenu(false);
      setCurrentCue('');
      
      if (trackId === -1) {
          setSubtitleCues([]);
          return;
      }
      
      const track = subTracks.find(t => t.id === trackId);
      if (!track) return;
      
      // If it's an uploaded local track with content
      if (track.content) {
          const cues = parseVTT(track.content);
          console.log(`Parsed ${cues.length} cues from uploaded subtitle`);
          setSubtitleCues(cues);
          return;
      }
      
      // Fetch from server
      if (track.src) {
          try {
              const response = await fetch(track.src);
              if (response.ok) {
                  const vttText = await response.text();
                  const cues = parseVTT(vttText);
                  console.log(`Parsed ${cues.length} cues from server subtitle`);
                  setSubtitleCues(cues);
              }
          } catch (e) {
              console.error('Failed to fetch subtitle:', e);
          }
      }
  };
  
  // Handle local subtitle file upload
  const handleSubtitleUpload = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = () => {
          const content = reader.result;
          const newTrackId = Date.now();
          const newTrack = {
              id: newTrackId,
              label: `📁 ${file.name}`,
              content: content,
              isLocal: true
          };
          
          // Parse the subtitle content immediately
          const cues = parseVTT(content);
          console.log(`Parsed ${cues.length} cues from uploaded subtitle: ${file.name}`);
          
          // Update state
          setSubTracks(prev => [...prev, newTrack]);
          setSubtitleCues(cues);
          setCurrentSubTrack(newTrackId);
          setCurrentCue(''); // Reset current cue
      };
      reader.readAsText(file);
      
      // Reset input to allow re-uploading same file
      e.target.value = '';
  };
  
  // Sync current cue with video time
  useEffect(() => {
      if (subtitleCues.length === 0 || currentSubTrack === -1) {
          setCurrentCue('');
          return;
      }
      
      const video = playerRef.current;
      if (!video) return;
      
      const updateCue = () => {
          // For transcoded streams, add seekOffset. For direct streams, use currentTime directly.
          const time = needsTranscoding ? (video.currentTime + seekOffset) : video.currentTime;
          const activeCue = subtitleCues.find(c => time >= c.start && time <= c.end);
          setCurrentCue(activeCue?.text || '');
      };
      
      // Update on timeupdate
      video.addEventListener('timeupdate', updateCue);
      // Also update immediately
      updateCue();
      
      return () => video.removeEventListener('timeupdate', updateCue);
  }, [subtitleCues, currentSubTrack, seekOffset, needsTranscoding]);
  
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

  // Clear subtitle cues when file changes
  useEffect(() => {
      setSubtitleCues([]);
      setCurrentCue('');
      setCurrentSubTrack(-1);
  }, [file?.path]);

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
          e.target.playbackRate = playbackRate;
          
          // resume playback if requested (initial load)
          // We moved the seekOffset initialization to the useEffect, but we still handle non-transcoded here
          // OR if for some reason offset was 0 but we have a start time (fallback)
          
          if (seekOffset === 0 && !needsTranscoding) {
              if (file.startTime && file.startTime > 0) {
                   e.target.currentTime = file.startTime;
              } else if (file.currentTime && file.currentTime > 0) {
                   e.target.currentTime = file.currentTime;
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
      >
        {subTracks.map(track => (
            <track 
                key={track.id} 
                kind="subtitles" 
                src={track.src} 
                label={track.label} 
                default={track.id === currentSubTrack}
                mode={track.id === currentSubTrack ? 'showing' : 'hidden'}
            />
        ))}
      </video>

      {/* Custom Subtitle Overlay - Netflix Style */}
      {currentCue && (
          <div className={`absolute left-0 right-0 z-20 flex justify-center pointer-events-none px-12 transition-all duration-300 ${controlsVisible ? 'bottom-32' : 'bottom-16'}`}>
              <div className="netflix-subtitle text-white text-center leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>
                  {currentCue}
              </div>
          </div>
      )}
      
      {/* Hidden file input for subtitle upload */}
      <input 
          ref={subtitleFileRef}
          type="file"
          accept=".vtt,.srt,.sub,.ass,.ssa"
          onChange={handleSubtitleUpload}
          className="hidden"
      />
      
      {/* Custom Controls Overlay - Netflix Style */}
      <div className={`netflix-controls absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-6 py-6 space-y-4 transition-all duration-300 ${controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        {/* Progress Bar */}
        <div className="progress-container relative group">
          <input
            type="range"
            min={0}
            max={0.999999}
            step="any"
            value={played}
            onMouseDown={handleSeekMouseDown}
            onChange={handleSeekChange}
            onMouseUp={handleSeekMouseUp}
            className="netflix-progress w-full h-1 group-hover:h-2 bg-white/30 rounded-full appearance-none cursor-pointer transition-all duration-200"
            style={{
              background: `linear-gradient(to right, #e50914 0%, #e50914 ${played * 100}%, rgba(255,255,255,0.3) ${played * 100}%, rgba(255,255,255,0.3) 100%)`,
            }}
          />
        </div>
        
        {/* Control Buttons */}
        <div className="flex items-center gap-6">
          {/* Play/Pause */}
          <button
            onClick={handlePlayPause}
            className="text-white hover:scale-110 transition-all p-1"
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg width="44" height="44" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Rewind 10s */}
          <button
             onClick={handleRewind}
             className="text-white/80 hover:text-white hover:scale-110 transition-all group relative"
             aria-label="Rewind 10 seconds"
             title="Rewind 10s"
          >
             <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                 <path d="M11 17l-9-9 9-9" style={{ display: 'none' }} /> {/* hidden dummy */}
                 <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" fill="none" />
                 <path d="M3 3v5h5" fill="none" />
                 <text x="12" y="14" textAnchor="middle" fill="currentColor" stroke="none" fontSize="8" fontWeight="bold">10</text>
             </svg>
          </button>

          {/* Forward 10s */}
          <button
             onClick={handleForward}
             className="text-white/80 hover:text-white hover:scale-110 transition-all group relative"
             aria-label="Forward 10 seconds"
             title="Forward 10s"
          >
             <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                 <path d="M13 17l9-9-9-9" style={{ display: 'none' }} /> 
                 <path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" fill="none" />
                 <path d="M21 3v5h-5" fill="none" />
                 <text x="12" y="14" textAnchor="middle" fill="currentColor" stroke="none" fontSize="8" fontWeight="bold">10</text>
             </svg>
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

          {/* Speed Control */}
          <div className="relative">
              <button
                  onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                  className="text-white hover:text-gray-300 transition-colors flex items-center gap-1"
                  aria-label="Playback Speed"
              >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M16 12a4 4 0 0 1-4 4" />
                      <path d="M12 8v4" />
                  </svg>
                  <span className="text-xs font-bold w-8 text-center">{playbackRate}x</span>
              </button>
              
              {showSpeedMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-black/90 border border-white/20 rounded-lg py-1 min-w-[100px] flex flex-col shadow-xl z-20">
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map(rate => (
                          <button
                              key={rate}
                              onClick={() => handleSpeedChange(rate)}
                              className={`text-left px-4 py-2 text-sm hover:bg-white/20 transition-colors ${playbackRate === rate ? 'text-red-600 font-bold' : 'text-white'}`}
                          >
                              {rate}x
                          </button>
                      ))}
                  </div>
              )}
          </div>
          
          {/* Subtitle Control - Always visible */}
              <div className="relative ml-2">
                  <button
                      onClick={() => setShowSubMenu(!showSubMenu)}
                      className="text-white hover:text-gray-300 transition-colors flex items-center gap-1"
                      aria-label="Subtitles"
                  >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 6h16v12H4z" />
                          <path d="M8 12h8" />
                          <path d="M8 15h4" />
                      </svg>
                      {currentSubTrack !== -1 && <span className="text-[10px] font-bold text-red-500 absolute -top-1 -right-1">ON</span>}
                  </button>
                  
                  {showSubMenu && (
                      <div className="absolute bottom-full right-0 mb-2 bg-[#141414] border border-[#ffffff20] rounded py-2 min-w-[250px] flex flex-col shadow-2xl z-20 max-h-[400px] overflow-y-auto">
                          {/* Header */}
                          <div className="px-4 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider sticky top-0 bg-[#141414] z-10">Subtitles</div>
                          
                          {/* Upload option */}
                          <button
                              onClick={() => {
                                  subtitleFileRef.current?.click();
                                  setShowSubMenu(false);
                              }}
                              className="w-full text-left px-4 py-3 text-sm hover:bg-white/10 transition-colors text-white border-b border-white/10 flex items-center gap-3 shrink-0"
                          >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                  <polyline points="17 8 12 3 7 8" />
                                  <line x1="12" y1="3" x2="12" y2="15" />
                              </svg>
                              Upload Subtitle...
                          </button>
                          
                          <button
                              onClick={() => handleSubTrackChange(-1)}
                              className={`w-full text-left px-4 py-3 text-sm hover:bg-white/10 transition-colors flex items-center gap-3 shrink-0 ${currentSubTrack === -1 ? 'text-white font-bold' : 'text-gray-300'}`}
                          >
                             {currentSubTrack === -1 && (
                               <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                             )}
                             <span className={currentSubTrack === -1 ? "ml-0" : "ml-7"}>Off</span>
                          </button>
                          
                          {subTracks.map(track => (
                              <button
                                  key={track.id}
                                  onClick={() => handleSubTrackChange(track.id)}
                                  className={`w-full text-left px-4 py-3 text-sm hover:bg-white/10 transition-colors flex items-center gap-3 shrink-0 ${currentSubTrack === track.id ? 'text-white font-bold' : 'text-gray-300'} ${track.isLocal ? 'text-green-400' : ''}`}
                              >
                                  {currentSubTrack === track.id && (
                                     <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                                  )}
                                  <span className={`truncate ${currentSubTrack === track.id ? "ml-0" : "ml-7"}`}>{track.label}</span>
                              </button>
                          ))}
                      </div>
                  )}
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
