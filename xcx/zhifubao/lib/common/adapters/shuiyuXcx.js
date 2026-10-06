// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 水域掩膜数据：走自有服务端 /shuiyu（服务端侧先查预置样例文件、再查落盘缓存、最后才联网 Overpass）。
// 这样小程序不必把 Overpass 域名加进白名单，也不会因为 Overpass 限流而卡住体检。
// 取不到就返回 null —— 引擎会按「本轮不做水面避让」继续跑，报告里如实提示（与 Web 端行为一致）。
import { plat } from '../plat.js';
import { fuWu } from '../peizhi.js';

export async function huoShuiYu(zx, banJingMi) {
  try {
    const lu = `/shuiyu?lng=${zx.lng}&lat=${zx.lat}` + (banJingMi ? `&banJingMi=${Math.round(banJingMi)}` : '');
    const r = await plat.request({ url: fuWu(lu), method: 'GET', timeout: 25000 });
    let j = r.data;
    if (typeof j === 'string') j = JSON.parse(j);
    if (!j || j.cuo) return null;
    const lie = j.duoBianXing || [];
    if (!lie.length) return null;
    return { duoBianXing: lie, geShu: lie.length, laiYuan: j.laiYuan || '' };
  } catch {
    return null; // 网络异常：这一轮不做避让，绝不因此中断体检
  }
}
