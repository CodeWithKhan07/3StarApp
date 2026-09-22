const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  isElectron: true,
  extractComplaintsFromImage: (imageDataUrl) =>
    ipcRenderer.invoke("complaints:extract", imageDataUrl),
});
