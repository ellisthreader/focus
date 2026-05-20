const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("focusDesktop", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  prioritize: () => ipcRenderer.invoke("window:prioritize"),
  loadData: () => ipcRenderer.invoke("data:load"),
  saveData: (state) => ipcRenderer.invoke("data:save", state),
  exportData: (state) => ipcRenderer.invoke("data:export", state),
  importData: () => ipcRenderer.invoke("data:import"),
  autoImportData: () => ipcRenderer.invoke("data:autoImport"),
  getSyncConfig: () => ipcRenderer.invoke("sync:getConfig"),
  chooseSyncFolder: () => ipcRenderer.invoke("sync:chooseFolder"),
  clearSyncFolder: () => ipcRenderer.invoke("sync:clearFolder"),
  readSyncData: () => ipcRenderer.invoke("sync:read"),
  writeSyncData: (state) => ipcRenderer.invoke("sync:write", state),
  saveDataSync: (state) => ipcRenderer.sendSync("data:saveSync", state),
  platform: process.platform
});
