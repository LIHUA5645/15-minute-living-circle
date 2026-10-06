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
