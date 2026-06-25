const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("focusDesktop", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  prioritize: () => ipcRenderer.invoke("window:prioritize"),
  loadData: () => ipcRenderer.invoke("data:load"),
  saveData: (state) => ipcRenderer.invoke("data:save", state),
  getMedicalVaultCapability: () => ipcRenderer.invoke("medicalVault:getCapability"),
  exportData: (state) => ipcRenderer.invoke("data:export", state),
  importData: () => ipcRenderer.invoke("data:import"),
  autoImportData: () => ipcRenderer.invoke("data:autoImport"),
  getSyncConfig: () => ipcRenderer.invoke("sync:getConfig"),
  chooseSyncFolder: () => ipcRenderer.invoke("sync:chooseFolder"),
  clearSyncFolder: () => ipcRenderer.invoke("sync:clearFolder"),
  readSyncData: () => ipcRenderer.invoke("sync:read"),
  writeSyncData: (state) => ipcRenderer.invoke("sync:write", state),
  createMysqlAccount: (account, state) => ipcRenderer.invoke("mysql:createAccount", account, state),
  loginMysqlUser: (account) => ipcRenderer.invoke("mysql:login", account),
  readMysqlUserState: (account) => ipcRenderer.invoke("mysql:read", account),
  writeMysqlUserState: (account, state) => ipcRenderer.invoke("mysql:write", account, state),
  saveDataSync: (state) => ipcRenderer.sendSync("data:saveSync", state),
  encryptSecret: (plaintext) => ipcRenderer.invoke("safeStorage:encrypt", plaintext),
  decryptSecret: (payload) => ipcRenderer.invoke("safeStorage:decrypt", payload),
  getAssistantConfig: () => ipcRenderer.invoke("assistant:getConfig"),
  setAssistantProvider: (provider) => ipcRenderer.invoke("assistant:setProvider", provider),
  setupLocalAssistant: () => ipcRenderer.invoke("assistant:setupLocal"),
  saveAssistantConfig: (config) => ipcRenderer.invoke("assistant:saveConfig", config),
  clearAssistantConfig: () => ipcRenderer.invoke("assistant:clearConfig"),
  requestAssistantPlan: (request) => ipcRenderer.invoke("assistant:plan", request),
  requestWeeklyReview: (request) => ipcRenderer.invoke("assistant:weeklyReview", request),
  transcribeAssistantAudio: (request) => ipcRenderer.invoke("assistant:transcribe", request),
  getPerformance: () => ipcRenderer.invoke("performance:get"),
  configurePerformance: (settings) => ipcRenderer.invoke("performance:configure", settings),
  searchNutrition: (query) => ipcRenderer.invoke("nutrition:search", query),
  resolveNutritionMeal: (description) => ipcRenderer.invoke("nutrition:resolveMeal", description),
  onPerformanceUpdate: (callback) => {
    if (typeof callback !== "function") return () => {};
    const listener = (event, sample) => callback(sample);
    ipcRenderer.on("performance:update", listener);
    return () => ipcRenderer.removeListener("performance:update", listener);
  },
  platform: process.platform
});
