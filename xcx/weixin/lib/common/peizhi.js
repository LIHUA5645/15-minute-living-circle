// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 全局配置：服务端地址与体检默认参数（三端共用，唯一需要改的地方）
import { plat } from './plat.js';

const KEY = 'sq_fuwu_dizhi';

export const peiZhi = {
  // 服务端统一出口：开发期填本机（开发者工具里勾「不校验合法域名」即可用 http），
  // 真机预览/上线必须换成 HTTPS 穿透域名（cloudflared / ngrok），并在小程序后台加白名单
  fuWuDiZhi: 'http://127.0.0.1:8787',
  chaoShiMs: 20000, // 单次请求超时
  banJingMi: 1500, // 设施检索半径（米），与 Web 端一致
  moRenMuBiaoMiao: 900, // 15 分钟
  moRenDangWei: 'standard', // 网格密度档位：fast 64 / standard 96 / fine 128
  qps: 2, // 令牌桶：每秒请求数（百度配额有限，别贪快）
  bingfa: 4 // 并发池：同时在途的请求数
};

// 运行期可在「我的」页改服务端地址（存存储，冷启动仍生效）
export function duFuWuDiZhi() {
  const v = plat.getStorage(KEY);
  const u = typeof v === 'string' && v.trim() ? v.trim() : peiZhi.fuWuDiZhi;
  return u.replace(/\/+$/, '');
}

export function cunFuWuDiZhi(u) {
  const v = String(u || '').trim().replace(/\/+$/, '');
  if (!v) return false;
  plat.setStorage(KEY, v);
  return true;
}

// 拼接接口地址：fuWu('/bmapapi/place/v2/search')
export function fuWu(lu) {
  return duFuWuDiZhi() + lu;
}
