// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 水域数据适配器：从 OpenStreetMap（Overpass）取中心点周边的江河湖泊水面多边形，
// 供等时圈生成时做「水面不可达」掩膜，这样 15 分钟圈不会横跨江面画过去。
// 复用车联网那套查询（多节点容灾 + 重试 + localStorage 缓存），同一片区域第二次跑不再联网；
// 整体失败或超时就返回空对象，上层照常出图（只是这一轮不做水面避让）
import { chaXun } from './osm.js';

const MO_REN_BAN_JING = 2600; // 查询半径：比 15 分钟步行圈（约 1.2 公里）留一倍富余
const MO_REN_CHAO_SHI = 20000; // 超过这个时间就先不等了（后台请求继续，成功后仍会写进缓存）

// 只有中心线、没有河岸面的河，按类型给个默认半宽（米）兜底；
// 有 width 标签就按标注宽度来。宁可窄一点也别糊住岸边陆地
const BAN_KUAN_MI = { river: 45, canal: 22, stream: 10, ditch: 6, drain: 6 };

// Overpass 的 geometry（[{lat, lon}]）→ 内部统一的多边形（[{lng, lat}]，首尾闭合）
function huanBi(g) {
  const p = (g || []).map(x => ({ lng: x.lon, lat: x.lat }));
  if (p.length < 3) return null;
  const a = p[0];
  const b = p[p.length - 1];
  if (a.lng !== b.lng || a.lat !== b.lat) p.push({ lng: a.lng, lat: a.lat });
  return p;
}

// 线状水系 → 窄带状多边形：沿中心线两侧各偏半个河宽，首尾一封就是一条「河带」。
// 为什么需要它：OSM 里不少河只画了中心线（桂林的桃花江就是这样），
// 光靠 natural=water 面拿不到掩膜，圈照样会横跨过去
function xianZhuanDai(dianLie, banKuanMi) {
  if (!dianLie || dianLie.length < 2) return null;
  const latC = dianLie[0].lat;
  const kx = 111320 * Math.cos((latC * Math.PI) / 180); // 每度经度多少米
  const ky = 110540; // 每度纬度多少米
  const zuo = [];
  const you = [];
  for (let i = 0; i < dianLie.length; i++) {
    const a = dianLie[Math.max(0, i - 1)];
    const b = dianLie[Math.min(dianLie.length - 1, i + 1)];
    let tx = (b.lng - a.lng) * kx;
    let ty = (b.lat - a.lat) * ky;
    const L = Math.hypot(tx, ty) || 1;
    tx /= L;
    ty /= L;
    const nx = -ty; // 法线
    const ny = tx;
    const p = dianLie[i];
    zuo.push({ lng: p.lng + (nx * banKuanMi) / kx, lat: p.lat + (ny * banKuanMi) / ky });
    you.push({ lng: p.lng - (nx * banKuanMi) / kx, lat: p.lat - (ny * banKuanMi) / ky });
  }
  const huan = zuo.concat(you.reverse());
  huan.push({ lng: huan[0].lng, lat: huan[0].lat });
  return huan;
}

function banKuan(el) {
  const t = el.tags || {};
  const w = Number(t.width);
  if (Number.isFinite(w) && w > 0) return Math.min(300, w / 2);
  return BAN_KUAN_MI[t.waterway] || 12;
}

// 取水域：面（natural=water / waterway=riverbank）+ 线（river / canal / stream 等 → 河带），
// 湖泊有时是多边形关系（relation，多条 outer 拼成），一并收下。内环（岛中湖）不单独处理，
// 掩膜用途下这点误差可以接受。查询用外接矩形（bbox）而不是 around：后者在大范围查询时明显慢
async function huoShuiYu(zx, banJingMi, chaoShiMs) {
  // 本地预置优先：scripts/xiazai-luwang.mjs --jinShuiyu 1 会把水域存成
  // public/osm/shuiyu_<经度>_<纬度>.json（文件名按 0.01 度网格取整，约 1.1 公里一格；
  // 查询半径 2.6 公里足够覆盖格内任意中心点），演示现场就不必看 Overpass 的脸色。
  // 取整会正好差一格：砂子塘中心 112.9388 取两位是 112.94，而预置文件可能是 112.95。
  // 所以本格找不到就按 3×3 邻格兜（先正四方、再对角，按距离由近到远），跨一格仍在覆盖范围内
  const ji = Number(zx.lng.toFixed(2));
  const ja = Number(zx.lat.toFixed(2));
  const linJin = [
    [0, 0],
    [0.01, 0],
    [-0.01, 0],
    [0, 0.01],
    [0, -0.01],
    [0.01, 0.01],
    [-0.01, 0.01],
    [0.01, -0.01],
    [-0.01, -0.01]
  ];
  for (const [a, b] of linJin) {
    try {
      const r = await fetch(`osm/shuiyu_${(ji + a).toFixed(2)}_${(ja + b).toFixed(2)}.json`);
      if (!r.ok) continue;
      const j = await r.json();
      if (j && Array.isArray(j.duoBianXing) && j.duoBianXing.length)
        return { duoBianXing: j.duoBianXing, geShu: j.duoBianXing.length, benDi: true };
    } catch {
      /* 这个文件名没有预置（或 node 环境不支持相对路径 fetch）→ 试下一个 */
    }
  }
  const R = Math.round(banJingMi || MO_REN_BAN_JING);
  const dLat = R / 110540;
  const dLng = R / (111320 * Math.cos((zx.lat * Math.PI) / 180));
  const s = (zx.lat - dLat).toFixed(6);
  const w = (zx.lng - dLng).toFixed(6);
  const n = (zx.lat + dLat).toFixed(6);
  const e = (zx.lng + dLng).toFixed(6);
  const ql =
    `[out:json][timeout:30];` +
    `(way["natural"="water"](${s},${w},${n},${e});` +
    `way["waterway"="riverbank"](${s},${w},${n},${e});` +
    `way["waterway"~"^(river|canal|stream|ditch|drain)$"](${s},${w},${n},${e});` +
    `relation["natural"="water"](${s},${w},${n},${e}););` +
    `out geom;`;
  let elements = null;
  try {
    elements = await Promise.race([
      chaXun(ql, 3),
      new Promise((jie, ju) =>
        setTimeout(() => ju(new Error('水域查询超时')), chaoShiMs || MO_REN_CHAO_SHI)
      )
    ]);
  } catch {
    // 超时 / 全节点失败：这一轮不做避让，别把整个体检拖住
    return { duoBianXing: [], geShu: 0, cuo: true };
  }
  const duoBianXing = [];
  for (const el of elements || []) {
    if (el.type === 'way') {
      const t = el.tags || {};
      // 河带：只有中心线的水系（没有 waterway=riverbank 面）按宽度撑成带状
      if (t.waterway && t.waterway !== 'riverbank' && t.natural !== 'water') {
        const dai = xianZhuanDai(
          (el.geometry || []).map(x => ({ lng: x.lon, lat: x.lat })),
          banKuan(el)
        );
        if (dai) duoBianXing.push(dai);
        continue;
      }
      const h = huanBi(el.geometry);
      if (h) duoBianXing.push(h);
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      for (const m of el.members) {
        if (m.role && m.role !== 'outer') continue;
        const h = huanBi(m.geometry);
        if (h) duoBianXing.push(h);
      }
    }
  }
  return { duoBianXing, geShu: duoBianXing.length };
}

export { huoShuiYu, MO_REN_BAN_JING };
