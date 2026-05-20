const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("focusDesktop", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  prioritize: () => ipcRenderer.invoke("window:prioritize"),
  loadData: () => ipcRenderer.invoke("data:load"),
  saveData: (state) => ipcRenderer.invoke("data:save", state),
  saveDataSync: (state) => ipcRenderer.sendSync("data:saveSync", state),
  platform: process.platform
});
