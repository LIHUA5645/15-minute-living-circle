// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，07
// 周边地点适配器：从 OpenStreetMap（Overpass）取中心点周边 2.5 公里的街区 / 社区 / 村镇名。
// 为什么需要它：定位只给一个坐标，用户看不出「这是哪」；把周边地名列出来，点一下就能把体检中心挪过去
// （与 Web 端「定位周边推荐」同一份数据口径：同一批 place 类型、同半径）。
// 复用车联网那套查询器（多节点容灾 + 重试 + 缓存），整体失败返回空列表，上层只显示「当前位置」
import { chaXun } from './osm.js';

const MO_REN_BAN_JING = 2500; // 与 Web 端一致：2.5 公里内找地名
const ZUI_DUO = 6; // 最多给 6 个候选，横滑一行放得下
const PLACE_LEI = '^(neighbourhood|suburb|quarter|village|town|city_block)$';

// 平面近似距离（米）：只用来排序与显示「0.8km」，不需要大地线精度
function juLiMi(a, b) {
  const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
  const ky = 110540;
  return Math.hypot((b.lng - a.lng) * kx, (b.lat - a.lat) * ky);
}

// 取周边地名：返回 { lie: [{ming, lng, lat, juMi}], banJingMi }，失败时 lie 为空数组并带 cuo
async function huoZhouBian(zx, banJingMi) {
  const R = Math.round(banJingMi || MO_REN_BAN_JING);
  // 用 around 而不是外接矩形：只找地名（place 标签），量很小；
  // nwr 一次把 node/way/relation 都覆盖，街区常常画成 way 或 relation，只查 node 会漏一半
  const ql =
    `[out:json][timeout:25];` +
    `nwr["place"~"${PLACE_LEI}"](around:${R},${zx.lat},${zx.lng});` +
    `out center;`;
  let els = null;
  try {
    els = await chaXun(ql, 2);
  } catch {
    return { lie: [], banJingMi: R, cuo: true };
  }

  // 同名去重：OSM 里一个街区常有 node + way 两条（甚至带 place 标签的 relation），
  // 名字一样就只留离中心最近的那条，免得界面上出现两个「那窝」
  const kan = new Map();
  for (const el of els || []) {
    const t = el.tags || {};
    const ming = (t.name || '').trim();
    if (!ming) continue;
    const lat = el.lat != null ? el.lat : el.center && el.center.lat;
    const lng = el.lon != null ? el.lon : el.center && el.center.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const juMi = Math.round(juLiMi(zx, { lng, lat }));
    const jiu = kan.get(ming);
    if (!jiu || juMi < jiu.juMi) kan.set(ming, { ming, lng, lat, juMi });
  }

  const lie = [...kan.values()].sort((x, y) => x.juMi - y.juMi).slice(0, ZUI_DUO);
  return { lie, banJingMi: R };
}

export { huoZhouBian, MO_REN_BAN_JING, ZUI_DUO };
