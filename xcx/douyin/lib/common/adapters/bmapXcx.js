// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 小程序端 geo provider：与 Web 端 src/adapters/bmapServer.js 同一套百度 Web 服务接口、同一套坐标处理：
//   出站 WGS-84 → BD-09，入站 BD-09 → WGS-84（百度接口一律按 BD-09 解析）。
// 两头差别：① 传输层 fetch → plat.request（wx / my / tt 三端统一）；
//          ② 多了一条「通道」概念——直连百度（用小程序 AK，端上不依赖任何服务）与服务端 /bmapapi
//             （服务端代持密钥、多 AK 轮换）互为备份，谁通用谁，见 peizhi.bmapMoShi。
import { wgs84ZhuanBd09, bd09ZhuanWgs84 } from '../../core/geo/zuobiao.js';
import { plat } from '../plat.js';
import { fuWu, peiZhi } from '../peizhi.js';

const qu = p => wgs84ZhuanBd09(p.lng, p.lat); // 出站前转 BD-09
const hui = p => bd09ZhuanWgs84(p.lng, p.lat); // 入站后转回 WGS-84

function chuan(canshu) {
  return Object.keys(canshu || {})
    .filter(k => canshu[k] !== undefined && canshu[k] !== null && canshu[k] !== '')
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(canshu[k])}`)
    .join('&');
}

// 通道①：直连百度（用小程序 AK）。微信发请求时会自动带上 servicewechat Referer，
// 所以「微信小程序」类型的 AK 在这里是合法可用的；逆地理编码/配额不足时会返回 302/220
function pinZhiLian(lu, canshu) {
  return `https://api.map.baidu.com${lu}?${chuan({ ...canshu, output: 'json', ak: peiZhi.bmapAk })}`;
}

// 通道②：自有服务端（服务端注入 AK，端上不持密钥，可多 AK 轮换）
function pinFuWuDuan(lu, canshu) {
  return fuWu('/bmapapi' + lu + '?' + chuan({ ...canshu, output: 'json' }));
}

// 记住上一次成功的通道：体检要发上百个请求，不能每次都先撞一次失败的
let tongDao = peiZhi.bmapMoShi === 'fuWuDuan' ? 'fuWuDuan' : 'zhiLian';

// 批量算路（routematrix）是否可用：null 未知 / true 可用 / false 已确认不可用（AK 未开通或配额耗尽）
let juZhenKeYong = null;

// 当前实际使用的通道（展示在界面上，排查时一眼看出走的哪条路）
export function dangQianTongDao() {
  return tongDao;
}

async function qingQiuYiCi(url) {
  const r = await plat.request({ url, method: 'GET', timeout: peiZhi.chaoShiMs });
  let j = r.data;
  if (typeof j === 'string') {
    try {
      j = JSON.parse(j);
    } catch {
      throw new Error(`返回非 JSON（HTTP ${r.statusCode}）：${j.slice(0, 60)}`);
    }
  }
  if (!j) throw new Error(`空响应（HTTP ${r.statusCode}）`);
  if (j.status === 0) return j;
  // 把百度的原因带上，便于分辨「AK 配额 / Referer / 权限未开通」
  throw new Error('status ' + j.status + ' ' + (j.message || ''));
}

// 两条通道互为备份：直连失败（多半是配额或域名白名单）→ 退到服务端；服务端不通 → 回直连。
// 命中过的通道会被记住，后续请求直接走它
async function baiDuGet(lu, canshu) {
  const shunXu = peiZhi.bmapMoShi === 'zhenDuan' ? ['zhiLian', 'fuWuDuan'] : tongDao === 'fuWuDuan' ? ['fuWuDuan', 'zhiLian'] : ['zhiLian', 'fuWuDuan'];
  if (!peiZhi.bmapAk) shunXu.splice(shunXu.indexOf('zhiLian'), 1);
  const cuo = [];
  for (const mo of shunXu) {
    const url = mo === 'zhiLian' ? pinZhiLian(lu, canshu) : pinFuWuDuan(lu, canshu);
    try {
      const j = await qingQiuYiCi(url);
      tongDao = mo;
      return j;
    } catch (e) {
      cuo.push((mo === 'zhiLian' ? '直连' : '服务端') + '：' + (e && e.message));
    }
  }
  throw new Error(
    '百度接口不可用（' +
      cuo.join('；') +
      '）。排查：① 开发者工具「详情 → 本地设置」勾选“不校验合法域名”；② 真机需在小程序后台把 api.map.baidu.com 与自有服务端域名加进 request 合法域名；③ 百度 AK 当日配额用尽需换 AK'
  );
}

function jieXiLuXian(pathStr) {
  if (!pathStr) return [];
  const chu = [];
  for (const s of String(pathStr).split(';')) {
    const [lng, lat] = s.split(',').map(Number);
    if (Number.isFinite(lng) && Number.isFinite(lat)) chu.push({ lng, lat });
  }
  return chu;
}

