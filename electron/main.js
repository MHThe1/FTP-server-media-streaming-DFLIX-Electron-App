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
    icon: join(__dirname, '../dist/appicon.ico'),
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

  // Auto-Update logic
  if (process.env.NODE_ENV !== 'development') {
    const { autoUpdater } = await import('electron-updater');
    
    autoUpdater.logger = console;
    autoUpdater.autoDownload = false; // We will ask the user first

    autoUpdater.on('checking-for-update', () => {
      console.log('Checking for update...');
    });

    autoUpdater.on('update-available', (info) => {
      console.log('Update available:', info);
      if (win) {
        win.webContents.send('update-available', info);
      }
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('Update not available:', info);
    });

    autoUpdater.on('error', (err) => {
      console.error('Error in auto-updater:', err);
      if (win) {
        win.webContents.send('update-error', err.message);
      }
    });

    autoUpdater.on('download-progress', (progressObj) => {
      let log_message = "Download speed: " + progressObj.bytesPerSecond;
      log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
      log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
      console.log(log_message);
      if (win) {
        win.webContents.send('update-download-progress', progressObj);
      }
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('Update downloaded:', info);
      if (win) {
        win.webContents.send('update-downloaded', info);
      }
    });

    // IPC Handlers for Updater
    ipcMain.handle('check-for-updates', () => {
      autoUpdater.checkForUpdates();
    });

    ipcMain.handle('download-update', () => {
      autoUpdater.downloadUpdate();
    });

    ipcMain.handle('quit-and-install', () => {
      autoUpdater.quitAndInstall();
    });

    ipcMain.handle('clear-app-data', async () => {
      if (win) {
        try {
          // Clear all session data
          await win.webContents.session.clearStorageData({
            storages: ['appcache', 'cookies', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage'],
          });
          await win.webContents.session.clearCache();
          
          console.log('App data cleared successfully');
          
          // Reload to apply changes and ensure fresh state
          win.reload();
          return true;
        } catch (error) {
          console.error('Failed to clear app data:', error);
          return false;
        }
      }
    });

    // Check for updates immediately
    autoUpdater.checkForUpdatesAndNotify();
  }
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
