import express from 'express';
import ffmpeg from 'fluent-ffmpeg';
import getPort, { portNumbers } from 'get-port';
import cors from 'cors';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { app as electronApp } from 'electron';

// Use createRequire to access node_modules binaries
const require = createRequire(import.meta.url);

// Resolve ffmpeg and ffprobe paths - handle both dev and packaged app
let ffmpegPath, ffprobePath;

// Check if running in packaged app
const isPackaged = electronApp?.isPackaged ?? false;

if (isPackaged) {
    // In packaged app, binaries are unpacked to app.asar.unpacked
    const resourcesPath = process.resourcesPath || path.dirname(electronApp.getAppPath());
    const unpackedPath = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules');
    
    ffmpegPath = path.join(unpackedPath, 'ffmpeg-static', 'ffmpeg.exe');
    ffprobePath = path.join(unpackedPath, 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe');
    
    console.log('[Transcoder] Packaged app detected, using unpacked paths');
} else {
    // In dev mode, use require to resolve from node_modules
    try {
        ffmpegPath = require('ffmpeg-static');
        ffprobePath = require('ffprobe-static').path;
    } catch (e) {
        // Fallback: Look in project root's node_modules
        const projectRoot = process.cwd();
        ffmpegPath = path.join(projectRoot, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
        ffprobePath = path.join(projectRoot, 'node_modules', 'ffprobe-static', 'bin', 'win32', 'x64', 'ffprobe.exe');
        console.log('[Transcoder] Using fallback ffmpeg paths');
    }
}

// Verify paths exist
if (!fs.existsSync(ffmpegPath)) {
    console.error('[Transcoder] FFmpeg not found at:', ffmpegPath);
}
if (!fs.existsSync(ffprobePath)) {
    console.error('[Transcoder] FFprobe not found at:', ffprobePath);
}

// Set ffmpeg/ffprobe paths
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);
console.log('[Transcoder] FFmpeg path:', ffmpegPath);
console.log('[Transcoder] FFprobe path:', ffprobePath);

const app = express();
app.use(cors());

// Temp directory for HLS segments - use app data path in packaged app
const TEMP_DIR = isPackaged 
    ? path.join(os.tmpdir(), 'betterflix_hls')
    : path.join(process.cwd(), 'temp_hls');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}
console.log('[Transcoder] Temp directory:', TEMP_DIR);

// Active Transcoding Sessions
// Map<sessionId, { command: FfmpegCommand, lastAccessed: number }>
const sessions = new Map();

// Periodic cleanup of old sessions (every 5 mins)
setInterval(() => {
    const now = Date.now();
    sessions.forEach((session, sessionId) => {
        if (now - session.lastAccessed > 10 * 60 * 1000) { // 10 mins inactive
            console.log(`[Transcoder] Cleaning up inactive session: ${sessionId}`);
            try {
                session.command.kill('SIGKILL');
            } catch (e) { /* ignore */ }
            
            // Clean up files
            const sessionDir = path.join(TEMP_DIR, sessionId);
            fs.rm(sessionDir, { recursive: true, force: true }, () => {});
            sessions.delete(sessionId);
        }
    });
}, 5 * 60 * 1000);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', transcoder: true, mode: 'hls' });
});

app.get('/metadata', (req, res) => {
    const fileUrl = req.query.file;
    if (!fileUrl) return res.status(400).send('File parameter is required');

    ffmpeg.ffprobe(fileUrl, (err, metadata) => {
        if (err) {
            console.error('[Transcoder] Probe Error:', err);
            return res.status(500).json({ error: 'Probe failed' });
        }
        res.json(metadata);
    });
});

// Route to stream specific subtitle track as WebVTT
app.get('/subtitles', (req, res) => {
    const fileUrl = req.query.file;
    const index = req.query.index; // Stream index of the subtitle
    
    if (!fileUrl || index === undefined) return res.status(400).send('File and index required');

    // Generate unique VTT
    res.setHeader('Content-Type', 'text/vtt');
    
    // We use ffmpeg to extract and convert to VTT on the fly
    const command = ffmpeg(fileUrl)
        .noVideo()
        .noAudio()
        .outputOptions([
            `-map 0:${index}`, // Select specific stream
            '-f webvtt'        // Force VTT format
        ])
        .on('error', (err) => {
            if (!err.message.includes('SIGKILL') && !err.message.includes('Output stream closed')) {
                console.error(`[Transcoder] Subtitle duplicate error: ${err.message}`);
            }
        });
        
    command.pipe(res, { end: true });
});

