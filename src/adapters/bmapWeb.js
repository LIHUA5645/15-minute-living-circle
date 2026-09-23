// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 浏览器端适配器：基于 BMap GL JS SDK（LocalSearch / DirectionService / Geocoder）
/* global BMAP_MODE_WALKING */
// 坐标系约定：核心引擎内部统一使用 WGS-84；
//   调用百度接口前 WGS-84 → BD-09，百度返回结果 BD-09 → WGS-84，保证与 OSM 数据/瓦片底图一致。
// 说明：批量距离矩阵为 Web 服务 API，浏览器端直连受限，本适配器 routeMatrix 返回 null，
//       盲区识别自动降级为并发步行算路（桌面端 Electron 服务端适配器才启用矩阵）。
import { wgs84ZhuanBd09, bd09ZhuanWgs84 } from '../core/geo/zuobiao.js';

function huoBMap() {
  const B = typeof window !== 'undefined' ? window.BMapGL : null;
  if (!B) throw new Error('BMapGL 未加载，请确认 index.html 已引入百度地图 JS API');
  return B;
}

function daiBiao(fn) {
  return new Promise((resolve, reject) => {
    try {
      fn((err, data) => (err ? reject(err) : resolve(data)));
    } catch (e) {
      reject(e);
    }
  });
}

export function chuangJianBmapWeb() {
  const B = huoBMap();
  // 内部 WGS-84 → 百度 BD-09
  const dian = p => {
    const q = wgs84ZhuanBd09(p.lng, p.lat);
    return new B.Point(q.lng, q.lat);
  };
  // 百度 BD-09 → 内部 WGS-84
  const hui = p => bd09ZhuanWgs84(p.lng, p.lat);

  return {
    // 步行路线
    walkingRoute(origin, dest) {
      return daiBiao(cb => {
        const ds = new B.DirectionService();
        ds.route(
          {
            origin: dian(origin),
            destination: dian(dest),
            mode: BMAP_MODE_WALKING
          },
          res => {
            try {
              const plan = res.getPlan(0);
              const distanceM = plan.getDistance(true);
              const durationSec = plan.getDuration(true);
              const path = plan.getPath();
              const polyline = (path || []).map(p => hui(p));
              cb(null, { durationSec, distanceM, polyline });
            } catch (e) {
              cb(e);
            }
          }
        );
      });
    },

    // 批量矩阵：浏览器端不支持，返回 null 触发降级
    async routeMatrix() {
      return null;
    },

    // POI 周边检索（单关键词组）
    searchPoi(center, keywords, radiusMi) {
      return daiBiao(cb => {
        const ls = new B.LocalSearch(new B.Map(document.createElement('div')), {
          onSearchComplete(results) {
            try {
              const out = [];
              if (!results || results.getNumPois() === 0) return cb(null, out);
              for (let i = 0; i < results.getNumPois(); i++) {
                const poi = results.getPoi(i);
                const q = hui(poi.point);
                out.push({
                  uid: poi.uid || `${poi.title}_${i}`,
                  name: poi.title,
                  lng: q.lng,
                  lat: q.lat,
                  type: '',
                  address: poi.address || ''
                });
              }
              cb(null, out);
            } catch (e) {
              cb(e);
            }
          }
        });
        ls.searchNearby(keywords.join('|'), dian(center), radiusMi);
      });
    },

    // 逆地理编码：用于居住性过滤
    reverseGeocode(point) {
      return daiBiao(cb => {
        const gc = new B.Geocoder();
        gc.getLocation(dian(point), res => {
          try {
            const sem = (res && res.surroundingPois && res.surroundingPois[0]?.title) || '';
            const addr = (res && res.address) || '';
            let poiType = 'residential';
            if (/湖|河|江|湿地|公园|绿地|工业|厂房|铁路|高铁/.test(addr + sem))
              poiType = 'fei_juzhu';
            cb(null, { address: addr, aoi: sem, poiType });
          } catch (e) {
            cb(e);
          }
        });
      });
    }
  };
}
