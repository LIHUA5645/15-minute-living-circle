// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 坐标系转换（纯算法，不依赖任何地图 SDK）
// WGS-84：GPS / OpenStreetMap 原始坐标
// GCJ-02：国测局加密坐标（高德、腾讯）
// BD-09：百度坐标
// 用途：浏览器定位得到 WGS-84，百度底图需要 BD-09，OSM 瓦片需要 WGS-84，必须按底图严格转换

const PI = Math.PI;
const X_PI = (PI * 3000.0) / 180.0;
const A = 6378245.0; // 长半轴
const EE = 0.00669342162296594; // 偏心率平方

function jingWai(lng, lat) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function zhuanLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((160.0 * Math.sin((y / 12.0) * PI) + 320 * Math.sin((y * PI) / 30.0)) * 2.0) / 3.0;
  return ret;
}

function zhuanLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += ((20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0) / 3.0;
  ret += ((20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0) / 3.0;
  ret += ((150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0) / 3.0;
  return ret;
}

// WGS-84 → GCJ-02
export function wgs84ZhuanGcj02(lng, lat) {
  if (jingWai(lng, lat)) return { lng, lat };
  let dLat = zhuanLat(lng - 105.0, lat - 35.0);
  let dLng = zhuanLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return { lng: lng + dLng, lat: lat + dLat };
}

// GCJ-02 → WGS-84（迭代逼近，精度优于 1 米）
export function gcj02ZhuanWgs84(lng, lat) {
  if (jingWai(lng, lat)) return { lng, lat };
  let wlng = lng;
  let wlat = lat;
  for (let i = 0; i < 5; i++) {
    const g = wgs84ZhuanGcj02(wlng, wlat);
    wlng += lng - g.lng;
    wlat += lat - g.lat;
  }
  return { lng: wlng, lat: wlat };
}

// GCJ-02 → BD-09
export function gcj02ZhuanBd09(lng, lat) {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * X_PI);
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * X_PI);
  return { lng: z * Math.cos(theta) + 0.0065, lat: z * Math.sin(theta) + 0.006 };
}

// BD-09 → GCJ-02
export function bd09ZhuanGcj02(lng, lat) {
  const x = lng - 0.0065;
  const y = lat - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * X_PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * X_PI);
  return { lng: z * Math.cos(theta), lat: z * Math.sin(theta) };
}

// WGS-84 → BD-09
export function wgs84ZhuanBd09(lng, lat) {
  const g = wgs84ZhuanGcj02(lng, lat);
  return gcj02ZhuanBd09(g.lng, g.lat);
}

// BD-09 → WGS-84
export function bd09ZhuanWgs84(lng, lat) {
  const g = bd09ZhuanGcj02(lng, lat);
  return gcj02ZhuanWgs84(g.lng, g.lat);
}