export function chuangJianBmapXcx() {
  return {
    // 百度地点检索一次只认一个关键词：引擎据此把「维度 × 关键词」展开并发提交
    danGuanJianCi: true,

    // 单条路线（步行）：引擎的算路入口，内部转发到 quLuXian，不重复一份实现
    walkingRoute(origin, dest) {
      return this.quLuXian('walking', origin, dest);
    },

    /* 当前位置的实时天气：先逆地理拿行政区码 adcode（weather 接口按区县查，不认坐标），
       再查该区的 now。两步都走既有双通道；location 同样要 BD-09（百度按它解析）。
       extensions_adcode=true 才会返回 addressComponent.adcode（百度文档约定）。
       海外点 / 权限未开会抛错 —— 上层 quTianQi 静默处理 */
    async tianQi(dian) {
      const o = qu(dian);
      const ni = await baiDuGet('/reverse_geocoding/v3', {
        location: `${o.lat},${o.lng}`,
        extensions_adcode: 'true'
      });
      const quMa = ni.result && ni.result.addressComponent && ni.result.addressComponent.adcode;
      if (!quMa) throw new Error('baidu:取不到行政区码');
      // 天气接口的路径必须带尾斜杠（/weather/v1/）：不带会被百度当 404 返回搜索页 HTML
      const j = await baiDuGet('/weather/v1/', { district_id: quMa, data_type: 'now' });
      // 百度 weather 的字段是 snake_case：temp / text / wind_dir（不是高德那套 temperature / windDir）
      const now = (j.result && j.result.now) || {};
      return { wendu: now.temp !== undefined ? String(now.temp) : '', wen: now.text || '', feng: now.wind_dir || '' };
    },

    /* 四种出行方式按需算一条：网页端是四种并行算好再让用户挑，小程序端点哪个算哪个
       （百度配额有限，见 peizhi.qps；四种并行的请求量在小程序上没必要）。
       四个路径的返回结构一致：routes[0] 带 duration（秒）/ distance（米），steps[].path 拼折线。
       公交是个例外：它的 steps 里只有步行段带 path，拼出来是断的 —— 所以公交只给耗时距离、不画线。
       transit 必须给 region（城市名，取不到用「中国」兜底，与网页端跳百度地图时的做法一致） */
    async quLuXian(mo, origin, dest, opt = {}) {
      const o = qu(origin);
      const d = qu(dest);
      const LU = {
        walking: '/direction/v2/walking',
        riding: '/direction/v2/riding',
        driving: '/direction/v2/driving',
        transit: '/direction/v2/transit'
      };
      // direction/v2 要求纬度在前（lat,lng）
      const can = { origin: `${o.lat},${o.lng}`, destination: `${d.lat},${d.lng}` };
      if (mo === 'transit') can.region = opt.region || '中国';
      const j = await baiDuGet(LU[mo] || LU.walking, can);
      const r = (j.result && j.result.routes && j.result.routes[0]) || null;
      if (!r) throw new Error('baidu:路线为空');
      const ju = (r.steps || []).map(s => s.path).filter(Boolean).join(';');
      return {
        durationSec: r.duration,
        distanceM: r.distance,
        polyline: mo === 'transit' ? [] : jieXiLuXian(ju).map(hui)
      };
    },

    // 批量算路：小程序端 URL 长度与并发都受平台限制，固定按 10×10 拆批再合并（与 Web 端同策略）。
    // 注意：routematrix 属 Web 服务接口，「微信小程序」类型的 AK 通常未开通（实测返回 status 240
    // 「APP 服务被禁用」）。这类失败一次就记住，后续直接抛错——引擎会落到直线估算，不必反复白跑
    async routeMatrix(origins, dests) {
      if (juZhenKeYong === false) throw new Error('批量算路在本通道不可用（AK 未开通该服务），已按直线估算处理');
      const OP = 10;
      const DP = 10;
      const jie = origins.map(() => dests.map(() => ({ durationSec: Infinity, distanceM: Infinity })));
      const pi = [];
      for (let i = 0; i < origins.length; i += OP) {
        for (let j = 0; j < dests.length; j += DP) {
          pi.push({ i, j, o: origins.slice(i, i + OP), d: dests.slice(j, j + DP) });
        }
      }
      let zhi = 0;
      const gongZuo = async () => {
        while (zhi < pi.length) {
          const p = pi[zhi++];
          let j;
          try {
            j = await baiDuGet('/routematrix/v2/walking', {
              origins: p.o.map(q => { const w = qu(q); return `${w.lat},${w.lng}`; }).join('|'),
              destinations: p.d.map(q => { const w = qu(q); return `${w.lat},${w.lng}`; }).join('|')
            });
          } catch (e) {
            // 未开通（240）这类硬失败：记住它，别让每个批次都白跑一次
            if (/240|服务被禁用|不可用/.test((e && e.message) || '')) juZhenKeYong = false;
            throw e;
          }
          const ge = j.result || [];
          const lie = Math.max(1, p.d.length);
          p.o.forEach((_, a) =>
            p.d.forEach((q, b) => {
              const e = ge[a * lie + b] || {};
              jie[p.i + a][p.j + b] = {
                durationSec: (e.duration && e.duration.value) ?? Infinity,
                distanceM: (e.distance && e.distance.value) ?? Infinity
              };
            })
          );
        }
      };
      await Promise.all(Array.from({ length: Math.min(4, Math.max(1, pi.length)) }, gongZuo));
      return jie;
    },

    async searchPoi(center, keywords, radiusMi) {
      const zx = qu(center); // 检索圆心也按 BD-09
      const out = [];
      for (const kw of keywords) {
        const j = await baiDuGet('/place/v2/search', {
          query: kw,
          location: `${zx.lat},${zx.lng}`,
          radius: radiusMi,
          scope: 2,
          page_size: 20
        });
        let results = j.results || [];
        // 第一页拉满 20 条说明圈内还有更多：追加第二页（合计最多 40 条），提高设施覆盖密度
        if (results.length >= 20) {
          try {
            const j2 = await baiDuGet('/place/v2/search', {
              query: kw,
              location: `${zx.lat},${zx.lng}`,
              radius: radiusMi,
              scope: 2,
              page_size: 20,
              page_num: 1
            });
            results = results.concat(j2.results || []);
          } catch {
            /* 第二页失败不影响第一页 */
          }
        }
        for (const p of results) {
          const w = hui(p.location);
          out.push({
            uid: p.uid,
            name: p.name,
            lng: w.lng,
            lat: w.lat,
            type: '',
            address: p.address || ''
          });
        }
      }
      return out;
    },

    async reverseGeocode(point) {
      const w = qu(point);
      const j = await baiDuGet('/reverse_geocoding/v3', { location: `${w.lat},${w.lng}` });
      const r = j.result || {};
      const sem = r.sematic_description || '';
      const addr = r.formatted_address || '';
      let poiType = 'residential';
      if (/湖|河|江|湿地|公园|绿地|工业|厂房|铁路|高铁/.test(addr + sem)) poiType = 'fei_juzhu';
      return { address: addr, aoi: sem, poiType };
    }
  };
}

