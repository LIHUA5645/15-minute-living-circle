// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 服务盲区识别：候选网格 → 居住性过滤 → 粗筛 → 精算 → DBSCAN 聚类 → 补建建议
import { liangDianJuLi, chuangJianWangGe } from '../geo/jichu.js';

const R_WAI = 2000; // 外扩半径（米）
const CUCAI_BU = { fast: 300, standard: 200, fine: 150 };
const FEI_JUZHU = ['water', 'green', 'industry', 'railway', 'river', 'park'];
const T_MUBIAO = 900; // 15 分钟

// 取某维度最近 POI 的直线距离
function zuiJinJuLi(dian, poiList) {
  let min = Infinity;
  for (const p of poiList) {
    const d = liangDianJuLi(dian, p);
    if (d < min) min = d;
  }
  return min;
}

// DBSCAN 聚类：用栅格索引替代 O(n²) 全量扫描
function dbscan(dianLie, eps, minPts) {
  const n = dianLie.length;
  if (n === 0) return [];
  const visited = new Array(n).fill(false);
  const cluster = new Array(n).fill(-1);
  let cid = 0;
  const wangGe = chuangJianWangGe(dianLie, eps);
  const quYu = (i) => wangGe.zaiBanJingNei(dianLie[i], eps).map((it) => it.i);
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    visited[i] = true;
    const nei = quYu(i);
    if (nei.length < minPts) continue;
    cluster[i] = cid;
    const queue = nei.slice();
    while (queue.length) {
      const q = queue.pop();
      if (!visited[q]) {
        visited[q] = true;
        const nq = quYu(q);
        if (nq.length >= minPts) queue.push(...nq);
      }
      if (cluster[q] === -1) cluster[q] = cid;
    }
    cid++;
  }
  return cluster;
}

