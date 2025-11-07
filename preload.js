// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Only expose the necessary ipcRenderer functions for the update notification
contextBridge.exposeInMainWorld('ipcRenderer', {
  on: (channel, func) => {
    const validChannels = ['update-info-available'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  send: (channel) => {
    const validChannels = ['open-download-page'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel);
    }
  }
});