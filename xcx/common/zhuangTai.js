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
  juJiaoMangQu: '' // 从报告页跳到地图时要聚焦的盲区 id
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
          shiJian: Date.now()
        }
      : tai.shangCi
  });
}

// 冷启动恢复（在 app.js 启动时调一次）
export function huiFu() {
  const s = plat.getStorage(KEY);
  if (s && typeof s === 'object') {
    tai.zhongXin = s.zhongXin || tai.zhongXin;
    tai.diMing = s.diMing || '';
    tai.mubiaoMiao = s.mubiaoMiao || tai.mubiaoMiao;
    tai.dangwei = s.dangwei || tai.dangwei;
    if (s.xianshi) tai.xianshi = { ...tai.xianshi, ...s.xianshi };
    tai.shangCi = s.shangCi || null;
  }
  const y = plat.getStorage('sq_yonghu');
  if (y && typeof y === 'object' && y.zhangHao) tai.yongHu = y;
  return tai;
}
