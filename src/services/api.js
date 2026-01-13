const HTTP_SERVER_URL = import.meta.env.VITE_HTTP_SERVER_URL || 'http://cdn.dflix.live';
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || '';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';


let TRANSCODE_PORT = null;
const initTranscodePort = async (retries = 3) => {
    if (window.require) {
        try {
            const { ipcRenderer } = window.require('electron');
            // Small delay to ensure main process is ready upon reload
            await new Promise(r => setTimeout(r, 500));
            
            TRANSCODE_PORT = await ipcRenderer.invoke('get-transcode-port');
            console.log('Transcoding server available on port:', TRANSCODE_PORT);
        } catch (e) {
            console.warn(`Failed to get transcode port (retries left: ${retries}):`, e);
            if (retries > 0) {
                setTimeout(() => initTranscodePort(retries - 1), 1000);
            }
        }
    }
};
initTranscodePort();

// Helper to parsing directory listings (Nginx Autoindex specific)
const parseDirectoryListing = (html, currentPath) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const files = [];

  // Nginx autoindex usually puts links inside <pre>
  const pre = doc.querySelector('pre');
  const links = pre ? pre.querySelectorAll('a') : doc.querySelectorAll('a');

  links.forEach(link => {
      const href = link.getAttribute('href');
      const text = link.textContent.trim();

      // CRITICAL: Skip parent directory, sorting headers, or empty links
      if (!href || href === '../' || href === './' || href.includes('?C=') || text === 'Parent Directory' || text === '../') {
          return;
      }
      
      // Skip specific junk folders that shouldn't be scanned
      const junkFolders = ['Archive/', 'Softwares/', 'Tutorial/', 'System Volume Information/', 'recycle/'];
      if (junkFolders.some(junk => href.includes(junk) || text.includes(junk))) {
          return;
      }

      // Detect directory
      const isDirectory = href.endsWith('/');
      
      // Extract name from href (text may be truncated by Nginx for long names!)
      // Decode the href to get the actual filename
      let cleanHref = href;
      let name;
      try {
          name = decodeURIComponent(href.replace(/\/$/, '')); // Decode and remove trailing slash
      } catch (e) {
          name = text.replace(/\/$/, ''); // Fallback to text if decode fails
      }

      // Skip non-media files if it's a file
      if (!isDirectory) {
          const validExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
          if (!validExts.some(ext => cleanHref.toLowerCase().endsWith(ext))) {
              return;
          }
      }

      // Debug logging for first few items to reduce noise
      if (files.length < 5) console.log(`Processing link: [${text}] -> href: [${href}]`);

      // Construct full path
      let filePath;
      
      // Removed the check that skipped absolute URLs. 
      // We will handle them in the try/catch block below.
      
      // Construct full path with canonical resolution
      try {
           // Use URL API to resolve relative paths (handles ../, ./, etc.)
           // We use a dummy base origin because URL requires one, then extract pathname
           const dummyBase = 'http://dflix.local'; 
           const basePath = currentPath.endsWith('/') ? currentPath : currentPath + '/';
           
           const resolvedUrl = new URL(cleanHref, dummyBase + basePath);
           filePath = decodeURIComponent(resolvedUrl.pathname);
           
           // Ensure it starts with /
           if (!filePath.startsWith('/')) filePath = '/' + filePath;

           
      } catch (e) {
          console.error(`  -> Path resolution failed for ${cleanHref}:`, e);
          // Fallback to simple concat if URL fails
          const base = currentPath.endsWith('/') ? currentPath : currentPath + '/';
           // Try to decode href for cleaner path, but fallback to original
          let decodedHref = cleanHref;
          try { decodedHref = decodeURIComponent(cleanHref); } catch (e) {}
          filePath = base + decodedHref;
      }
      
      // Prevent going above root
      if (!filePath.startsWith('/')) filePath = '/' + filePath;

      files.push({
          name: text.trim().replace(/\/$/, '') || name, // Prefer text content for name as it's cleaner
          type: isDirectory ? 'directory' : 'file',
          size: 0, // Nginx size parsing is messy, skipping for now
          modified: null,
          path: filePath
      });
  });

  console.log(`Parsed ${files.length} items from ${currentPath}`);

  return files;
};

