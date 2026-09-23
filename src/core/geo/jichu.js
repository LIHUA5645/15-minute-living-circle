// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 基础几何工具：经纬度均以 {lng, lat} 表示，统一为 BD09 坐标系

const R_DIQIU = 6371000; // 地球平均半径（米）

// 角度转弧度
function zhuanHuDu(du) {
  return (du * Math.PI) / 180;
}
// 弧度转角度
function zhuanDu(hu) {
  return (hu * 180) / Math.PI;
}

// 两点球面距离（Haversine，米）
function liangDianJuLi(a, b) {
  const dLat = zhuanHuDu(b.lat - a.lat);
  const dLng = zhuanHuDu(b.lng - a.lng);
  const lat1 = zhuanHuDu(a.lat);
  const lat2 = zhuanHuDu(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_DIQIU * Math.asin(Math.min(1, Math.sqrt(h)));
}

// 起点到终点的初始方位角（度，0=正北，顺时针）
function fangWeiJiao(a, b) {
  const lat1 = zhuanHuDu(a.lat);
  const lat2 = zhuanHuDu(b.lat);
  const dLng = zhuanHuDu(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (zhuanDu(Math.atan2(y, x)) + 360) % 360;
}

// 由起点、方位角、距离推算目标点（大圆航线近似）
function tuiSuanDian(qiDian, fangWei, juLiMi) {
  const d = juLiMi / R_DIQIU;
  const th1 = zhuanHuDu(qiDian.lat);
  const la1 = zhuanHuDu(qiDian.lng);
  const th2 = Math.asin(
    Math.sin(th1) * Math.cos(d) + Math.cos(th1) * Math.sin(d) * Math.cos(zhuanHuDu(fangWei))
  );
  const la2 =
    la1 +
    Math.atan2(
      Math.sin(zhuanHuDu(fangWei)) * Math.sin(d) * Math.cos(th1),
      Math.cos(d) - Math.sin(th1) * Math.sin(th2)
    );
  return { lng: zhuanDu(la2), lat: zhuanDu(th2) };
}

// 方位角差（取最小夹角，0~180）
function fangWeiCha(a, b) {
  const c = Math.abs(a - b) % 360;
  return c > 180 ? 360 - c : c;
}

// Chaikin 角点平滑（迭代 n 次）
function pingHuaXian(dianLie, ciShu = 2) {
  let pts = dianLie.slice();
  for (let k = 0; k < ciShu; k++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      out.push({ lng: p.lng * 0.75 + q.lng * 0.25, lat: p.lat * 0.75 + q.lat * 0.25 });
      out.push({ lng: p.lng * 0.25 + q.lng * 0.75, lat: p.lat * 0.25 + q.lat * 0.75 });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

// 闭合多边形面积（平方米，球面近似采用等距投影到局部平面）
function mianJi(duoBianXing) {
  if (!duoBianXing || duoBianXing.length < 3) return 0;
  const c = duoBianXing[0];
  const k = 111320 * Math.cos(zhuanHuDu(c.lat)); // 经度每度米数
  const h = 110540; // 纬度每度米数
  let s = 0;
  for (let i = 0; i < duoBianXing.length; i++) {
    const p = duoBianXing[i];
    const q = duoBianXing[(i + 1) % duoBianXing.length];
    const x1 = (p.lng - c.lng) * k;
    const y1 = (p.lat - c.lat) * h;
    const x2 = (q.lng - c.lng) * k;
    const y2 = (q.lat - c.lat) * h;
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

// 点是否在多边形内（射线法）
function zaiDuoBianXingNei(dian, duoBianXing) {
  let inside = false;
  for (let i = 0, j = duoBianXing.length - 1; i < duoBianXing.length; j = i++) {
    const xi = duoBianXing[i].lng,
      yi = duoBianXing[i].lat;
    const xj = duoBianXing[j].lng,
      yj = duoBianXing[j].lat;
    const intersect =
      yi > dian.lat !== yj > dian.lat && dian.lng < ((xj - xi) * (dian.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// 计算一组点的外包矩形
function waiBaoJuXing(dianLie) {
  let minLng = Infinity,
    minLat = Infinity,
    maxLng = -Infinity,
    maxLat = -Infinity;
  for (const p of dianLie) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  return { minLng, minLat, maxLng, maxLat };
}

// 平面化距离（米）近似，比 Haversine 快约 3~5 倍，仅用于栅格/邻域粗筛
function pingMianJuLi(a, b, latCanKao) {
  const k = 111320 * Math.cos(zhuanHuDu(latCanKao == null ? (a.lat + b.lat) / 2 : latCanKao));
  const dx = (a.lng - b.lng) * k;
  const dy = (a.lat - b.lat) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
}

// 简单均匀栅格索引：将点集按 cell 大小切分，支持半径邻域查询
// 返回 { zaiBanJingNei(p, r): Point[] }
function chuangJianWangGe(dianLie, cellSizeM = 100) {
  if (!dianLie || dianLie.length === 0) return { zaiBanJingNei: () => [] };
  const box = waiBaoJuXing(dianLie);
  const latMid = (box.minLat + box.maxLat) / 2;
  const mx = 111320 * Math.cos(zhuanHuDu(latMid));
  const my = 110540;
  const minX = box.minLng * mx;
  const minY = box.minLat * my;
  const cell = Math.max(1, cellSizeM);
  const cells = new Map();
  const key = (cx, cy) => `${cx},${cy}`;
  for (let i = 0; i < dianLie.length; i++) {
    const p = dianLie[i];
    const cx = Math.floor((p.lng * mx - minX) / cell);
    const cy = Math.floor((p.lat * my - minY) / cell);
    const k = key(cx, cy);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push({ p, i });
  }
  return {
    zaiBanJingNei(p, r) {
      const px = p.lng * mx - minX;
      const py = p.lat * my - minY;
      const cx = Math.floor(px / cell);
      const cy = Math.floor(py / cell);
      const dCell = Math.ceil(r / cell);
      const out = [];
      for (let dx = -dCell; dx <= dCell; dx++) {
        for (let dy = -dCell; dy <= dCell; dy++) {
          const list = cells.get(key(cx + dx, cy + dy));
          if (!list) continue;
          for (const item of list) {
            if (pingMianJuLi(p, item.p, latMid) <= r) out.push(item);
          }
        }
      }
      return out;
    }
  };
}

export {
  R_DIQIU,
  zhuanHuDu,
  zhuanDu,
  liangDianJuLi,
  fangWeiJiao,
  tuiSuanDian,
  fangWeiCha,
  pingHuaXian,
  mianJi,
  zaiDuoBianXingNei,
  waiBaoJuXing,
  pingMianJuLi,
  chuangJianWangGe
};
