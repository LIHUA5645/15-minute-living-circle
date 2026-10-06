// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 体检编排：小程序页面只调这一个入口。
// 负责三件事：① 拼装 provider（百度 Web 服务，走自有服务端）② 准备水域掩膜与缓存 ③ 把引擎进度翻成中文阶段
import { yunXingTijian } from '../core/pipeline.js';
import { HuanCun } from '../core/scheduler/xianliu.js';
import { chuangJianBmapXcx } from './adapters/bmapXcx.js';
import { huoShuiYu } from './adapters/shuiyuXcx.js';
import { chuangJianCunChu } from './cunchu.js';
import { peiZhi } from './peizhi.js';

// 引擎回报的阶段标识 → 页面文案
export const JIE_DUAN_MING = {
  sousuo: '检索周边设施…',
  caiyang: '生成等时圈…',
  mangqu: '识别服务盲区…'
};

let cunChu = null;
function quCunChu() {
  if (!cunChu) cunChu = chuangJianCunChu({});
  return cunChu;
}

/**
 * 跑一轮体检
 * @param {object} p
 * @param {{lng:number,lat:number}} p.zhongXin 引擎坐标（WGS-84）
 * @param {number} p.mubiaoMiao 目标时长（秒）
 * @param {string} p.dangwei 网格密度档位 fast|standard|fine
 * @param {object} [p.tiJianPeiZhi] 管理员配置（评分基准/权重/盲区阈值），缺省用引擎内置
 * @param {(p:number)=>void} [p.onJinDu] 进度 0~1
 * @param {(j:string)=>void} [p.onJieDuan] 阶段标识变化
 */
export async function paoYiLunTiJian({ zhongXin, mubiaoMiao, dangwei, tiJianPeiZhi, onJinDu, onJieDuan }) {
  const provider = chuangJianBmapXcx();
  // 水域：取到就用（服务端带预置样例与缓存），取不到就这一轮不避让，绝不因此中断
  const shuiYu = await huoShuiYu(zhongXin);
  const huanCun = new HuanCun(quCunChu(), peiZhi.huanCunTian * 24 * 3600 * 1000);
  return yunXingTijian(
    provider,
    { zhongXin, mubiaoMiao, dangwei, banJingMi: peiZhi.banJingMi },
    {
      huanCun,
      qps: peiZhi.qps,
      bingfa: peiZhi.bingfa,
      shuiYu,
      peiZhi: tiJianPeiZhi || null,
      jinDu: (p, jieduan) => {
        if (onJinDu) onJinDu(Math.max(0, Math.min(1, Number(p) || 0)));
        if (onJieDuan && jieduan) onJieDuan(jieduan);
      }
    }
  );
}
