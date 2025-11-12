// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ipcRenderer', {
  // --- NEW: Add an invoke method for request/response calls like getting the IP ---
  invoke: (channel) => {
    const validChannels = ['get-local-ip'];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel);
    }
  },

  on: (channel, func) => {
    // --- NEW: Add new channels to listen for ---
    const validChannels = [
        'update-info-available', 
        'network-status-update', 
        'network-event'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },

  send: (channel, data) => {
    // --- NEW: Add new channels to send on ---
    const validChannels = [
        'open-download-page', 
        'host-game', 
        'join-game', 
        'send-network-event', 
        'stop-networking'
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  }
});