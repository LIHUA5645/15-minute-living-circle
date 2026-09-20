// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，20
// 地图可视化：支持两种底图引擎
//   ① 百度地图（BMapGL）—— 需有效 AK
//   ② 开源瓦片（DiTuCanvas）—— 不依赖任何 AK，百度不可用时自动降级
// 两种引擎均叠加：等时圈热力分层 / 设施散点 / 服务盲区 / 体检中心
import React, { useEffect, useRef, useState } from 'react';
import { loadBmap } from './loadBmap.js';
import { DiTuCanvas } from './DiTuCanvas.jsx';
import { wgs84ZhuanBd09, bd09ZhuanWgs84 } from '../core/geo/zuobiao.js';

// 应用内部统一 WGS-84；百度底图需要 BD-09，绘制与拾取时转换
const Z = (p) => wgs84ZhuanBd09(p.lng, p.lat);

const COLOR = {
  yiliao: '#ff6b6b',
  jiaoyu: '#ffd166',
  gouwu: '#3ddc97',
  yanglao: '#b18cff',
  jiaotong: '#2f9bff',
  xiuxian: '#e64980',
};
const MI_CAISE = { 300: '#3ddc97', 600: '#2f9bff', 900: '#ff6b6b' };

// 六类设施散点形状（与 App 图例、DiTuCanvas 散点一致）：色彩之外加形状差异
const XING_ZHUANG = {
  yiliao: (c) => `<path d='M5.6 1.5h2.8v4.1h4.1v2.8H8.4v4.1H5.6V8.4H1.5V5.6h4.1z' fill='${c}' stroke='#0f1420' stroke-width='1.2'/>`,
  jiaoyu: (c) => `<path d='M7 1.5l5.2 10.5H1.8z' fill='${c}' stroke='#0f1420' stroke-width='1.2'/>`,
  gouwu: (c) => `<rect x='2.5' y='2.5' width='9' height='9' rx='1.2' fill='${c}' stroke='#0f1420' stroke-width='1.2'/>`,
  yanglao: (c) => `<path d='M7 1.2l5 2.9v5.8l-5 2.9-5-2.9V4.1z' fill='${c}' stroke='#0f1420' stroke-width='1.2'/>`,
  jiaotong: (c) => `<circle cx='7' cy='7' r='5' fill='${c}' stroke='#0f1420' stroke-width='1.2'/>`,
  xiuxian: (c) => `<path d='M7 1.5L12.5 7 7 12.5 1.5 7z' fill='${c}' stroke='#0f1420' stroke-width='1.2'/>`,
};
const MI_OPA = { 300: 0.34, 600: 0.22, 900: 0.12 };

function svgIcon(svg) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function simpleKey(obj) {
  return JSON.stringify(obj);
}

