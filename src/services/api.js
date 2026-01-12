const HTTP_SERVER_URL = import.meta.env.VITE_HTTP_SERVER_URL || 'http://cdn.dflix.live';
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || '';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Helper to parse directory listings
const parseDirectoryListing = (html, currentPath) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const files = [];

  const pre = doc.querySelector('pre');
  if (!pre) {
    const allLinks = doc.querySelectorAll('a');
    allLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && href !== '../' && !href.startsWith('http')) {
        const name = link.textContent.trim();
        if (name && name !== '../') {
          const isDirectory = href.endsWith('/');
          const cleanName = name.replace(/\/$/, '');
          let filePath = currentPath === '/' ? `/${cleanName}` : `${currentPath}/${cleanName}`;
          files.push({
            name: cleanName,
            type: isDirectory ? 'directory' : 'file',
            size: 0,
            modified: null,
            path: filePath
          });
        }
      }
    });
    return files;
  }

  const lines = pre.innerHTML.split('\n').filter(line => line.trim());
  
  lines.forEach((line) => {
    if (!line.trim() || line.includes('../') || line.includes('href="../"')) return;

    const linkMatch = line.match(/<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/);
    if (!linkMatch) return;

    let href = linkMatch[1];
    let name = linkMatch[2].trim();
    
    if (href === '../' || name === '../') return;

    try {
      href = decodeURIComponent(href);
      name = decodeURIComponent(name);
    } catch (e) {
      // If decoding fails, use original values
    }

    const isDirectory = href.endsWith('/') || name.endsWith('/');
    const cleanName = name.replace(/\/$/, '');
    const cleanHref = href.replace(/\/$/, '');
    
    let size = 0;
    const afterLink = line.replace(/<a[^>]*>.*?<\/a>/, '').trim();
    const parts = afterLink.split(/\s+/).filter(p => p && p !== '');
    
    // Quick size parsing logic
    for (const part of parts) {
        if (!isNaN(parseInt(part)) && part.length > 3) { // Rough heuristic
            size = parseInt(part);
            break;
        }
    }

    let filePath;
    if (currentPath === '/') {
      filePath = `/${cleanHref}`;
    } else {
      if (cleanHref.startsWith('/')) {
        filePath = cleanHref;
      } else {
        filePath = `${currentPath}/${cleanHref}`;
      }
    }

    files.push({
      name: cleanName,
      type: isDirectory ? 'directory' : 'file',
      size: size,
      modified: null,
      path: filePath
    });
  });

  return files;
};

export const api = {
  async listFiles(path = '/') {
    try {
      let url = HTTP_SERVER_URL;
      if (path !== '/') {
        url += path;
        if (!path.endsWith('/')) url += '/';
      } else {
        url += '/';
      }

      console.log(`Fetching directory listing from: ${url}`);
      
      // In Electron (main process disabled webSecurity), fetch works directly
      const response = await fetch(url);
      
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

  getStreamUrl(filePath) {
    return HTTP_SERVER_URL + filePath;
  },
  
  // For downloads inside the app
  getDirectStreamUrl(filePath) {
    return HTTP_SERVER_URL + filePath;
  },

  async getFileInfo(filePath) {
    try {
      const url = HTTP_SERVER_URL + filePath;
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

  async searchSubtitles(query, language = 'en') {
    try {
      // In Electron, we can hit OpenSubtitles directly
      const searchUrl = `https://rest.opensubtitles.org/search/query-${encodeURIComponent(query)}/sublanguageid-${language}`;
      const response = await fetch(searchUrl, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) return [];

      const data = await response.json();
      let subtitles = [];
      
      if (Array.isArray(data)) subtitles = data;
      else if (data?.data && Array.isArray(data.data)) subtitles = data.data;

      return subtitles.map(sub => ({
        id: sub.IDSubtitleFile || sub.id,
        name: sub.SubFileName || sub.filename || sub.name,
        language: sub.LanguageName || sub.language || language,
        downloadUrl: sub.SubDownloadLink || sub.download_url || sub.url,
        format: sub.SubFormat || sub.format || 'srt',
        downloads: sub.SubDownloadsCnt || sub.downloads || 0
      })).filter(sub => sub.downloadUrl);
    } catch (error) {
      console.error('Subtitle search error:', error);
      return [];
    }
  },

  getSubtitleDownloadUrl(subtitleUrl) {
    return subtitleUrl; // Direct access in Electron
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
