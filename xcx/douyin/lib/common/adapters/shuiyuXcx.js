// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，07
// OSM 数据适配器（水域掩膜 + 周边地名），两件事都走自有服务端，端上不直连 Overpass：
//   /shuiyu   —— 水域多边形（服务端侧：预置样例 → 落盘缓存 → Overpass）
//   /zhoubian —— 周边街区 / 社区名（服务端侧：落盘缓存 → Overpass），给「定位周边推荐」用
// 为什么都放服务端：① 小程序只连一个域名，Overpass 不必进白名单；② 真机上 Overpass 又慢又容易被限流，
// 体检主流程不该被它拖住；③ 同一片区域第二次直接读服务端的网格缓存文件。
// 取不到就返回 null / 空数组 —— 界面少一层、报告如实说明，绝不因此中断定位与体检。
// ⚠️ 这两个函数刻意放在**同一个已有文件**里：微信开发者工具开着「编译器模块化」（project.config.json
//    的 useCompilerModule）时，**热重载不会给新增文件重建模块表**，控制台会报
//    「module 'lib/common/adapters/xxx.js' is not defined」；不新增文件就不踩这个坑。
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

// 周边地名：给「切换」面板顶部的「定位周边推荐」用（定位只给坐标，地名才看得懂）
export async function huoZhouBian(zx, banJingMi) {
  try {
    const lu =
      `/zhoubian?lng=${zx.lng}&lat=${zx.lat}` + (banJingMi ? `&banJingMi=${Math.round(banJingMi)}` : '');
    const r = await plat.request({ url: fuWu(lu), method: 'GET', timeout: 25000 });
    let j = r.data;
    if (typeof j === 'string') j = JSON.parse(j);
    if (!j || j.cuo) return [];
    return (j.lie || []).filter(x => x && x.ming && Number.isFinite(x.lng) && Number.isFinite(x.lat));
  } catch {
    return []; // 网络异常：这一层不显示，不影响定位与体检
  }
}
