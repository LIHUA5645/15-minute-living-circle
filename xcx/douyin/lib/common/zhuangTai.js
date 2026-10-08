// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 全局状态：小程序各页面是独立实例，跨页共享靠模块单例。
// 完整报告（含等时圈上千个点）只在内存常驻；存储里只放「瘦身摘要」——冷启动能显示上次结论，
// 又不会把小程序 10MB 存储配额吃掉。
import { plat } from './plat.js';
import { peiZhi } from './peizhi.js';

const KEY = 'sq_zhuangtai_v1';

const tai = {
  zhongXin: null, // {lng,lat} 引擎坐标（WGS-84）
  diMing: '',
  mubiaoMiao: peiZhi.moRenMuBiaoMiao,
  dangwei: peiZhi.moRenDangWei,
  report: null, // 完整报告（内存）
  baoGaoShi: 0, // 本轮报告生成时间
  yongHu: null, // 登录用户
  xianshi: { yiliao: true, jiaoyu: true, gouwu: true, yanglao: true, jiaotong: true, xiuxian: true },
  shangCi: null, // 冷启动恢复的摘要
  juJiaoMangQu: '', // 从报告页跳到地图时要聚焦的盲区 id
  juJiaoDaoHang: null, // 报告页 AI 浮层「带我去」的目的地设施：跳地图页后接力画路线
  zhengDuanWen: '' // 报告页当前展示的 AI 诊断叙述（AI 聊天回答时结合它；只在内存，不入摘要）
};

export function duTai() {
  return tai;
}

export function sheZhongXin(zx, ming) {
  if (zx) tai.zhongXin = { lng: Number(zx.lng), lat: Number(zx.lat) };
  if (ming !== undefined) tai.diMing = ming || '';
  cunZhaiYao();
}

export function sheCanShu(mubiaoMiao, dangwei) {
  if (mubiaoMiao) tai.mubiaoMiao = Number(mubiaoMiao);
  if (dangwei) tai.dangwei = dangwei;
  cunZhaiYao();
}

export function sheXianShi(k, v) {
  tai.xianshi = { ...tai.xianshi, [k]: !!v };
  cunZhaiYao();
}

export function sheYongHu(y) {
  tai.yongHu = y || null;
}

export function cunBaoGao(r) {
  tai.report = r || null;
  tai.baoGaoShi = r ? Date.now() : 0; // 本轮报告生成时间（报告体里没有时间戳，这里补一个）
  cunZhaiYao();
}

export function duBaoGao() {
  return tai.report;
}

/* ── 「去体检后自动回来继续」的待续提问 ──
   AI 页答不了（本机还没报告）时，把用户那句话暂存下来；点出口按钮去地图页跑完体检，
   地图页跑完自动切回 AI 页，AI 页再把它自动问一遍——整条链路不用用户手动接 */
const DAI_XU = 'sq_dai_xu_wen';

export function cunDaiXu(wen) {
  try {
    plat.setStorage(DAI_XU, String(wen || ''));
  } catch {
    /* 存不上就算了：只是少一次自动续问，不影响别的 */
  }
}

export function quDaiXu() {
  try {
    return String(plat.getStorage(DAI_XU) || '');
  } catch {
    return '';
  }
}

export function qingDaiXu() {
  try {
    plat.removeStorage(DAI_XU);
  } catch {
    /* 忽略 */
  }
}

/* 设施散点的持久化副本：完整报告（等时圈上千个点）确实不该进存储，
   但「地图上有没有东西」不该被一次冷启动/清缓存抹掉 —— 那看起来就是"小程序端什么都没有"。
   这里只留六类、每类前 SHE_SHI_CUN 个、每点只留名字与坐标（地址/电话/省份地图用不上），
   六类合计约 10 KB，与"不把 10MB 配额吃掉"的初衷并不冲突。等时圈与盲区仍然要重跑才有 */
const SHE_SHI_CUN = 30;

function jianPoiSet(poiSet) {
  const ge = (poiSet && poiSet.fenleiSet) || {};
  const chu = {};
  for (const f of Object.keys(ge)) {
    chu[f] = (ge[f] || []).slice(0, SHE_SHI_CUN).map(p => ({
      name: p.name || '',
      lng: Number(p.lng),
      lat: Number(p.lat)
    }));
  }
  return chu;
}

// 存储里的摘要
function cunZhaiYao() {
  const r = tai.report;
  plat.setStorage(KEY, {
    zhongXin: tai.zhongXin,
    diMing: tai.diMing,
    mubiaoMiao: tai.mubiaoMiao,
    dangwei: tai.dangwei,
    xianshi: tai.xianshi,
    shangCi: r
      ? {
          total: r.total,
          dengji: r.dengji,
          mangquShu: (r.mangquList || []).length,
          qingQiuShu: (r.xinxi && r.xinxi.qingQiuShu) || 0,
          haoShiMs: (r.xinxi && r.xinxi.haoShiMs) || 0,
          shiJian: Date.now(),
          poi: jianPoiSet(r.poiSet)
        }
      : tai.shangCi
  });
}

// 冷启动恢复（在 app.js 启动时调一次）
export function huiFu() {
  const s = plat.getStorage(KEY);
  const you = !!(s && typeof s === 'object');
  if (you) {
    tai.zhongXin = s.zhongXin || tai.zhongXin;
    // 旧版本会把「定位中…」这个中间态存进摘要（定位中途被打断就永久留在库里）；
    // 它不仅出现在定位条，中心点 marker 的标签也直接用它 —— 在数据源头归位，
    // 各页面（显示层已各自过滤）拿到的都是干净值
    tai.diMing = s.diMing === '定位中…' ? '位置已就绪' : s.diMing || '';
    tai.mubiaoMiao = s.mubiaoMiao || tai.mubiaoMiao;
    tai.dangwei = s.dangwei || tai.dangwei;
    if (s.xianshi) tai.xianshi = { ...tai.xianshi, ...s.xianshi };
  }
  // 存储被清空（换了机器 / 手动清缓存）时内存摘要也要跟着清：
  // 否则旧设施散点还会画在地图上，与「没跑过体检」的底部文案自相矛盾
  tai.shangCi = you ? s.shangCi || null : null;
  const y = plat.getStorage('sq_yonghu');
  if (y && typeof y === 'object' && y.zhangHao) tai.yongHu = y;
  return tai;
}
