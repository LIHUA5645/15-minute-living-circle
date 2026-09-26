// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，20
// 服务端适配器（Electron 主进程 / Node 使用）：调用百度 Web 服务 API，
// 启用批量距离矩阵 routematrix，主进程自定义 Referer 头绕过 AK 校验、隐藏密钥。
// 浏览器端同样复用本模块：api 传相对路径 /bmapapi，AK 由 Vite 中间件在服务端注入。
//
// 注意：浏览器里没有 process 对象，早期版本直接读 process.env 会抛 ReferenceError，
// 被上层的容错 catch 吞掉后表现为「静默降级」，排查成本很高。这里统一用安全读取。
// 坐标系约定（与 bmapWeb 适配器一致）：核心引擎内部统一 WGS-84；
//   调百度 Web API 前先 WGS-84 → BD-09，返回的路线/POI（BD-09）再转回 WGS-84。
//   缺了这层转换，体检设施/步行路线/等时圈会整体偏移约 500~700 米（曾致路线穿河、
//   与浏览器端适配器规划的同一条路线对不上）。
import { wgs84ZhuanBd09, bd09ZhuanWgs84 } from '../core/geo/zuobiao.js';

function duHuanJing(ming) {
  if (typeof process === 'undefined' || !process.env) return '';
  return process.env[ming] || '';
}

// WGS-84 → BD-09（出站前转）
function qu(p) {
  return wgs84ZhuanBd09(p.lng, p.lat);
}
// BD-09 → WGS-84（入站后转）
function hui(p) {
  return bd09ZhuanWgs84(p.lng, p.lat);
}

async function baiDuGet(api, path, params, chaoShiMs = 15000) {
  // 支持相对 api（浏览器经 Vite/nginx 代理调用，AK 由服务端注入，前端不持有密钥）
  const qs = new URLSearchParams();
  for (const k of Object.keys(params)) {
    if (k === '_referer') continue;
    if (k === 'ak' && !params[k]) continue; // 空 AK 交由代理服务端注入
    qs.set(k, params[k]);
  }
  // 百度 Web 服务 API 部分接口默认吐 XML（place/v2/search 就是），不显式要 json 的话
  // 响应体是 <PlaceSearchResponse>…，resp.json() 会直接抛解析错，白白浪费一次请求
  if (!qs.has('output')) qs.set('output', 'json');
  const tou = params._referer ? { Referer: params._referer } : undefined;
  // 必须带超时：百度接口被限流/网络半死时，请求会一直挂着不返回也不报错，
  // 上层限流池会跟着一起卡死（曾出现过整个体检停在 0% 永不结束）。超时后走重试与降级。
  const kong = new AbortController();
  const jiShi = setTimeout(() => kong.abort(), chaoShiMs);
  let resp;
  try {
    resp = await fetch(`${api}${path}?${qs.toString()}`, { headers: tou, signal: kong.signal });
  } catch (e) {
    throw new Error(`baidu 请求失败（${path}）：${(e && e.message) || '网络异常'}`, { cause: e });
  } finally {
    clearTimeout(jiShi);
  }
  const wenBen = await resp.text();
  let json;
  try {
    json = JSON.parse(wenBen);
  } catch {
    // 把返回体片段带出来，避免只看到「Unexpected token <」这种没法定位的错误
    throw new Error(`baidu 非 JSON 响应（HTTP ${resp.status}）：${wenBen.slice(0, 80)}`);
  }
  if (json.status !== 0) throw new Error('baidu:' + json.status + ' ' + (json.message || ''));
  return json;
}

function jieXiLuXian(pathStr) {
  if (!pathStr) return [];
  return pathStr.split(';').map(s => {
    const [lng, lat] = s.split(',').map(Number);
    return { lng, lat };
  });
}