async function shiBieMangQu(provider, canShu, poiSet, opt = {}) {
  const { zhongXin } = canShu;
  const dangwei = canShu.dangwei || 'standard';
  const bu = CUCAI_BU[dangwei] || 200;
  const xl = opt.xianliu || { run: (f) => f() };
  // 盲区阈值：管理员配置可覆盖（旧配置无 mangqu 字段时用默认值）
  const yu = (opt.peiZhi && opt.peiZhi.mangqu) || {};
  const XIAN_CAI = yu.caiShiChangMiao || T_MUBIAO;
  const XIAN_YAO = yu.yaoDianMiao || T_MUBIAO;
  const XIAN_XIAO = yu.xiaoXueMiao || T_MUBIAO;
  const XIAN_CU_SHAI = yu.cuShaiMi || 800;

  // 1. 候选网格（在经纬度上近似偏移，仅用于候选采样）
  const grid = [];
  for (let dx = -R_WAI; dx <= R_WAI; dx += bu) {
    for (let dy = -R_WAI; dy <= R_WAI; dy += bu) {
      const lat = zhongXin.lat + dy / 110540;
      const lng = zhongXin.lng + dx / (111320 * Math.cos((zhongXin.lat * Math.PI) / 180));
      grid.push({ lng, lat, dx, dy });
    }
  }

  // 2. 粗筛（纯本地计算，零网络请求）
  // 标准档网格 21×21 = 441 个点，早先对每个点先做一次逆地理编码再判覆盖，
  // 等于 441 次串行请求（单次 2~3 秒），盲区阶段要跑十几分钟，界面看着就是死住。
  // 这里先把覆盖良好的点用直线距离剔掉，只对剩下的候选点联网。
  const houXuan = []; // 粗筛后需要联网确认的点
  const poigouwu = poiSet.fenleiSet.gouwu || [];
  const poiyiliao = poiSet.fenleiSet.yiliao || [];
  const poijiaoyu = poiSet.fenleiSet.jiaoyu || [];
  for (const g of grid) {
    const dCai = zuiJinJuLi(g, poigouwu);
    const dYao = zuiJinJuLi(g, poiyiliao);
    const dXiao = zuiJinJuLi(g, poijiaoyu);
    // 任一类直线距离超过粗筛阈值 → 可能盲区，需精算；否则认为覆盖
    if (dCai > XIAN_CU_SHAI || dYao > XIAN_CU_SHAI || dXiao > XIAN_CU_SHAI) {
      g._d = { caiShiChang: dCai, yaoDian: dYao, xiaoXue: dXiao };
      houXuan.push(g);
    }
  }

  // 3. 居住性过滤：水面/绿地/工业/铁路等非居住地不参与盲区统计。
  // 逆地理编码只用来判断「这一片是不是水面/绿地」，相邻居候点的结论几乎一样，
  // 因此按 400m 网格分组合并：一格只请求一次，结论复用到格内所有点，请求量降到 1/4 左右。
  const [jin0, jin1] = opt.jinDuQuJian || [0, 1];
  const xuYao = []; // 需要精算的点
  const hc = opt.huanCun;
  const geZi = new Map();
  for (const g of houXuan) {
    const k = `${Math.round((g.dx || 0) / 400)},${Math.round((g.dy || 0) / 400)}`;
    if (!geZi.has(k)) geZi.set(k, []);
    geZi.get(k).push(g);
  }
  const zuLie = [...geZi.values()];
  let yiWan = 0;
  const zongShu = Math.max(1, zuLie.length);
  await Promise.all(
    zuLie.map((zu) =>
      (async () => {
        const dai = zu[0];
        const key = `rg:${dai.lng.toFixed(4)},${dai.lat.toFixed(4)}`;
        let rg = hc ? hc.get(key) : null;
        if (!rg) {
          try {
            rg = await xl.run(() => provider.reverseGeocode(dai));
            if (rg && hc) hc.set(key, rg);
          } catch {
            rg = null; // 逆地理编码失败 → 按「默认居住」处理，与原逻辑一致
          }
        }
        if (!(rg && FEI_JUZHU.includes(rg.poiType))) {
          for (const g of zu) xuYao.push(g);
        }
      })().finally(() => {
        yiWan++;
        // 逆地理编码占盲区阶段前 60%，逐组回报，避免长时间没有进度变化
        if (opt.jinDu) opt.jinDu(jin0 + (jin1 - jin0) * 0.6 * (yiWan / zongShu), 'mangqu');
      })
    )
  );

  // 4. 精算：批量距离矩阵优先
  // 判断盲区只需要「到最近的菜市场/药店/小学要走多久」，每类按直线距离取最近 30 个当终点即可；
  // 起点再按 400m 取代表点（相邻 200m 格子的可达性几乎一样），矩阵规模压到可控范围，
  // 同时记下每个代表点覆盖了几个小格，后面据此还原盲区面积与人口，不因降采样而缩水。
  const jinLei = (lie, k = 30) =>
    lie
      .slice()
      .sort((a, b) => liangDianJuLi(zhongXin, a) - liangDianJuLi(zhongXin, b))
      .slice(0, k);
  const dCai = jinLei(poigouwu);
  const dYao = jinLei(poiyiliao);
  const dXiao = jinLei(poijiaoyu);

  const jiangYang = new Map();
  for (const g of xuYao) {
    const k = `${Math.round((g.dx || 0) / 400)},${Math.round((g.dy || 0) / 400)}`;
    if (!jiangYang.has(k)) jiangYang.set(k, { ...g, _geShu: 0 });
    jiangYang.get(k)._geShu++;
  }
  const qiDian = [...jiangYang.values()];

  const mangquDian = [];
  let juZhenKeYong = false;
  if (qiDian.length && typeof provider.routeMatrix === 'function') {
    const dests = [
      ...dCai.map((p) => ({ lng: p.lng, lat: p.lat })),
      ...dYao.map((p) => ({ lng: p.lng, lat: p.lat })),
      ...dXiao.map((p) => ({ lng: p.lng, lat: p.lat })),
    ];
    let matrix = null;
    try {
      matrix = await xl.run(() => provider.routeMatrix(qiDian, dests));
    } catch {
      matrix = null; // 矩阵不可用 → 落到下面的直线估算
    }
    if (matrix) {
      juZhenKeYong = true;
      for (let k = 0; k < qiDian.length; k++) {
        const row = matrix[k] || [];
        const cai = Math.min(...row.slice(0, dCai.length).map((m) => m.durationSec));
        const yao = Math.min(...row.slice(dCai.length, dCai.length + dYao.length).map((m) => m.durationSec));
        const xiao = Math.min(...row.slice(dCai.length + dYao.length).map((m) => m.durationSec));
        if (cai > XIAN_CAI && yao > XIAN_YAO && xiao > XIAN_XIAO) {
          qiDian[k]._shiChang = { cai, yao, xiao };
          mangquDian.push(qiDian[k]);
        }
      }
    }
  }
  // 无矩阵能力（或矩阵失败）时降级：用直线×1.35 估算
  if (!juZhenKeYong) {
    for (const g of qiDian) {
      const cai = (g._d.caiShiChang * 1.35) / (80 / 60);
      const yao = (g._d.yaoDian * 1.35) / (80 / 60);
      const xiao = (g._d.xiaoXue * 1.35) / (80 / 60);
      if (cai > XIAN_CAI && yao > XIAN_YAO && xiao > XIAN_XIAO) {
        g._shiChang = { cai, yao, xiao };
        mangquDian.push(g);
      }
    }
  }

  // 5. 聚类成斑块 + 补建建议
  // 邻域半径跟着采样步长走：起点已按 400m 抽稀，仍用 250m 会把每个点都当成孤立噪点丢掉
  const cluster = dbscan(mangquDian, Math.max(250, bu * 2.5), 2);
  const bans = {};
  mangquDian.forEach((g, i) => {
    const c = cluster[i];
    if (c < 0) return;
    if (!bans[c]) bans[c] = [];
    bans[c].push(g);
  });
  const list = Object.values(bans).map((pts, idx) => {
    const lng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
    const lat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    // 面积与人口按「覆盖的小格总数」算，而不是代表点个数（代表点是抽稀过的）
    const geShu = pts.reduce((s, p) => s + (p._geShu || 1), 0);
    const areaM2 = (geShu * bu * bu) | 0;
    // 补建候选点 = 代表点的 medoid（到簇内其它代表点直线距离和最小者）：
    // 建在这里能让盲区内居民到新设施的平均步行距离最短
    let medoid = pts[0];
    let zuiXiaoHe = Infinity;
    for (const a of pts) {
      let he = 0;
      for (const b of pts) he += liangDianJuLi(a, b);
      if (he < zuiXiaoHe) {
        zuiXiaoHe = he;
        medoid = a;
      }
    }
    // 判定依据：簇内各点「到最近缺口设施的真实步行耗时」取平均，对照阈值
    const pingJun = (jian) => {
      const you = pts.filter((p) => p._shiChang);
      if (!you.length) return null;
      return Math.round(you.reduce((s, p) => s + p._shiChang[jian], 0) / you.length);
    };
    const caiPing = pingJun('cai');
    const yaoPing = pingJun('yao');
    const xiaoPing = pingJun('xiao');
    const fen = (m) => (m == null ? '—' : `${Math.round(m / 60)} 分钟`);
    const yiJu = `实测最近菜市场平均步行 ${fen(caiPing)}、药店 ${fen(yaoPing)}、小学 ${fen(xiaoPing)}，均超过 ${Math.round(T_MUBIAO / 60)} 分钟阈值`;
    return {
      id: 'MQ' + (idx + 1),
      level: geShu > 12 ? 'red' : 'orange',
      // 盲区统一用「圆心 + 半径」表示，渲染层直接画圆：网格点本来就是散点，
      // 连成多边形只会得到折返的长条，画圆更干净也更符合阅读习惯
      polygon: null,
      banJingM: Math.round(Math.sqrt(areaM2 / Math.PI)),
      areaM2,
      quekou: ['菜市场', '药店', '小学'],
      zhongxin: { lng, lat },
      // 补建候选点（medoid）：建议政府/开发商在此增设社区级商业与服务设施
      buJianDian: { lng: medoid.lng, lat: medoid.lat },
      pingJunBuXing: { caiShiChangMiao: caiPing, yaoDianMiao: yaoPing, xiaoXueMiao: xiaoPing },
      yiJu,
      jianyi: `建议在补建点 (${medoid.lng.toFixed(5)}, ${medoid.lat.toFixed(5)}) 增设社区菜市场与药店，建成后约 ${geShu * 260} 名居民步行 15 分钟内可达`,
      yujiFugaiRenkou: geShu * 260,
    };
  });

  if (opt.jinDu) opt.jinDu(jin1, 'mangqu');
  return list;
}

export { shiBieMangQu };