/* ─────────────── 当前位置天气（地图页主卡 + AI 助手共用） ───────────────
   天气的两步接口（逆地理取 adcode → weather now）本来就属于本适配器，缓存与现象映射
   也放在这里 —— 不单独开 tianQi.js 文件：微信开发者工具的文件监听对「运行期间新增的
   文件」会失忆（内容变化能拾取、新增文件拾取不到），新增文件曾导致 lib 模块表缺文件、
   整个页面链加载失败。原则：common 下不为小功能开新文件。 */

// 现象文字 → 图标档位（app.wxss 的 .ic-tq-*）：百度 text 是「小雨 / 雷阵雨 / 多云…」这类
// 自由词，用关键词分到五档 —— 晴 / 云（含阴）/ 雨（含雷阵雨）/ 雪 / 雾（含霾沙尘），认不出按云兜底
export function tianQiTu(wen) {
  const s = String(wen || '');
  if (/雪|冰雹/.test(s)) return 'ic-tq-xue';
  if (/雨|雷/.test(s)) return 'ic-tq-yu';
  if (/雾|霾|沙|尘/.test(s)) return 'ic-tq-wu';
  if (/晴/.test(s) && !/多云/.test(s)) return 'ic-tq-qing';
  return 'ic-tq-yun';
}

// 缓存：30 分钟有效，key 用 0.05° 网格（约 5 公里内视为同一处）—— weather 按区县配额，
// 地图页 onShow、AI 每次提问都来调，不能每次都真打接口
const TIAN_QI_HUO_MIAO = 30 * 60 * 1000;
let tianQiHuan = { key: '', shi: 0, shu: null };

/* 查当前位置天气（带缓存）：返回 { wendu, wen, tu } 或 null（没坐标 / 拉失败）。
   失败一律返回 null —— 天气是锦上添花，任何调用方都不该为它弹错或打断主流程 */
export async function quTianQi(dian) {
  if (!dian || !Number.isFinite(dian.lng) || !Number.isFinite(dian.lat)) return null;
  const key = dian.lat.toFixed(2) + ',' + dian.lng.toFixed(2);
  const xian = Date.now();
  if (tianQiHuan.key === key && xian - tianQiHuan.shi < TIAN_QI_HUO_MIAO) return tianQiHuan.shu;
  try {
    const x = await chuangJianBmapXcx().tianQi(dian);
    const shu = x && x.wendu ? { wendu: x.wendu, wen: x.wen || '', tu: tianQiTu(x.wen) } : null;
    if (shu) tianQiHuan = { key, shi: xian, shu };
    return shu;
  } catch {
    return null;
  }
}
