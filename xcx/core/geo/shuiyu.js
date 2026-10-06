// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 水域掩膜（纯几何，零 DOM、零网络）：把水面多边形栅格化成 0/1 掩膜，
// 交给等时圈生成阶段把水面格子标成「不可达」——15 分钟圈与评分就不会压到江里去了。
// 数据由 adapters/shuiyu.js 从 OpenStreetMap 取，坐标本来就是 WGS-84，与本模块一致
import { zaiDuoBianXingNei, waiBaoJuXing } from './jichu.js';

// 生成掩膜：yan[j * G + i] === 1 表示该格中心落在水面里（应视为不可达）
// 性能考量：先用每个水面的外接矩形圈出可能命中的格子范围，只在矩形内做射线法判定，
// 避免「每个格点都遍历全部水面多边形」那种平方级开销
function shuiYuYanMa(shuiYu, G, x0, y0, dx, dy) {
  const yan = new Uint8Array(G * G);
  const lie = (shuiYu && shuiYu.duoBianXing) || [];
  for (const duo of lie) {
    if (!duo || duo.length < 4) continue;
    const box = waiBaoJuXing(duo);
    const i0 = Math.max(0, Math.ceil((box.minLng - x0) / dx));
    const i1 = Math.min(G - 1, Math.floor((box.maxLng - x0) / dx));
    const j0 = Math.max(0, Math.ceil((box.minLat - y0) / dy));
    const j1 = Math.min(G - 1, Math.floor((box.maxLat - y0) / dy));
    for (let j = j0; j <= j1; j++) {
      const lat = y0 + j * dy;
      for (let i = i0; i <= i1; i++) {
        const k = j * G + i;
        if (yan[k]) continue; // 已被别的水面覆盖过，不必重复判定
        if (zaiDuoBianXingNei({ lng: x0 + i * dx, lat }, duo)) yan[k] = 1;
      }
    }
  }
  return yan;
}

// 点是否落在水面上（给需要逐点判定的场景用，例如调试与单点校验）
function zaiShuiMian(shuiYu, dian) {
  const lie = (shuiYu && shuiYu.duoBianXing) || [];
  for (const duo of lie) {
    if (duo && duo.length >= 4 && zaiDuoBianXingNei(dian, duo)) return true;
  }
  return false;
}

export { shuiYuYanMa, zaiShuiMian };
