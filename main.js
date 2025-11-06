// main.js

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// --- LOGGING SETUP ---
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    backgroundColor: '#2e3440',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  mainWindow.loadFile('index.html');

  // After the window is ready, check for updates
  mainWindow.once('ready-to-show', () => {
    // We DON'T use checkForUpdatesAndNotify().
    // We will check and handle the notification UI ourselves.
    autoUpdater.checkForUpdates();
  });
}

app.whenReady().then(createWindow);

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});


// --- UPDATE EVENT LISTENERS ---

// When an update is available, send the version info to the renderer process
autoUpdater.on('update-available', (info) => {
  log.info('Update available.', info);
  // Send version info to the renderer process
  mainWindow.webContents.send('update-info-available', info);
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater. ' + err.toString());
});

// New: Listen for a message from the renderer to open the download link
ipcMain.on('open-download-page', () => {
  // Use the repository URL from your package.json to build the releases URL
  const releasesUrl = `https://github.com/Meaturious/modified-ninemensmorris/releases/latest`;
  shell.openExternal(releasesUrl);
});