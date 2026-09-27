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

// 导航期底图样式：隐藏 POI/楼宇标签（GL 渲染大户）。
// 注意 setMapStyleV2 会整体替换样式，且切卫星 / 开关路况也可能把样式或路况图层重置——
// 凡是动过地图样式 / 图层类型的地方，都要按当前开关把两者补齐（见路况 / 卫星 / 导航开局三处）
const DAO_HANG_YANG_SHI = [
  { featureType: 'poilabel', elementType: 'all', stylers: { visibility: 'off' } },
  { featureType: 'estatelabel', elementType: 'all', stylers: { visibility: 'off' } },
  { featureType: 'businesstowerlabel', elementType: 'all', stylers: { visibility: 'off' } },
  { featureType: 'companylabel', elementType: 'all', stylers: { visibility: 'off' } }
];
function yingYongDaoHangYangShi(map) {
  try {
    map.setMapStyleV2({ styleJson: DAO_HANG_YANG_SHI });
  } catch {
    /* 个别版本不支持个性化样式时忽略 */
  }
}

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
        // 比例尺：左下角，避开百度 logo（API 依据：百度 JSAPI WebGL v1.0 官方类参考 ScaleControl）。
        // 指南针不用原生 NavigationControl3D——它自带「2D/3D」切换（与右上角 3D 开关两套状态会不同步），
        // 且原生控件层级高，全屏导航时会压住导航操控按钮；改用自绘轻量指南针（map-zhiNanZhen）
        try {
          const zuoXia =
            B.BMAP_ANCHOR_BOTTOM_LEFT != null
              ? B.BMAP_ANCHOR_BOTTOM_LEFT
              : window.BMAP_ANCHOR_BOTTOM_LEFT;
          map.addControl(new B.ScaleControl({ anchor: zuoXia, offset: new B.Size(10, 28) }));
        } catch (e) {
          console.warn('地图控件（比例尺）加载失败，不影响其它功能', e);
        }
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

  // —— 指南针：轮询地图航向驱动指针旋转（GL 无可依赖的 headingchange 事件，400ms 轮询开销极低），
  // 点一下回正北。不用原生 NavigationControl3D 的原因见地图初始化处注释
  const [zhiNanXiang, setZhiNanXiang] = useState(0);
  useEffect(() => {
    if (engine !== 'baidu' || !mapRef.current) return undefined;
    const ding = setInterval(() => {
      try {
        const h = Number(mapRef.current.map.getHeading()) || 0;
        setZhiNanXiang(prev => (Math.abs(prev - h) > 0.5 ? h : prev));
      } catch {
        /* 忽略 */
      }
    }, 400);
    return () => clearInterval(ding);
  }, [engine]);
  // 点指南针回正北（带动画转回去）
  function huiZhengBei() {
    if (!mapRef.current) return;
    try {
      mapRef.current.map.setHeading(0);
    } catch {
      /* 忽略 */
    }
  }
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
          map.setZoom(Number.isFinite(dqJi) ? Math.max(dqJi, 21) : 21);
        } catch {
          /* 忽略 */
        }
        if (daoHang && daoHang.weiZhi) {
          const h = Z(daoHang.weiZhi);
          map.panTo(new B.Point(h.lng, h.lat));
        }
        return;
      }
      // 普通视图：用户预期「定位按钮 = 看我人在哪」——优先浏览器真实定位飞过去；
      // 拒绝授权 / 无定位设备 / 超时，桌面端用百度 IP 定位兜底（城市级），
      // 仍拿不到再退回体检中心（老行为保底）
      if (navigator.geolocation && navigator.geolocation.getCurrentPosition) {
        navigator.geolocation.getCurrentPosition(
          pos => {
            const mb2 = mapRef.current;
            if (!mb2) return;
            const q = Z({ lng: pos.coords.longitude, lat: pos.coords.latitude });
            if (!Number.isFinite(q.lng) || !Number.isFinite(q.lat)) return;
            ziFaRef.current = null;
            mb2.map.setCenter(new B.Point(q.lng, q.lat));
            try {
              if (Number(mb2.map.getZoom()) < 15) mb2.map.setZoom(15);
            } catch {
              /* 忽略 */
            }
          },
          () => {
            const mb2 = mapRef.current;
            if (!mb2) return;
            // 桌面端 IP 定位兜底（无需系统权限，城市/区县级）
            if (window.api && window.api.ipDingWei) {
              window.api
                .ipDingWei()
                .then(ip => {
                  const mb3 = mapRef.current;
                  if (!mb3) return;
                  if (ip && ip.ok) {
                    const w = bd09ZhuanWgs84(ip.lng, ip.lat);
                    const q = Z(w);
                    ziFaRef.current = null;
                    mb3.map.setCenter(new B.Point(q.lng, q.lat));
                    try {
                      if (Number(mb3.map.getZoom()) < 13) mb3.map.setZoom(13);
                    } catch {
                      /* 忽略 */
                    }
                    return;
                  }
                  const c = Z(center);
                  ziFaRef.current = null;
                  mb3.map.setCenter(new B.Point(c.lng, c.lat));
                })
                .catch(() => {});
              return;
            }
            const c = Z(center);
            ziFaRef.current = null;
            mb2.map.setCenter(new B.Point(c.lng, c.lat));
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
        );
      } else {
        const q = Z(center);
        ziFaRef.current = null;
        map.setCenter(new B.Point(q.lng, q.lat));
      }
    } else if (engine === 'tile') {
      setJuJiaoCi(n => n + 1); // DiTuCanvas 监听该计数强制重新居中
    }
  }

  // —— 地图工具条：路况图层 / 卫星图 / 3D 倾斜（百度地图同款）——
  // 状态由父组件受控（AI 导航卡与地图工具条共用同一套开关），此处只负责把状态落到地图上
  const luKuangKai = !!(gongJu && gongJu.luKuang);
  const weiXingKai = !!(gongJu && gongJu.weiXing);
  const qingXieKai = !!(gongJu && gongJu.qingXie);
  // 路况图层挂/摘：GL 版官方原生 setTrafficOn / setTrafficOff。
  // 开路况后若在导航期，要把隐藏标签的样式补回去——setTrafficOn 可能重置底图样式
  useEffect(() => {
    const mb = mapRef.current;
    if (engine !== 'baidu' || !mb) return;
    const { map } = mb;
    try {
      if (luKuangKai) {
        if (map.setTrafficOn) map.setTrafficOn();
        if (daoHangYangShiRef.current === 'dao') yingYongDaoHangYangShi(map);
      } else if (map.setTrafficOff) {
        map.setTrafficOff();
        if (daoHangYangShiRef.current === 'dao') yingYongDaoHangYangShi(map);
      }
    } catch {
      /* 当前 GL 版本不支持路况图层时保持原状 */
    }
  }, [luKuangKai, engine]);
  // 卫星图 / 普通地图切换。
  // GL 关键坑（实测）：setMapType(B_SATELLITE_MAP) 后矢量路网层仍盖在卫星影像上，
  // 看起来像「没切换」——必须 hideVectorStreetLayer / hideStreetLayer 把矢量层藏掉，
  // 切回普通地图再显示回来。切完底图类型还要按开关补走路况（setMapType 会重置路况）
  useEffect(() => {
    const mb = mapRef.current;
    if (engine !== 'baidu' || !mb) return;
    const { map } = mb;
    try {
      const lei = weiXingKai
        ? window.BMAP_SATELLITE_MAP || (window.BMapGL && window.BMapGL.BMAP_SATELLITE_MAP)
        : window.BMAP_NORMAL_MAP || (window.BMapGL && window.BMapGL.BMAP_NORMAL_MAP);
      if (lei) map.setMapType(lei);
      const dongZuo = weiXingKai
        ? ['hideVectorStreetLayer', 'hideStreetLayer']
        : ['showVectorStreetLayer', 'showStreetLayer'];
      dongZuo.forEach(fn => {
        if (typeof map[fn] === 'function') {
          try {
            map[fn]();
          } catch {
            /* 忽略 */
          }
        }
      });
      try {
        map.setDisplayOptions({ street: !weiXingKai });
      } catch {
        /* 忽略 */
      }
      if (luKuangKai && map.setTrafficOn) map.setTrafficOn();
      if (daoHangYangShiRef.current === 'dao') yingYongDaoHangYangShi(map);
    } catch {
      /* 当前 GL 版本不支持卫星图层时保持原状 */
    }
  }, [weiXingKai, luKuangKai, engine]);
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
  const daoHangBiaoDiRef = useRef(null); // 该 Marker 所属的地图实例：地图重初始化后旧 marker 失效需重建
  const daoHangLuRef = useRef([]); // 导航中的路线高亮（白边 + 蓝色实线）
  const daoHangKaiRef = useRef(false); // 是否已做过开局路线总览
  const daoHangYangShiRef = useRef('mo'); // 底图样式当前态：'dao'=导航减负（隐藏标签）/'mo'=默认完整样式
  const daoHangYiRef = useRef(0); // panTo 节流时间戳（60fps 更新位置，视角每 300ms 平滑跟一次）
  const daoHangSuoRef = useRef(0); // 缩放保险检查节流（500ms 一次，减少对 GL 渲染循环的打扰）
  const daoHangXiangRef = useRef(0); // 当前镜头航向角（度，顺时针 0=正北）——航向朝上导航用
  const daoHangXiangShiRef = useRef(0); // 航向旋转节流时间戳（与平移分开，各自节奏）
  const daoHangSuiRef = useRef(true); // 导航镜头是否自动跟随（用户拖图浏览时暂停，点回中按钮恢复）
  const [daoHangSuiTing, setDaoHangSuiTing] = useState(false); // 跟随暂停态（驱动回中按钮高亮与提示）
  const daoHangTuoRef = useRef(null); // 导航期 dragstart 监听句柄（退出导航时摘除）
  const daoHangCiRef = useRef(0); // 已打开画面的导航局号：与 App 端局号对齐——变了就是「新一局」，整局重开（清旧路线高亮、重画、重新落到路上）
  const xuanZhuanRef = useRef(xuanZhuan); // 航向朝上开关的实时值（事件监听只注册一次，须经 ref 读新值）
  xuanZhuanRef.current = xuanZhuan;
  const qingXieRef = useRef(false); // 3D 倾斜开关实时值（平滑跟随循环里校正镜头用）
  qingXieRef.current = qingXieKai;

  // —— 实时跟随帧（事件直驱 + 插值平滑）——
  // 数据来源是离散定位（模拟 GPS 每 400ms 一拍、真实定位 1~2 秒一拍），若收到位置就直接
  // panTo，镜头就是「冻住 → 跳一下」，观感即「卡」；手机导航之所以顺，是在两拍之间连续插值。
  // 所以这里只把收到的位置记为「目标」，由独立 rAF 循环用指数逼近把蓝点与镜头连续推过去
  // （时间常数 180ms、帧率无关，约覆盖 400ms 的定位间隔），到位即停循环、下一拍再启动，
  // 静止时零开销；整个过程不经过 React 渲染，不会拖着 App 组件树重渲染。
  const dhMuBiaoRef = useRef(null); // 当前跟随目标 {weiZhi, qianWang, fangWei}
  const dhXianShiRef = useRef(null); // 屏幕上当前显示的位置（向目标逼近）
  const dhHuanRef = useRef(0); // 平滑跟随 rAF 句柄（0 = 未在跑）
  const dhShiRef = useRef(0); // 上一平滑帧时间戳（算时间常数用）
  const dhXiuRef = useRef(0); // 缩放/倾斜校正节流时间戳
  const dhPanRef = useRef(0); // 镜头 panTo 节流时间戳（30fps 上限——panTo 每次都触发 GL 全画面重渲染，是导航中最大的渲染开销；蓝点 marker 位移便宜，仍逐帧更新）

  function dhPingHua() {
    dhHuanRef.current = 0;
    const mb = mapRef.current;
    const mbiao = dhMuBiaoRef.current;
    // 退出导航（画面拆掉）时直接收手，不再调度下一帧
    if (!mb || !daoHangKaiRef.current || !mbiao) return;
    const { map, B } = mb;
    const xianZai = performance.now();
    const dt = Math.min(64, xianZai - (dhShiRef.current || xianZai));
    dhShiRef.current = xianZai;
    const xian = dhXianShiRef.current || {
      weiZhi: mbiao.weiZhi,
      qianWang: mbiao.qianWang,
      fangWei: mbiao.fangWei
    };
    // 指数逼近系数：k = 1 - e^(-dt/τ)，与帧率无关；τ 取 180ms 恰好铺满一个定位间隔
    const k = 1 - Math.exp(-Math.max(dt, 1) / 180);
    const wei = {
      lng: xian.weiZhi.lng + (mbiao.weiZhi.lng - xian.weiZhi.lng) * k,
      lat: xian.weiZhi.lat + (mbiao.weiZhi.lat - xian.weiZhi.lat) * k
    };
    const qian = {
      lng: xian.qianWang.lng + (mbiao.qianWang.lng - xian.qianWang.lng) * k,
      lat: xian.qianWang.lat + (mbiao.qianWang.lat - xian.qianWang.lat) * k
    };
    // 朝向走最短角路逼近，避免 359°→1° 时箭头绕一大圈
    const chaJiao = ((mbiao.fangWei - xian.fangWei + 540) % 360) - 180;
    const fangWei = (xian.fangWei + chaJiao * k + 360) % 360;
    dhXianShiRef.current = { weiZhi: wei, qianWang: qian, fangWei };
    if (daoHangBiaoRef.current) {
      const q = Z(wei);
      // 坐标必须有效才喂给 GL——NaN/undefined 坐标会在 GL 内部 pointToPixel 里炸掉整个渲染
      if (Number.isFinite(q.lng) && Number.isFinite(q.lat)) {
        daoHangBiaoRef.current.setPosition(new B.Point(q.lng, q.lat));
        try {
          daoHangBiaoRef.current.setRotation(fangWei);
        } catch {
          /* 个别版本无 setRotation 时退化为固定朝上的箭头，不影响跟随 */
        }
      }
    }
    if (daoHangSuiRef.current) {
      const kq = Z(qian);
      // panTo 限 30fps：骑行车速快、目标持续前移，逐帧 panTo 会让 GL 每帧全画面重渲染（卡的主因）；
      // 33ms 一拍对人眼依然连贯，蓝点 marker 仍逐帧微移
      if (
        Number.isFinite(kq.lng) &&
        Number.isFinite(kq.lat) &&
        xianZai - dhPanRef.current >= 33
      ) {
        dhPanRef.current = xianZai;
        map.panTo(new B.Point(kq.lng, kq.lat), { noAnimation: true });
      }
      // 缩放/倾斜校正：panTo 若把相机还原成旧视角就补回，节流 400ms 一次，避免每帧白跑
      if (xianZai - dhXiuRef.current > 400) {
        dhXiuRef.current = xianZai;
        try {
          const dqJi = Number(map.getZoom());
          if (Number.isFinite(dqJi) && dqJi !== 21) map.setZoom(21, { noAnimation: true });
        } catch {
          /* 忽略 */
        }
        try {
          const dqQing = Number(map.getTilt());
          // 校正目标跟随 3D 开关：开着补回 52°，关着补回平视
          const muBiaoQing = qingXieRef.current ? 52 : 0;
          if (Number.isFinite(dqQing) && Math.abs(dqQing - muBiaoQing) > 2)
            map.setTilt(muBiaoQing, { noAnimation: true });
        } catch {
          /* 忽略 */
        }
      }
    }
    // 未到位就继续下一帧；到位（亚像素级 + 朝向基本对齐）收手等下一拍定位
    const chaMi = liangDianJuLi(xian.weiZhi, mbiao.weiZhi);
    if (chaMi > 0.12 || Math.abs(chaJiao) > 0.8) dhHuanRef.current = requestAnimationFrame(dhPingHua);
    else dhXianShiRef.current = mbiao;
  }

  function daoHangZhuZhui(xin) {
    if (!mapRef.current || !daoHangKaiRef.current || !xin || !xin.weiZhi) return;
    dhMuBiaoRef.current = {
      weiZhi: xin.weiZhi,
      qianWang: xin.qianWang || xin.weiZhi,
      fangWei: Number(xin.fangWei) || 0
    };
    if (!dhHuanRef.current) dhHuanRef.current = requestAnimationFrame(dhPingHua);
  }
  // 航向朝上的平滑旋转同样挂进事件帧（150ms 一步、每次吃掉角差 20%），与 React 状态节奏解耦
  function daoHangXiangZhui(xin) {
    const mb = mapRef.current;
    if (!mb || !daoHangKaiRef.current || !xin || !daoHangSuiRef.current) return;
    const xianZai = Date.now();
    if (xianZai - daoHangXiangShiRef.current <= 150) return;
    daoHangXiangShiRef.current = xianZai;
    const xiang = xuanZhuanRef.current ? Number(xin.fangWei) : 0;
    if (!Number.isFinite(xiang)) return;
    const cha = ((xiang - daoHangXiangRef.current + 540) % 360) - 180; // 最短角差 [-180,180)
    if (Math.abs(cha) <= 0.6) return;
    daoHangXiangRef.current =
      (daoHangXiangRef.current + Math.sign(cha) * Math.min(Math.abs(cha), Math.max(1, Math.abs(cha) * 0.2)) + 360) % 360;
    try {
      mb.map.setHeading(daoHangXiangRef.current, { noAnimation: true });
    } catch {
      /* 个别版本无 setHeading 时退化为北朝上 */
    }
  }
  // 事件监听只注册一次：跟随函数内部全走 ref，不存在闭包过期问题
  useEffect(() => {
    const ting = e => {
      if (!e || !e.detail) return;
      daoHangZhuZhui(e.detail);
      daoHangXiangZhui(e.detail);
    };
    window.addEventListener('sq_dh_wei', ting);
    return () => {
      window.removeEventListener('sq_dh_wei', ting);
      // 卸载时停掉平滑跟随循环，避免残留 rAF 空转
      if (dhHuanRef.current) {
        cancelAnimationFrame(dhHuanRef.current);
        dhHuanRef.current = 0;
      }
    };
  }, []);
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
    const shiZhengZaiChai = daoHangKaiRef.current; // 是否真从「导航画面已开」拆下来（区别于初次进入/引擎切换）
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
      // 退出导航：恢复底图默认样式（导航期间隐藏的 POI 标签回来）。
      // 样式替换会重置路况——按开关补走，保证「路况亮着就要显示」
      daoHangYangShiRef.current = 'mo';
      try {
        if (engine === 'baidu' && mb) {
          mb.map.setMapStyleV2({ styleJson: [] });
          if (luKuangKai && mb.map.setTrafficOn) mb.map.setTrafficOn();
        }
      } catch {
        /* 忽略 */
      }
      // 画面已回平视：3D 开关同步熄灭，保证按钮状态与实际视角永远一致
      // （否则出现「按钮亮着画面却是平的」或「点了 3D 像没反应」的错位观感）。
      // 只在「确实从导航拆下来」时同步——初次进入/引擎切换不碰用户在普通地图上自己开的 3D
      if (shiZhengZaiChai && engine === 'baidu' && gongJuSheZhi && gongJuSheZhi.qingXie) {
        gongJuSheZhi.qingXie(false);
      }
      // 缩放兜底：导航结束不该把人丢在世界地图上（缩放过小连自己在哪都看不见），
      // 拆画面后若缩放低于街道级（<12）就拉回 15 级，配合 drawBaidu 的回体检中心定位
      if (shiZhengZaiChai && mb) {
        try {
          const dqJi = Number(mb.map.getZoom());
          if (Number.isFinite(dqJi) && dqJi < 12) mb.map.setZoom(15, { noAnimation: true });
        } catch {
          /* 忽略 */
        }
      }
      // 退出导航：停掉平滑跟随循环并清掉目标/显示位置，下一局从新位置重新起算
      if (dhHuanRef.current) {
        cancelAnimationFrame(dhHuanRef.current);
        dhHuanRef.current = 0;
      }
      dhMuBiaoRef.current = null;
      dhXianShiRef.current = null;
      dhShiRef.current = 0;
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
      // 平滑跟随复位：开局第一帧直接用传入位置落点，不做从旧位置滑过来的动画
      dhMuBiaoRef.current = null;
      dhXianShiRef.current = null;
      dhShiRef.current = 0;
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
      // 导航期间隐藏底图 POI/楼宇标签：3D 近景下成片的标签文字是 GL 渲染大户，
      // 隐藏后画面减负明显；导航画面本该聚焦路线，退出导航时恢复默认样式
      // （API 依据：bmap-jsapi-gl 技能文档 map-style 分册——styleJson 可按 featureType 关 visibility，
      //   传空数组恢复默认样式）
      yingYongDaoHangYangShi(map);
      daoHangYangShiRef.current = 'dao';
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
              // 注意：BMapGL 构造参数里的 rotation 不生效（实测 + 社区反馈），必须 addOverlay
              // 之后调 setRotation——否则路面箭头全部朝上、不沿路（正是「箭头不沿路」的来源）
              try {
                jian.setRotation(fang);
              } catch {
                /* 忽略 */
              }
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
        // 立刻掐掉，缩放永远走不完；21 级为百度 GL 瓦片最高级别（用户指定导航近景用满级）
        try {
          const kaiQ = Z(daoHang.weiZhi);
          map.setCenter(new B.Point(kaiQ.lng, kaiQ.lat), { noAnimation: true });
        } catch {
          /* 忽略 */
        }
        try {
          // 倾斜跟随右上角 3D 开关（导航默认开）：开关关着就平视，不再硬编码 52 度
          map.setTilt(qingXieKai ? 52 : 0, { noAnimation: true });
        } catch {
          /* 忽略 */
        }
        try {
          map.setZoom(21, { noAnimation: true });
        } catch {
          /* 忽略 */
        }
      }
    }
    // 用户位置标记：蓝色导航箭头 + 白描边 + 淡蓝光晕（首帧创建，之后只挪位置、转朝向）——
    // 箭头按 fangWei（行进方位角，顺时针 0=正北）实时旋转，一眼看出当前朝向；
    // 镜头仍保持北朝上不转，只有箭头转，不会晕
    if (!daoHangBiaoRef.current || daoHangBiaoDiRef.current !== map) {
      // marker 不存在，或所属地图实例已更换（引擎切换 / 地图重初始化）：旧 marker 随旧地图失效，必须重建，
      // 否则对失效 marker setPosition 会在 GL 内部抛「reading 'lng' of undefined」炸掉整棵组件树
      if (daoHangBiaoRef.current) {
        try {
          map.removeOverlay(daoHangBiaoRef.current);
        } catch {
          /* 旧 marker 已随旧地图销毁时忽略 */
        }
        daoHangBiaoRef.current = null;
      }
      const tu = svgIcon(
        "<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'>" +
          "<circle cx='20' cy='20' r='15' fill='rgba(47,134,247,0.16)'/>" +
          "<path d='M20 4 L29.5 21 L20 16.5 L10.5 21 Z' fill='#2f86f7' stroke='#ffffff' " +
            "stroke-width='2' stroke-linejoin='round'/>" +
          "<rect x='16.8' y='19' width='6.4' height='12' rx='3' fill='#2f86f7' stroke='#ffffff' " +
            "stroke-width='2'/></svg>"
      );
      const biao = new B.Icon(tu, new B.Size(40, 40), { anchor: new B.Size(20, 20) });
      // zIndex 压过终点图钉（998）与「目的地」标签——GPS 模式下蓝点常与终点重合，层级低了会被盖住
      daoHangBiaoRef.current = new B.Marker(new B.Point(0, 0), { icon: biao, zIndex: 1002 });
      map.addOverlay(daoHangBiaoRef.current);
      daoHangBiaoDiRef.current = map;
    }
    // 底图样式跟随跟随状态：跟随中隐藏标签减负；暂停 / 等待定位 / 结束后恢复完整样式——
    // 否则停在原地时画面只剩路网白底，用户会以为「没加载出来」。
    // setMapStyleV2 会把路况图层一起重置——样式切完必须按开关补走路况，「亮了就要执行」
    const muBiaoYangShi = daoHang.kai ? 'dao' : 'mo';
    if (daoHangYangShiRef.current !== muBiaoYangShi) {
      daoHangYangShiRef.current = muBiaoYangShi;
      try {
        if (muBiaoYangShi === 'dao') yingYongDaoHangYangShi(map);
        else map.setMapStyleV2({ styleJson: [] });
        if (luKuangKai && map.setTrafficOn) map.setTrafficOn();
      } catch {
        /* 忽略 */
      }
    }
    // 位置/镜头更新统一交给 dhPingHua 平滑循环（事件直驱）。
    // 此处只做「落到当前真实位置」的兜底：刚创建小蓝点时还没有过跟随帧，
    // 或暂停后重新开始（状态推送但事件未到）时，先把蓝点与平滑基准摆到正确位置。
    // 注意别在这里按状态值 panTo/摆蓝点——状态推送是低频的，直接跳过去会打断平滑插值（硬跳 5 米级）
    if (dhMuBiaoRef.current === null && daoHang.weiZhi) {
      const q = Z(daoHang.weiZhi);
      if (Number.isFinite(q.lng) && Number.isFinite(q.lat)) {
        dhXianShiRef.current = {
          weiZhi: daoHang.weiZhi,
          qianWang: daoHang.qianWang || daoHang.weiZhi,
          fangWei: Number(daoHang.fangWei) || 0
        };
        if (daoHangBiaoRef.current) {
          try {
            daoHangBiaoRef.current.setPosition(new B.Point(q.lng, q.lat));
            daoHangBiaoRef.current.setRotation(Number(daoHang.fangWei) || 0);
          } catch {
            /* 个别版本 setRotation / 内部状态异常时忽略，下一帧跟随会继续摆 */
          }
        }
      }
    }
    // —— 航向朝上旋转（手机导航同款，需用户在导航页点「🧭」开启，默认北朝上不晕）——
    // setHeading 同样必须 noAnimation（默认动画被高频重启就会连续转圈）；
    // 150ms 一步、每次吃掉角差的 20%（至少 1°），转弯约一秒出头顶点、收敛柔顺；
    // 角差 0.6° 以内视为到位彻底停手；用户拖图浏览（跟随暂停）时镜头完全交还给用户
    const xianZai = Date.now();
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
      {/* 指南针：指针随地图航向转，点一下回正北；全屏导航时隐藏（导航页右上角有自己的视角开关） */}
      <button
        type="button"
        className="map-zhiNanZhen"
        onClick={huiZhengBei}
        title="地图朝向，点击回正北"
        aria-label="指南针，点击回正北"
      >
        <svg
          viewBox="0 0 40 40"
          width="24"
          height="24"
          style={{ transform: `rotate(${-zhiNanXiang}deg)` }}
        >
          <circle
            cx="20"
            cy="20"
            r="17"
            fill="rgba(255,255,255,0.95)"
            stroke="#d9dfe8"
            strokeWidth="1.5"
          />
          <path d="M20 7 L24 21 L20 18.5 L16 21 Z" fill="#e5484d" />
          <path d="M20 33 L16 19 L20 21.5 L24 19 Z" fill="#9aa7b8" />
        </svg>
      </button>
      <button
        type="button"
        className={`map-huiWei ${daoHangSuiTing ? 'daoSuiTing' : ''}`}
        onClick={huiDaoDingWei}
        title={
          daoHangSuiTing
            ? '镜头跟随已暂停（你拖动了地图），点此回到小蓝点继续导航'
            : '定位到当前位置（导航中为回到小蓝点跟随）'
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
