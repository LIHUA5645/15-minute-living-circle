// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，20
// 开源瓦片底图引擎：不依赖百度 AK，直接绘制真实地图瓦片并叠加等时圈/设施/盲区
// 采用 Web Mercator 投影，与瓦片坐标系一致，叠加层与底图严格对齐
import React, { useCallback, useEffect, useRef, useState } from 'react';

const TILE = 256;

// 瓦片源（按国内可用性排序：高德最快且有中文注记，失败自动切 OSM）
const WA_YUAN = [
  (z, x, y) => `https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x=${x}&y=${y}&z=${z}`,
  (z, x, y) => `https://a.tile.openstreetmap.fr/hot/${z}/${x}/${y}.png`,
];

// 与 App.jsx 的 COLOR 保持一致（图层开关色 = 地图散点色）
const COLOR = {
  yiliao: '#ff6b6b',
  jiaoyu: '#ffd166',
  gouwu: '#3ddc97',
  yanglao: '#b18cff',
  jiaotong: '#2f9bff',
  xiuxian: '#e64980',
};
const MI_CAISE = { 300: '#22a06b', 600: '#2f9bff', 900: '#ff6b6b' };
const MI_OPA = { 300: 0.3, 600: 0.2, 900: 0.11 };

// 体检中心定位图钉（模块级预加载，尖端即坐标点）
const ZHONG_XIN_PIN = (() => {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='30' viewBox='0 0 24 30'>
  <ellipse cx='12' cy='28.6' rx='5' ry='1.5' fill='rgba(15,23,42,0.28)'/>
  <path d='M12 0C5.9 0 1 4.9 1 11c0 7.4 9.6 17.4 10.1 17.9.3.3.9.3 1.2 0C13.4 28.4 23 18.4 23 11 23 4.9 18.1 0 12 0z' fill='#1f6feb' stroke='#ffffff' stroke-width='1.5'/>
  <circle cx='12' cy='11' r='4.2' fill='#ffffff'/>
</svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  return img;
})();

