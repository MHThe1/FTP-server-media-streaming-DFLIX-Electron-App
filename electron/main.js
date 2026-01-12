import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { join } from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

// Handle __dirname in ES modules - compatible with build tools
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Disable GPU Acceleration for Windows 7
if (process.platform === 'win32') app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win = null;

async function createWindow() {
  win = new BrowserWindow({
    title: 'BetterFlix',
    width: 1280,
    height: 800,
    backgroundColor: '#141414', // Show dark background immediately
    show: false, // Don't show until ready
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
    },
  });

  // Show window as soon as it's ready, even if content isn't fully loaded
  win.once('ready-to-show', () => {
    win.show();
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'));
  }

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle downloads
  win.webContents.session.on('will-download', (event, item, webContents) => {
    // Set save path, etc.
    // item.setSavePath('/tmp/save.pdf')
    
    item.on('updated', (event, state) => {
      if (state === 'interrupted') {
        console.log('Download is interrupted but can be resumed')
      } else if (state === 'progressing') {
        if (item.isPaused()) {
          console.log('Download is paused')
        } else {
          console.log(`Received bytes: ${item.getReceivedBytes()}`)
        }
      }
    })
    
    item.on('done', (event, state) => {
      if (state === 'completed') {
        console.log('Download successfully')
      } else {
        console.log(`Download failed: ${state}`)
      }
    })
  })
}

// Transcoding port - MUST be declared before app.whenReady
let globalTranscodePort = null;

// IPC handler - MUST be registered before window loads
ipcMain.handle('get-transcode-port', () => {
  console.log('IPC: get-transcode-port called. Returning:', globalTranscodePort);
  return globalTranscodePort;
});

app.whenReady().then(async () => {
  try {
    const { startTranscodeServer } = await import('./transcodeServer.js');
    const port = await startTranscodeServer();
    globalTranscodePort = port.toString();
    process.env.TRANSCODE_PORT = port.toString();
    console.log('[Main] Transcoding server started on port:', globalTranscodePort);
  } catch (err) {
    console.error('Failed to start transcoder:', err);
  }
  createWindow();
});

app.on('window-all-closed', () => {
  win = null;
  if (process.platform !== 'darwin') app.quit();
});

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});
