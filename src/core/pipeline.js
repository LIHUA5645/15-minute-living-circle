// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 体检流水线总编排：检索→等时圈→盲区→评分→报告
import { shengChengDengshiquan } from './isochrone/dengshiquan.js';
import { souSuoBingQingXi } from './poi/qingxi.js';
import { shiBieMangQu } from './blindspot/mangqu.js';
import { pingFen, shengChengJianYi } from './scoring/pingfen.js';
import { LingPaiTong, BingFaChi, HuanCun } from './scheduler/xianliu.js';

export async function yunXingTijian(provider, canShu, opt = {}) {
  const t0 = Date.now();
  const warnings = [];
  // 构造调度器：并发池 + 令牌桶限流，并统计实际经过限流器的请求数
  const qps = opt.qps || 2;
  const bingfa = opt.bingfa || 3;
  const tong = new LingPaiTong(qps);
  const xl = new BingFaChi(bingfa);
  let qingQiuShu = 0;
  const xianliu = {
    run: (fn) => xl.run(async () => {
      await tong.huoQu();
      qingQiuShu++;
      return fn();
    }),
  };
  const hc = opt.huanCun || new HuanCun(opt.store);

  // 1. 检索与清洗（占总进度 0~18%，逐关键词回报）
  if (opt.jinDu) opt.jinDu(0, 'sousuo');
  const poiSet = await souSuoBingQingXi(provider, canShu.zhongXin, canShu.banJingMi || 1500, {
    xianliu,
    huanCun: hc,
    peiZhi: opt.peiZhi,
    jinDu: (wan, zong) => opt.jinDu && opt.jinDu(0.18 * (wan / Math.max(1, zong)), 'sousuo'),
  });
  if (poiSet.cunYi && poiSet.cunYi.length) {
    warnings.push(`POI 清洗阶段有 ${poiSet.cunYi.length} 条低可信度数据未参评`);
  }
  // 设施样本过少（典型原因是地点检索配额被打光，只剩零星几条）时，
  // 再往下算出来的分数与盲区结论都没有参考价值，必须在报告里说清楚
  const poiZongShu = Object.values(poiSet.fenleiSet || {}).reduce((s, lie) => s + lie.length, 0);
  if (poiZongShu < 8) {
    warnings.push(
      `本次仅检索到 ${poiZongShu} 个有效设施（正常应有数十个），样本严重不足，综合得分与盲区结论仅供参考`
    );
  }
  if (poiSet.shiBaiShu) {
    // 单个关键词失败不中断体检，但必须让用户知道结果可能漏检
    warnings.push(
      `POI 检索有 ${poiSet.shiBaiShu} 次关键词请求失败（${(poiSet.shiBaiCi || []).slice(0, 5).join('、')}），该部分设施可能漏检`
    );
  }

  // 2. 等时圈（占总进度 18~85%）
  const dengShiQuan = await shengChengDengshiquan(provider, canShu, {
    huanCun: hc,
    xianliu,
    jinDu: opt.jinDu,
    jinDuQuJian: [0.18, 0.85],
  });
  if (dengShiQuan.geshe && dengShiQuan.geshe.length) {
    warnings.push(`检测到 ${dengShiQuan.geshe.length} 个方位存在明显阻隔/割裂`);
  }
  const jiangZhiYangBen = (dengShiQuan.yangBenDian || []).filter((s) => s.degraded);
  if (jiangZhiYangBen.length) {
    warnings.push(`${jiangZhiYangBen.length} 个采样点因算路失败降级为直线估算`);
  }

  // 3. 盲区（占总进度 85~100%）
  const mangquList = await shiBieMangQu(provider, canShu, poiSet, {
    huanCun: hc,
    xianliu,
    jinDu: opt.jinDu,
    jinDuQuJian: [0.85, 1],
    peiZhi: opt.peiZhi,
  });

  // 4. 评分（管理员配置可覆盖基准值/权重/目标时长）
  const peiZhi = opt.peiZhi || null;
  const { fenleiPingfen, total, dengji } = pingFen(
    canShu.zhongXin,
    poiSet.fenleiSet,
    dengShiQuan,
    peiZhi
  );
  const jianYi = shengChengJianYi(fenleiPingfen);

  const report = {
    zhongXin: canShu.zhongXin,
    canShu,
    total,
    dengji,
    dengShiQuan,
    poiSet,
    fenleiPingfen,
    mangquList,
    jianYi,
    warnings,
    xinxi: {
      qingQiuShu,
      haoShiMs: Date.now() - t0,
      miDu: dengShiQuan.miDu,
    },
  };
  return report;
}
