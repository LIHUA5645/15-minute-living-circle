// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 真实路网适配器：街道与设施取自 OpenStreetMap（Overpass），步行可达范围由本地 Dijkstra 计算
// 特点：数据真实、不调用百度 API、零百度配额；等时圈沿真实道路生成而不再是估算的圆形
// 稳定性：多服务节点 + 指数退避重试 + localStorage 缓存（首次成功后可离线复用）
import { liangDianJuLi } from '../core/geo/jichu.js';
import { FENLEI_GUANJIANCI } from '../core/types.js';
import {
  gouJianTu,
  zuiJinJieDian,
  dengShiChang,
  luJing,
  MO_REN_BAN_JING
} from '../core/osmluwang.js';

// Overpass 服务（多节点容灾，任一可用即可；按实测可用性排序）
const FUWUQI = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];

// 道路按负载拆成三组分别请求：主干道一组负载最重，步行道半径适当收窄，避免单次查询过大被网关超时
const LUWANG_FEN_ZU = [
  { re: 'residential|service|unclassified|road', k: 1 },
  { re: 'tertiary|tertiary_link|secondary|secondary_link|primary|primary_link', k: 1 },
  { re: 'footway|path|pedestrian|steps|corridor|cycleway|living_street|track', k: 0.8 }
];

const CACHE_QIAN = 'osmcache_v1_';
// localStorage 配额守护：路网响应单条可达数 MB，无限制缓存会挤爆 localStorage，
// 导致百度 SDK 写 SECKEY_ABVK 等键时抛 QuotaExceededError、地图脚本中断。
const DAN_TIAO_SHANG_XIAN = 1200000; // 单条缓存上限（字符数）
const ZONG_YU_SUAN = 3000000; // OSM 缓存总量预算（字符数），超限按最旧优先清理

// 启动自检：OSM 缓存总量超出预算时逐条清理（Object.keys 对字符串键按插入序返回，近似最旧优先）
(function huanCunZiJian() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_QIAN));
    let zong = keys.reduce((s, k) => s + (localStorage.getItem(k) || '').length, 0);
    for (const k of keys) {
      if (zong <= ZONG_YU_SUAN) break;
      zong -= (localStorage.getItem(k) || '').length;
      localStorage.removeItem(k);
    }
  } catch {
    /* 忽略 */
  }
})();

