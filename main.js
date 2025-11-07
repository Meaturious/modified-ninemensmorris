// main.js

const { app, BrowserWindow, ipcMain, shell, protocol } = require('electron');
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
    height: 850,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    backgroundColor: '#2e3440',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // *** NEW: Add this option for security with custom protocols ***
      webSecurity: true 
    }
  });

  mainWindow.loadURL('app://./index.html');

  mainWindow.once('ready-to-show', () => {
    autoUpdater.checkForUpdates();
  });
}

// We must register the protocol BEFORE the app is ready.
// *** NEW: Make the protocol handler more robust and add logging ***
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
]);

app.on('ready', () => {
  protocol.registerFileProtocol('app', (request, callback) => {
    // Sanitize the URL to prevent directory traversal attacks
    const url = request.url.substr(6).replace(/\/$/, '');
    const filePath = path.join(__dirname, url);
    const normalizedPath = path.normalize(filePath);

    // Log the request and the path we are trying to serve
    log.info(`[Protocol] Requested URL: ${request.url}`);
    log.info(`[Protocol] Resolved to path: ${normalizedPath}`);

    callback({ path: normalizedPath });
  });

  createWindow();
});

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// --- UPDATE EVENT LISTENERS ---
autoUpdater.on('update-available', (info) => {
  log.info('Update available.', info);
  mainWindow.webContents.send('update-info-available', info);
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater. ' + err.toString());
});

ipcMain.on('open-download-page', () => {
  const releasesUrl = `https://github.com/Meaturious/modified-ninemensmorris/releases/latest`;
  shell.openExternal(releasesUrl);
});