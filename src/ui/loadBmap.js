// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 百度地图 JS API（WebGL 版）单例加载器，供地图渲染器与浏览器端适配器共用
let p = null;

// 轮询等待 BMapGL.Map 真正就绪：引导脚本的 callback 可能早于 Map 类定义触发（慢网下更明显）
function dengMapJiuXu(resolve, reject) {
  const t0 = Date.now();
  (function xun() {
    if (typeof window !== 'undefined' && window.BMapGL && window.BMapGL.Map)
      return resolve(window.BMapGL);
    if (Date.now() - t0 > 15000) return reject(new Error('BMapGL.Map 未就绪'));
    setTimeout(xun, 100);
  })();
}

export function loadBmap() {
  if (p) return p;
  p = new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.BMapGL && window.BMapGL.Map) {
      resolve(window.BMapGL);
      return;
    }
    const ak = import.meta.env.VITE_BMAP_AK;
    if (!ak) {
      reject(new Error('缺少 VITE_BMAP_AK'));
      return;
    }
    window.__bmapReady = () => dengMapJiuXu(resolve, reject);
    const s = document.createElement('script');
    s.src = `https://api.map.baidu.com/api?type=webgl&v=1.0&ak=${ak}&callback=__bmapReady`;
    s.onerror = () => reject(new Error('BMap 脚本加载失败'));
    s.onload = () => dengMapJiuXu(resolve, reject);
    document.head.appendChild(s);
    setTimeout(() => {
      if (!window.BMapGL || !window.BMapGL.Map) reject(new Error('BMap 加载超时'));
    }, 15000);
  });
  // 失败不缓存：下次调用自动重试（此前一次「未就绪」竞态失败会被永久缓存，地图再也加载不出来）
  p.catch(() => {
    p = null;
  });
  return p;
}
