// preload.js

// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
window.addEventListener('DOMContentLoaded', () => {
  console.log('Preload script has been loaded.');
  // You can expose specific Node.js features to your game here
  // in a secure way if needed in the future.
});