// 六类设施点形状：色彩之外再给形状差异（医疗十字/教育三角/购物方块/养老六边形/交通圆/休闲菱形）
// 与 App.jsx 图例、MapCanvas 散点图标保持一致
function huaSheShiDian(ctx, x, y, f, yanSe) {
  const r = 4.2;
  ctx.beginPath();
  if (f === 'yiliao') {
    ctx.rect(x - r * 0.4, y - r, r * 0.8, r * 2);
    ctx.rect(x - r, y - r * 0.4, r * 2, r * 0.8);
  } else if (f === 'jiaoyu') {
    ctx.moveTo(x, y - r * 1.15);
    ctx.lineTo(x + r * 1.15, y + r * 0.9);
    ctx.lineTo(x - r * 1.15, y + r * 0.9);
    ctx.closePath();
  } else if (f === 'gouwu') {
    ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
  } else if (f === 'yanglao') {
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const px = x + Math.cos(a) * r * 1.1;
      const py = y + Math.sin(a) * r * 1.1;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (f === 'xiuxian') {
    ctx.moveTo(x, y - r * 1.2);
    ctx.lineTo(x + r * 1.2, y);
    ctx.lineTo(x, y + r * 1.2);
    ctx.lineTo(x - r * 1.2, y);
    ctx.closePath();
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = yanSe;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function lngLatToWorld(lng, lat, z) {
  const scale = TILE * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  };
}
function worldToLngLat(x, y, z) {
  const scale = TILE * 2 ** z;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  return {
    lng: (x / scale) * 360 - 180,
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
  };
}

export function DiTuCanvas({ report, center, onPick, onPoiDianJi, buXing, xianshi, juJiao = 0, guanZhuId }) {
  const wrapRef = useRef(null);
  const cvsRef = useRef(null);
  const stRef = useRef({ z: 15, cx: 0, cy: 0, yuan: 0 });
  const tilesRef = useRef(new Map());
  const dragRef = useRef(null);
  const rafRef = useRef(0);
  const shiBaiRef = useRef(new Set()); // 已失败的瓦片（按源区分）
  const jiShuRef = useRef(0); // 当前源失败次数
  const ziFaRef = useRef(null); // 由地图自身点击产生的中心点（避免自己点完又强行居中，导致视图跳动）
  // 选中确认机制：单击地图只产生「待确认点」（橙色虚线针 + 气泡），点气泡里的确认按钮才回写中心点，
  // 避免误触一下就把体检中心挪走；图钉本身可拖拽，松手即生效（拖拽本身就是明确意图）
  const [daiXuan, setDaiXuan] = useState(null); // 待确认的体检中心（WGS-84）
  const pinPxRef = useRef({ x: 0, y: 0 }); // 图钉当前的屏幕坐标（画完即记录，供拖拽命中检测）
  const qiPaoRef = useRef(null); // 确认气泡 DOM（位置随地图平移/缩放实时跟随）

  const draw = useCallback(() => {
    const cvs = cvsRef.current;
    const wrap = wrapRef.current;
    if (!cvs || !wrap) return;
    const dpr = window.devicePixelRatio || 1;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    if (!W || !H) return;
    if (cvs.width !== W * dpr || cvs.height !== H * dpr) {
      cvs.width = W * dpr;
      cvs.height = H * dpr;
      cvs.style.width = W + 'px';
      cvs.style.height = H + 'px';
    }
    const ctx = cvs.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const st = stRef.current;
    const z = st.z;
    const ox = st.cx - W / 2;
    const oy = st.cy - H / 2;

    // ① 瓦片
    const x0 = Math.floor(ox / TILE);
    const x1 = Math.floor((ox + W) / TILE);
    const y0 = Math.floor(oy / TILE);
    const y1 = Math.floor((oy + H) / TILE);
    const zuiDa = 2 ** z;
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        if (ty < 0 || ty >= zuiDa) continue;
        const wx = ((tx % zuiDa) + zuiDa) % zuiDa;
        const key = `${z}/${wx}/${ty}`;
        let img = tilesRef.current.get(key);
        if (img && img.complete && img.naturalWidth) {
          ctx.drawImage(img, tx * TILE - ox, ty * TILE - oy, TILE, TILE);
        } else if (!img) {
          const biao = `${st.yuan}|${key}`;
          if (shiBaiRef.current.has(biao)) continue; // 已失败过，避免无限重试
          img = new Image();
          // 注意：不能设置 crossOrigin。瓦片服务器不返回 CORS 头，
          // 设了会导致图片加载全部失败；画布只做 drawImage 不需要读取像素。
          const k = st.yuan;
          img.src = WA_YUAN[k](z, wx, ty);
          img.onload = () => jianGeChongHua();
          img.onerror = () => {
            tilesRef.current.delete(key);
            shiBaiRef.current.add(biao);
            jiShuRef.current += 1;
            // 同一源累计失败 6 次 → 切换下一个瓦片源并重试
            if (jiShuRef.current >= 6 && st.yuan + 1 < WA_YUAN.length) {
              st.yuan += 1;
              jiShuRef.current = 0;
              tilesRef.current.clear();
              shiBaiRef.current.clear();
            }
            jianGeChongHua();
          };
          tilesRef.current.set(key, img);
        }
      }
    }

    // ② 等时圈（外→内叠加，形成热力分层）
    const toXY = (p) => {
      const w = lngLatToWorld(p.lng, p.lat, z);
      return { x: w.x - ox, y: w.y - oy };
    };
    const ceng = (report?.dengShiQuan?.ceng || []).slice().sort((a, b) => b.miao - a.miao);
    for (const c of ceng) {
      for (const ring of c.polygon || []) {
        ctx.beginPath();
        ring.forEach((pt, i) => {
          const { x, y } = toXY(pt);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.globalAlpha = MI_OPA[c.miao] || 0.18;
        ctx.fillStyle = MI_CAISE[c.miao] || '#2f9bff';
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    // ③ 设施散点（内置六类 + 管理员自定义维度，未知类别回退圆形中性色）
    const poiSet = report?.poiSet;
    if (poiSet) {
      const fenLeiJian = [...new Set([...Object.keys(COLOR), ...Object.keys(poiSet.fenleiSet || {})])];
      for (const f of fenLeiJian) {
        if (xianshi && xianshi[f] === false) continue;
        for (const p of (poiSet.fenleiSet?.[f] || []).slice(0, 120)) {
          const { x, y } = toXY(p);
          huaSheShiDian(ctx, x, y, f, COLOR[f] || '#8a93a3');
        }
      }
    }

    // ④ 服务盲区（被用户标记的盲区：橙色加粗描边突出）
    for (const mq of report?.mangquList || []) {
      const beiBiaoJi = mq.id === guanZhuId;
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#ff6b6b';
      ctx.strokeStyle = beiBiaoJi ? '#ff8c00' : '#d13438';
      ctx.lineWidth = beiBiaoJi ? 3.2 : 1.6;
      if (mq.polygon && mq.polygon.length > 2) {
        ctx.beginPath();
        mq.polygon.forEach((pt, i) => {
          const { x, y } = toXY(pt);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (mq.zhongxin) {
        // 盲区画成真实尺度的圆：米 → 像素按 Web Mercator 换算（与瓦片投影一致）
        const { x, y } = toXY(mq.zhongxin);
        const mi = mq.banJingM || Math.sqrt((mq.areaM2 || 400000) / Math.PI);
        const miMeiPx = (156543.03392 * Math.cos((mq.zhongxin.lat * Math.PI) / 180)) / 2 ** st.z;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(6, mi / miMeiPx), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ③′ 盲区补建点：绿色 ✚ 图钉（medoid 候选点）
    for (const mq of report?.mangquList || []) {
      if (!mq.buJianDian) continue;
      const b = toXY(mq.buJianDian);
      ctx.beginPath();
      ctx.arc(b.x, b.y, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#1a8f57';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(b.x - 4.5, b.y);
      ctx.lineTo(b.x + 4.5, b.y);
      ctx.moveTo(b.x, b.y - 4.5);
      ctx.lineTo(b.x, b.y + 4.5);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // ④′ 步行路线（点击设施后沿真实路网的虚线，画在图钉之下）
    if (buXing && buXing.zhuangTai === 'ok' && buXing.polyline && buXing.polyline.length > 1) {
      ctx.save();
      ctx.beginPath();
      buXing.polyline.forEach((pt, i) => {
        const w = toXY(pt);
        if (i === 0) ctx.moveTo(w.x, w.y);
        else ctx.lineTo(w.x, w.y);
      });
      ctx.setLineDash([10, 6]);
      ctx.strokeStyle = 'rgba(31, 42, 55, 0.85)';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      // 终点高亮圆点
      const end = toXY(buXing.polyline[buXing.polyline.length - 1]);
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(end.x, end.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#1f2a37';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // ⑤ 体检中心（定位图钉，尖端对准坐标）
    // 正在拖拽图钉时用拖拽中的临时坐标绘制，松手才回写父级，避免拖动过程被父级旧中心点拉回
    const tuoPin = dragRef.current && dragRef.current.mode === 'pin' ? dragRef.current.cur : null;
    const c = tuoPin ? toXY(tuoPin) : toXY(center);
    pinPxRef.current = c;
    if (tuoPin) {
      // 拖拽中给一个落点光晕，明确「针尖落在这里」
      ctx.beginPath();
      ctx.arc(c.x, c.y, 15, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(31,111,235,0.18)';
      ctx.fill();
    }
    if (ZHONG_XIN_PIN.complete && ZHONG_XIN_PIN.naturalWidth) {
      ctx.drawImage(ZHONG_XIN_PIN, c.x - 12, c.y - 30, 24, 30);
    } else {
      // 图标未就绪时先以圆点兜底
      ctx.beginPath();
      ctx.arc(c.x, c.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#1f6feb';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // ⑥ 待确认选点：橙色虚线定位环 + 橙色图钉（针尖对准坐标），只有点气泡里的确认按钮才生效
    if (daiXuan) {
      const q = toXY(daiXuan);
      ctx.save();
      ctx.beginPath();
      ctx.arc(q.x, q.y, 17, 0, Math.PI * 2);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(245,158,11,0.14)';
      ctx.fill();
      // 针身
      ctx.beginPath();
      ctx.moveTo(q.x - 7, q.y - 10);
      ctx.lineTo(q.x, q.y);
      ctx.lineTo(q.x + 7, q.y - 10);
      ctx.closePath();
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 针头
      ctx.beginPath();
      ctx.arc(q.x, q.y - 17, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
      // 气泡跟随地图平移与缩放：直接改样式（left/top），不走 state，避免重绘循环
      const pao = qiPaoRef.current;
      if (pao) {
        const kuan = pao.offsetWidth || 208;
        const gao = pao.offsetHeight || 76;
        pao.style.left = `${Math.round(q.x - kuan / 2)}px`;
        pao.style.top = `${Math.round(q.y - gao - 30)}px`;
      }
    }
  }, [report, center, xianshi, buXing, daiXuan]);

  function jianGeChongHua() {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
    });
  }

  // 中心点变化 → 视图居中
  // 但若这次中心点就是「用户刚点地图产生的」，则不再居中，否则每点一次画面整体平移，观感就是乱跳
  // juJiao 计数变化时（「回到体检中心」按钮）无条件居中，且此时中心点与当前一致
  useEffect(() => {
    const z = ziFaRef.current;
    const ziFa =
      juJiao === 0 &&
      z && Math.abs(z.lng - center.lng) < 1e-9 && Math.abs(z.lat - center.lat) < 1e-9;
    if (!ziFa) {
      const st = stRef.current;
      const w = lngLatToWorld(center.lng, center.lat, st.z);
      st.cx = w.x;
      st.cy = w.y;
    }
    jianGeChongHua();
  }, [center, juJiao]);

  useEffect(() => {
    jianGeChongHua();
  }, [draw]);

  // 用户在清单里标记某盲区 → 瓦片视图飞到该盲区中心
  useEffect(() => {
    if (!guanZhuId) return undefined;
    const mq = (report?.mangquList || []).find((m) => m.id === guanZhuId);
    if (mq && mq.zhongxin) {
      const st = stRef.current;
      const w = lngLatToWorld(mq.zhongxin.lng, mq.zhongxin.lat, st.z);
      st.cx = w.x;
      st.cy = w.y;
      jianGeChongHua();
    }
  }, [guanZhuId]);

  useEffect(() => {
    const ro = new ResizeObserver(() => jianGeChongHua());
    if (wrapRef.current) ro.observe(wrapRef.current);
    // 定位图钉首次异步加载完成后重绘一次，替换兜底圆点
    if (!ZHONG_XIN_PIN.complete) ZHONG_XIN_PIN.onload = jianGeChongHua;
    return () => ro.disconnect();
  }, []);

  // 命中体检中心图钉本体（24×30，针尖对准坐标）→ 视为「拖动图钉」而不是平移地图
  function mingZhongTuDing(cx, cy) {
    const pin = pinPxRef.current;
    return cx >= pin.x - 13 && cx <= pin.x + 13 && cy >= pin.y - 32 && cy <= pin.y + 4;
  }
  function shuBiaoXY(e) {
    const rect = wrapRef.current.getBoundingClientRect();
    return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
  }
  function shiTuXY() {
    const wrap = wrapRef.current;
    const st = stRef.current;
    return { ox: st.cx - wrap.clientWidth / 2, oy: st.cy - wrap.clientHeight / 2 };
  }
  // 拖动图钉松手（含拖出画布）：拖拽本身就是明确意图，直接回写中心点，不再走二次确认
  function luoDiTuDing(d) {
    if (!d || d.mode !== 'pin' || !d.moved || !d.cur || !onPick) return;
    ziFaRef.current = d.cur; // 标记来源，视图不再重新居中，图钉就停在松手的位置
    setDaiXuan(null);
    onPick(d.cur);
    jianGeChongHua();
  }

  function xiaBiao(e) {
    const { cx, cy } = shuBiaoXY(e);
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      moved: false,
      mode: mingZhongTuDing(cx, cy) ? 'pin' : 'map',
      cur: null,
    };
    if (dragRef.current.mode === 'pin' && cvsRef.current) cvsRef.current.style.cursor = 'grabbing';
  }
  function yiDong(e) {
    const d = dragRef.current;
    if (!d) {
      // 未按下时只改光标：悬在图钉上提示「可拖动」
      const { cx, cy } = shuBiaoXY(e);
      if (cvsRef.current) cvsRef.current.style.cursor = mingZhongTuDing(cx, cy) ? 'grab' : '';
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    const st = stRef.current;
    if (d.mode === 'pin') {
      // 拖图钉：地图本身不动，只把图钉挪到鼠标处
      const { cx, cy } = shuBiaoXY(e);
      const { ox, oy } = shiTuXY();
      d.cur = worldToLngLat(ox + cx, oy + cy, st.z);
      d.x = e.clientX;
      d.y = e.clientY;
      jianGeChongHua();
      return;
    }
    st.cx -= dx;
    st.cy -= dy;
    dragRef.current = { x: e.clientX, y: e.clientY, moved: d.moved, mode: 'map', cur: null };
    jianGeChongHua();
  }
  function taiQi(e) {
    const d = dragRef.current;
    dragRef.current = null;
    if (cvsRef.current) cvsRef.current.style.cursor = '';
    if (!d) return;
    if (d.mode === 'pin') {
      luoDiTuDing(d); // 拖了就生效；只是点一下图钉则什么都不做
      return;
    }
    if (d.moved) return; // 平移地图，不算选点
    const { cx, cy } = shuBiaoXY(e);
    const { ox, oy } = shiTuXY();
    const st = stRef.current;
    // 设施点命中检测：点击位置 10px 内存在可见设施 → 触发步行路线查询，不再当作选中心点
    if (onPoiDianJi && report?.poiSet) {
      const toXY2 = (p) => {
        const w = lngLatToWorld(p.lng, p.lat, st.z);
        return { x: w.x - ox, y: w.y - oy };
      };
      for (const f of Object.keys(COLOR)) {
        if (xianshi && !xianshi[f]) continue;
        for (const p of (report.poiSet.fenleiSet?.[f] || []).slice(0, 120)) {
          const w = toXY2(p);
          if ((w.x - cx) ** 2 + (w.y - cy) ** 2 <= 100) {
            onPoiDianJi(p);
            return;
          }
        }
      }
    }
    // 空白处单击：只落一个「待确认点」，等用户点气泡里的确认按钮，避免误触即搬走体检中心
    setDaiXuan(worldToLngLat(ox + cx, oy + cy, st.z));
  }

  // 确认待确认点：此时才回写父级中心点；不标记 ziFa，让视图把新中心点居中，给用户明确反馈
  function queRenXuanDian() {
    if (!daiXuan) return;
    const p = daiXuan;
    ziFaRef.current = null;
    setDaiXuan(null);
    if (onPick) onPick(p);
  }
  function gunLun(e) {
    e.preventDefault();
    const st = stRef.current;
    const rect = wrapRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const ox = st.cx - wrapRef.current.clientWidth / 2;
    const oy = st.cy - wrapRef.current.clientHeight / 2;
    const di = worldToLngLat(ox + mx, oy + my, st.z);
    const nz = Math.max(3, Math.min(19, st.z + (e.deltaY < 0 ? 1 : -1)));
    st.z = nz;
    tilesRef.current.clear();
    const nw = lngLatToWorld(di.lng, di.lat, nz);
    st.cx = nw.x + (wrapRef.current.clientWidth / 2 - mx);
    st.cy = nw.y + (wrapRef.current.clientHeight / 2 - my);
    jianGeChongHua();
  }

  return (
    <div className="map-tile-layer" ref={wrapRef}>
      <canvas
        ref={cvsRef}
        className="map-tile"
        onMouseDown={xiaBiao}
        onMouseMove={yiDong}
        onMouseUp={taiQi}
        onMouseLeave={() => {
          const d = dragRef.current;
          dragRef.current = null;
          luoDiTuDing(d); // 拖图钉时鼠标划出画布也按落点处理，避免白拖一场
        }}
        onWheel={gunLun}
      />
      {/* 选点确认气泡：位置由 draw 跟着地图平移/缩放实时改写 left/top */}
      {daiXuan && (
        <div className="pick-bubble" ref={qiPaoRef}>
          <div className="pick-bubble-t">将体检中心设到此处？</div>
          <div className="pick-bubble-c">
            {daiXuan.lng.toFixed(6)}, {daiXuan.lat.toFixed(6)}
          </div>
          <div className="pick-bubble-b">
            <button type="button" className="pick-ok" onClick={queRenXuanDian}>
              设为中心点
            </button>
            <button type="button" className="pick-no" onClick={() => setDaiXuan(null)}>
              取消
            </button>
          </div>
        </div>
      )}
      <div className="map-attri">© OpenStreetMap contributors</div>
    </div>
  );
}