export function chuangJianBmapServer(cfg = {}) {
  const ak = cfg.ak || duHuanJing('BAIDU_SERVER_AK');
  const api = cfg.api || 'https://api.map.baidu.com';
  const referer = cfg.referer || 'http://localhost';

  return {
    // 标记：本适配器的 searchPoi 一次只认一个关键词（百度地点检索接口本身如此），
    // 调用方据此把「分类 × 关键词」展开并发提交，否则只能串行等待，30 多个关键词要跑两三分钟
    danGuanJianCi: true,

    async walkingRoute(origin, dest) {
      const o = qu(origin);
      const d = qu(dest);
      const json = await baiDuGet(api, '/direction/v2/walking', {
        ak,
        // direction/v2 要求纬度在前（lat,lng），且坐标为 BD-09
        origin: `${o.lat},${o.lng}`,
        destination: `${d.lat},${d.lng}`,
        _referer: referer
      });
      const r = json.result.routes[0];
      return {
        durationSec: r.duration,
        distanceM: r.distance,
        // 返回的路线点是 BD-09，转回 WGS-84 再交给内部引擎绘制
        polyline: jieXiLuXian(r.steps?.map(s => s.path).join(';')).map(hui)
      };
    },

    async routeMatrix(origins, dests) {
      // 批量算路 RouteMatrix v2：扁平数组按行优先返回，duration/distance 为 {text, value} 对象。
      // 单次请求的起终点数量与 URL 长度都有上限：把上百个起终点拼进一个 URL 会导致请求行过长，
      // 经 Vite 代理转发时直接被拒（实测 HTTP 431 Request Header Fields Too Large，整轮体检白跑）。
      // 这里固定按 10×10 拆批，再合并回完整矩阵；批间用小并发，避免退化成串行等待。
      const OP = 10;
      const DP = 10;
      const jie = origins.map(() =>
        dests.map(() => ({ durationSec: Infinity, distanceM: Infinity }))
      );
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
          const json = await baiDuGet(api, '/routematrix/v2/walking', {
            ak,
            // 起终点一律先转 BD-09（矩阵接口按 BD-09 解析坐标）
            origins: p.o.map(q => { const w = qu(q); return `${w.lat},${w.lng}`; }).join('|'),
            destinations: p.d.map(q => { const w = qu(q); return `${w.lat},${w.lng}`; }).join('|'),
            _referer: referer
          });
          const ge = json.result || [];
          const lie = Math.max(1, p.d.length);
          p.o.forEach((_, a) =>
            p.d.forEach((q, b) => {
              const e = ge[a * lie + b] || {};
              jie[p.i + a][p.j + b] = {
                durationSec: e.duration?.value ?? Infinity,
                distanceM: e.distance?.value ?? Infinity
              };
            })
          );
        }
      };
      await Promise.all(Array.from({ length: Math.min(6, Math.max(1, pi.length)) }, gongZuo));
      return jie;
    },

    async searchPoi(center, keywords, radiusMi) {
      const out = [];
      const zx = qu(center); // 检索圆心也先转 BD-09
      for (const kw of keywords) {
        const json = await baiDuGet(api, '/place/v2/search', {
          ak,
          query: kw,
          location: `${zx.lat},${zx.lng}`,
          radius: radiusMi,
          scope: 2,
          page_size: 20,
          _referer: referer
        });
        let results = json.results || [];
        // 第一页拉满 20 条说明该关键词在圈内还有更多结果，追加第二页（共 40 条），提高设施覆盖密度
        if (results.length >= 20) {
          try {
            const j2 = await baiDuGet(api, '/place/v2/search', {
              ak,
              query: kw,
              location: `${center.lat},${center.lng}`,
              radius: radiusMi,
              scope: 2,
              page_size: 20,
              page_num: 1,
              _referer: referer
            });
            results = results.concat(j2.results || []);
          } catch {
            /* 第二页失败不影响第一页结果 */
          }
        }
        for (const p of results) {
          const w = hui(p.location); // BD-09 → WGS-84
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
      const w = qu(point); // 逆地理编码按 BD-09 解析，先转
      const json = await baiDuGet(api, '/reverse_geocoding/v3', {
        ak,
        location: `${w.lat},${w.lng}`,
        _referer: referer
      });
      const sem = json.result.sematic_description || '';
      const addr = json.result.formatted_address || '';
      let poiType = 'residential';
      if (/湖|河|江|湿地|公园|绿地|工业|厂房|铁路|高铁/.test(addr + sem)) poiType = 'fei_juzhu';
      return { address: addr, aoi: sem, poiType };
    }
  };
}
