// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 小程序端 geo provider：走自有服务端的 /bmapapi（服务端注入 AK + 多 AK 轮换），
// 与 Web 端 src/adapters/bmapServer.js 同一套百度 Web 服务接口、同一套坐标处理：
//   出站 WGS-84 → BD-09，入站 BD-09 → WGS-84（百度接口一律按 BD-09 解析）。
// 差别只在传输层：fetch → plat.request（微信 wx.request / 支付宝 my.request / 抖音 tt.request）。
import { wgs84ZhuanBd09, bd09ZhuanWgs84 } from '../../core/geo/zuobiao.js';
import { plat } from '../plat.js';
import { fuWu, peiZhi } from '../peizhi.js';

const qu = p => wgs84ZhuanBd09(p.lng, p.lat); // 出站前转 BD-09
const hui = p => bd09ZhuanWgs84(p.lng, p.lat); // 入站后转回 WGS-84

function pin(lu, canshu) {
  const qs = Object.keys(canshu || {})
    .filter(k => canshu[k] !== undefined && canshu[k] !== null && canshu[k] !== '')
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(canshu[k])}`)
    .join('&');
  return fuWu('/bmapapi' + lu + (qs ? '?' + qs : ''));
}

async function baiDuGet(lu, canshu) {
  const r = await plat.request({ url: pin(lu, { ...canshu, output: 'json' }), method: 'GET', timeout: peiZhi.chaoShiMs });
  let j = r.data;
  if (typeof j === 'string') {
    try {
      j = JSON.parse(j);
    } catch {
      throw new Error(`百度返回非 JSON（HTTP ${r.statusCode}）：${String(j).slice(0, 60)}`);
    }
  }
  if (!j || j.status !== 0) throw new Error('baidu:' + ((j && j.status) || r.statusCode) + ' ' + ((j && j.message) || ''));
  return j;
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

    async walkingRoute(origin, dest) {
      const o = qu(origin);
      const d = qu(dest);
      // direction/v2 要求纬度在前（lat,lng）
      const j = await baiDuGet('/direction/v2/walking', {
        origin: `${o.lat},${o.lng}`,
        destination: `${d.lat},${d.lng}`
      });
      const r = (j.result && j.result.routes && j.result.routes[0]) || null;
      if (!r) throw new Error('baidu:步行路线为空');
      const ju = (r.steps || []).map(s => s.path).join(';');
      return {
        durationSec: r.duration,
        distanceM: r.distance,
        polyline: jieXiLuXian(ju).map(hui)
      };
    },

    // 批量算路：小程序端 URL 长度与并发都受平台限制，固定按 10×10 拆批再合并（与 Web 端同策略）
    async routeMatrix(origins, dests) {
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
          const j = await baiDuGet('/routematrix/v2/walking', {
            origins: p.o.map(q => { const w = qu(q); return `${w.lat},${w.lng}`; }).join('|'),
            destinations: p.d.map(q => { const w = qu(q); return `${w.lat},${w.lng}`; }).join('|')
          });
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
