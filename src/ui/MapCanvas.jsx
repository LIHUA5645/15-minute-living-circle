// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，20
// 地图可视化：支持两种底图引擎
//   ① 百度地图（BMapGL）—— 需有效 AK
//   ② 开源瓦片（DiTuCanvas）—— 不依赖任何 AK，百度不可用时自动降级
// 两种引擎均叠加：等时圈热力分层 / 设施散点 / 服务盲区 / 体检中心
import React, { useEffect, useRef, useState } from 'react';
import { Cross, GraduationCap, ShoppingCart, Armchair, Bus, Trees, Shapes } from 'lucide';
import { loadBmap } from './loadBmap.js';
import { DiTuCanvas } from './DiTuCanvas.jsx';
import { wgs84ZhuanBd09, bd09ZhuanWgs84 } from '../core/geo/zuobiao.js';

// 应用内部统一 WGS-84；百度底图需要 BD-09，绘制与拾取时转换
const Z = p => wgs84ZhuanBd09(p.lng, p.lat);

const COLOR = {
  yiliao: '#ff6b6b',
  jiaoyu: '#ffd166',
  gouwu: '#3ddc97',
  yanglao: '#b18cff',
  jiaotong: '#2f9bff',
  xiuxian: '#e64980'
};
const MI_CAISE = { 300: '#3ddc97', 600: '#2f9bff', 900: '#ff6b6b' };

// 六类设施散点形状统一取自 sheShiXing.js（与图例、瓦片画布共用），色彩之外加形状差异
const MI_OPA = { 300: 0.34, 600: 0.22, 900: 0.12 };

function svgIcon(svg) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// 设施散点图标：与「设施图层」图例同款 lucide 语义图标（白描边）+ 类别色圆底徽章，图例与地图一一对应。
// 注意：lucide 导出的是图标节点数据（[[标签, 属性], ...]）而非 React 组件，需手动拼接 SVG 字符串
const TU_BIAO = {
  yiliao: Cross,
  jiaoyu: GraduationCap,
  gouwu: ShoppingCart,
  yanglao: Armchair,
  jiaotong: Bus,
  xiuxian: Trees
};
const kebab = s => s.replace(/([A-Z])/g, '-$1').toLowerCase();
function tuZhuanSvg(Tu) {
  const nei = Tu.map(([tag, attrs]) => {
    const a = Object.entries(attrs || {})
      .map(([k, v]) => `${kebab(k)}='${v}'`)
      .join(' ');
    return `<${tag} ${a}/>`;
  }).join('');
  return `<svg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='#ffffff' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'>${nei}</svg>`;
}
const tuHuanCun = {};
function sheShiBiaoJi(f, color) {
  if (!tuHuanCun[f]) {
    tuHuanCun[f] =
      `<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'>` +
      `<circle cx='10' cy='10' r='9' fill='${color}' stroke='#ffffff' stroke-width='1.6'/>` +
      `<g transform='translate(4.5,4.5)'>${tuZhuanSvg(TU_BIAO[f] || Shapes)}</g></svg>`;
  }
  return tuHuanCun[f];
}

function simpleKey(obj) {
  return JSON.stringify(obj);
}

