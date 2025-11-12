// main.js

const { app, BrowserWindow, ipcMain, shell, protocol } = require('electron');
const path = require('path');
const os = require('os');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
// --- NEW: Import WebSocket modules ---
const { WebSocketServer } = require('ws');
const WebSocket = require('ws');


// --- LOGGING SETUP ---
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

let mainWindow;

// --- NEW: Networking State ---
let networkSocket = null; // Can be a server or client socket
let webSocketServer = null;


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 500,
    height: 650,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    backgroundColor: '#2e3440',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true 
    }
  });

  mainWindow.loadURL('app://./index.html');

  mainWindow.once('ready-to-show', () => {
    autoUpdater.checkForUpdates();
  });
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
]);

app.on('ready', () => {
  protocol.registerFileProtocol('app', (request, callback) => {
    const url = request.url.substr(6).replace(/\/$/, '');
    const filePath = path.join(__dirname, url);
    const normalizedPath = path.normalize(filePath);
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

autoUpdater.on('update-available', (info) => {
  log.info('Update available.', info);
  mainWindow.webContents.send('update-info-available', info);
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater. ' + err.toString());
});

ipcMain.on('open-download-page', () => {
  // Corrected URL
  const releasesUrl = `https://github.com/suspiciousstew67/ninemensmorris/releases/latest`;
  shell.openExternal(releasesUrl);
});


// --- NEW: NETWORKING LOGIC ---

// Function to find the local IP address
function getLocalIP() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '0.0.0.0';
}

// Make the local IP available to the renderer process
ipcMain.handle('get-local-ip', () => {
    return getLocalIP();
});

// Stop all networking activity
function stopNetworking() {
    if (networkSocket) {
        networkSocket.close();
        networkSocket = null;
    }
    if (webSocketServer) {
        webSocketServer.close();
        webSocketServer = null;
    }
    log.info('Networking stopped.');
}

ipcMain.on('stop-networking', stopNetworking);

// Host a game
ipcMain.on('host-game', () => {
    stopNetworking(); // Ensure any old connections are closed
    const port = 8080;
    webSocketServer = new WebSocketServer({ port });
    log.info(`Server started on port ${port}. Waiting for connection...`);

    webSocketServer.on('connection', (ws) => {
        log.info('Opponent connected!');
        networkSocket = ws;
        mainWindow.webContents.send('network-status-update', { status: 'connected', role: 'host' });

        ws.on('message', (data) => {
            const message = JSON.parse(data.toString());
            log.info('Received from client:', message);
            mainWindow.webContents.send('network-event', message);
        });

        ws.on('close', () => {
            log.info('Opponent disconnected.');
            mainWindow.webContents.send('network-status-update', { status: 'disconnected' });
            networkSocket = null;
        });

        ws.on('error', (err) => {
            log.error('Host socket error:', err);
            mainWindow.webContents.send('network-status-update', { status: 'error', message: err.message });
        });
    });
});

// Join a game
ipcMain.on('join-game', (event, hostAddress) => {
    stopNetworking();
    log.info(`Attempting to connect to ${hostAddress}`);
    const ws = new WebSocket(`ws://${hostAddress}`);
    networkSocket = ws;

    ws.on('open', () => {
        log.info('Successfully connected to host!');
        mainWindow.webContents.send('network-status-update', { status: 'connected', role: 'client' });
    });

    ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        log.info('Received from host:', message);
        mainWindow.webContents.send('network-event', message);
    });

    ws.on('close', () => {
        log.info('Disconnected from host.');
        mainWindow.webContents.send('network-status-update', { status: 'disconnected' });
        networkSocket = null;
    });

    ws.on('error', (err) => {
        log.error('Client connection error:', err);
        mainWindow.webContents.send('network-status-update', { status: 'error', message: 'Connection failed. Check IP and firewall.' });
        networkSocket = null;
    });
});


// Send a message to the other player
ipcMain.on('send-network-event', (event, eventData) => {
    if (networkSocket && networkSocket.readyState === WebSocket.OPEN) {
        networkSocket.send(JSON.stringify(eventData));
    }
});