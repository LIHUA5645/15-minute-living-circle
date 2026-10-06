// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 坐标工具：引擎内部恒为 WGS-84；小程序地图（腾讯/高德底图）渲染用 GCJ-02。
// 转换只允许发生在两个地方——本文件与 adapters/；页面里不要自己换算，免得出现「有的图层偏 500 米」。
export {
  wgs84ZhuanGcj02,
  gcj02ZhuanWgs84,
  wgs84ZhuanBd09,
  bd09ZhuanWgs84,
  gcj02ZhuanBd09,
  bd09ZhuanGcj02
} from '../core/geo/zuobiao.js';

import { wgs84ZhuanGcj02, gcj02ZhuanWgs84 } from '../core/geo/zuobiao.js';

const shi = (lng, lat) => Number.isFinite(lng) && Number.isFinite(lat);

// 引擎坐标 → 地图渲染坐标
export function wgsDaoGcj(p) {
  if (!p || !shi(p.lng, p.lat)) return null;
  const g = wgs84ZhuanGcj02(p.lng, p.lat);
  return { lng: g.lng, lat: g.lat };
}

// 地图坐标（定位 / 选点 / 地图点击）→ 引擎坐标
export function gcjDaoWgs(p) {
  if (!p || !shi(p.lng, p.lat)) return null;
  const g = gcj02ZhuanWgs84(p.lng, p.lat);
  return { lng: g.lng, lat: g.lat };
}