export const MapCanvas = React.memo(function MapCanvas({ report, center, onPick, onPoiDianJi, buXing, xianshi, ditu = 'baidu', onDitu }) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({ iso: [], poi: [], blind: [], center: [], buXing: [] });
  const keysRef = useRef({ iso: '', poi: '', blind: '', center: '', buXing: '' });
  const onPickRef = useRef(onPick);
  const onPoiRef = useRef(onPoiDianJi);
  const ziFaRef = useRef(null); // 由地图点击产生的中心点，避免重复居中造成视图跳动
  const [engine, setEngine] = useState(ditu === 'tile' ? 'tile' : 'loading');
  const drawTimerRef = useRef(0);
  // 选中确认机制：单击地图只落一个「待确认点」（气泡 + 确认按钮），点确认才回写中心点，避免误触即搬走体检中心；
  // 体检中心图钉本身可拖拽，拖动松手直接生效（拖拽本身就是明确意图）
  const [daiXuan, setDaiXuan] = useState(null); // 待确认的体检中心（WGS-84）
  const ballonRef = useRef(null); // 确认气泡（BMapGL.CustomOverlay，跟随地图移动）
  const huLveRef = useRef(0); // 忽略时间戳：点设施 / 点气泡按钮时，紧随其后的地图 click 不算选点
  const queRenRef = useRef(null);
  onPickRef.current = onPick;
  onPoiRef.current = onPoiDianJi;
  queRenRef.current = () => {
    if (!daiXuan) return;
    huLveRef.current = Date.now();
    ziFaRef.current = null; // 确认后让视图把新中心点居中，给用户明确反馈
    setDaiXuan(null);
    if (onPickRef.current) onPickRef.current(daiXuan);
  };

  // 初始化百度地图
  useEffect(() => {
    if (ditu !== 'baidu') {
      setEngine('tile');
      return undefined;
    }
    let cancelled = false;
    let readyTimer = 0;

    function chuShiHua(B) {
      if (cancelled) return;
      if (!mapDivRef.current) {
        // 容器还没挂上（极少见）→ 稍后重试，避免一直停在加载中
        setTimeout(() => chuShiHua(B), 100);
        return;
      }
      try {
        const map = new B.Map(mapDivRef.current, { enableMapClick: false });
        map.enableScrollWheelZoom(true);
        map.centerAndZoom(new B.Point(center.lng, center.lat), 15);
        mapRef.current = { map, B };
        map.addEventListener('click', (e) => {
          // 点设施标记 / 点气泡按钮时也会走到这里，300ms 内一律忽略，避免「点一下就被搬走中心点」
          if (Date.now() - huLveRef.current < 300) return;
          const ll = e.latlng || e.point;
          if (!ll) return;
          // 百度返回 BD-09，转回内部 WGS-84 后作为「待确认点」，等用户点气泡里的确认按钮再生效
          setDaiXuan(bd09ZhuanWgs84(ll.lng, ll.lat));
        });
        const ro = new ResizeObserver(() => map.resize && map.resize());
        ro.observe(mapDivRef.current);
        setEngine('baidu');
        // 底图瓦片超时未加载完成（AK 被风控时百度瓦片会一直不来）→ 提示排查，不降级非百度底图
        // 首屏瓦片受网络影响常超过 3 秒，这里给 12 秒，避免正常加载被误判为失败
        readyTimer = setTimeout(() => {
          if (cancelled) return;
          setEngine('error');
        }, 12000);
        // 瓦片迟到时恢复底图状态，自动撤掉误报提示
        map.addEventListener('tilesloaded', () => {
          clearTimeout(readyTimer);
          if (!cancelled) setEngine('baidu');
        });
      } catch (e) {
        // 百度初始化异常 → 提示错误（赛道要求必须使用百度地图，不降级第三方底图）
        setEngine('error');
      }
    }

    setEngine('loading');
    loadBmap()
      .then((B) => {
        if (cancelled || !B || !B.Map) {
          if (!cancelled) setEngine('error');
          return;
        }
        if (!mapDivRef.current || !mapDivRef.current.clientWidth) {
          setTimeout(() => chuShiHua(B), 80);
          return;
        }
        chuShiHua(B);
      })
      .catch(() => {
        if (cancelled) return;
        // 百度脚本加载失败 → 提示错误（赛道要求必须使用百度地图，不降级第三方底图）
        setEngine('error');
      });
    return () => {
      cancelled = true;
      clearTimeout(readyTimer);
      if (mapRef.current && mapRef.current.map.destroy) mapRef.current.map.destroy();
      mapRef.current = null;
    };
  }, [ditu]);

  // 重绘叠加层：防抖 80ms，避免连续状态更新触发多次全量绘制
  useEffect(() => {
    if (engine !== 'baidu' || !mapRef.current) return;
    clearTimeout(drawTimerRef.current);
    drawTimerRef.current = setTimeout(() => drawBaidu(), 80);
    return () => clearTimeout(drawTimerRef.current);
  }, [engine, report, center, xianshi, buXing]);

  function clearLayer(name) {
    if (!mapRef.current) return;
    const { map } = mapRef.current;
    (layersRef.current[name] || []).forEach((o) => map.removeOverlay(o));
    layersRef.current[name] = [];
  }
  function addTo(name, o) {
    layersRef.current[name].push(o);
    mapRef.current.map.addOverlay(o);
    return o; // 返回覆盖物本身，便于就地绑定事件（如中心点图钉的 dragend）
  }

  function drawBaidu() {
    const { map, B } = mapRef.current;
    const c0 = Z(center);
    // 若中心点来自地图自身点击，不重复居中（否则画面会整体平移，观感为乱跳）
    const z = ziFaRef.current;
    const ziFa = z && Math.abs(z.lng - center.lng) < 1e-9 && Math.abs(z.lat - center.lat) < 1e-9;
    if (!ziFa) map.setCenter(new B.Point(c0.lng, c0.lat));

    // ① 等时圈热力分层：仅当数据变化时重建
    const isoKey = simpleKey(report?.dengShiQuan?.ceng);
    if (isoKey !== keysRef.current.iso) {
      keysRef.current.iso = isoKey;
      clearLayer('iso');
      const ceng = (report?.dengShiQuan?.ceng || []).slice().sort((a, b) => b.miao - a.miao);
      for (const c of ceng) {
        const col = MI_CAISE[c.miao] || '#2f9bff';
        const opa = MI_OPA[c.miao] || 0.18;
        for (const ring of c.polygon) {
          const pts = ring.map((p) => {
            const q = Z(p);
            return new B.Point(q.lng, q.lat);
          });
          if (!pts.length) continue;
          addTo(
            'iso',
            new B.Polygon(pts, {
              strokeColor: '#e6ecf5',
              strokeWeight: 1,
              strokeOpacity: 0.55,
              fillColor: col,
              fillOpacity: opa,
            })
          );
        }
      }
    }

    // ② POI 散点：仅当 POI 数据或图层显隐变化时重建
    const poiSet = report?.poiSet;
    const poiKey = simpleKey({
      counts: Object.fromEntries(Object.keys(COLOR).map((f) => [f, (poiSet?.fenleiSet?.[f] || []).length])),
      xianshi,
    });
    if (poiKey !== keysRef.current.poi) {
      keysRef.current.poi = poiKey;
      clearLayer('poi');
      const icons = {};
      for (const f of Object.keys(COLOR)) {
        if (xianshi && !xianshi[f]) continue;
        if (!icons[f]) {
          icons[f] = new B.Icon(
            svgIcon(
              `<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14'>${XING_ZHUANG[f](COLOR[f])}</svg>`
            ),
            new B.Size(14, 14)
          );
        }
        const list = (poiSet?.fenleiSet?.[f] || []).slice(0, 90);
        for (const p of list) {
          const q = Z(p);
          const marker = new B.Marker(new B.Point(q.lng, q.lat), { icon: icons[f] });
          marker.addEventListener('click', () => {
            huLveRef.current = Date.now(); // 这一下是「点设施查步行」，不要被当成选点
            if (onPoiRef.current) onPoiRef.current(p);
          });
          addTo('poi', marker);
        }
      }
    }

    // ③ 服务盲区点位
    const blindKey = simpleKey((report?.mangquList || []).map((m) => m.id));
    if (blindKey !== keysRef.current.blind) {
      keysRef.current.blind = blindKey;
      clearLayer('blind');
      for (const mq of report?.mangquList || []) {
        if (mq.polygon && mq.polygon.length > 2) {
          const pts = mq.polygon.map((p) => {
            const q = Z(p);
            return new B.Point(q.lng, q.lat);
          });
          addTo(
            'blind',
            new B.Polygon(pts, {
              strokeColor: '#ff6b6b',
              strokeWeight: 2,
              strokeOpacity: 0.9,
              fillColor: '#ff6b6b',
              fillOpacity: 0.3,
            })
          );
        } else {
          const r = Math.max(80, Math.sqrt((mq.areaM2 || 400000) / Math.PI));
          const q = Z(mq.zhongxin);
          addTo(
            'blind',
            new B.Circle(new B.Point(q.lng, q.lat), r, {
              strokeColor: '#ff6b6b',
              strokeWeight: 2,
              fillColor: '#ff6b6b',
              fillOpacity: 0.3,
            })
          );
        }
      }
    }

    // ④ 体检中心：中心点变化时重建，避免每次 pan 都清掉
    const centerKey = `${center.lng.toFixed(6)},${center.lat.toFixed(6)}`;
    if (centerKey !== keysRef.current.center) {
      keysRef.current.center = centerKey;
      clearLayer('center');
      // 定位图钉（24x30），anchor 设在尖端 (12,30) 使其精确指向坐标；图钉可拖拽，松手即生效
      const pin = addTo(
        'center',
        new B.Marker(new B.Point(c0.lng, c0.lat), {
          enableDragging: true,
          raiseOnDrag: true,
          title: '按住图钉可拖动体检中心',
          icon: new B.Icon(
            svgIcon(
              `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='30' viewBox='0 0 24 30'><ellipse cx='12' cy='28.6' rx='5' ry='1.5' fill='rgba(15,23,42,0.28)'/><path d='M12 0C5.9 0 1 4.9 1 11c0 7.4 9.6 17.4 10.1 17.9.3.3.9.3 1.2 0C13.4 28.4 23 18.4 23 11 23 4.9 18.1 0 12 0z' fill='#1f6feb' stroke='#ffffff' stroke-width='1.5'/><circle cx='12' cy='11' r='4.2' fill='#ffffff'/></svg>`
            ),
            new B.Size(24, 30),
            { anchor: new B.Size(12, 30) }
          ),
        })
      );
      pin.addEventListener('dragend', (e) => {
        const ll = (e && (e.latLng || e.point)) || pin.getPoint();
        if (!ll) return;
        const p = bd09ZhuanWgs84(ll.lng, ll.lat);
        huLveRef.current = Date.now();
        ziFaRef.current = p; // 拖到哪就是哪，视图不再重新居中，图钉就停在松手处
        setDaiXuan(null);
        if (onPickRef.current) onPickRef.current(p);
      });
    }

    // ⑤ 步行路线：点击设施后沿真实路网的虚线折线（官方 Polyline 写法，见技能文档 references/polyline.md）
    const buXingKey = buXing ? `${buXing.uid}|${buXing.zhuangTai}|${(buXing.polyline || []).length}` : '';
    if (buXingKey !== keysRef.current.buXing) {
      keysRef.current.buXing = buXingKey;
      clearLayer('buXing');
      if (buXing && buXing.zhuangTai === 'ok' && buXing.polyline && buXing.polyline.length > 1) {
        const pts = buXing.polyline.map((p) => {
          const q = Z(p);
          return new B.Point(q.lng, q.lat);
        });
        addTo(
          'buXing',
          new B.Polyline(pts, {
            strokeColor: '#1f2a37',
            strokeWeight: 4,
            strokeOpacity: 0.85,
            strokeStyle: 'dashed',
            dashArray: [10, 6],
            strokeLineCap: 'round',
            strokeLineJoin: 'round',
          })
        );
      }
    }
  }

  // 待确认选点气泡：用 CustomOverlay 承载 DOM，位置由百度地图负责跟随平移/缩放
  useEffect(() => {
    if (engine !== 'baidu' || !mapRef.current) return undefined;
    const { map, B } = mapRef.current;
    const jiu = ballonRef.current;
    ballonRef.current = null;
    if (jiu) {
      try {
        map.removeOverlay(jiu);
      } catch {
        /* 地图已重建，覆盖物随之释放 */
      }
    }
    if (!daiXuan) return undefined;
    const q = Z(daiXuan);
    const overlay = new B.CustomOverlay(
      function () {
        const box = document.createElement('div');
        box.className = 'pick-bubble';
        const t = document.createElement('div');
        t.className = 'pick-bubble-t';
        t.textContent = '将体检中心设到此处？';
        const xy = document.createElement('div');
        xy.className = 'pick-bubble-c';
        xy.textContent = `${daiXuan.lng.toFixed(6)}, ${daiXuan.lat.toFixed(6)}`;
        const btns = document.createElement('div');
        btns.className = 'pick-bubble-b';
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'pick-ok';
        ok.textContent = '设为中心点';
        ok.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (queRenRef.current) queRenRef.current();
        });
        const no = document.createElement('button');
        no.type = 'button';
        no.className = 'pick-no';
        no.textContent = '取消';
        no.addEventListener('click', (ev) => {
          ev.stopPropagation();
          huLveRef.current = Date.now();
          setDaiXuan(null);
        });
        btns.appendChild(ok);
        btns.appendChild(no);
        box.appendChild(t);
        box.appendChild(xy);
        box.appendChild(btns);
        return box;
      },
      // anchors [0.5, 1] = 气泡底边中点对齐坐标；offsetY 再抬 8px 让底部小三角的尖正落在坐标上
      { point: new B.Point(q.lng, q.lat), anchors: [0.5, 1], offsetY: -8, zIndex: 9999 }
    );
    map.addOverlay(overlay);
    ballonRef.current = overlay;
    return () => {
      if (ballonRef.current === overlay) {
        try {
          map.removeOverlay(overlay);
        } catch {
          /* 地图已重建 */
        }
        ballonRef.current = null;
      }
    };
  }, [daiXuan, engine]);

  return (
    <div className="map-view">
      {/* 百度底图容器必须常驻：初始化时需要它已经有尺寸，否则会一直卡在加载中 */}
      {engine !== 'tile' && <div ref={mapDivRef} className="map-inner" />}
      {engine === 'tile' && (
        <DiTuCanvas
          report={report}
          center={center}
          onPick={onPick}
          onPoiDianJi={onPoiDianJi}
          buXing={buXing}
          xianshi={xianshi}
        />
      )}
      {engine === 'loading' && (
        <div className="map-loading">
          <span>百度地图加载中…</span>
        </div>
      )}
      {engine === 'error' && (
        <div className="map-loading">
          <span>百度地图加载失败：请检查 .env 中 VITE_BMAP_AK 配置、百度控制台 Referer 白名单及网络，然后刷新重试。</span>
          <button type="button" className="link-btn" onClick={() => window.location.reload()}>
            刷新重试
          </button>
        </div>
      )}
    </div>
  );
});
