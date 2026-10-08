// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 渲染前处理（纯函数、零平台 API）：把 report 变成小程序 <map> 需要的 polygons / circles / markers / polyline。
// 三个要点：
//   ① 坐标只在出口处 WGS-84 → GCJ-02（页面里不做换算）
//   ② 点数保形抽稀：setData 传大数组代价高，等时圈每环压到 180 点以内，拐点仍保留
//   ③ 设施散点用「小半径圆」而不是 marker 图标——零图标资源，颜色按维度区分，点哪一片都能命中
import { wgs84ZhuanGcj02, gcj02ZhuanWgs84 } from '../core/geo/zuobiao.js';
import { FENLEI_MING } from '../core/types.js';

export const MI_CAISE = { 300: '#3ddc97', 600: '#2f9bff', 900: '#ff6b6b' };
export const MI_OPA = { 300: 0.34, 600: 0.22, 900: 0.12 };
export const FENLEI_SE = {
  yiliao: '#ff6b6b',
  jiaoyu: '#ffd166',
  gouwu: '#3ddc97',
  yanglao: '#b18cff',
  jiaotong: '#2f9bff',
  xiuxian: '#e64980'
};

// 颜色 + 透明度 → 8 位十六进制（小程序 map 的 fillColor 认这种写法，省掉单独的 opacity 字段）
function touMing(se, opa) {
  const a = Math.round(Math.max(0, Math.min(1, Number(opa) || 0)) * 255)
    .toString(16)
    .padStart(2, '0');
  return se + a;
}

// 引擎点（{lng,lat} WGS-84）→ 地图点（{latitude,longitude} GCJ-02）
export function dian(p) {
  const g = wgs84ZhuanGcj02(p.lng, p.lat);
  return { latitude: g.lat, longitude: g.lng };
}

// 地图点（GCJ-02）→ 引擎点（WGS-84）：地图点击、定位、选点都用得到
export function dianHui(p) {
  const g = gcj02ZhuanWgs84(Number(p.longitude), Number(p.latitude));
  return { lng: g.lng, lat: g.lat };
}

// 两点平面距离（米），用于「点击位置最近的设施」
export function juLiMi(a, b) {
  const kx = 111320 * Math.cos((a.lat * Math.PI) / 180);
  const ky = 110540;
  return Math.hypot((a.lng - b.lng) * kx, (a.lat - b.lat) * ky);
}

// 保形抽稀：等步长取点 + 首尾必留 + 拐点（方向突变）必留。
// 等时圈被河道截断处正是尖角，只按步长抽会把「咬口」抹平，所以拐点单独找回
export function chouXi(dianLie, zuiDa = 180) {
  const lie = dianLie || [];
  const n = lie.length;
  if (n <= zuiDa) return lie;
  const liu = new Set([0, n - 1]);
  const bu = Math.max(1, Math.floor(n / zuiDa));
  for (let i = 0; i < n; i += bu) liu.add(i);
  for (let i = 1; i < n - 1; i++) {
    const a = lie[i - 1];
    const b = lie[i];
    const c = lie[i + 1];
    const v1 = Math.atan2(b.lat - a.lat, b.lng - a.lng);
    const v2 = Math.atan2(c.lat - b.lat, c.lng - b.lng);
    let d = Math.abs(v2 - v1);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d > 0.7) liu.add(i); // 约 40° 以上算拐点
  }
  const chu = [...liu].sort((x, y) => x - y).map(i => lie[i]);
  // 拐点太多时退回纯步长，避免抽稀反而把点数顶上去
  return chu.length > zuiDa * 1.5 ? lie.filter((_, i) => liu.has(i) === false || i % bu === 0) : chu;
}

// ① 等时圈热力：外→内叠色（与 Web 端同序同色板），每环抽稀后转 GCJ-02
export function dengShiQuanPolygons(ceng, zuiDa = 180) {
  const chu = [];
  const lie = (ceng || []).slice().sort((a, b) => b.miao - a.miao);
  for (const c of lie) {
    const se = MI_CAISE[c.miao] || '#2f9bff';
    for (const huan of c.polygon || []) {
      // 过滤非法点：NaN 坐标交给原生渲染层会被判成「路径无效」，整个图形都不出来
      const pts = chouXi(huan, zuiDa)
        .map(dian)
        .filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
      if (pts.length < 3) continue;
      chu.push({
        points: pts,
        strokeColor: se,
        strokeWidth: 1,
        fillColor: touMing(se, MI_OPA[c.miao] || 0.18)
      });
    }
  }
  return chu;
}

