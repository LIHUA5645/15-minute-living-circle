// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 等时圈生成：扇形采样 → 收敛边界 → 各向异性插值 → 等值线 → 路网吸附
import {
  tuiSuanDian,
  fangWeiJiao,
  fangWeiCha,
  pingHuaXian,
  liangDianJuLi,
  waiBaoJuXing,
  chuangJianWangGe,
  pingMianJuLi,
} from '../geo/jichu.js';
import { ouJiGuJI, tuiBiChongShi } from '../scheduler/xianliu.js';

// 密度档位预设
const MI_DU = {
  fast: { fangwei: 12, diedai: 3, fenbian: 64, tuFa: 6 },
  standard: { fangwei: 24, diedai: 4, fenbian: 96, tuFa: 8 },
  fine: { fangwei: 36, diedai: 5, fenbian: 128, tuFa: 10 },
};

const V_BUXING = 80; // 步行速度 米/分钟
const K_RAOLU = 1.25; // 路网绕行系数
const ALPHA = 0.6; // 各向异性权重

// 缓存键：目标点量化到 5 位小数（≈1m）
function juLiKey(d) {
  return `${d.lng.toFixed(5)},${d.lat.toFixed(5)}`;
}

// 一次算路（含缓存、退避、降级）
async function ceLiang(provider, zhongXin, dian, hc, xl) {
  const key = 'walk:' + juLiKey(dian);
  const cached = hc.get(key);
  if (cached) return cached;
  let res;
  try {
    res = await tuiBiChongShi(() => xl.run(() => provider.walkingRoute(zhongXin, dian)));
    if (!res || typeof res.durationSec !== 'number') throw new Error('bad route');
  } catch {
    res = ouJiGuJI(zhongXin, dian);
    res.degraded = true;
  }
  hc.set(key, res);
  return res;
}

// 从路线折线派生中间锚点：按累计路程比例估计耗时（零额外请求），
// 给 IDW 内层等值线提供真实耗时支撑（百度模式无路网时间场时的补偿手段）
function luXianMiaoDian(polyline, durationSec, fangWei, yangBen) {
  if (!polyline || polyline.length < 4 || !(durationSec > 0)) return;
  const d = [0];
  for (let i = 1; i < polyline.length; i++) {
    d.push(d[i - 1] + liangDianJuLi(polyline[i - 1], polyline[i]));
  }
  const zong = d[d.length - 1];
  if (!(zong > 0)) return;
  for (const bei of [0.3, 0.55, 0.8]) {
    const miaoBiao = zong * bei;
    let i = 1;
    while (i < d.length && d[i] < miaoBiao) i++;
    if (i >= d.length) break;
    const p = polyline[i];
    yangBen.push({ lng: p.lng, lat: p.lat, t: durationSec * bei, fangWei });
  }
}

// 单方位边界搜索：割线法为主，越界/发散退二分
async function qiuBianJie(provider, zhongXin, fangWei, T, cfg, hc, xl, yangBen) {
  const r0 = (V_BUXING * (T / 60)) / K_RAOLU;
  let lo = 0.25 * r0;
  let hi = 2.2 * r0;
  let rA = lo;
  const pA = tuiSuanDian(zhongXin, fangWei, rA);
  const rAres = await ceLiang(provider, zhongXin, pA, hc, xl);
  let tA = rAres.durationSec;
  let rB = hi;
  const pB = tuiSuanDian(zhongXin, fangWei, rB);
  const rBres = await ceLiang(provider, zhongXin, pB, hc, xl);
  let tB = rBres.durationSec;

  // 记录采样（零成本复用），同时保留路线用于路网吸附
  yangBen.push({
    lng: pA.lng,
    lat: pA.lat,
    t: tA,
    fangWei,
    polyline: rAres.polyline,
  });
  yangBen.push({
    lng: pB.lng,
    lat: pB.lat,
    t: tB,
    fangWei,
    polyline: rBres.polyline,
  });
  // 沿真实路线折线派生内层锚点（按路程比例估计耗时），改善 IDW 近中心失真
  luXianMiaoDian(rAres.polyline, tA, fangWei, yangBen);
  luXianMiaoDian(rBres.polyline, tB, fangWei, yangBen);

  // 立即被阻隔
  if (tA > T) {
    const d = tuiSuanDian(zhongXin, fangWei, lo);
    return { r: lo, blocked: true, dian: d, t: tA };
  }
  // 该方向极通畅：扩展上界直到耗时超过 T
  let guard = 0;
  while (tB < T && guard < 4) {
    hi = hi * 1.5;
    rB = hi;
    const pB2 = tuiSuanDian(zhongXin, fangWei, rB);
    const rBres2 = await ceLiang(provider, zhongXin, pB2, hc, xl);
    tB = rBres2.durationSec;
    yangBen.push({ lng: pB2.lng, lat: pB2.lat, t: tB, fangWei, polyline: rBres2.polyline });
    guard++;
  }

  let r = (rA + rB) / 2;
  for (let i = 0; i < cfg.diedai; i++) {
    // 割线估计
    const rC = rB - (tB - T) * ((rB - rA) / (tB - tA || 1e-6));
    const rClamp = Math.max(rA, Math.min(rB, rC));
    const pC = tuiSuanDian(zhongXin, fangWei, rClamp);
    const rCres = await ceLiang(provider, zhongXin, pC, hc, xl);
    const tc = rCres.durationSec;
    yangBen.push({
      lng: pC.lng,
      lat: pC.lat,
      t: tc,
      fangWei,
      polyline: rCres.polyline,
    });
    if (Math.abs(tc - T) < 45 || Math.abs(rClamp - r) < 40) {
      r = rClamp;
      break;
    }
    // 更新括号：保持 rA<rB 且 tA<T<tB
    if (tc < T) {
      rA = rClamp;
      tA = tc;
    } else {
      rB = rClamp;
      tB = tc;
    }
    r = rClamp;
  }
  return { r, blocked: false, dian: tuiSuanDian(zhongXin, fangWei, r), t: T };
}

