// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 真实路网引擎：基于 OpenStreetMap 街道数据构建图，并做 Dijkstra 最短路 / 等时场计算
// 纯 JS，无第三方依赖；步行速度默认 80 米/分钟，可按道路类型微调
import { liangDianJuLi } from './geo/jichu.js';

// 可步行道路类型
const KE_ZOUXING = new Set([
  'footway',
  'path',
  'residential',
  'service',
  'pedestrian',
  'living_street',
  'steps',
  'track',
  'unclassified',
  'tertiary',
  'tertiary_link',
  'secondary',
  'secondary_link',
  'primary',
  'primary_link',
  'cycleway',
  'corridor',
  'road'
]);
// 禁止步行（高速/快速路）
const JIN_ZHI = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link']);
// 特殊类型步行速度（米/分钟）
const SUDU = { steps: 50, track: 60, path: 65, footway: 75, pedestrian: 75 };
const V_MOREN = 80; // 米/分钟

export const MO_REN_BAN_JING = 1500;

// 二叉最小堆
class Dui {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(id, k) {
    this.a.push({ id, k });
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.a[p].k <= this.a[i].k) break;
      const t = this.a[p];
      this.a[p] = this.a[i];
      this.a[i] = t;
      i = p;
    }
  }
  pop() {
    const top = this.a[0];
    const last = this.a.pop();
    if (this.a.length) {
      this.a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < this.a.length && this.a[l].k < this.a[s].k) s = l;
        if (r < this.a.length && this.a[r].k < this.a[s].k) s = r;
        if (s === i) break;
        const t = this.a[s];
        this.a[s] = this.a[i];
        this.a[i] = t;
        i = s;
      }
    }
    return top;
  }
}

// 由 Overpass 返回元素构建无向图（步行视为双向通行）
export function gouJianTu(elements) {
  const nodes = new Map(); // nodeId -> {lat, lon}
  const lin = new Map(); // nodeId -> [{to, sec, m}]
  let wayShu = 0;
  let bianShu = 0;

  function jiaBian(a, b, sec, m) {
    if (!lin.has(a)) lin.set(a, []);
    if (!lin.has(b)) lin.set(b, []);
    lin.get(a).push({ to: b, sec, m });
    lin.get(b).push({ to: a, sec, m });
    bianShu++;
  }

  for (const e of elements || []) {
    if (!e || e.type !== 'way') continue;
    const t = e.tags || {};
    const hw = t.highway;
    if (!hw || JIN_ZHI.has(hw)) continue;
    if (t.foot === 'no' || t.access === 'private') continue;
    if (!KE_ZOUXING.has(hw) && t.foot !== 'yes') continue;
    wayShu++;
    const v = SUDU[hw] || V_MOREN;
    const ids = e.nodes || [];
    const geo = e.geometry || [];
    for (let i = 0; i < ids.length && i < geo.length; i++) {
      if (geo[i] && typeof geo[i].lat === 'number')
        nodes.set(ids[i], { lat: geo[i].lat, lon: geo[i].lon });
    }
    for (let i = 0; i + 1 < ids.length && i + 1 < geo.length; i++) {
      const A = nodes.get(ids[i]);
      const B = nodes.get(ids[i + 1]);
      if (!A || !B) continue;
      const m = liangDianJuLi({ lng: A.lon, lat: A.lat }, { lng: B.lon, lat: B.lat });
      if (!(m > 0) || m > 800) continue; // 异常长边（数据缺节点）跳过
      jiaBian(ids[i], ids[i + 1], (m / v) * 60, m);
    }
  }
  return { nodes, lin, wayShu, bianShu };
}

// 距离点 p 最近的图节点 id
export function zuiJinJieDian(tu, p) {
  let best = null;
  let bestD = Infinity;
  for (const [id, n] of tu.nodes) {
    const d = liangDianJuLi({ lng: n.lon, lat: n.lat }, p);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return { id: best, juLi: bestD };
}

// 从起点扩散的等时场（Dijkstra，限时 maxSec 秒）
export function dengShiChang(tu, qiId, maxSec = 3600) {
  const time = new Map();
  const dist = new Map();
  const prev = new Map();
  const dui = new Dui();
  time.set(qiId, 0);
  dist.set(qiId, 0);
  dui.push(qiId, 0);
  while (dui.size) {
    const { id, k } = dui.pop();
    if (k > (time.has(id) ? time.get(id) : Infinity)) continue;
    const list = tu.lin.get(id) || [];
    for (const e of list) {
      const nk = k + e.sec;
      if (nk > maxSec) continue;
      const old = time.has(e.to) ? time.get(e.to) : Infinity;
      if (nk < old) {
        time.set(e.to, nk);
        dist.set(e.to, (dist.get(id) || 0) + e.m);
        prev.set(e.to, id);
        dui.push(e.to, nk);
      }
    }
  }
  return { time, dist, prev, qi: qiId, maxSec };
}

// 由等时场回溯出路径折线
export function luJing(tu, chang, zhongId) {
  const out = [];
  let cur = zhongId;
  let guard = 0;
  while (cur != null && guard++ < 50000) {
    const n = tu.nodes.get(cur);
    if (!n) break;
    out.unshift({ lng: n.lon, lat: n.lat });
    if (cur === chang.qi) break;
    cur = chang.prev.get(cur);
  }
  return out;
}
