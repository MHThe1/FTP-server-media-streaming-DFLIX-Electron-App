import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// 1. Load Environment Variables
const envPath = path.join(projectRoot, '.env');
let TMDB_API_KEY = '';

if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/VITE_TMDB_API_KEY=(.*)/);
    if (match) {
        TMDB_API_KEY = match[1].trim();
    }
}

if (!TMDB_API_KEY) {
    console.error('❌ Error: VITE_TMDB_API_KEY not found in .env');
    process.exit(1);
}

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const FTP_BASE_URL = 'http://cdn.dflix.live';
const OUTPUT_FILE = path.join(projectRoot, 'src/data/static_catalog.json');

// --- HELPER: Fetch TMDB ---
async function fetchTMDB(endpoint, params = {}) {
    const url = new URL(`${TMDB_BASE_URL}${endpoint}`);
    url.searchParams.append('api_key', TMDB_API_KEY);
    Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    return await res.json();
}

// --- HELPER: Recursive Directory Scanner ---
// Returns a FLAT list of all directory paths found on the server
async function indexServer(startPath) {
    const allPaths = [];
    const queue = [startPath];
    const visited = new Set();
    
    console.log(`\n📂 Starting recursive index of ${startPath}...`);
    let processed = 0;

    while (queue.length > 0) {
        const currentPath = queue.shift();
        if (visited.has(currentPath)) continue;
        visited.add(currentPath);

        try {
            const url = `${FTP_BASE_URL}${currentPath}`;
            const res = await fetch(url);
            const html = await res.text();
            
            const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
            let match;
            
            while ((match = linkRegex.exec(html)) !== null) {
                const href = match[1];
                const text = match[2];

                // Skip navigation and junk
                if (href === '../' || href === './' || href.includes('?C=')) continue;
                if (text === 'Parent Directory') continue;
                
                if (href.endsWith('/')) {
                    const fullPath = `${currentPath}${href}`;
                    const folderName = decodeURIComponent(href.replace(/\/$/, '')); // clean name
                    const lowerName = folderName.toLowerCase();

                    // Filter out Junk / Dubbed folders
                    if (lowerName.includes('dubbed')) continue;
                    
                    // Filter out TV Structure (Seasons/Specials) - we only want the Show Name folder
                    if (/^season\s+\d+$/i.test(folderName) || lowerName === 'specials') continue;

                    // Add to our BIG INDEX
                    allPaths.push({
                        name: folderName,
                        path: fullPath,
                        parent: currentPath
                    });
                    
                    // Recurse!
                    queue.push(fullPath);
                }
            }
            
            processed++;
            if (processed % 50 === 0) process.stdout.write(`\rScanned ${processed} folders... Found ${allPaths.length} items`);

        } catch (e) {
            // checking error
        }
    }
    console.log(`\n✅ Indexed ${allPaths.length} folders in ${startPath}`);
    return allPaths;
}

// --- HELPER: Find Best Match in Index ---
function findInIndex(index, title) {
    if (!title) return null;
    const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // 1. Exact Name Match (most reliable)
    let match = index.find(folder => folder.name.toLowerCase() === title.toLowerCase());
    
    // 2. Exact alphanumeric match (ignores punctuation)
    if (!match) {
        match = index.find(folder => {
            const normFolder = folder.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            return normFolder === normalizedTitle;
        });
    }

    // 3. Containment (risky but needed)
    if (!match) {
        match = index.find(folder => folder.name.toLowerCase().includes(title.toLowerCase()));
    }
    
    return match ? match.path : null;
}


// --- MAIN ---
(async () => {
    try {
        console.log("Fetching TMDB content...");
        // Fetch Top 250 Movies
        let topMovies = [];
        let p = 1;
        while(topMovies.length < 250) {
            const d = await fetchTMDB('/movie/top_rated', {page: p++});
            topMovies = [...topMovies, ...d.results];
        }
        topMovies = topMovies.slice(0, 250);

        // Fetch Top 250 TV Shows
        let topTV = [];
        p = 1;
        while(topTV.length < 250) {
            const d = await fetchTMDB('/tv/top_rated', {page: p++});
            topTV = [...topTV, ...d.results];
        }
        topTV = topTV.slice(0, 250);

        // 2. Build Server Index (The "Expensive" part, done once)
        console.log("\nBuilding Server Index (Recursive)...");
        const movieIndex = await indexServer('/Movies/');
        const tvIndex = await indexServer('/TV Series/');
        
        const fullTvIndex = [...tvIndex]; 

        // 3. Match
        console.log("\nMatching content...");
        
        const processItems = (items, type, index) => items.map(item => {
            const title = item.title || item.name;
            const path = findInIndex(index, title);
            
            return {
                id: item.id,
                title: title,
                original_title: item.original_title || item.original_name,
                overview: item.overview,
                poster_path: item.poster_path,
                backdrop_path: item.backdrop_path,
                release_date: item.release_date || item.first_air_date,
                vote_average: item.vote_average,
                media_type: type,
                server_path: path
            };
        });

        const finalMovies = processItems(topMovies, 'movie', movieIndex);
        const finalTV = processItems(topTV, 'tv', fullTvIndex);
        
        const catalog = {
            metadata: { 
                generatedAt: new Date().toISOString(),
                movieCount: finalMovies.length,
                tvCount: finalTV.length,
                matchedCount: finalMovies.filter(m => m.server_path).length + finalTV.filter(t => t.server_path).length
            },
            items: [...finalMovies, ...finalTV]
        };

        const dir = path.dirname(OUTPUT_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(catalog, null, 2));
        console.log(`\n✅ Saved ${catalog.items.length} items to ${OUTPUT_FILE}`);
        console.log(`   Matched: ${catalog.metadata.matchedCount} items`);
        
        // --- NEW: Save FULL Server Index for Intelligent Search ---
        // Combine Movie and TV indexes into a single flat list
        // Minimize size: { n: name, p: path }
        const fullIndex = [
            ...movieIndex.map(f => ({ n: f.name, p: f.path })),
            ...fullTvIndex.map(f => ({ n: f.name, p: f.path }))
        ];
        
        const INDEX_FILE = path.join(projectRoot, 'src/data/server_index.json');
        fs.writeFileSync(INDEX_FILE, JSON.stringify(fullIndex)); // Minified JSON
        console.log(`✅ Saved FULL Server Index (${fullIndex.length} items) to ${INDEX_FILE}`);

    } catch (e) {
        console.error(e);
    }
})();