// Routes are defined below in correct order:
// 1. /stream - redirects to /hls/:sessionId/playlist.m3u8
// 2. /hls/:sessionId/playlist.m3u8 - serves or starts transcoding
// 3. /hls/:sessionId/:segment - serves segment files (MUST be last to not catch playlists)

app.get('/stream', (req, res) => {
    const fileUrl = req.query.file;
    const startTime = req.query.startTime || 0;
    if (!fileUrl) return res.status(400).send('File param required');
    
    // Include startTime in session ID so we get a fresh session for new seek points
    const sessionId = crypto.createHash('md5').update(`${fileUrl}-${startTime}`).digest('hex');
    res.redirect(`/hls/${sessionId}/playlist.m3u8?file=${encodeURIComponent(fileUrl)}&startTime=${startTime}`);
});

app.get('/hls/:sessionId/playlist.m3u8', (req, res) => {
    const { sessionId } = req.params;
    const fileUrl = req.query.file;
    const startTime = parseFloat(req.query.startTime) || 0;
    
    const sessionDir = path.join(TEMP_DIR, sessionId);
    const playlistPath = path.join(sessionDir, 'playlist.m3u8');

    // If we have the session and file exists, serve it
    if (sessions.has(sessionId) && fs.existsSync(playlistPath)) {
        sessions.get(sessionId).lastAccessed = Date.now();
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        return res.sendFile(playlistPath);
    }

    // Need to start?
    if (!fileUrl) {
         return res.status(400).send('Session expired or file param missing');
    }

    startTranscoding(sessionId, fileUrl, sessionDir, playlistPath, res, startTime);
});

function startTranscoding(sessionId, fileUrl, sessionDir, playlistPath, res, startTime = 0) {
    console.log(`[Transcoder] Starting Session: ${sessionId} (Start: ${startTime}s)`);
    
    if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });

    if (sessions.has(sessionId)) {
        try { sessions.get(sessionId).command.kill(); } catch (e) {}
    }

    const command = ffmpeg(fileUrl);
    
    // Seek input if needed
    if (startTime > 0) {
        command.seekInput(startTime);
    }

    command
        .addOptions([
            '-profile:v main',
            '-pix_fmt yuv420p',
            '-preset ultrafast',
            '-g 48', 
            '-sc_threshold 0',
            '-hls_time 6',
            '-hls_list_size 0', 
            '-hls_segment_filename', path.join(sessionDir, 'segment_%03d.ts'),
            '-f hls'
        ])
        .output(playlistPath);

    command.videoCodec('libx264');
    command.addOutputOption('-vf', "scale='min(1920,iw)':-2");
    command.audioCodec('aac');
    command.audioChannels(2);

    command.on('start', (cmd) => console.log(`[Transcoder] Processing: ${fileUrl}`));
    command.on('error', (err) => {
         if (!err.message.includes('SIGKILL')) console.error(`[Transcoder] key error: ${err.message}`);
    });

    command.run();

    sessions.set(sessionId, { command, lastAccessed: Date.now() });

    const checkPlaylist = () => {
        if (fs.existsSync(playlistPath)) {
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.sendFile(playlistPath);
        } else {
             if (!sessions.has(sessionId)) return res.status(500).send('Failed');
             setTimeout(checkPlaylist, 500);
        }
    };
    checkPlaylist();
}

// Serve HLS Segments (MUST be after playlist.m3u8 route to avoid catching it)
app.get('/hls/:sessionId/:segment', (req, res) => {
    const { sessionId, segment } = req.params;
    const filePath = path.join(TEMP_DIR, sessionId, segment);
    
    // Security check: ensure no directory traversal
    if (!filePath.startsWith(TEMP_DIR)) return res.sendStatus(403);

    if (fs.existsSync(filePath)) {
        if (sessions.has(sessionId)) {
            sessions.get(sessionId).lastAccessed = Date.now();
        }
        res.sendFile(filePath);
    } else {
        res.sendStatus(404);
    }
});

export async function startTranscodeServer() {
  const port = await getPort({ port: portNumbers(3001, 3999) });
  return new Promise((resolve, reject) => {
    app.listen(port, () => {
      console.log(`[Transcoder] HLS Server running on ${port}`);
      resolve(port);
    }).on('error', reject);
  });
}
