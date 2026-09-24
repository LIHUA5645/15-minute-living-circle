// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，23
// 出行方式路线规划（步行 / 骑行 / 驾车 / 公交）：走浏览器端百度 JS API（与底图同一 AK 与配额池，
// 不占服务端 Web 服务配额），返回与内部统一 WGS-84 的折线与距离耗时，供导航模拟复用。
import { loadBmap } from './loadBmap.js';
import { bd09ZhuanWgs84 } from '../core/geo/zuobiao.js';
import { liangDianJuLi } from '../core/geo/jichu.js';

// 各方式默认速度（米/秒），服务端没给耗时或结果为字符串时兜底估算
const MO_REN_SU_DU = { walk: 1.33, riding: 3.33, driving: 8.33, transit: 5 };
const FANG_SHI_MING = {
  walk: 'WalkingRoute',
  riding: 'RidingRoute',
  driving: 'DrivingRoute',
  transit: 'TransitRoute'
};

// 「2.1公里」「1489 米」→ 米；纯数字直接用
function jieXiMi(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const m = String(v || '').match(/([\d.]+)\s*(公里|千米|米|m)/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return /公里|千米/i.test(m[2]) ? Math.round(n * 1000) : Math.round(n);
}
// 「11分钟」「1小时5分钟」→ 秒；纯数字直接用
function jieXiMiao(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v || '');
  let miao = 0;
  const x = s.match(/([\d.]+)\s*小时/);
  const f = s.match(/([\d.]+)\s*分/);
  if (x) miao += parseFloat(x[1]) * 3600;
  if (f) miao += parseFloat(f[1]) * 60;
  return Math.round(miao);
}

// 把各种 Plan 里能拿到的路径点尽量抠出来（实测 GL：step 不暴露 getPath()，路径在
// route._points / step._path 私有字段里；公交在 lines 里，逐层兼容）
function tiQuDian(plan) {
  const dian = [];
  const shou = pt => {
    if (pt && Number.isFinite(pt.lng) && Number.isFinite(pt.lat)) dian.push(pt);
  };
  // ① route 整体路径：getPath() 或私有 _points（GL 实测主要来源）
  try {
    const route = plan.getRoute(0);
    const pts = (route.getPath && route.getPath()) || route._points || [];
    pts.forEach(shou);
    // ② 逐 step 的 _path 补充
    if (dian.length < 2 && route.getNumSteps) {
      const n = route.getNumSteps();
      for (let i = 0; i < n; i++) {
        const st = route.getStep(i);
        const lu = (st.getPath && st.getPath()) || st._path || [];
        lu.forEach(shou);
      }
    }
  } catch {
    /* 换下一种结构 */
  }
  // ③ TransitRoute：plan.getLines()[i].getPoints() / getPath() / _points
  if (dian.length < 2) {
    try {
      const xian = plan.getLines ? plan.getLines() : [];
      xian.forEach(l => {
        const pts = (l.getPoints && l.getPoints()) || (l.getPath && l.getPath()) || l._points || [];
        pts.forEach(shou);
      });
    } catch {
      /* 忽略 */
    }
  }
  return dian;
}

