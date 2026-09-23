// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 离线样例适配器：无需 AK 即可跑通完整流程（评审演示兜底）
import { liangDianJuLi, tuiSuanDian, fangWeiJiao } from '../core/geo/jichu.js';
import { FENLEI_GUANJIANCI } from '../core/types.js';

// 简单可复现伪随机
function suiji(h) {
  let x = Math.sin(h) * 10000;
  return x - Math.floor(x);
}

const MINGZI = {
  yiliao: ['社区卫生服务中心', '康健诊所', '惠民医院', '卫生服务站'],
  jiaoyu: ['第一小学', '阳光幼儿园', '启航教育', '实验二小'],
  gouwu: ['惠民菜市场', '鲜丰生鲜', '利群超市', '便利商店'],
  yanglao: ['怡养养老院', '日间照料中心', '老年活动站'],
  jiaotong: ['公交总站', '地铁口', '共享单车点', '停车场'],
  xiuxian: ['中央公园', '市民广场', '健身中心', '文化馆']
};

// 各方向绕路系数（制造非圆形，体现真实路网各向异性）
function raoLuXiShu(bearing) {
  return (
    1.2 + 0.25 * Math.sin((bearing * Math.PI) / 180) + 0.1 * Math.cos((bearing * Math.PI) / 90)
  );
}

export function chuangJianMock() {
  // 预生成样例 POI：围绕中心散布，不同维度密度不同
  const poiKu = [];
  function zao(center, fenlei, n, banjing) {
    for (let i = 0; i < n; i++) {
      const h = center.lng * 13 + center.lat * 7 + i * 3 + fenlei.length;
      const r = banjing * Math.sqrt(suiji(h)) * 0.9;
      const fw = suiji(h + 1) * 360;
      const p = tuiSuanDian(center, fw, r);
      const ming = MINGZI[fenlei][i % MINGZI[fenlei].length];
      poiKu.push({
        uid: fenlei + i,
        name: ming,
        lng: p.lng,
        lat: p.lat,
        type: fenlei,
        brand: ming.slice(0, 2),
        address: '样例地址'
      });
    }
  }

  return {
    _poiKu: poiKu,
    _init: false,
    _ensure(center) {
      if (this._init) return;
      this._init = true;
      Object.keys(MINGZI).forEach((f, idx) => {
        const n = [10, 8, 14, 5, 16, 9][idx];
        zao(center, f, n, 1400);
      });
    },
    // 步行路线：基于欧氏 × 方向绕路系数，返回直线带抖动的 polyline
    async walkingRoute(origin, dest) {
      const d = liangDianJuLi(origin, dest);
      const fw = fangWeiJiao(origin, dest);
      const k = raoLuXiShu(fw);
      const v = 80; // 米/分钟
      const durationSec = ((d * k) / v) * 60;
      const steps = 6;
      const polyline = [];
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const p = {
          lng: origin.lng + (dest.lng - origin.lng) * t,
          lat: origin.lat + (dest.lat - origin.lat) * t
        };
        polyline.push(p);
      }
      return { durationSec, distanceM: d * k, polyline };
    },
    // 批量距离矩阵
    async routeMatrix(origins, dests) {
      return origins.map(o =>
        dests.map(d => {
          const dist = liangDianJuLi(o, d);
          const fw = fangWeiJiao(o, d);
          const k = raoLuXiShu(fw);
          return { durationSec: ((dist * k) / 80) * 60, distanceM: dist * k };
        })
      );
    },
    // POI 检索
    async searchPoi(center, keywords, banjingMi) {
      this._ensure(center);
      const fenlei = Object.keys(FENLEI_GUANJIANCI).find(f =>
        FENLEI_GUANJIANCI[f].some(kw => keywords.includes(kw))
      );
      return this._poiKu.filter(p => p.type === fenlei && liangDianJuLi(center, p) <= banjingMi);
    },
    // 逆地理：默认居住
    async reverseGeocode() {
      return { address: '样例地址', aoi: 'residential', poiType: 'residential' };
    }
  };
}