export const api = {
  async listFiles(path = '/') {
    try {

      const url = new URL(HTTP_SERVER_URL);
      const basePath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
      
      // Ensure path starts with / logic is handled by path arg usually, but let's be safe
      const cleanPath = path.startsWith('/') ? path : '/' + path;
      url.pathname = basePath + cleanPath;
      
      // Ensure trailing slash for directories (Nginx/Apache usually expect it for listings)
      if (!url.pathname.endsWith('/')) {
        url.pathname += '/';
      }

      console.log(`Fetching directory listing from: ${url.href}`);
      
      // In Electron (main process disabled webSecurity), fetch works directly
      const response = await fetch(url.href);
      
      if (!response.ok) {
        throw new Error(`Failed to list files: ${response.statusText}`);
      }

      const html = await response.text();
      return parseDirectoryListing(html, path);
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  needsTranscoding(filePath) {
      const ext = filePath.split('.').pop().toLowerCase();
      const compatible = ['mp4', 'webm', 'ogv', 'mp3', 'wav', 'ogg', 'm4a', 'aac']; 
      // Force transcode/remux for these containers/formats
      return !compatible.includes(ext) || ['mkv', 'avi', 'wmv', 'flv', 'mov'].includes(ext);
  },

  async getMediaMetadata(filePath) {
      if (!TRANSCODE_PORT) return null;
      try {
          const url = new URL(HTTP_SERVER_URL);
          const basePath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
          const cleanPath = filePath.startsWith('/') ? filePath : '/' + filePath;
          url.pathname = basePath + cleanPath;
          const originalUrl = url.href;

          const response = await fetch(`http://localhost:${TRANSCODE_PORT}/metadata?file=${encodeURIComponent(originalUrl)}`);
          if (!response.ok) return null;
          return await response.json();
      } catch (e) {
          console.error('Failed to get media metadata:', e);
          return null;
      }
  },

  getStreamUrl(filePath, startTime = 0) {
    try {
      const url = new URL(HTTP_SERVER_URL);
      const basePath = url.pathname.endsWith('/') ? url.pathname.slice(0, -1) : url.pathname;
      
      // Decode first to prevent double-encoding (URL constructor auto-encodes)
      let cleanPath = filePath.startsWith('/') ? filePath : '/' + filePath;
      try {
          cleanPath = decodeURIComponent(cleanPath);
      } catch (e) { /* Already decoded, ignore */ }
      
      url.pathname = basePath + cleanPath;
      const originalUrl = url.href;

      // Check extensions for transcoding
      // If we have a transcode port, we can proxy incompatible files
      if (TRANSCODE_PORT) {
          const ext = filePath.split('.').pop().toLowerCase();
          const compatible = ['mp4', 'webm', 'ogv', 'mp3', 'wav', 'ogg', 'm4a', 'aac']; // Browser compatible
          // Note: wav is usually supported, but some encodings might not be. We'll trust browser for wav for now unless user complained.
          // User request mentioned wav issues. Let's include wav in transcoding if needed, but WAV usually works.
          // Actually user "some wav or mkv files".
          // Let's force transcode for mkv, avi, wmv, flv, mov (sometimes mov needs it).
          // And if it's 4k (usually HEVC in mkv), we definitely need to transcode/remux.
          const needsTranscode = !compatible.includes(ext) || ext === 'mkv' || ext === 'avi' || ext === 'wmv' || ext === 'flv' || ext === 'mov';

          if (needsTranscode) {
             // Construct local transcoding URL
             // If startTime is provided, we pass it to the transcoder
             // Note: The transcoder expects 'file' param to be the full remote URL
             const transcodeUrl = `http://localhost:${TRANSCODE_PORT}/stream?file=${encodeURIComponent(originalUrl)}&startTime=${startTime}`;
             return transcodeUrl;
          }
      }

      return originalUrl;
    } catch (e) {
      console.error('Error forming stream URL:', e);
      return HTTP_SERVER_URL + filePath;
    }
  },
  
  // For downloads inside the app
  getDirectStreamUrl(filePath) {
    return this.getStreamUrl(filePath);
  },

  async getFileInfo(filePath) {
    try {
      const url = this.getStreamUrl(filePath);
      const response = await fetch(url, { method: 'HEAD' });

      if (!response.ok) {
        throw new Error(`Failed to get file info: ${response.statusText}`);
      }

      const size = parseInt(response.headers.get('content-length') || '0');
      const name = filePath.split('/').pop();
      
      return {
        name: name,
        size: size,
        modified: null,
        path: filePath
      };
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },



  async searchMedia(query, type = 'multi') {
    try {
        const cleanQuery = query.trim().replace(/\s*-\s*$/, '').trim();
        const searchUrl = `${TMDB_BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanQuery)}&language=en-US`;
        
        const response = await fetch(searchUrl, { headers: { 'Accept': 'application/json' } });
        if (!response.ok) return { results: [], total_results: 0 };
        
        const data = await response.json();
        return { 
            results: (data.results || []).slice(0, 5).map(item => ({
                id: item.id,
                title: item.title || item.name,
                overview: item.overview || '',
                releaseDate: item.release_date || item.first_air_date,
                rating: item.vote_average || 0,
                posterPath: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
                backdropPath: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
                mediaType: item.media_type || (type === 'movie' ? 'movie' : 'tv')
            })),
            total_results: data.total_results || 0 
        };
    } catch (error) {
        console.error('TMDB Search Error:', error);
        return { results: [], total_results: 0 };
    }
  },

  async getMediaDetails(id, type = 'movie') {
    try {
        const endpoint = type === 'tv' ? 'tv' : 'movie';
        const url = `${TMDB_BASE_URL}/${endpoint}/${id}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=credits,videos`;
        
        const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!response.ok) throw new Error('Failed to fetch details');
        
        const data = await response.json();
        return {
            id: data.id,
            title: data.title || data.name,
            overview: data.overview || '',
            releaseDate: data.release_date || data.first_air_date,
            rating: data.vote_average || 0,
            posterPath: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : null,
            backdropPath: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : null,
            genres: (data.genres || []).map(g => g.name),
            cast: (data.credits?.cast || []).slice(0, 10).map(actor => ({
                name: actor.name,
                character: actor.character,
                profilePath: actor.profile_path ? `https://image.tmdb.org/t/p/w185${actor.profile_path}` : null
            }))
        };
    } catch (error) {
        console.error('TMDB Details Error:', error);
        throw error;
    }
  }
};
