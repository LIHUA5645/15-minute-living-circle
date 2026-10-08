// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
/* global wx, my, tt */
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 平台层入口：把微信 / 支付宝 / 抖音的差异全部收敛到 plat 这一个对象后面。
// 页面逻辑与适配器只认 plat.xxx()，所以同一份代码能跑在三端；分端差异只存在于 plat.<平台>.js。
import { weixin } from './plat.weixin.js';
import { zhifubao } from './plat.zhifubao.js';
import { douyin } from './plat.douyin.js';

// 靠全局对象探测平台：wx / my / tt 三者只会有其一存在
function tanCe() {
  if (typeof wx !== 'undefined' && typeof wx.request === 'function') return 'weixin';
  if (typeof my !== 'undefined' && typeof my.request === 'function') return 'zhifubao';
  if (typeof tt !== 'undefined' && typeof tt.request === 'function') return 'douyin';
  return 'weixin'; // 兜底：按微信实现走，真出问题时错误信息里能看出平台没被识别
}

const shiXian = { weixin, zhifubao, douyin };

export const pingTaiMing = tanCe();

// 注意：这里展开的是「平台实现对象」的方法，调用时 this 不参与（方法都用闭包引用自己的全局对象）
export const plat = { ...shiXian[pingTaiMing], pingTai: pingTaiMing };

// 四个 tabBar 页（地图 / 生活圈 / 助手 / 我的）：只能用 switchTab 打开，
// 用 navigateTo / redirectTo 会被平台拒绝。所以页面一律走 plat.quYe()，由它挑正确的方式
const TAB_YE = ['/pages/ditu/ditu', '/pages/baogao/baogao', '/pages/ai/ai', '/pages/wo/wo'];

export function quYe(url) {
  const u = String(url || '').split('?')[0];
  return TAB_YE.includes(u) ? plat.switchTab(u) : plat.navigateTo(url);
}
plat.quYe = quYe;

/**
 * 回报 tabBar 选中项（微信端自定义 tabBar 用）。
 * 原生 tabBar 的图标只认图片文件，而项目图标规则要求「语义图标一律 .ic-* CSS 自绘、不引图片资源」，
 * 所以微信端改成了组件自绘（`custom-tab-bar/`），选中态得由页面在 onShow 里告诉它；
 * 支付宝/抖音目前是原生「纯文字」tabBar，没有 getTabBar，这里静默跳过即可
 */
export function biaoTab(ben, i) {
  try {
    const tab = ben && typeof ben.getTabBar === 'function' ? ben.getTabBar() : null;
    if (tab) tab.setData({ xuanZhong: i });
  } catch {
    /* 没有自定义 tabBar 的平台：什么都不用做 */
  }
}
plat.biaoTab = biaoTab;
