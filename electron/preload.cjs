// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// Electron 预加载：安全暴露 API 代理桥
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  isElectron: true,
  walkingRoute: (o, d) => ipcRenderer.invoke('walkingRoute', o, d),
  routeMatrix: (o, d) => ipcRenderer.invoke('routeMatrix', o, d),
  searchPoi: (c, k, r) => ipcRenderer.invoke('searchPoi', c, k, r),
  reverseGeocode: (p) => ipcRenderer.invoke('reverseGeocode', p),
  ipDingWei: () => ipcRenderer.invoke('ipDingWei'),
});
