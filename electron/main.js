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
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false, // For easier IPC in this simple app
      webSecurity: false, // CRITICAL: This allows CORS bypass
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    // electron-vite-plugin injects this env var
    await win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    await win.loadFile(join(__dirname, '../dist/index.html'));
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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  win = null;
  if (process.platform !== 'darwin') app.quit();
});

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
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
