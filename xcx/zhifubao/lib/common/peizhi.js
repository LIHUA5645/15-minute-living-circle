// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 全局配置：服务端地址与体检默认参数（三端共用，唯一需要改的地方）
import { plat } from './plat.js';

const KEY = 'sq_fuwu_dizhi';

export const peiZhi = {
  // 微信小程序 AK（百度地图开放平台「微信小程序」类型，客户端 AK 本就允许内置在小程序里）。
  // 直连 api.map.baidu.com 时用它；留空则只走自有服务端
  bmapAk: 'uHFdon2724NMyiOf46wBtanBd7uCyPGN',

  // 百度 Web 服务的通道策略：
  //   'zhiLian'  直连百度（用上面的小程序 AK，微信会自动带上 servicewechat Referer）→ 失败自动退到服务端
  //   'fuWuDuan' 只走自有服务端 /bmapapi（服务端代持密钥 + 多 AK 轮换，适合生产）
  //   'zhenDuan' 两边都试，谁通用谁（排查用，会多花一次失败请求的时间）
  // 不管哪种策略，失败都会自动换另一边，所以「本地服务端没起」也能跑通体检
  bmapMoShi: 'zhiLian',

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
  // 如实返回是否真写进去了：存储满 / 不可用时上层要提示「没保存成功」。
  // 早期忽略返回值，会把「没存上」显示成「已保存」，用户下次进来还是旧地址
  return plat.setStorage(KEY, v) !== false;
}

/* ── 服务端地址自动探测（开发者工具用 127.0.0.1，真机得用内网 IP / HTTPS 域名） ── */

const KEY_LAN = 'sq_fuwu_lan'; // 服务端 /jianKang 上报过的内网候选，真机预览可直接切

function guiYi(u) {
  return String(u || '')
    .trim()
    .replace(/\/+$/, '');
}

// 候选地址：当前用的 → 代码里的默认 → 服务端上报过的内网候选（去重、保序）
export function fuWuHouXuan() {
  const jian = [duFuWuDiZhi(), peiZhi.fuWuDiZhi];
  const lan = plat.getStorage(KEY_LAN);
  if (Array.isArray(lan)) jian.push(...lan);
  const chu = [];
  for (const u of jian) {
    const v = guiYi(u);
    if (v && !chu.includes(v)) chu.push(v);
  }
  return chu.slice(0, 4);
}

/**
 * 探测可用服务端：依次 GET 候选地址的 /jianKang，第一个通的写回存储（并收下服务端上报的内网候选）后返回该地址；
 * 都不通返回 ''。buHan 里的地址直接跳过（刚失败过的就别再试，省一轮超时）。
 * 有了它，「服务端起来了 / 换了地址」都能自动接上，用户不必手改地址
 */
export async function tanCeFuWu(buHan = []) {
  const tiao = buHan.map(guiYi);
  for (const u of fuWuHouXuan()) {
    if (tiao.includes(u)) continue;
    try {
      const r = await plat.request({ url: u + '/jianKang', method: 'GET', timeout: 2500 });
      const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
      if (j && j.ok) {
        cunFuWuDiZhi(u);
        if (Array.isArray(j.lan) && j.lan.length) plat.setStorage(KEY_LAN, j.lan.slice(0, 4));
        return u;
      }
    } catch {
      /* 这个地址不通 → 试下一个 */
    }
  }
  return '';
}

// 拼接接口地址：fuWu('/bmapapi/place/v2/search')
export function fuWu(lu) {
  return duFuWuDiZhi() + lu;
}