function huanCunQu(key) {
  try {
    const s = localStorage.getItem(CACHE_QIAN + key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
function huanCunCun(key, val) {
  let s;
  try {
    s = JSON.stringify(val);
  } catch {
    return; // 序列化失败（循环引用等）放弃缓存
  }
  if (s.length > DAN_TIAO_SHANG_XIAN) return; // 超大响应直接不缓存，宁可下次重取也不挤爆配额
  try {
    localStorage.setItem(CACHE_QIAN + key, s);
  } catch {
    // 存储配额已满：清掉一半旧 OSM 缓存再试，避免挤占百度 SDK 的 localStorage 键
    try {
      const jiu = Object.keys(localStorage).filter(k => k.startsWith(CACHE_QIAN));
      jiu.slice(0, Math.ceil(jiu.length / 2)).forEach(k => localStorage.removeItem(k));
      localStorage.setItem(CACHE_QIAN + key, s);
    } catch {
      /* 仍失败则放弃本次缓存 */
    }
  }
}
function zhaiYao(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// 带重试与缓存的 Overpass 查询（429/504 时轮换节点并指数退避）
async function chaXun(ql, ciShu = 4) {
  const key = zhaiYao(ql);
  const hit = huanCunQu(key);
  if (hit && Array.isArray(hit)) return hit;

  let lastErr = null;
  for (let i = 0; i < ciShu; i++) {
    for (const host of FUWUQI) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 90000);
        const r = await fetch(`${host}?data=${encodeURIComponent(ql)}`, { signal: ctl.signal });
        clearTimeout(timer);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (j && Array.isArray(j.elements)) {
          huanCunCun(key, j.elements);
          return j.elements;
        }
        throw new Error('返回格式异常');
      } catch (e) {
        lastErr = e;
      }
    }
    // 退避：3s / 6s / 9s / 12s，给平台限流窗口留出恢复时间
    await new Promise(res => setTimeout(res, 3000 * (i + 1)));
  }
  throw lastErr || new Error('Overpass 不可用');
}

// OSM 标签 → 业务分类 + 中文名（中文名用于清洗阶段的关键字归并）
const POI_GUIZE = [
  { fenlei: 'yiliao', ming: '医院', pan: t => t.amenity === 'hospital' },
  { fenlei: 'yiliao', ming: '诊所', pan: t => t.amenity === 'clinic' || t.amenity === 'doctors' },
  {
    fenlei: 'yiliao',
    ming: '药店',
    pan: t => t.amenity === 'pharmacy' || t.healthcare === 'pharmacy'
  },
  { fenlei: 'jiaoyu', ming: '小学', pan: t => t.amenity === 'school' },
  { fenlei: 'jiaoyu', ming: '幼儿园', pan: t => t.amenity === 'kindergarten' },
  { fenlei: 'gouwu', ming: '菜市场', pan: t => t.amenity === 'marketplace' },
  {
    fenlei: 'gouwu',
    ming: '超市',
    pan: t => ['supermarket', 'greengrocer', 'convenience', 'mall', 'general'].includes(t.shop)
  },
  {
    fenlei: 'yanglao',
    ming: '养老院',
    pan: t =>
      ['nursing_home', 'retirement_home'].includes(t.amenity) || t.amenity === 'social_facility'
  },
  {
    fenlei: 'jiaotong',
    ming: '公交站',
    pan: t => t.highway === 'bus_stop' || t.amenity === 'bus_station'
  },
  {
    fenlei: 'jiaotong',
    ming: '地铁站',
    pan: t => t.railway === 'station' || t.railway === 'subway_entrance'
  },
  { fenlei: 'jiaotong', ming: '停车场', pan: t => t.amenity === 'parking' },
  { fenlei: 'xiuxian', ming: '公园', pan: t => t.leisure === 'park' || t.leisure === 'garden' },
  { fenlei: 'xiuxian', ming: '广场', pan: t => t.place === 'square' },
  {
    fenlei: 'xiuxian',
    ming: '健身',
    pan: t => ['fitness_centre', 'sports_centre', 'pitch', 'playground'].includes(t.leisure)
  },
  {
    fenlei: 'xiuxian',
    ming: '文化',
    pan: t => ['library', 'arts_centre', 'theatre', 'museum'].includes(t.amenity)
  }
];

function piPei(tags = {}) {
  for (const g of POI_GUIZE) {
    try {
      if (g.pan(tags)) return g;
    } catch {
      /* 忽略异常标签 */
    }
  }
  return null;
}

function hanYouGuanJianCi(name, fenlei) {
  return (FENLEI_GUANJIANCI[fenlei] || []).some(kw => name.includes(kw));
}

function zhuanPoi(e) {
  const lat = e.lat != null ? e.lat : e.center && e.center.lat;
  const lon = e.lon != null ? e.lon : e.center && e.center.lon;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  const tags = e.tags || {};
  const g = piPei(tags);
  if (!g) return null;
  const yuan = (tags.name || '').trim();
  const ming = hanYouGuanJianCi(yuan, g.fenlei) ? yuan : yuan ? `${yuan}（${g.ming}）` : g.ming;
  return {
    uid: `${e.type}_${e.id}`,
    name: ming,
    lng: lon,
    lat,
    type: g.fenlei,
    address: [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join('') || 'OSM'
  };
}

// POI 查询拆成 2 条较轻的语句，降低单次请求被网关超时拦截的概率
function poiYuJu(center, R) {
  return [
    `[out:json][timeout:50];node["amenity"~"^(hospital|clinic|doctors|pharmacy|school|kindergarten|marketplace|bus_station|parking|nursing_home|retirement_home|library|arts_centre|theatre|museum|social_facility)$"](around:${R},${center.lat},${center.lng});out center;`,
    `[out:json][timeout:50];(
node["healthcare"="pharmacy"](around:${R},${center.lat},${center.lng});
node["shop"~"^(supermarket|greengrocer|convenience|mall|general)$"](around:${R},${center.lat},${center.lng});
node["highway"="bus_stop"](around:${R},${center.lat},${center.lng});
node["railway"~"^(station|subway_entrance)$"](around:${R},${center.lat},${center.lng});
node["leisure"~"^(park|garden|fitness_centre|sports_centre|pitch|playground)$"](around:${R},${center.lat},${center.lng});
node["place"="square"](around:${R},${center.lat},${center.lng});
);out center;`
  ];
}

export function chuangJianOsm(opt = {}) {
  const banJing = opt.banJingMi || MO_REN_BAN_JING;
  let tu = null;
  let tuKey = '';
  const changCache = new Map();
  let poiHuanCun = null; // { key, list }
  let benDi = null; // 预下载到本地的真实数据（public/osm/osm_<经度>_<纬度>.json）

  // 优先读取预下载数据：用 scripts/xiazai-luwang.mjs 按坐标生成，可完全离线运行
  async function huoBenDi(zx) {
    if (benDi !== null) return benDi;
    try {
      const r = await fetch(`osm/osm_${zx.lng.toFixed(3)}_${zx.lat.toFixed(3)}.json`);
      if (!r.ok) return (benDi = false);
      const j = await r.json();
      benDi = j && Array.isArray(j.luWang) ? j : false;
    } catch {
      benDi = false;
    }
    return benDi;
  }

  async function huoTu(zx) {
    const k = `${zx.lng.toFixed(3)},${zx.lat.toFixed(3)}`;
    if (tu && k === tuKey) return tu;
    const b = await huoBenDi(zx);
    let elements = [];
    if (b && b.luWang) {
      elements = b.luWang;
    } else {
      // 分组请求，单组失败不影响其他组；全部失败则明确抛错（不再静默用直线估算冒充真实结果）
      for (const z of LUWANG_FEN_ZU) {
        const R = Math.round(banJing * z.k);
        const ql = `[out:json][timeout:50];way["highway"~"^(${z.re})$"](around:${R},${zx.lat},${zx.lng});out geom;`;
        try {
          elements = elements.concat(await chaXun(ql));
        } catch {
          /* 该组失败继续下一组 */
        }
      }
    }
    if (!elements.length) throw new Error('真实路网获取失败（Overpass 限流或无数据）');
    tu = gouJianTu(elements);
    if (!tu.nodes.size) throw new Error('路网解析为空，请稍后重试');
    tuKey = k;
    changCache.clear();
    return tu;
  }

  async function huoChang(zx, maxSec) {
    const t = await huoTu(zx);
    const k = `${zx.lng.toFixed(4)},${zx.lat.toFixed(4)}:${maxSec}`;
    if (changCache.has(k)) return { t, chang: changCache.get(k) };
    const { id } = zuiJinJieDian(t, zx);
    const chang = dengShiChang(t, id, maxSec);
    changCache.set(k, chang);
    return { t, chang };
  }

  return {
    // 路网统计信息（供界面展示真实数据规模）
    async luWangXinXi() {
      if (!tu) return null;
      return {
        jieDianShu: tu.nodes.size,
        luDuanShu: tu.bianShu,
        daoLuShu: tu.wayShu,
        banJingMi: banJing
      };
    },

    // 路网时间场访问：供等时圈直接从 Dijkstra 时间场取值（内层 300/600 秒等值线严格精确）
    // 返回 qu(点) => 该点步行耗时（秒）；不可达返回 Infinity
    async shiJianChang(zx, zuiDaMiao) {
      const { t, chang } = await huoChang(zx, Math.max(3600, zuiDaMiao * 4));
      // 预投影到以中心为原点的平面米制坐标，近邻查询从 O(球面三角) 降为 O(平面欧氏)
      const kx = 111320 * Math.cos((zx.lat * Math.PI) / 180);
      const jieDian2 = [];
      for (const [id, n] of t.nodes) {
        jieDian2.push({ id, x: (n.lon - zx.lng) * kx, y: (n.lat - zx.lat) * 110540 });
      }
      const zhongXinJie = zuiJinJieDian(t, zx);
      const zhongXinJieBo = ((zhongXinJie.juLi || 0) / 80) * 60; // 中心到其最近路网节点的接驳耗时
      return {
        qu(p) {
          const px = (p.lng - zx.lng) * kx;
          const py = (p.lat - zx.lat) * 110540;
          let best = null;
          let bestD = Infinity;
          for (const n of jieDian2) {
            const dx = n.x - px;
            const dy = n.y - py;
            const d = dx * dx + dy * dy;
            if (d < bestD) {
              bestD = d;
              best = n;
            }
          }
          if (!best || !chang.time.has(best.id)) return Infinity;
          return chang.time.get(best.id) + (Math.sqrt(bestD) / 80) * 60 + zhongXinJieBo;
        }
      };
    },

    // 真实步行算路：单次 Dijkstra 等时场 + 首尾接驳
    // 路网不可用时直接抛错，由上层提示重试，绝不用直线距离冒充真实路网结果
    async walkingRoute(origin, dest) {
      const maxSec = 3600;
      const { t, chang } = await huoChang(origin, maxSec);
      const { id: zid, juLi: d2 } = zuiJinJieDian(t, dest);
      const { id: qid, juLi: d1 } = zuiJinJieDian(t, origin);
      // 首尾「最后一公里」接驳：从实际点到最近路网节点的直线步行耗时
      const jieBoMiao = (((d1 || 0) + (d2 || 0)) / 80) * 60;
      if (zid == null || qid == null || !chang.time.has(zid)) {
        // 该点在路网覆盖范围外（或与中心不连通）：按最远耗时返回，使等时圈边界收敛在真实可达范围内
        const m = liangDianJuLi(origin, dest);
        return { durationSec: maxSec, distanceM: m, polyline: [origin, dest] };
      }
      const zheng = chang.time.get(zid) - (chang.time.get(qid) || 0);
      const polyline = [origin, ...luJing(t, chang, zid), dest];
      return {
        durationSec: zheng + jieBoMiao,
        distanceM: (chang.dist.get(zid) || 0) + (d1 || 0) + (d2 || 0),
        polyline
      };
    },

    // 批量矩阵：每个起点一次 Dijkstra（真实路网耗时）
    async routeMatrix(origins, dests) {
      try {
        const rows = [];
        for (const o of origins || []) {
          const { t, chang } = await huoChang(o, 3600);
          const row = [];
          for (const d of dests || []) {
            const { id, juLi } = zuiJinJieDian(t, d);
            if (id == null || !chang.time.has(id)) {
              const m = liangDianJuLi(o, d) * 1.35;
              row.push({ durationSec: (m / 80) * 60, distanceM: m });
            } else {
              row.push({
                durationSec: chang.time.get(id) + (juLi / 80) * 60,
                distanceM: (chang.dist.get(id) || 0) + juLi
              });
            }
          }
          rows.push(row);
        }
        return rows;
      } catch {
        return null; // 交给上层降级
      }
    },

    // 真实设施检索（OSM 标签 → 六类）
    async searchPoi(center, keywords, radiusMi) {
      const k = `${center.lng.toFixed(3)},${center.lat.toFixed(3)}:${radiusMi || banJing}`;
      if (!poiHuanCun || poiHuanCun.key !== k) {
        const R = radiusMi || banJing;
        const list = [];
        const b = await huoBenDi(center);
        if (b && Array.isArray(b.poi)) {
          for (const e of b.poi) {
            const p = zhuanPoi(e);
            if (p) list.push(p);
          }
        } else {
          for (const ql of poiYuJu(center, R)) {
            try {
              for (const e of await chaXun(ql)) {
                const p = zhuanPoi(e);
                if (p) list.push(p);
              }
            } catch {
              /* 单条失败不阻断整体 */
            }
          }
        }
        poiHuanCun = { key: k, list };
      }
      // 按调用方请求的关键词筛出对应维度
      const muBiao = Object.keys(FENLEI_GUANJIANCI).find(f =>
        (FENLEI_GUANJIANCI[f] || []).some(kw => (keywords || []).includes(kw))
      );
      return muBiao ? poiHuanCun.list.filter(p => p.type === muBiao) : poiHuanCun.list;
    },

    // 逆地理：离线取居住属性兜底（不调用任何 API）
    async reverseGeocode() {
      return { address: 'OSM 路网', aoi: 'residential', poiType: 'residential' };
    }
  };
}
