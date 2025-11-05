// main.js

const { app, BrowserWindow } = require('electron');
const path = require('path');

// This function creates the main application window.
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 900,  // A bit wider to accommodate the game UI comfortably
    height: 750, // A bit taller
    webPreferences: {
      // The preload script is a security best practice.
      preload: path.join(__dirname, 'preload.js'),
      // These settings are needed for the preload script to work correctly.
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Load your game's HTML file into the window.
  mainWindow.loadFile('index.html');

  // Optional: Open the DevTools for debugging during development.
  // mainWindow.webContents.openDevTools();
}

// This method is called when Electron has finished initialization.
app.whenReady().then(() => {
  createWindow();

  // On macOS, it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') { // 'darwin' is the OS name for macOS
    app.quit();
  }
});