// 各向异性 IDW 插值：在网格点上求耗时场
// 优化：用栅格索引只取最近 12 个样本，从 O(N) 降到 O(k)，整体从 O(N·G²) 降到 O(G²)
function gouJianChang(yangBen, zhongXin) {
  const yangBenDian = yangBen.map((s) => ({ lng: s.lng, lat: s.lat }));
  const wangGe = chuangJianWangGe(yangBenDian, 150);
  return function (p) {
    const linJin = wangGe.zaiBanJingNei(p, 1200);
    // 若附近无样本（理论上不会），回退到全量
    const yuan = linJin.length ? linJin.map((it) => yangBen[it.i]) : yangBen;
    const thetaP = fangWeiJiao(zhongXin, p);
    let num = 0;
    let den = 0;
    let zuiJin = Infinity;
    for (const s of yuan) {
      const d = pingMianJuLi({ lng: s.lng, lat: s.lat }, p, zhongXin.lat) + 1e-3;
      if (d < zuiJin) zuiJin = d;
      const w = 1 / (d * d * (1 + ALPHA * fangWeiCha(s.fangWei, thetaP)));
      num += w * s.t;
      den += w;
    }
    // 远离所有样本时外推会失真，直接给最大目标时长的 1.2 倍作为“不可达”标记
    if (!den) return Infinity;
    if (zuiJin > 800) return Math.max(num / den, 1200);
    return num / den;
  };
}

// Marching Squares：在 t 场提取等值线（返回若干闭合折线）
function marchingSquares(field, G, x0, y0, dx, dy, level) {
  const at = (i, j) => field[j * G + i];
  const segs = [];
  const pt = (i, j, vA, vB, axis) => {
    // axis='x' 在水平边，'y' 在垂直边；线性插值求交点
    const t = (level - vA) / (vB - vA || 1e-6);
    if (axis === 'x') return { x: i + t, y: j };
    return { x: i, y: j + t };
  };
  for (let j = 0; j < G - 1; j++) {
    for (let i = 0; i < G - 1; i++) {
      const tl = at(i, j);
      const tr = at(i + 1, j);
      const br = at(i + 1, j + 1);
      const bl = at(i, j + 1);
      let code = 0;
      if (tl > level) code |= 8;
      if (tr > level) code |= 4;
      if (br > level) code |= 2;
      if (bl > level) code |= 1;
      if (code === 0 || code === 15) continue;
      const top = pt(i, j, tl, tr, 'x');
      const right = pt(i + 1, j, tr, br, 'y');
      const bottom = pt(i, j + 1, bl, br, 'x');
      const left = pt(i, j, tl, bl, 'y');
      const push = (a, b) => segs.push([a, b]);
      switch (code) {
        case 1:
        case 14:
          push(left, bottom);
          break;
        case 2:
        case 13:
          push(bottom, right);
          break;
        case 3:
        case 12:
          push(left, right);
          break;
        case 4:
        case 11:
          push(top, right);
          break;
        case 5:
          push(left, top);
          push(bottom, right);
          break;
        case 6:
        case 9:
          push(top, bottom);
          break;
        case 7:
        case 8:
          push(left, top);
          break;
        case 10:
          push(left, bottom);
          push(top, right);
          break;
        default:
          break;
      }
    }
  }
  return lianJieXianDuan(segs, G, x0, y0, dx, dy);
}