// ② 跨水面的原圈轮廓：细虚线（填色止于岸边，虚线把「圈还是原来那个圈」续过去）
// 每段都要过三关：点数 ≥ 2、坐标有限、不能整段缩成一个点 —— 任一条不满足，原生渲染层都会
// 报「MultiPolyline.geometries … paths 属性无效」，所以在这里就丢掉
export function shuiDuanLines(shuiDuan) {
  const chu = [];
  for (const c of shuiDuan || []) {
    const se = MI_CAISE[c.miao] || '#2f9bff';
    for (const d of c.duan || []) {
      if (!d || d.length < 2) continue;
      const pts = d.map(dian).filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
      if (pts.length < 2) continue;
      if (pts.every(p => p.latitude === pts[0].latitude && p.longitude === pts[0].longitude)) continue;
      chu.push({ points: pts, color: se, width: 2, dottedLine: true });
    }
  }
  return chu;
}

// ③ 设施标记：地图上的设施用 marker 画，图标是 xcx/common/images/sheshi-<类别>.png 六张小圆徽章
// （类别色圆底 + 白色形状），观感与网页端 src/ui/MapCanvas.jsx 的 sheShiBiaoJi 一致。
// 为什么这里必须用图片（README §10 的总则是「不引图片资源」）：小程序 <map> 的 marker 图标只认 iconPath 的
// **图片路径**（官方文档：项目目录 / 网络 / 代码包路径），不认 data URI / base64 / SVG；网页端是百度地图，
// 可以把内联 SVG 转 data URI 直接塞给 B.Icon —— 两端能力不同，同一段代码搬不过来。
// 所以地图标记按 README「图片资源」那一节的规范走：真源放 xcx/common/images/，
// 由 scripts/shengcheng-sheshi-tubiao.ps1 生成、tongbu-xcx.mjs 按字节分发到三端，标记里用 /images/xxx.png。
// 形状与网页端 src/ui/sheShiXing.js 的 SHE_SHI_XING 一一对应（十字/三角/方块/竖六边形/圆/菱形），
// 保证「左侧图例 ↔ 地图散点」对得上；颜色取自本文件上面的 FENLEI_SE，两边同一套色板。
// marker id 从 300 起编号：100~199 是补建点、200~299 是「我的标记」，互不干扰（见 pages/ditu.js 的 biaoJiTap）
const SHE_SHI_MARKER_ID = 300;
const SHE_SHI_MEI_LEI = 25; // 每类最多画这么多个：marker 比色块重（原生逐个按图绘制），六类封顶 150 个

// 设施 markers：iconPath 指向六张小圆徽章，点击弹纯文字气泡显示名称（不塞 emoji，见 README §10）
export function sheShiMarkers(poiSet, xianshi, meiLei = SHE_SHI_MEI_LEI) {
  const chu = [];
  const ge = (poiSet && poiSet.fenleiSet) || {};
  let xu = SHE_SHI_MARKER_ID;
  for (const f of Object.keys(ge)) {
    if (xianshi && xianshi[f] === false) continue;
    for (const p of (ge[f] || []).slice(0, meiLei)) {
      const q = dian(p);
      if (!Number.isFinite(q.latitude) || !Number.isFinite(q.longitude)) continue;
      chu.push({
        id: xu++,
        latitude: q.latitude,
        longitude: q.longitude,
        iconPath: `/images/sheshi-${f}.png`,
        width: 20,
        height: 20,
        callout: {
          content: p.name || FENLEI_MING[f] || f,
          color: '#1f2a37',
          fontSize: 11,
          borderRadius: 6,
          bgColor: '#ffffff',
          padding: 5,
          display: 'BYCLICK',
          textAlign: 'center'
        },
        // 点图标时平台只回 markerId（见微信文档 markertap 的 e.detail），认不出是哪个设施 ——
        // 这里带上卡片与算路要用的字段，页面拿 id 在里面反查即可。
        // 坐标保持引擎的 WGS-84（页面要算路 / 打开地图时自己转 GCJ-02，与「点地图命中设施」一致）
        poi: {
          name: p.name || '',
          lng: Number(p.lng),
          lat: Number(p.lat),
          address: p.address || '',
          fenlei: f
        }
      });
    }
  }
  return chu;
}

