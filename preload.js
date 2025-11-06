// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipcRenderer', {
  // Expose a function to listen for messages from the main process
  on: (channel, func) => {
    // Only allow the 'update-info-available' channel
    const validChannels = ['update-info-available'];
    if (validChannels.includes(channel)) {
      // Deliberately strip event as it includes `sender`
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  // Expose a function to send a message to the main process
  send: (channel) => {
    // Only allow the 'open-download-page' channel
    const validChannels = ['open-download-page'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel);
    }
  }
});