const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('maddenFantasy', {
  listSaves: () => ipcRenderer.invoke('list-saves'),
  analyzeSave: (sourcePath) => ipcRenderer.invoke('analyze-save', sourcePath),
  chooseSave: () => ipcRenderer.invoke('choose-save'),
  exportJson: (kind, data) => ipcRenderer.invoke('export-json', { kind, data }),
  importBackup: () => ipcRenderer.invoke('import-backup'),
  appInfo: () => ipcRenderer.invoke('app-info'),
  onSaveChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('save-changed', listener);
    return () => ipcRenderer.removeListener('save-changed', listener);
  },
});