// 公交/地铁方案规划：返回多套完整方案（高德式方案卡数据源）
// 每套：{ haoShiMiao, juLiMi, buXingMi, xian: [{ming, lei, zhanShu, juLiMi}], polyline }
export function guiHuaJiaoTong(from, to) {
  return new Promise((resolve, reject) => {
    loadBmap()
      .then(B => {
        if (!B || !B.TransitRoute) {
          reject(new Error('当前地图未就绪，无法规划公交方案'));
          return;
        }
        let yiWan = false;
        const dingWei = new B.Point(from.lng, from.lat);
        const sou = new B.TransitRoute(dingWei, {
          onSearchComplete: r => {
            if (yiWan) return;
            yiWan = true;
            try {
              if (!r || r.Err || r.error || !r.getPlan || !r.getNumPlans || r.getNumPlans() < 1) {
                reject(new Error('没有规划到可行的公交方案'));
                return;
              }
              const fangAn = [];
              const n = Math.min(4, r.getNumPlans());
              for (let i = 0; i < n; i++) {
                const p = r.getPlan(i);
                if (!p) continue;
                // 每条线路：标题、类型（0=公交 1=地铁）、途经站数、路径点
                const xian = [];
                let dianBd = [];
                let cheJuLi = 0;
                const nL = p.getNumLines ? p.getNumLines() : 0;
                for (let j = 0; j < nL; j++) {
                  const l = p.getLine(j);
                  if (!l) continue;
                  const lei = l.type === 1 ? 'ditie' : 'gongjiao';
                  const juLiMi = jieXiMi((l.getDistance && l.getDistance()) || l._distance);
                  cheJuLi += juLiMi;
                  xian.push({
                    ming: (l.getTitle && l.getTitle()) || '',
                    lei,
                    zhanShu: (l.getNumViaStops && l.getNumViaStops()) || 0,
                    juLiMi
                  });
                  const pts = (l.getPoints && l.getPoints()) || l._points || [];
                  dianBd = dianBd.concat(pts);
                }
                if (dianBd.length < 2) continue;
                const polyline = dianBd.map(pt => bd09ZhuanWgs84(pt.lng, pt.lat));
                // 总距离（含步行）减去乘车距离 ≈ 步行距离
                const zongMi = jieXiMi(p.getDistance && p.getDistance());
                fangAn.push({
                  haoShiMiao: jieXiMiao(p.getDuration && p.getDuration()),
                  juLiMi: zongMi || Math.round(distanceHe(polyline)),
                  buXingMi: Math.max(0, (zongMi || cheJuLi) - cheJuLi),
                  xian,
                  polyline
                });
              }
              if (!fangAn.length) {
                reject(new Error('该出行方式在此路线上没有可用方案'));
                return;
              }
              resolve({ fangAn });
            } catch (e) {
              reject(new Error('公交方案解析失败：' + (e && e.message)));
            }
          }
        });
        sou.search(new B.Point(from.lng, from.lat), new B.Point(to.lng, to.lat));
        // 公交规划较慢，放宽到 20 秒
        setTimeout(() => {
          if (!yiWan) {
            yiWan = true;
            reject(new Error('公交方案规划超时，请稍后重试'));
          }
        }, 20000);
      })
      .catch(() => reject(new Error('地图未加载，无法规划公交方案')));
  });
}

// 沿折线累计距离（米）
function distanceHe(xian) {
  let he = 0;
  for (let i = 1; i < xian.length; i++) {
    he += liangDianJuLi(xian[i - 1], xian[i]);
  }
  return he;
}

// 主入口：fangShi 'walk' | 'riding' | 'driving' | 'transit'；from/to 为 WGS-84 {lng, lat}
export function guiHuaLuXian(fangShi, from, to) {
  return new Promise((resolve, reject) => {
    loadBmap()
      .then(B => {
        if (!B || !B[FANG_SHI_MING[fangShi]]) {
          reject(new Error('当前地图未就绪，无法规划该出行方式'));
          return;
        }
        let yiWan = false;
        // GL 路线类构造签名：new RidingRoute(location, opts)——第一个参数是定位中心点（地图实例/城市名/坐标点）
        const dingWei = new B.Point(from.lng, from.lat);
        const sou = new B[FANG_SHI_MING[fangShi]](dingWei, {
          onSearchComplete: res => {
            if (yiWan) return;
            yiWan = true;
            try {
              if (!res || res.Err || res.error || !res.getPlan) {
                reject(new Error('没有规划到可行路线'));
                return;
              }
              const plan = res.getPlan(0);
              if (!plan) {
                reject(new Error('没有规划到可行路线'));
                return;
              }
              const bd = tiQuDian(plan);
              if (bd.length < 2) {
                reject(new Error('该出行方式在此路线上没有可用方案'));
                return;
              }
              // BD-09 → 内部统一 WGS-84
              const polyline = bd.map(pt => bd09ZhuanWgs84(pt.lng, pt.lat));
              let distanceM = 0;
              for (let i = 1; i < polyline.length; i++) {
                distanceM += liangDianJuLi(polyline[i - 1], polyline[i]);
              }
              // 距离优先用自己沿折线累加的值；耗时解析服务商返回（可能为「11分钟」字符串），兜底按速度估算
              let durationSec = jieXiMiao(plan.getDuration && plan.getDuration());
              if (!durationSec) {
                durationSec = Math.round(distanceM / (MO_REN_SU_DU[fangShi] || 1.33));
              }
              resolve({ polyline, distanceM, durationSec });
            } catch (e) {
              reject(new Error('路线结果解析失败：' + (e && e.message)));
            }
          }
        });
        sou.search(new B.Point(from.lng, from.lat), new B.Point(to.lng, to.lat));
        // 15 秒无回调视为规划失败
        setTimeout(() => {
          if (!yiWan) {
            yiWan = true;
            reject(new Error('路线规划超时，请稍后重试'));
          }
        }, 15000);
      })
      .catch(() => reject(new Error('地图未加载，无法规划路线')));
  });
}
