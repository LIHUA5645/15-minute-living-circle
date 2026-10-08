// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，08
// 当前位置天气（Web 端）：顶栏天气 chip 与 AI 在线问答的天气感知共用这一份。
// 与小程序端 xcx/common/tianQi.js 同构（30 分钟缓存 + 0.05° 网格 + 失败返回 null），
// 差别只有传输层：plat.request → fetch，且走 /bmapapi 代理（Vite 中间件与 fuwuqi 都转发，
// AK 由服务端注入）。刻意没塞进 bmapServer 适配器 —— 天气只有两步请求，不值得动体检那套
// 限流池，独立小模块让 App.jsx 与 aiLiaoTian 都能零成本调用。
import { fuWuUrl } from './fuwuDiZhi.js';

const HUO_MIAO = 30 * 60 * 1000;
let huan = { key: '', shi: 0, shu: null };

/* 现象文字 → 图标档位：返回值同时用作 lucide 图标名（App.jsx 顶栏 chip）与 AI 描述 */
export function tianQiTu(wen) {
  const s = String(wen || '');
  if (/雪|冰雹/.test(s)) return 'xue';
  if (/雨|雷/.test(s)) return 'yu';
  if (/雾|霾|沙|尘/.test(s)) return 'wu';
  if (/晴/.test(s) && !/多云/.test(s)) return 'qing';
  return 'yun';
}

async function baiDuGet(lu, params) {
  const qs = new URLSearchParams({ ...params, output: 'json' });
  const resp = await fetch(fuWuUrl('/bmapapi' + lu + '?' + qs.toString()));
  const wenBen = await resp.text();
  let json;
  try {
    json = JSON.parse(wenBen);
  } catch {
    throw new Error(`baidu 非 JSON 响应（HTTP ${resp.status}）：${wenBen.slice(0, 60)}`);
  }
  if (json.status !== 0) throw new Error('baidu:' + json.status + ' ' + (json.message || ''));
  return json;
}

/* 查当前位置天气（带缓存）：返回 { wendu, wen, tu } 或 null（没坐标 / 拉失败） */
export async function quTianQi(dian) {
  if (!dian || !Number.isFinite(dian.lng) || !Number.isFinite(dian.lat)) return null;
  const key = dian.lat.toFixed(2) + ',' + dian.lng.toFixed(2);
  const xian = Date.now();
  if (huan.key === key && xian - huan.shi < HUO_MIAO) return huan.shu;
  try {
    // 两步：逆地理拿行政区码（weather 按区县查，extensions_adcode=true 才返回 adcode）→ 实时天气。
    // 天气接口路径必须带尾斜杠 /weather/v1/：不带会被百度当 404 返回搜索页 HTML（小程序端踩过的坑）
    const o = new URLSearchParams({ location: `${dian.lat},${dian.lng}`, extensions_adcode: 'true' });
    const ni = await baiDuGet('/reverse_geocoding/v3', Object.fromEntries(o));
    const quMa = ni.result && ni.result.addressComponent && ni.result.addressComponent.adcode;
    if (!quMa) throw new Error('baidu:取不到行政区码');
    const j = await baiDuGet('/weather/v1/', { district_id: quMa, data_type: 'now' });
    const now = (j.result && j.result.now) || {};
    const shu =
      now.temp !== undefined && now.temp !== ''
        ? { wendu: String(now.temp), wen: now.text || '', tu: tianQiTu(now.text) }
        : null;
    if (shu) huan = { key, shi: xian, shu };
    return shu;
  } catch {
    return null; // 静默：天气拉不到就当没有
  }
}