export const MapCanvas = React.memo(function MapCanvas({
  report,
  center,
  onPick,
  onPoiDianJi,
  buXing,
  xianshi,
  ditu = 'baidu',
  onDitu,
  guanZhuId,
  yongHuMangQu,
  biaoJiKai,
  onBiaoJiDianJi,
  juJiaoYongHu,
  daoHang,
  gongJu,
  gongJuSheZhi,
  luXianZu,
  yinLiangXian,
  chuXing
}) {
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const resizeRoRef = useRef(null); // 地图容器尺寸监听（销毁时须断开）
  const layersRef = useRef({
    iso: [],
    poi: [],
    blind: [],
    center: [],
    buJian: [],
    buXing: [],
    guanZhu: [],
    yongHu: []
  });
  const keysRef = useRef({
    iso: '',
    poi: '',
    blind: '',
    center: '',
    buJian: '',
    buXing: '',
    guanZhu: '',
    yongHu: ''
  });
  const onPickRef = useRef(onPick);
  const onPoiRef = useRef(onPoiDianJi);
  const biaoJiRef = useRef(biaoJiKai); // 盲区标记模式：点地图落标记而非选中心
  const onBiaoJiRef = useRef(onBiaoJiDianJi);
  biaoJiRef.current = biaoJiKai;
  onBiaoJiRef.current = onBiaoJiDianJi;
  const ziFaRef = useRef(null); // 由地图点击产生的中心点，避免重复居中造成视图跳动
  const [engine, setEngine] = useState(ditu === 'tile' ? 'tile' : 'loading');
  const drawTimerRef = useRef(0);
  // 选中确认机制：双击地图才落一个「待确认点」（气泡 + 确认按钮），点确认才回写中心点，
  // 单击只用于浏览/点设施/点盲区图钉，不会误触搬走体检中心；体检中心图钉本身可拖拽，拖动松手直接生效
  const [daiXuan, setDaiXuan] = useState(null); // 待确认的体检中心（WGS-84）
  const ballonRef = useRef(null); // 确认气泡（BMapGL.CustomOverlay，跟随地图移动）
  const huLveRef = useRef(0); // 忽略时间戳：点设施 / 点气泡按钮时，紧随其后的地图 click 不算选点
  const queRenRef = useRef(null);
  const [juJiaoCi, setJuJiaoCi] = useState(0); // 「回到体检中心」按钮计数（瓦片引擎靠它强制重新居中）
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
        // 双击缩放关闭：双击专用于「设为中心点」确认，避免确认前视角突跳
        try {
          map.disableDoubleClickZoom();
        } catch {
          /* 个别版本无此 API 时忽略 */
        }
        map.addEventListener('click', e => {
          // 单击不再弹「设为中心点」确认框（单击设施 / 盲区图钉曾被误触或 300ms 防抖吞掉，
          // 用户反馈体验差）——确认框改为双击弹出（下方 dblclick）；盲区标记模式下单击仍直接落标记
          if (Date.now() - huLveRef.current < 300) return;
          const ll = e.latlng || e.point;
          if (!ll) return;
          const wgs = bd09ZhuanWgs84(ll.lng, ll.lat);
          if (biaoJiRef.current && onBiaoJiRef.current) onBiaoJiRef.current(wgs);
        });
        // GL 的 map 级 dblclick 事件在部分版本不派发（双击被内部缩放流程吞掉），
        // 改监听容器原生 dblclick：双击点相对中心的像素偏移 + pointToPixel/pixelToPoint 反算经纬度
        const shuangJi = ev => {
          console.log('[mq-dbg] native dblclick', huLveRef.current, Date.now() - huLveRef.current);
          if (Date.now() - huLveRef.current < 300) return;
          if (!mapDivRef.current) return;
          const rct = mapDivRef.current.getBoundingClientRect();
          const dx = ev.clientX - (rct.left + rct.width / 2);
          const dy = ev.clientY - (rct.top + rct.height / 2);
          try {
            const cPx = map.pointToPixel(map.getCenter());
            // pixelToPoint 接收的是 Pixel（容器像素），误传 Point 会被当经纬度解析出 (0,0)
            const dian = map.pixelToPoint(new B.Pixel(cPx.x + dx, cPx.y + dy));
            if (!dian) return;
            setDaiXuan(bd09ZhuanWgs84(dian.lng, dian.lat));
          } catch {
            /* 个别版本缺 pixelToPoint 时忽略 */
          }
        };
        // GL 内部层会对 dblclick stopPropagation 拦截冒泡，故用捕获阶段监听（先于 GL 处理）
        mapDivRef.current.addEventListener('dblclick', shuangJi, true);
        const ro = new ResizeObserver(() => {
          // 只对仍挂载在 mapRef 上的当前实例 resize，防止销毁后误触发（曾致 GL 画布被搞崩白屏）
          if (mapRef.current && mapRef.current.map === map && map.resize) map.resize();
        });
        ro.observe(mapDivRef.current);
        resizeRoRef.current = ro;
        setEngine('baidu');
        // 底图瓦片超时未加载完成（AK 被风控时百度瓦片会一直不来）→ 提示排查，不降级非百度底图
        // 首屏瓦片受网络影响常超过 3 秒，这里给 12 秒，避免正常加载被误判为失败
        readyTimer = setTimeout(() => {
          if (cancelled) return;
          // 画布已经出图（GL 正常渲染）就不再误报「加载失败」，慢网下瓦片晚到属正常现象
          if (mapDivRef.current && mapDivRef.current.querySelector('canvas')) return;
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
      .then(B => {
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
      if (resizeRoRef.current) {
        resizeRoRef.current.disconnect();
        resizeRoRef.current = null;
      }
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
  }, [engine, report, center, xianshi, buXing, guanZhuId, yongHuMangQu]);

  // 用户在清单里标记某盲区 → 地图飞到该盲区中心
  useEffect(() => {
    if (!guanZhuId || engine !== 'baidu' || !mapRef.current) return;
    const mq = (report?.mangquList || []).find(m => m.id === guanZhuId);
    if (mq && mq.zhongxin) {
      const { map, B } = mapRef.current;
      const q = Z(mq.zhongxin);
      ziFaRef.current = null;
      map.setCenter(new B.Point(q.lng, q.lat));
    }
  }, [guanZhuId, engine]);

  // 自标盲区清单点「定位」→ 飞到该点（dian + ci 计数，同一标记可反复定位）
  useEffect(() => {
    if (!juJiaoYongHu || engine !== 'baidu' || !mapRef.current) return;
    const { map, B } = mapRef.current;
    const q = Z(juJiaoYongHu.dian);
    ziFaRef.current = null;
    map.setCenter(new B.Point(q.lng, q.lat));
    if (map.getZoom() < 16) map.setZoom(16);
  }, [juJiaoYongHu, engine]);

  // —— 多方式路线组：非当前采用方式的路线以各方式颜色半透明显示（选中的走 buXing 加粗蓝线） ——
  const LU_SE = { walk: '#f59f00', riding: '#12b76a', driving: '#7c5cf0', transit: '#e8590c' };
  const qiTaRef = useRef([]);
  useEffect(() => {
    const mb = mapRef.current;
    if (engine !== 'baidu' || !mb) {
      qiTaRef.current.forEach(o => {
        try {
          o.map && o.map.removeOverlay(o.line);
        } catch {
          /* 忽略 */
        }
      });
      qiTaRef.current = [];
      return;
    }
    const { map, B } = mb;
    // 清旧
    qiTaRef.current.forEach(x => {
      try {
        map.removeOverlay(x.line);
      } catch {
        /* 忽略 */
      }
    });
    qiTaRef.current = [];
    Object.entries(luXianZu || {}).forEach(([mode, x]) => {
      if (mode === chuXing || !x || x.zhuangTai !== 'ok' || !x.polyline || x.polyline.length < 2)
        return;
      const pts = x.polyline.map(p => {
        const q = Z(p);
        return new B.Point(q.lng, q.lat);
      });
      const line = new B.Polyline(pts, {
        strokeColor: LU_SE[mode] || '#2f86f7',
        strokeWeight: 4,
        strokeOpacity: 0.55,
        strokeStyle: mode === 'walk' ? 'dashed' : 'solid'
      });
      map.addOverlay(line);
      qiTaRef.current.push({ line, map });
    });
    // 阴凉路段：绿色加粗半透明叠在当前路线之上（仅步行 / 骑行）
    if (yinLiangXian && yinLiangXian.duan && (chuXing === 'walk' || chuXing === 'riding')) {
      yinLiangXian.duan.forEach(duan => {
        if (duan.length < 2) return;
        const pts = duan.map(p => {
          const q = Z(p);
          return new B.Point(q.lng, q.lat);
        });
        const line = new B.Polyline(pts, {
          strokeColor: '#3a9e58',
          strokeWeight: 9,
          strokeOpacity: 0.55
        });
        map.addOverlay(line);
        qiTaRef.current.push({ line, map });
      });
    }
  }, [luXianZu, chuXing, yinLiangXian, engine]);

  // 一键回到体检中心：地图乱滑后找不回位置时使用
  function huiDaoDingWei() {
    if (engine === 'baidu' && mapRef.current) {
      const { map, B } = mapRef.current;
      const q = Z(center);
      ziFaRef.current = null;
      map.setCenter(new B.Point(q.lng, q.lat));
    } else if (engine === 'tile') {
      setJuJiaoCi(n => n + 1); // DiTuCanvas 监听该计数强制重新居中
    }
  }

  // —— 地图工具条：路况图层 / 卫星图 / 3D 倾斜（百度地图同款）——
  // 状态由父组件受控（AI 导航卡与地图工具条共用同一套开关），此处只负责把状态落到地图上
  const luKuangKai = !!(gongJu && gongJu.luKuang);
  const weiXingKai = !!(gongJu && gongJu.weiXing);
  const qingXieKai = !!(gongJu && gongJu.qingXie);
  // 路况图层挂/摘：GL 版官方原生 setTrafficOn / setTrafficOff
  useEffect(() => {
    const mb = mapRef.current;
    if (engine !== 'baidu' || !mb) return;
    const { map } = mb;
    try {
      if (luKuangKai) {
        if (map.setTrafficOn) map.setTrafficOn();
      } else if (map.setTrafficOff) {
        map.setTrafficOff();
      }
    } catch {
      /* 当前 GL 版本不支持路况图层时保持原状 */
    }
  }, [luKuangKai, engine]);
  // 卫星图 / 普通地图切换
  useEffect(() => {
    const mb = mapRef.current;
    if (engine !== 'baidu' || !mb) return;
    const { map } = mb;
    try {
      const lei = weiXingKai
        ? window.BMAP_SATELLITE_MAP || (window.BMapGL && window.BMapGL.BMAP_SATELLITE_MAP)
        : window.BMAP_NORMAL_MAP || (window.BMapGL && window.BMapGL.BMAP_NORMAL_MAP);
      if (lei) map.setMapType(lei);
    } catch {
      /* 当前 GL 版本不支持卫星图层时保持原状 */
    }
  }, [weiXingKai, engine]);
  // 3D 倾斜 / 回正
  useEffect(() => {
    const mb = mapRef.current;
    if (engine !== 'baidu' || !mb) return;
    const { map } = mb;
    try {
      map.setTilt(qingXieKai ? 52 : 0);
    } catch {
      /* 不支持倾斜时保持原状 */
    }
  }, [qingXieKai, engine]);

  // —— 模拟导航带路：小蓝点沿步行路线前进，视角像手机导航一样跟着走 ——
  const daoHangBiaoRef = useRef(null); // 导航小蓝点 Marker
  const daoHangLuRef = useRef([]); // 导航中的路线高亮（白边 + 蓝色实线）
  const daoHangKaiRef = useRef(false); // 是否已做过开局路线总览
  const daoHangYiRef = useRef(0); // panTo 节流时间戳（60fps 更新位置，视角每 300ms 平滑跟一次）
  // 摘掉导航期间的所有专属覆盖物
  function qingDaoHangFuGai() {
    if (!mapRef.current) return;
    const { map } = mapRef.current;
    if (daoHangBiaoRef.current) {
      try {
        map.removeOverlay(daoHangBiaoRef.current);
      } catch {
        /* 旧地图实例已销毁时忽略 */
      }
      daoHangBiaoRef.current = null;
    }
    daoHangLuRef.current.forEach(o => {
      try {
        map.removeOverlay(o);
      } catch {
        /* 忽略 */
      }
    });
    daoHangLuRef.current = [];
  }
  useEffect(() => {
    const mb = mapRef.current;
    const zaiKai = !!(daoHang && daoHang.kai && daoHang.weiZhi && engine === 'baidu');
    if (!mb || !zaiKai) {
      // 退出导航 / 引擎切换：摘掉小蓝点与高亮路线，回正视角
      daoHangKaiRef.current = false;
      qingDaoHangFuGai();
      if (mb && daoHangLuRef.current.length === 0) {
        try {
          mb.map.setTilt(0);
        } catch {
          /* 个别版本无 setTilt 时忽略 */
        }
      }
      return;
    }
    const { map, B } = mb;
    // 开局：路线高亮（白边蓝实线）+ 3D 倾斜 + 总览整条路线，随后跟随视角
    if (!daoHangKaiRef.current) {
      daoHangKaiRef.current = true;
      if (buXing && buXing.polyline && buXing.polyline.length > 1) {
        const dian = buXing.polyline.map(p => {
          const q = Z(p);
          return new B.Point(q.lng, q.lat);
        });
        try {
          const bai = new B.Polyline(dian, {
            strokeColor: '#ffffff',
            strokeWeight: 10,
            strokeOpacity: 0.9
          });
          const lan = new B.Polyline(dian, {
            strokeColor: '#2f86f7',
            strokeWeight: 7,
            strokeOpacity: 0.95
          });
          map.addOverlay(bai);
          map.addOverlay(lan);
          daoHangLuRef.current = [bai, lan];
        } catch {
          /* 高亮失败不影响导航 */
        }
        try {
          map.setViewport(dian);
        } catch {
          /* setViewport 个别版本签名差异时忽略，不影响跟随 */
        }
        try {
          map.setTilt(52);
        } catch {
          /* 个别版本无 setTilt 时忽略 */
        }
        setTimeout(() => {
          if (daoHangKaiRef.current) map.setZoom(Math.max(map.getZoom(), 17));
        }, 900);
      }
    }
    // 小蓝点：蓝色圆 + 白圈白心（首帧创建，之后只挪位置）
    if (!daoHangBiaoRef.current) {
      const tu = svgIcon(
        "<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30'>" +
          "<circle cx='15' cy='15' r='11.5' fill='rgba(47,134,247,0.25)'/>" +
          "<circle cx='15' cy='15' r='7.5' fill='#2f86f7' stroke='#ffffff' stroke-width='2.4'/>" +
          '<circle cx="15" cy="15" r="2.6" fill="#ffffff"/></svg>'
      );
      const biao = new B.Icon(tu, new B.Size(30, 30), { anchor: new B.Size(15, 15) });
      daoHangBiaoRef.current = new B.Marker(new B.Point(0, 0), { icon: biao, zIndex: 999 });
      map.addOverlay(daoHangBiaoRef.current);
    }
    const q = Z(daoHang.weiZhi);
    daoHangBiaoRef.current.setPosition(new B.Point(q.lng, q.lat));
    const xianZai = Date.now();
    if (xianZai - daoHangYiRef.current > 300) {
      daoHangYiRef.current = xianZai;
      map.panTo(new B.Point(q.lng, q.lat));
    }
  }, [daoHang, buXing, engine]);

  function clearLayer(name) {
    if (!mapRef.current) return;
    const { map } = mapRef.current;
    (layersRef.current[name] || []).forEach(o => map.removeOverlay(o));
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
          const pts = ring.map(p => {
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
              fillOpacity: opa
            })
          );
        }
      }
    }

    // ② POI 散点：仅当 POI 数据或图层显隐变化时重建（含管理员自定义维度，未知类别回退圆形中性色）
    const poiSet = report?.poiSet;
    const fenLeiJian = [
      ...new Set([...Object.keys(COLOR), ...Object.keys(poiSet?.fenleiSet || {})])
    ];
    const poiKey = simpleKey({
      counts: Object.fromEntries(fenLeiJian.map(f => [f, (poiSet?.fenleiSet?.[f] || []).length])),
      xianshi
    });
    if (poiKey !== keysRef.current.poi) {
      keysRef.current.poi = poiKey;
      clearLayer('poi');
      const icons = {};
      for (const f of fenLeiJian) {
        if (xianshi && xianshi[f] === false) continue;
        if (!icons[f]) {
          icons[f] = new B.Icon(
            svgIcon(sheShiBiaoJi(f, COLOR[f] || '#8a93a3')),
            new B.Size(20, 20)
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
    const blindKey = simpleKey((report?.mangquList || []).map(m => m.id));
    if (blindKey !== keysRef.current.blind) {
      keysRef.current.blind = blindKey;
      clearLayer('blind');
      for (const mq of report?.mangquList || []) {
        if (mq.polygon && mq.polygon.length > 2) {
          const pts = mq.polygon.map(p => {
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
              fillOpacity: 0.3
            })
          );
        } else {
          // 盲区统一画圆：优先用后端给的半径，缺省再按面积折算
          const r = Math.max(80, mq.banJingM || Math.sqrt((mq.areaM2 || 400000) / Math.PI));
          const q = Z(mq.zhongxin);
          addTo(
            'blind',
            new B.Circle(new B.Point(q.lng, q.lat), r, {
              strokeColor: '#ff6b6b',
              strokeWeight: 2,
              fillColor: '#ff6b6b',
              fillOpacity: 0.3
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
          )
        })
      );
      pin.addEventListener('dragend', e => {
        const ll = (e && (e.latLng || e.point)) || pin.getPoint();
        if (!ll) return;
        const p = bd09ZhuanWgs84(ll.lng, ll.lat);
        huLveRef.current = Date.now();
        ziFaRef.current = p; // 拖到哪就是哪，视图不再重新居中，图钉就停在松手处
        setDaiXuan(null);
        if (onPickRef.current) onPickRef.current(p);
      });
    }

    // ④′ 盲区补建点：绿色 ✚ 图钉
    const buJianKey = simpleKey((report?.mangquList || []).map(m => m.buJianDian));
    if (buJianKey !== keysRef.current.buJian) {
      keysRef.current.buJian = buJianKey;
      clearLayer('buJian');
      for (const mq of report?.mangquList || []) {
        if (!mq.buJianDian) continue;
        const q = Z(mq.buJianDian);
        addTo(
          'buJian',
          new B.Marker(new B.Point(q.lng, q.lat), {
            icon: new B.Icon(
              svgIcon(
                `<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22'><circle cx='11' cy='11' r='10' fill='#1a8f57' stroke='#ffffff' stroke-width='2'/><path d='M11 5.5v11M5.5 11h11' stroke='#ffffff' stroke-width='2.4' stroke-linecap='round'/></svg>`
              ),
              new B.Size(22, 22),
              { anchor: new B.Size(11, 11) }
            ),
            title: `补建点 ${mq.id}`
          })
        );
      }
    }

    // ④″ 用户标记的盲区：清单点「标记」后画橙色旗标 + 轮廓加粗，突出该盲区
    const gzKey = `${guanZhuId || ''}|${(report?.mangquList || []).length}`;
    if (gzKey !== keysRef.current.guanZhu) {
      keysRef.current.guanZhu = gzKey;
      clearLayer('guanZhu');
      const mq = (report?.mangquList || []).find(m => m.id === guanZhuId);
      if (mq && mq.zhongxin) {
        const q = Z(mq.zhongxin);
        addTo(
          'guanZhu',
          new B.Marker(new B.Point(q.lng, q.lat), {
            title: `${mq.id} 盲区标记`,
            icon: new B.Icon(
              svgIcon(
                `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='30' viewBox='0 0 24 30'><ellipse cx='12' cy='28.6' rx='5' ry='1.5' fill='rgba(15,23,42,0.28)'/><path d='M12 0C5.9 0 1 4.9 1 11c0 7.4 9.6 17.4 10.1 17.9.3.3.9.3 1.2 0C13.4 28.4 23 18.4 23 11 23 4.9 18.1 0 12 0z' fill='#ff8c00' stroke='#ffffff' stroke-width='1.5'/><path d='M8.5 15.5h7v-6h-7z' fill='#ffffff'/><path d='M15.5 10.5l4 1.8-4 1.8z' fill='#ffffff'/></svg>`
              ),
              new B.Size(24, 30),
              { anchor: new B.Size(12, 30) }
            )
          })
        );
      }
    }

    // ④‴ 用户自标盲区：红色图钉（与体检盲区绿 ✚、清单标记橙旗区分），点击弹信息窗看详情
    const yhKey = simpleKey(yongHuMangQu || []);
    if (yhKey !== keysRef.current.yongHu) {
      keysRef.current.yongHu = yhKey;
      clearLayer('yongHu');
      for (const m of yongHuMangQu || []) {
        const q = Z(m.weiZhi);
        const mk = addTo(
          'yongHu',
          new B.Marker(new B.Point(q.lng, q.lat), {
            title: `自标盲区：${m.beiZhu}`,
            icon: new B.Icon(
              svgIcon(
                `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='30' viewBox='0 0 24 30'><ellipse cx='12' cy='28.6' rx='5' ry='1.5' fill='rgba(15,23,42,0.28)'/><path d='M12 0C5.9 0 1 4.9 1 11c0 7.4 9.6 17.4 10.1 17.9.3.3.9.3 1.2 0C13.4 28.4 23 18.4 23 11 23 4.9 18.1 0 12 0z' fill='#e5484d' stroke='#ffffff' stroke-width='1.5'/><path d='M12 7.2c-.9 0-1.6.7-1.5 1.6l.3 3.4c0 .7.5 1.2 1.2 1.2s1.2-.5 1.2-1.2l.3-3.4c.1-.9-.6-1.6-1.5-1.6z' fill='#ffffff'/><circle cx='12' cy='15.4' r='1' fill='#ffffff'/></svg>`
              ),
              new B.Size(24, 30),
              { anchor: new B.Size(12, 30) }
            )
          })
        );
        // 点击图钉：信息窗展示这是什么盲点、谁标的、何时、坐标
        mk.addEventListener('click', () => {
          huLveRef.current = Date.now(); // 点图钉不要被当成地图选点
          const shi = m.shiJian
            ? new Date(m.shiJian).toLocaleString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })
            : '';
          const neiRong =
            '<div style="font-size:13px;line-height:1.7;max-width:230px">' +
            '<b style="font-size:13.5px">📍 用户标记的盲区</b><br/>' +
            `${m.beiZhu}<br/>` +
            `<span style="color:#8a93a3;font-size:11.5px">标注：${m.zhangHao || '匿名'} · ${shi}<br/>(${m.weiZhi.lng.toFixed(5)}, ${m.weiZhi.lat.toFixed(5)})</span>` +
            '</div>';
          try {
            const chuang = new B.InfoWindow(neiRong, { width: 0, enableAutoPan: true });
            map.openInfoWindow(chuang, mk.getPosition());
          } catch {
            /* 个别版本不支持时忽略，图钉仍有 hover 提示 */
          }
        });
      }
    }

    // ⑤ 步行路线：点击设施后沿真实路网的虚线折线（官方 Polyline 写法，见技能文档 references/polyline.md）
    const buXingKey = buXing
      ? `${buXing.uid}|${buXing.zhuangTai}|${(buXing.polyline || []).length}`
      : '';
    if (buXingKey !== keysRef.current.buXing) {
      keysRef.current.buXing = buXingKey;
      clearLayer('buXing');
      if (buXing && buXing.zhuangTai === 'ok' && buXing.polyline && buXing.polyline.length > 1) {
        const pts = buXing.polyline.map(p => {
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
            strokeLineJoin: 'round'
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
        ok.addEventListener('click', ev => {
          ev.stopPropagation();
          if (queRenRef.current) queRenRef.current();
        });
        const no = document.createElement('button');
        no.type = 'button';
        no.className = 'pick-no';
        no.textContent = '取消';
        no.addEventListener('click', ev => {
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
    <div className={`map-view ${biaoJiKai ? 'map-biaoJi' : ''}`}>
      {/* 百度底图容器必须常驻：初始化时需要它已经有尺寸，否则会一直卡在加载中 */}
      {engine !== 'tile' && <div ref={mapDivRef} className="map-inner" />}
      {/* 地图工具条：百度地图同款（路况 / 卫星 / 3D） */}
      {engine === 'baidu' && (
        <div className="map-gongJu">
          <button
            type="button"
            className={luKuangKai ? 'on' : ''}
            onClick={() => gongJuSheZhi && gongJuSheZhi.luKuang(!luKuangKai)}
            title="实时路况图层"
          >
            🚦 路况
          </button>
          <button
            type="button"
            className={weiXingKai ? 'on' : ''}
            onClick={() => gongJuSheZhi && gongJuSheZhi.weiXing(!weiXingKai)}
            title="卫星影像 / 普通地图"
          >
            🛰 卫星
          </button>
          <button
            type="button"
            className={qingXieKai ? 'on' : ''}
            onClick={() => gongJuSheZhi && gongJuSheZhi.qingXie(!qingXieKai)}
            title="3D 倾斜视角"
          >
            🏔 3D
          </button>
        </div>
      )}
      {engine === 'tile' && (
        <DiTuCanvas
          report={report}
          center={center}
          onPick={onPick}
          onPoiDianJi={onPoiDianJi}
          buXing={buXing}
          xianshi={xianshi}
          juJiao={juJiaoCi}
        />
      )}
      <button
        type="button"
        className="map-huiWei"
        onClick={huiDaoDingWei}
        title="回到体检中心"
        aria-label="回到体检中心"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="7" />
          <line x1="12" y1="1" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="1" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="23" y2="12" />
          <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
        </svg>
      </button>
      {engine === 'loading' && (
        <div className="map-loading">
          <span>百度地图加载中…</span>
        </div>
      )}
      {engine === 'error' && (
        <div className="map-loading">
          <span>
            百度地图加载失败：请检查 .env 中 VITE_BMAP_AK 配置、百度控制台 Referer
            白名单及网络，然后刷新重试。
          </span>
          <button type="button" className="link-btn" onClick={() => window.location.reload()}>
            刷新重试
          </button>
        </div>
      )}
    </div>
  );
});
