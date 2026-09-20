// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，20
// 服务端适配器（Electron 主进程 / Node 使用）：调用百度 Web 服务 API，
// 启用批量距离矩阵 routematrix，主进程自定义 Referer 头绕过 AK 校验、隐藏密钥。
// 浏览器端同样复用本模块：api 传相对路径 /bmapapi，AK 由 Vite 中间件在服务端注入。
//
// 注意：浏览器里没有 process 对象，早期版本直接读 process.env 会抛 ReferenceError，
// 被上层的容错 catch 吞掉后表现为「静默降级」，排查成本很高。这里统一用安全读取。
function duHuanJing(ming) {
  if (typeof process === 'undefined' || !process.env) return '';
  return process.env[ming] || '';
}

async function baiDuGet(api, path, params) {
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
  const resp = await fetch(`${api}${path}?${qs.toString()}`, { headers: tou });
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
  return pathStr.split(';').map((s) => {
    const [lng, lat] = s.split(',').map(Number);
    return { lng, lat };
  });
}

export function chuangJianBmapServer(cfg = {}) {
  const ak = cfg.ak || duHuanJing('BAIDU_SERVER_AK');
  const api = cfg.api || 'https://api.map.baidu.com';
  const referer = cfg.referer || 'http://localhost';

  return {
    async walkingRoute(origin, dest) {
      const json = await baiDuGet(api, '/direction/v2/walking', {
        ak,
        // direction/v2 要求纬度在前（lat,lng）
        origin: `${origin.lat},${origin.lng}`,
        destination: `${dest.lat},${dest.lng}`,
        _referer: referer,
      });
      const r = json.result.routes[0];
      return {
        durationSec: r.duration,
        distanceM: r.distance,
        polyline: jieXiLuXian(r.steps?.map((s) => s.path).join(';')),
      };
    },

    async routeMatrix(origins, dests) {
      // 批量算路 RouteMatrix v2：扁平数组按行优先返回，duration/distance 为 {text, value} 对象
      const json = await baiDuGet(api, '/routematrix/v2/walking', {
        ak,
        origins: origins.map((o) => `${o.lat},${o.lng}`).join('|'),
        destinations: dests.map((d) => `${d.lat},${d.lng}`).join('|'),
        _referer: referer,
      });
      const ge = json.result || [];
      const lie = Math.max(1, dests.length);
      return origins.map((_, i) =>
        dests.map((_, j) => {
          const e = ge[i * lie + j] || {};
          return {
            durationSec: e.duration?.value ?? Infinity,
            distanceM: e.distance?.value ?? Infinity,
          };
        })
      );
    },

    async searchPoi(center, keywords, radiusMi) {
      const out = [];
      for (const kw of keywords) {
        const json = await baiDuGet(api, '/place/v2/search', {
          ak,
          query: kw,
          location: `${center.lat},${center.lng}`,
          radius: radiusMi,
          scope: 2,
          page_size: 20,
          _referer: referer,
        });
        for (const p of json.results || []) {
          out.push({
            uid: p.uid,
            name: p.name,
            lng: p.location.lng,
            lat: p.location.lat,
            type: '',
            address: p.address || '',
          });
        }
      }
      return out;
    },

    async reverseGeocode(point) {
      const json = await baiDuGet(api, '/reverse_geocoding/v3', {
        ak,
        location: `${point.lat},${point.lng}`,
        _referer: referer,
      });
      const sem = json.result.sematic_description || '';
      const addr = json.result.formatted_address || '';
      let poiType = 'residential';
      if (/湖|河|江|湿地|公园|绿地|工业|厂房|铁路|高铁/.test(addr + sem)) poiType = 'fei_juzhu';
      return { address: addr, aoi: sem, poiType };
    },
  };
}