// 把小线段连接成闭合折线
function lianJieXianDuan(segs, G, x0, y0, dx, dy) {
  const key = (p) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)}`;
  const map = new Map();
  for (const [a, b] of segs) {
    if (!map.has(key(a))) map.set(key(a), []);
    if (!map.has(key(b))) map.set(key(b), []);
    map.get(key(a)).push(b);
    map.get(key(b)).push(a);
  }
  const used = new Set();
  const rings = [];
  for (const k of map.keys()) {
    if (used.has(k)) continue;
    const ring = [];
    let cur = k;
    let guard = 0;
    while (cur && !used.has(cur) && guard < 100000) {
      used.add(cur);
      // 键存的是「格坐标×1000」（毫格精度哈希），还原时必须除回 1000，否则顶点经纬度被放大千倍
      const [ix, iy] = cur.split(',').map(Number);
      ring.push({ lng: x0 + (ix / 1000) * dx, lat: y0 + (iy / 1000) * dy });
      const nxt = map.get(cur).find((e) => key(e) !== cur && !used.has(key(e)));
      cur = nxt ? key(nxt) : null;
      guard++;
    }
    if (ring.length > 3) rings.push(ring);
  }
  return rings;
}

// 路网吸附：等值线顶点 80m 内吸附到采样路网
// 先用栅格索引把 O(R·L·P) 降到 O(R·k)，k 为 80m 邻域内顶点数
function luWangXiFu(rings, luXian) {
  if (!luXian.length) return rings;
  const suoYouDian = [];
  for (const line of luXian) {
    for (const q of line) suoYouDian.push(q);
  }
  if (!suoYouDian.length) return rings;
  const wangGe = chuangJianWangGe(suoYouDian, 80);
  return rings.map((ring) =>
    ring.map((p) => {
      const linJin = wangGe.zaiBanJingNei(p, 80);
      if (!linJin.length) return p;
      let best = null;
      let bestD = Infinity;
      for (const it of linJin) {
        const d = pingMianJuLi(p, it.p, p.lat);
        if (d < bestD) {
          bestD = d;
          best = it.p;
        }
      }
      return best || p;
    })
  );
}

// 主入口：生成等时圈
export async function shengChengDengshiquan(provider, canShu, opt = {}) {
  const { zhongXin, mubiaoMiao = 900 } = canShu;
  const dangwei = canShu.dangwei || 'standard';
  const cfg = MI_DU[dangwei] || MI_DU.standard;
  const hc = opt.huanCun;
  const xl = opt.xianliu || { run: (f) => f() };

  const yangBen = [{ lng: zhongXin.lng, lat: zhongXin.lat, t: 0, fangWei: 0 }];
  const luXian = [];
  const bianJie = [];
  const geshe = [];

  for (let i = 0; i < cfg.fangwei; i++) {
    const fw = (360 / cfg.fangwei) * i;
    const r = await qiuBianJie(provider, zhongXin, fw, mubiaoMiao, cfg, hc, xl, yangBen);
    bianJie.push({ fangWei: fw, r: r.r, blocked: r.blocked });
    if (r.blocked) geshe.push({ fangWei: fw, leixing: 'jukuaisai/zugai' });
    if (opt.jinDu) opt.jinDu((i + 1) / cfg.fangwei, 'caiyang');
  }

  // 构造插值场
  const rMax = 2.2 * ((V_BUXING * (mubiaoMiao / 60)) / K_RAOLU);
  const G = cfg.fenbian;
  const box = waiBaoJuXing([
    ...yangBen.map((s) => ({ lng: s.lng, lat: s.lat })),
    zhongXin,
  ]);
  const latMid = (box.minLat + box.maxLat) / 2;
  const halfLng = rMax / (111320 * Math.cos((latMid * Math.PI) / 180));
  const halfLat = rMax / 110540;
  const x0 = zhongXin.lng - halfLng;
  const y0 = zhongXin.lat - halfLat;
  const dx = (2 * halfLng) / (G - 1);
  const dy = (2 * halfLat) / (G - 1);

  // 收集采样路线（若 provider 返回 polyline 则并入路网），必须在路网吸附前完成
  for (const s of yangBen) {
    if (s.polyline) luXian.push(s.polyline);
  }

  const chang = gouJianChang(yangBen, zhongXin);
  // 优先使用路网时间场（OSM 模式提供）：内层 300/600 秒等值线严格精确；
  // 无时间场的数据源（百度模式）退回 IDW 插值场（已由折线锚点改善近中心失真）
  let shiJian = null;
  if (typeof provider.shiJianChang === 'function') {
    try {
      shiJian = await provider.shiJianChang(zhongXin, mubiaoMiao);
    } catch {
      shiJian = null;
    }
  }
  const field = new Array(G * G);
  const buKeDaMiao = mubiaoMiao * 2; // 不可达哨兵值：必须为有限数，否则等值线插值产生 NaN
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      const p = { lng: x0 + i * dx, lat: y0 + j * dy };
      const v = shiJian ? shiJian.qu(p) : chang(p);
      field[j * G + i] = Number.isFinite(v) ? v : buKeDaMiao;
    }
  }

  const ceng = [];
  for (const miao of [300, 600, mubiaoMiao]) {
    let rings = marchingSquares(field, G, x0, y0, dx, dy, miao);
    rings = rings.map((r) => pingHuaXian(r, 2));
    rings = luWangXiFu(rings, luXian);
    if (rings.length) ceng.push({ miao, polygon: rings });
  }

  return {
    ceng,
    yangBenDian: yangBen.filter((s) => s.t > 0),
    luXian,
    geshe,
    rMax,
    miDu: dangwei,
  };
}

export { MI_DU };