// ④ 盲区：按面积折算半径（圆面积 = 盲区面积，与 Web 端口径一致），重度红 / 轻度橙
export function mangSe(lv) {
  return lv === 'red' ? '#e5484d' : '#f59f00';
}

// 盲区半径（米）：圆面积 = 盲区面积，限定 60~600 米免得圈过大盖住全图。
// 地图页要靠它判断「点击位置落在哪个盲区里」，所以单独导出
export function mangQuBanJing(m) {
  const m2 = Number(m && m.areaM2) || 0;
  return Math.max(60, Math.min(600, Math.sqrt(Math.max(1, m2) / Math.PI)));
}

export function mangQuCircles(mangquList, zuiDa = 40) {
  const chu = [];
  for (const m of mangquList || []) {
    if (chu.length >= zuiDa) break;
    const zx = m.zhongxin || m.buJianDian;
    if (!zx) continue;
    const q = dian(zx);
    const ban = mangQuBanJing(m);
    const se = mangSe(m.level);
    chu.push({
      latitude: q.latitude,
      longitude: q.longitude,
      radius: ban,
      fillColor: touMing(se, 0.16),
      // 描边给实色、宽度给整数：原生渲染层对「样式宽度」的容忍度很低，
      // 层次靠 fillColor 的透明度已经够了，不再叠加半透明描边
      color: se,
      strokeWidth: 1
    });
  }
  return chu;
}

// ⑤ 标记：体检中心（常显气泡）与补建点（点击展开气泡）
export function zhongXinMarkers(zhongXin, ming) {
  if (!zhongXin) return [];
  const q = dian(zhongXin);
  return [
    {
      id: 1,
      latitude: q.latitude,
      longitude: q.longitude,
      width: 24,
      height: 30,
      callout: {
        content: ming || '体检中心',
        color: '#1f2a37',
        fontSize: 12,
        borderRadius: 6,
        bgColor: '#ffffff',
        padding: 6,
        display: 'ALWAYS',
        textAlign: 'center'
      }
    }
  ];
}

export function buJianMarkers(mangquList) {
  const chu = [];
  (mangquList || []).forEach((m, i) => {
    if (!m.buJianDian) return;
    const q = dian(m.buJianDian);
    chu.push({
      id: 100 + i,
      latitude: q.latitude,
      longitude: q.longitude,
      width: 20,
      height: 26,
      callout: {
        content: `补建建议 ${m.id}`,
        color: '#ffffff',
        fontSize: 11,
        borderRadius: 6,
        bgColor: '#1a8f57',
        padding: 5,
        display: 'BYCLICK',
        textAlign: 'center'
      }
    });
  });
  return chu;
}

// ⑥ 步行路线
export function luXianPolyline(polyline) {
  if (!polyline || polyline.length < 2) return [];
  const pts = polyline.map(dian).filter(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
  if (pts.length < 2) return [];
  return [{ points: pts, color: '#2f86f7', width: 5, arrowLine: false }];
}

// 格式化
export function geShiMianJi(m2) {
  const v = Number(m2) || 0;
  if (v >= 1000000) return (v / 1000000).toFixed(2) + ' 平方公里';
  if (v >= 10000) return (v / 10000).toFixed(2) + ' 万㎡';
  return Math.round(v) + ' ㎡';
}

export function geShiHaoShi(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  return s >= 60 ? Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒' : s + ' 秒';
}

export function fenSe(fen) {
  const v = Number(fen) || 0;
  if (v >= 85) return '#1a8f57';
  if (v >= 70) return '#2f9bff';
  if (v >= 60) return '#f59f00';
  return '#e5484d';
}

// 等级文案：引擎既可能给 A/B/C/D 字母，也可能给 you/liang/zhong/cha 这类代号，
// 统一翻成中文，免得界面上只剩一个孤零零的字母
export function dengJiMing(dengji) {
  const m = {
    you: '优秀',
    liang: '良好',
    zhong: '一般',
    cha: '待改善',
    A: '优秀',
    B: '良好',
    C: '一般',
    D: '待改善',
    a: '优秀',
    b: '良好',
    c: '一般',
    d: '待改善'
  };
  return m[dengji] || dengji || '—';
}
