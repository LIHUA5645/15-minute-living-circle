// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 六维评分模型 + 等级 + 自然语言建议
import { liangDianJuLi } from '../geo/jichu.js';
import { FENLEI_QUANZHONG, BIAOZHUN, MOREN_PEI_ZHI, FENLEI_MING } from '../types.js';

const V_BUXING = 80; // 米/分钟
const K_RAOLU = 1.25; // 路网绕行系数

// peiZhi：管理员控制面板覆盖的配置 { mubiaoMiao, biaozhun, quanzhong }
export function pingFen(zhongXin, fenleiSet, dengShiQuan, peiZhi) {
  const cfg = peiZhi || MOREN_PEI_ZHI;
  const T_MUBIAO = cfg.mubiaoMiao || 900;
  const R0 = (V_BUXING * (T_MUBIAO / 60)) / K_RAOLU; // 15 分钟步行直线半径 ≈ 960m
  const quanZhong = cfg.quanzhong || FENLEI_QUANZHONG;
  const biaoZhun = cfg.biaozhun || BIAOZHUN;
  // 圈内判定：以中心点步行直线半径 R0 作为 15 分钟圈近似（真实可达性由等时圈可视化体现）
  const r0 = (dengShiQuan && dengShiQuan.rMax ? dengShiQuan.rMax / 2.2 : R0) || R0;

  const fenleiPingfen = [];
  let total = 0;
  // 参评维度 = 内置六类 + 管理员自定义维度（各自携带基准数/权重/名称）
  const canPing = [
    ...Object.keys(FENLEI_QUANZHONG).map((f) => ({ f, biaoZhunZhi: biaoZhun[f] || 3, quanZhongZhi: quanZhong[f] || 0, ming: (cfg.mingGai && cfg.mingGai[f]) || FENLEI_MING[f] })),
    ...(cfg.ziDing || []).map((z) => ({ f: z.f, biaoZhunZhi: z.biaoZhun || 1, quanZhongZhi: z.quanZhong || 0, ming: z.ming })),
  ];
  for (const { f, biaoZhunZhi, quanZhongZhi, ming } of canPing) {
    const list = (fenleiSet[f] || []).filter((p) => liangDianJuLi(zhongXin, p) <= r0);
    const shuliang = list.length;
    // C 覆盖率
    const C = Math.min(1, shuliang / (biaoZhunZhi || 3));
    // A 可达性：最近设施步行时间
    let nearestSec = Infinity;
    for (const p of list) {
      const d = liangDianJuLi(zhongXin, p);
      nearestSec = Math.min(nearestSec, (d / V_BUXING) * 60);
    }
    const A = nearestSec === Infinity ? 0 : 1 - Math.min(nearestSec / T_MUBIAO, 1);
    // D 多样性：按品牌前缀去重计数 → Shannon
    const brands = new Set(list.map((p) => (p.name || '').slice(0, 3)));
    const subN = Math.max(1, brands.size);
    const D = Math.min(1, Math.log(subN) / Math.log(6));
    // B 均衡性：四象限标准差倒数
    const quad = [0, 0, 0, 0];
    for (const p of list) {
      const qx = p.lng >= zhongXin.lng ? 1 : 0;
      const qy = p.lat >= zhongXin.lat ? 1 : 0;
      quad[qx * 2 + qy]++;
    }
    const mean = quad.reduce((a, b) => a + b, 0) / 4 || 1;
    const std = Math.sqrt(quad.reduce((s, v) => s + (v - mean) ** 2, 0) / 4);
    const B = mean === 0 ? 0 : Math.max(0, 1 - std / mean);
    const score = Math.round(100 * (0.4 * C + 0.3 * A + 0.2 * D + 0.1 * B));
    fenleiPingfen.push({ fenlei: f, ming, score, C, A, D, B, shuliang });
    total += (quanZhongZhi || 0) * score;
  }
  total = Math.round(total);
  let dengji = 'D';
  if (total >= 85) dengji = 'A';
  else if (total >= 70) dengji = 'B';
  else if (total >= 55) dengji = 'C';

  return { fenleiPingfen, total, dengji };
}

// 短板建议生成（自定义维度用其名称）
export function shengChengJianYi(fenleiPingfen) {
  const sorted = [...fenleiPingfen].sort((a, b) => a.score - b.score);
  const mingzi = {
    yiliao: '医疗',
    jiaoyu: '教育',
    gouwu: '购物',
    yanglao: '养老',
    jiaotong: '交通',
    xiuxian: '休闲',
  };
  return sorted
    .slice(0, 2)
    .map(
      (x) =>
        `${x.ming || mingzi[x.fenlei]}维度得分偏低(${x.score})，建议补建${x.ming || mingzi[x.fenlei]}类设施、提升圈内覆盖与可达性`
    );
}
