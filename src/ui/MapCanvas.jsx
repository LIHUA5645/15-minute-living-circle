// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，20
// 地图可视化：支持两种底图引擎
//   ① 百度地图（BMapGL）—— 需有效 AK
//   ② 开源瓦片（DiTuCanvas）—— 不依赖任何 AK，百度不可用时自动降级
// 两种引擎均叠加：等时圈热力分层 / 设施散点 / 服务盲区 / 体检中心
import React, { useEffect, useRef, useState } from 'react';
import { Cross, GraduationCap, ShoppingCart, Armchair, Bus, Trees, Shapes } from 'lucide';
import { MorphIcon } from 'morphicons/react';
import { Route as LuYouLuXian, Satellite, Axis3d } from 'lucide';
import { loadBmap } from './loadBmap.js';
import { DiTuCanvas } from './DiTuCanvas.jsx';
import { wgs84ZhuanBd09, bd09ZhuanWgs84 } from '../core/geo/zuobiao.js';
import { liangDianJuLi } from '../core/geo/jichu.js';

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
  souSuoMuDi,
  biaoJiKai,
  onBiaoJiDianJi,
  onDaoHangBiaoJi,
  juJiaoYongHu,
  daoHang,
  xuanZhuan,
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
    yongHu: [],
    muDiBiao: []
  });
  const keysRef = useRef({
    iso: '',
    poi: '',
    blind: '',
    center: '',
    buJian: '',
    buXing: '',
    guanZhu: '',
    yongHu: '',
    muDiBiao: ''
  });
  const onPickRef = useRef(onPick);
  const onPoiRef = useRef(onPoiDianJi);
  const biaoJiRef = useRef(biaoJiKai); // 盲区标记模式：点地图落标记而非选中心
  const onBiaoJiRef = useRef(onBiaoJiDianJi);
  biaoJiRef.current = biaoJiKai;
  onBiaoJiRef.current = onBiaoJiDianJi;
  const onDaoHangBiaoRef = useRef(onDaoHangBiaoJi); // 导航途中双击地图快速标记
  onDaoHangBiaoRef.current = onDaoHangBiaoJi;
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
        // enableIconClick：底图 POI 图标可点——百度瓦片内部的标注（卫生院 / 加油站等）
        // 程序无法批量读取，但打开此开关后用户点击即由百度弹出该点名称信息，配合逆地理编码可感知"这是哪"
        const map = new B.Map(mapDivRef.current, { enableMapClick: false, enableIconClick: true });
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
          // 用户反馈体验差）——确认框改为双击弹出（下方 dblclick）；盲区标记模式下单击仍直接落标记；
          // 导航途中的快速标记也并入双击（单击/双击时序竞争易误触，见下方 shuangJi）
          if (Date.now() - huLveRef.current < 300) return;
          const ll = e.latlng || e.point;
          if (!ll) return;
          const wgs = bd09ZhuanWgs84(ll.lng, ll.lat);
          if (biaoJiRef.current && onBiaoJiRef.current) onBiaoJiRef.current(wgs);
        });
        // GL 的 map 级 dblclick 事件在部分版本不派发（双击被内部缩放流程吞掉），
        // 改监听容器原生 dblclick：双击点相对中心的像素偏移 + pointToPixel/pixelToPoint 反算经纬度
        const shuangJi = ev => {
          if (!mapDivRef.current) return;
          const rct = mapDivRef.current.getBoundingClientRect();
          const dx = ev.clientX - (rct.left + rct.width / 2);
          const dy = ev.clientY - (rct.top + rct.height / 2);
          try {
            const cPx = map.pointToPixel(map.getCenter());
            // pixelToPoint 接收的是 Pixel（容器像素），误传 Point 会被当经纬度解析出 (0,0)
            const dian = map.pixelToPoint(new B.Pixel(cPx.x + dx, cPx.y + dy));
            if (!dian) return;
            // 普通视图：气泡提供「设为中心点 / 取消」；导航视图：气泡多一个「标记盲区」按钮
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
        readyTimer = setTimeout(function check() {
          if (cancelled) return;
          // 画布已经出图（GL 正常渲染）就不再误报「加载失败」，慢网下瓦片晚到属正常现象
          if (mapDivRef.current && mapDivRef.current.querySelector('canvas')) {
            setEngine('baidu'); // 失败提示后画布晚到：自动撤掉横幅自愈
            return;
          }
          setEngine('error');
          readyTimer = setTimeout(check, 1500); // 每 1.5 秒复查，画布出现即自愈
        }, 12000);
        // 瓦片迟到时恢复底图状态，自动撤掉误报提示
        map.addEventListener('tilesloaded', () => {
          clearTimeout(readyTimer);
          if (!cancelled) setEngine('baidu');
        });
      } catch (e) {
        // 百度初始化异常 → 提示错误（赛道要求必须使用百度地图，不降级第三方底图）
        console.error('[map-init] 初始化失败：', e && e.message, e && e.stack);
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
  }, [engine, report, center, xianshi, buXing, guanZhuId, yongHuMangQu, souSuoMuDi]);

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

  // 一键回到体检中心：地图乱滑后找不回位置时使用；
  // 导航中语义变为「回到导航跟随」：恢复镜头接管并立即回到小蓝点
  function huiDaoDingWei() {
    if (engine === 'baidu' && mapRef.current) {
      const { map, B } = mapRef.current;
      if (daoHangKaiRef.current) {
        daoHangSuiRef.current = true;
        setDaoHangSuiTing(false);
        try {
          // GL 的 getZoom 偶发返回 undefined，Math.max 会得到 NaN 喂进 setZoom
          // 触发 GL 内部 getMinZoom 报错——先做有限数兜底
          const dqJi = Number(map.getZoom());
          map.setZoom(Number.isFinite(dqJi) ? Math.max(dqJi, 19) : 19);
        } catch {
          /* 忽略 */
        }
        if (daoHang && daoHang.weiZhi) {
          const h = Z(daoHang.weiZhi);
          map.panTo(new B.Point(h.lng, h.lat));
        }
        return;
      }
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
  const daoHangXiangRef = useRef(0); // 当前镜头航向角（度，顺时针 0=正北）——航向朝上导航用
  const daoHangXiangShiRef = useRef(0); // 航向旋转节流时间戳（与平移分开，各自节奏）
  const daoHangSuiRef = useRef(true); // 导航镜头是否自动跟随（用户拖图浏览时暂停，点回中按钮恢复）
  const [daoHangSuiTing, setDaoHangSuiTing] = useState(false); // 跟随暂停态（驱动回中按钮高亮与提示）
  const daoHangTuoRef = useRef(null); // 导航期 dragstart 监听句柄（退出导航时摘除）
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
  // 导航期间隐藏日常图层（等时圈 / 设施散点 / 盲区 / 图钉 / 普通虚线路线），
  // 只留导航高亮路线与小蓝点——与手机地图导航一致，满屏杂物会挡住路线；
  // 键值一并清空，退出导航后 drawBaidu 才能把这些图层原样画回来
  function yinCangRiChangTuCeng() {
    if (!mapRef.current) return;
    ['iso', 'poi', 'blind', 'buJian', 'center', 'guanZhu', 'yongHu', 'buXing'].forEach(ming => {
      clearLayer(ming);
      keysRef.current[ming] = '';
    });
  }
  useEffect(() => {
    const mb = mapRef.current;
    // 注意：判断的是 daoHang 对象是否存在，而不是 kai——暂停/到达只是 kai 变 false
    // 但对象还在（进度要保留），若按 kai 判断会把暂停当退出处理：
    // 拆掉导航画面、重画日常图层并 setCenter 回体检中心，表现为「一点暂停就跑回原位置」
    const zaiKai = !!(daoHang && daoHang.weiZhi && engine === 'baidu');
    if (!mb || !zaiKai) {
      // 退出导航 / 引擎切换：摘掉小蓝点与高亮路线，回正视角并恢复日常图层
      daoHangKaiRef.current = false;
      qingDaoHangFuGai();
      if (daoHangTuoRef.current) {
        try {
          mb.map.removeEventListener('dragstart', daoHangTuoRef.current);
        } catch {
          /* 忽略 */
        }
        daoHangTuoRef.current = null;
      }
      daoHangSuiRef.current = true; // 跟随恢复默认开启
      setDaoHangSuiTing(false);
      if (mb && daoHangLuRef.current.length === 0) {
        try {
          mb.map.setTilt(0);
          mb.map.setHeading(0); // 镜头航向回正北（导航期间是航向朝上的旋转视角）
        } catch {
          /* 个别版本无 setTilt / setHeading 时忽略 */
        }
      }
      daoHangXiangRef.current = 0;
      // 日常图层在导航开局被清掉且键值已重置，这里延迟一拍重画恢复
      clearTimeout(drawTimerRef.current);
      drawTimerRef.current = setTimeout(() => {
        if (engine === 'baidu' && mapRef.current) drawBaidu();
      }, 100);
      return;
    }
    const { map, B } = mb;
    // 开局：清掉日常图层只留导航画面 → 路线高亮（白边蓝实线）+ 3D 倾斜 + 总览整条路线，随后拉近跟随
    if (!daoHangKaiRef.current) {
      daoHangKaiRef.current = true;
      daoHangXiangRef.current = 0; // 航向记录归零，首帧按实际行进方向重新起算
      daoHangSuiRef.current = true;
      setDaoHangSuiTing(false);
      // 用户拖图浏览时暂停镜头接管（平移/缩放/航向都停），点右下角回中按钮恢复跟随
      daoHangTuoRef.current = () => {
        daoHangSuiRef.current = false;
        setDaoHangSuiTing(true);
      };
      try {
        map.addEventListener('dragstart', daoHangTuoRef.current);
      } catch {
        /* 个别版本事件名差异时忽略，只是少了暂停跟随的手势 */
      }
      yinCangRiChangTuCeng();
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
          // 路面导航箭头：沿路线等距铺白色箭头，每支按所在路段方位角自转（marker.setRotation，
          // 顺时针 0=正北）——蓝底白箭头就是手机 / 车机导航的路面引导样式
          const xianW = buXing.polyline;
          const duanLu = [];
          let quanLu = 0;
          for (let i = 1; i < xianW.length; i++) {
            const d = liangDianJuLi(xianW[i - 1], xianW[i]);
            duanLu.push(d);
            quanLu += d;
          }
          const zhouQi = quanLu > 4000 ? 80 : 40; // 箭头间距：短路线 40 米一支，长路线 80 米防卡顿
          const jianTu = new B.Icon(
            svgIcon(
              "<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14'>" +
                "<path d='M7 2.2 L11.8 11.8 L7 9.4 L2.2 11.8 Z' fill='#ffffff' opacity='0.92'/></svg>"
            ),
            new B.Size(14, 14),
            { anchor: new B.Size(7, 7) }
          );
          let muBiaoLu = zhouQi;
          let lei = 0;
          for (let i = 0; i < duanLu.length && muBiaoLu <= quanLu - 10; i++) {
            while (muBiaoLu <= lei + duanLu[i] && muBiaoLu <= quanLu - 10) {
              const t = duanLu[i] ? (muBiaoLu - lei) / duanLu[i] : 0;
              const a = xianW[i];
              const b2 = xianW[i + 1];
              const zw = { lng: a.lng + (b2.lng - a.lng) * t, lat: a.lat + (b2.lat - a.lat) * t };
              const fang = (Math.atan2(b2.lng - a.lng, b2.lat - a.lat) * 180) / Math.PI;
              const qw = Z(zw);
              const jian = new B.Marker(new B.Point(qw.lng, qw.lat), {
                icon: jianTu,
                rotation: fang
              });
              map.addOverlay(jian);
              daoHangLuRef.current.push(jian);
              muBiaoLu += zhouQi;
            }
            lei += duanLu[i];
          }
          // 终点标：红色旗标图钉 + 「目的地」红底白字文字标——导航画面里最醒目的锚点
          const zhongW = xianW[xianW.length - 1];
          const zq = Z(zhongW);
          const zhongBiao = new B.Marker(
            new B.Point(zq.lng, zq.lat),
            {
              title: '目的地',
              icon: new B.Icon(
                svgIcon(
                  `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='36' viewBox='0 0 24 30'><ellipse cx='12' cy='28.6' rx='5' ry='1.5' fill='rgba(15,23,42,0.28)'/><path d='M12 0C5.9 0 1 4.9 1 11c0 7.4 9.6 17.4 10.1 17.9.3.3.9.3 1.2 0C13.4 28.4 23 18.4 23 11 23 4.9 18.1 0 12 0z' fill='#e5484d' stroke='#ffffff' stroke-width='1.5'/><path d='M8.5 15.5h7v-6h-7z' fill='#ffffff'/><path d='M15.5 10.5l4 1.8-4 1.8z' fill='#ffffff'/></svg>`
                ),
                new B.Size(28, 36),
                { anchor: new B.Size(14, 36) }
              ),
              zIndex: 998
            }
          );
          map.addOverlay(zhongBiao);
          daoHangLuRef.current.push(zhongBiao);
          try {
            const qian = new B.Label('目的地', {
              position: new B.Point(zq.lng, zq.lat),
              offset: new B.Size(-26, -48)
            });
            qian.setStyle({
              background: '#e5484d',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '2px 9px',
              fontSize: '12px',
              fontWeight: '700',
              fontFamily: 'inherit'
            });
            map.addOverlay(qian);
            daoHangLuRef.current.push(qian);
          } catch {
            /* Label 个别版本样式差异时忽略，旗标图钉仍在 */
          }
        } catch {
          /* 高亮 / 箭头失败不影响导航 */
        }
        // 开局直接落到近景（不再总览），三个调用各自独立 try——
        // 若共用一个 try，前面任何一个 API 在个别 GL 版本上抛错（如 setTilt 不认 options），
        // 后面的 setZoom 就不会执行，表现为「导航不放大」。
        // 全部 noAnimation 瞬切：带动画的 setZoom 会被 50ms 后跟随帧的 panTo(noAnimation)
        // 立刻掐掉，缩放永远走不完；19 级=步行导航实用上限（瓦片最高 21 级）
        try {
          const kaiQ = Z(daoHang.weiZhi);
          map.setCenter(new B.Point(kaiQ.lng, kaiQ.lat), { noAnimation: true });
        } catch {
          /* 忽略 */
        }
        try {
          map.setTilt(52, { noAnimation: true });
        } catch {
          /* 忽略 */
        }
        try {
          map.setZoom(19, { noAnimation: true });
        } catch {
          /* 忽略 */
        }
      }
    }
    // 用户位置标记：蓝色导航箭头 + 白描边 + 淡蓝光晕（首帧创建，之后只挪位置、转朝向）——
    // 箭头按 fangWei（行进方位角，顺时针 0=正北）实时旋转，一眼看出当前朝向；
    // 镜头仍保持北朝上不转，只有箭头转，不会晕
    if (!daoHangBiaoRef.current) {
      const tu = svgIcon(
        "<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'>" +
          "<circle cx='20' cy='20' r='15' fill='rgba(47,134,247,0.16)'/>" +
          "<path d='M20 5.5 L29 31 L20 25.5 L11 31 Z' fill='#2f86f7' stroke='#ffffff' " +
            "stroke-width='2.4' stroke-linejoin='round'/></svg>"
      );
      const biao = new B.Icon(tu, new B.Size(40, 40), { anchor: new B.Size(20, 20) });
      // zIndex 压过终点图钉（998）与「目的地」标签——GPS 模式下蓝点常与终点重合，层级低了会被盖住
      daoHangBiaoRef.current = new B.Marker(new B.Point(0, 0), { icon: biao, zIndex: 1002 });
      map.addOverlay(daoHangBiaoRef.current);
    }
    const q = Z(daoHang.weiZhi);
    daoHangBiaoRef.current.setPosition(new B.Point(q.lng, q.lat));
    try {
      daoHangBiaoRef.current.setRotation(Number(daoHang.fangWei) || 0);
    } catch {
      /* 个别版本无 setRotation 时退化为固定朝上的箭头，不影响跟随 */
    }
    // —— 丝滑平移跟随：panTo 必须带 noAnimation——GL 的 panTo 默认自带飞行动画，
    // 高频调用等于不停重启动画，观感一顿一顿；关掉动画改为高频小步跳变（50ms 一档），
    // 步长小到肉眼不可见，跟点如丝般顺滑。缩放仍绝不在跟随帧里调（GL getMinZoom 缺陷）
    const xianZai = Date.now();
    if (daoHangSuiRef.current && xianZai - daoHangYiRef.current > 50) {
      daoHangYiRef.current = xianZai;
      // 相机看向前方 60 米引导点（App 沿路线插值好随 daoHang 传入）：
      // 小蓝点沉到屏幕下三分之一、前方路面占视野主体；旧数据没有引导点时退回蓝点居中
      const kan = daoHang.qianWang || daoHang.weiZhi;
      const kq = Z(kan);
      map.panTo(new B.Point(kq.lng, kq.lat), { noAnimation: true });
      // 保险：级别意外低于 19（开局瞬切被 GL 内部状态吃掉、或用户缩小了）就拉回路上近景。
      // 必须先过 Number.isFinite——GL 的 getZoom 偶发返回 undefined，NaN 进 setZoom
      // 会触发 GL 内部 getMinZoom 报错（此前画面乱动的元凶之一）
      try {
        const dqJi = Number(map.getZoom());
        if (Number.isFinite(dqJi) && dqJi < 19) map.setZoom(19, { noAnimation: true });
      } catch {
        /* 忽略 */
      }
    }
    // —— 航向朝上旋转（手机导航同款，需用户在导航页点「🧭」开启，默认北朝上不晕）——
    // setHeading 同样必须 noAnimation（默认动画被高频重启就会连续转圈）；
    // 150ms 一步、每次吃掉角差的 20%（至少 1°），转弯约一秒出头顶点、收敛柔顺；
    // 角差 0.6° 以内视为到位彻底停手；用户拖图浏览（跟随暂停）时镜头完全交还给用户
    if (daoHangSuiRef.current && xianZai - daoHangXiangShiRef.current > 150) {
      daoHangXiangShiRef.current = xianZai;
      const xiang = xuanZhuan ? Number(daoHang.fangWei) : 0;
      if (Number.isFinite(xiang)) {
        const cha = ((xiang - daoHangXiangRef.current + 540) % 360) - 180; // 最短角差 [-180,180)
        if (Math.abs(cha) > 0.6) {
          daoHangXiangRef.current = (daoHangXiangRef.current + Math.sign(cha) * Math.min(Math.abs(cha), Math.max(1, Math.abs(cha) * 0.2)) + 360) % 360;
          try {
            map.setHeading(daoHangXiangRef.current, { noAnimation: true });
          } catch {
            /* 个别版本无 setHeading 时退化为北朝上，不影响跟随 */
          }
        }
      }
    }
  }, [daoHang, buXing, engine]);

  function clearLayer(name) {
    if (!mapRef.current) return;
    const { map } = mapRef.current;
    (layersRef.current[name] || []).forEach(o => {
      try {
        map.removeOverlay(o);
      } catch {
        /* BMapGL 内部 remove 时偶发读 undefined（intersects）报错，属其自身渲染缺陷，
           逐个捕获避免把 React 树整个打崩白屏 */
      }
    });
    layersRef.current[name] = [];
  }
  function addTo(name, o) {
    layersRef.current[name].push(o);
    try {
      mapRef.current.map.addOverlay(o);
    } catch {
      /* 与 clearLayer 同理：GL 内部异常不外抛 */
    }
    return o; // 返回覆盖物本身，便于就地绑定事件（如中心点图钉的 dragend）
  }

  function drawBaidu() {
    // 导航期间不重画日常图层：一重画就会 setCenter 拽回体检中心，跟车视角会被打断；
    // 退出导航时由导航 effect 统一重画恢复
    if (daoHangKaiRef.current) return;
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
            '<div style="min-width:200px;max-width:240px">' +
            // 标题行：图钉 + 标题 + 虚线分隔，比旧版单行标题更精致
            '<div style="display:flex;align-items:center;gap:6px;padding-bottom:6px;margin-bottom:7px;border-bottom:1px dashed #e3e8ef">' +
            '<span style="font-size:15px;line-height:1">📍</span>' +
            '<b style="font-size:13.5px;color:#1f2a37">用户标记的盲区</b>' +
            '</div>' +
            `<div style="font-size:12.5px;color:#1f2a37;line-height:1.6">${m.beiZhu}</div>` +
            `<div style="margin-top:6px;color:#8a93a3;font-size:11.5px;line-height:1.6">标注：${m.zhangHao || '匿名'} · ${shi}<br/>(${m.weiZhi.lng.toFixed(5)}, ${m.weiZhi.lat.toFixed(5)})</div>` +
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

    // ④⁗ 搜索目的地旗标：搜索面板 / AI 选点确定目的地时打橙色旗标（与导航终点红旗、
    //    盲区标记橙旗区分用更醒目的紫罗兰色），换目的地 / 换体检中心随层重建
    const mdKey = simpleKey(souSuoMuDi || null);
    if (mdKey !== keysRef.current.muDiBiao) {
      keysRef.current.muDiBiao = mdKey;
      clearLayer('muDiBiao');
      if (souSuoMuDi && Number.isFinite(souSuoMuDi.lng)) {
        const mq = Z(souSuoMuDi);
        const zhen = addTo(
          'muDiBiao',
          new B.Marker(new B.Point(mq.lng, mq.lat), {
            title: `目的地：${souSuoMuDi.ming || '搜索地点'}`,
            icon: new B.Icon(
              svgIcon(
                `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='36' viewBox='0 0 24 30'><ellipse cx='12' cy='28.6' rx='5' ry='1.5' fill='rgba(15,23,42,0.28)'/><path d='M12 0C5.9 0 1 4.9 1 11c0 7.4 9.6 17.4 10.1 17.9.3.3.9.3 1.2 0C13.4 28.4 23 18.4 23 11 23 4.9 18.1 0 12 0z' fill='#7c5cf0' stroke='#ffffff' stroke-width='1.5'/><path d='M8.5 15.5h7v-6h-7z' fill='#ffffff'/><path d='M15.5 10.5l4 1.8-4 1.8z' fill='#ffffff'/></svg>`
              ),
              new B.Size(28, 36),
              { anchor: new B.Size(14, 36) }
            ),
            zIndex: 997
          })
        );
        try {
          const qian = new B.Label(souSuoMuDi.ming || '目的地', {
            position: new B.Point(mq.lng, mq.lat),
            offset: new B.Size(-26, -48)
          });
          qian.setStyle({
            background: '#7c5cf0',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '2px 9px',
            fontSize: '12px',
            fontWeight: '700',
            fontFamily: 'inherit'
          });
          map.addOverlay(qian);
          layersRef.current.muDiBiao.push(qian);
        } catch {
          /* Label 个别版本样式差异时忽略 */
        }
        zhen.addEventListener('click', () => {
          huLveRef.current = Date.now(); // 点旗标不要被当成地图选点
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
        // 导航途中双击：气泡多一个「标记盲区」选项（设中心点仍然保留）
        const zaiDaoHang = daoHangKaiRef.current && onDaoHangBiaoRef.current;
        t.textContent = zaiDaoHang ? '对这个位置做什么？' : '将体检中心设到此处？';
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
        // 普通视图：追加「标记此处」按钮——与盲区标记模式同一入口，把双击点记成共享盲区（弹标记小窗填备注）；
        // 导航途中已有「标记盲区」，不重复加
        if (!zaiDaoHang && onBiaoJiRef.current) {
          const bj = document.createElement('button');
          bj.type = 'button';
          bj.className = 'pick-biao';
          bj.textContent = '标记此处';
          bj.addEventListener('click', ev => {
            ev.stopPropagation();
            huLveRef.current = Date.now();
            onBiaoJiRef.current(daiXuan);
            setDaiXuan(null);
          });
          btns.appendChild(bj);
        }
        // 导航途中：追加「标记盲区」第三按钮——把双击点记成共享盲区（弹标记小窗填备注）
        if (zaiDaoHang) {
          const bz = document.createElement('button');
          bz.type = 'button';
          bz.className = 'pick-biao';
          bz.textContent = '标记盲区';
          bz.addEventListener('click', ev => {
            ev.stopPropagation();
            huLveRef.current = Date.now();
            if (onDaoHangBiaoRef.current) onDaoHangBiaoRef.current(daiXuan);
            setDaiXuan(null);
          });
          btns.appendChild(bz);
        }
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
            <MorphIcon icon={LuYouLuXian} size={14} spring="snappy" />
            路况
          </button>
          <button
            type="button"
            className={weiXingKai ? 'on' : ''}
            onClick={() => gongJuSheZhi && gongJuSheZhi.weiXing(!weiXingKai)}
            title="卫星影像 / 普通地图"
          >
            <MorphIcon icon={Satellite} size={14} spring="snappy" />
            卫星
          </button>
          <button
            type="button"
            className={qingXieKai ? 'on' : ''}
            onClick={() => gongJuSheZhi && gongJuSheZhi.qingXie(!qingXieKai)}
            title="3D 倾斜视角"
          >
            <MorphIcon icon={Axis3d} size={14} spring="snappy" />
            3D
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
        className={`map-huiWei ${daoHangSuiTing ? 'daoSuiTing' : ''}`}
        onClick={huiDaoDingWei}
        title={
          daoHangSuiTing
            ? '镜头跟随已暂停（你拖动了地图），点此回到小蓝点继续导航'
            : '回到小蓝点 / 体检中心'
        }
        aria-label={daoHangSuiTing ? '回到导航跟随' : '回到体检中心'}
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
