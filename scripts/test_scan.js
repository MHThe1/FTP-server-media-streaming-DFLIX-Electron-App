
const HTTP_SERVER_URL = 'http://cdn.dflix.live/TV%20Series/';

const parseDirectoryListing = (html, currentPath) => {
  const files = [];

  // SIMPLE REGEX PARSER for <a href="...">
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const text = match[2]; // This might have HTML entities or tags, but usually text

      if (!href || href === '../' || href === './' || href.includes('?C=') || text === 'Parent Directory' || text === '../') {
          continue;
      }
      
      const junkFolders = ['Archive/', 'Softwares/', 'Tutorial/', 'System Volume Information/', 'recycle/'];
      if (junkFolders.some(junk => href.includes(junk) || text.includes(junk))) {
          continue;
      }

      const isDirectory = href.endsWith('/');
      let name = text.replace(/\/$/, '');
      let cleanHref = href;
      
      try {
          name = decodeURIComponent(name);
      } catch (e) { }

      if (!isDirectory) {
          const validExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
          if (!validExts.some(ext => cleanHref.toLowerCase().endsWith(ext))) {
              continue;
          }
      }

      let filePath;
      try {
           const dummyBase = 'http://dflix.local'; 
           const basePath = currentPath.endsWith('/') ? currentPath : currentPath + '/';
           const resolvedUrl = new URL(cleanHref, dummyBase + basePath);
           filePath = decodeURIComponent(resolvedUrl.pathname);
           if (!filePath.startsWith('/')) filePath = '/' + filePath;
      } catch (e) {
          const base = currentPath.endsWith('/') ? currentPath : currentPath + '/';
          filePath = base + cleanHref;
      }
      
      if (!filePath.startsWith('/')) filePath = '/' + filePath;

      files.push({
          name: name,
          type: isDirectory ? 'directory' : 'file',
          path: filePath
      });
  }

  return files;
};

async function test() {
    console.log(`Fetching from ${HTTP_SERVER_URL}...`);
    try {
        const resp = await fetch(HTTP_SERVER_URL);
        const html = await resp.text();
        console.log(`Got HTML (${html.length} chars). Parsing...`);
        const files = parseDirectoryListing(html, '/TV Series/');
        console.log(`Parsed ${files.length} items.`);
        if (files.length > 0) {
            console.log('First 5 items:');
            files.slice(0, 5).forEach(f => console.log(JSON.stringify(f)));
            console.log('Last 5 items:');
            files.slice(-5).forEach(f => console.log(JSON.stringify(f)));
            
            // Check specific items user mentioned
            const check = files.find(f => f.name.includes('Breaking Bad') || f.name.includes('Given'));
            console.log('Sample match:', check);
        } else {
            console.log('HTML Preview:', html.slice(0, 500));
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}

test();
