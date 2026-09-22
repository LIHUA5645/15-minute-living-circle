// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，20
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { yunXingTijian } from '../core/pipeline.js';
import { chuangJianBmapWeb } from '../adapters/bmapWeb.js';
import { chuangJianBmapServer } from '../adapters/bmapServer.js';
import { chuangJianOsm } from '../adapters/osm.js';
import { MapCanvas } from './MapCanvas.jsx';
import { BaoGao } from './BaoGao.jsx';
import { GuanLiYuan } from './admin.jsx';
import { DengLu } from './dengLu.jsx';
import { GeRen } from './geRen.jsx';
import { dangQianYongHu, yongHuTuiChu } from '../core/yonghu.js';
import { loadPeiZhi, saveReport } from './peiZhi.js';
import { loadBmap } from './loadBmap.js';
import { shengChengZhenDuan } from '../core/zhenduan.js';
import { aiXuanDian } from '../core/aiDaohang.js';
import { aiLiaoTian } from '../core/aiLiaoTian.js';
import { liangDianJuLi } from '../core/geo/jichu.js';
import { bd09ZhuanWgs84 } from '../core/geo/zuobiao.js';
import { MorphIcon } from 'morphicons/react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Search, MapPin, Map, Cross, GraduationCap, ShoppingCart, Armchair, Bus, Trees, Shapes, Navigation, NavigationOff } from 'lucide';

// AI 助手徽章：渐变蓝底 + 星芒 SVG（本项目 lucide 导出的是节点数据非组件，故手写内联 SVG）
function AiHuiZhang({ da }) {
  return (
    <span className={`lt-jiQi ${da ? 'da' : ''}`}>
      <svg viewBox="0 0 24 24" width={da ? 20 : 13} height={da ? 20 : 13} fill="currentColor">
        <path d="M12 2l2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3z" />
      </svg>
    </span>
  );
}

const COLOR = {
  yiliao: '#ff6b6b',
  jiaoyu: '#ffd166',
  gouwu: '#3ddc97',
  yanglao: '#b18cff',
  jiaotong: '#2f9bff',
  xiuxian: '#e64980',
};
const MING = { yiliao: '医疗', jiaoyu: '教育', gouwu: '购物', yanglao: '养老', jiaotong: '交通', xiuxian: '休闲' };

// 六类设施图例：语义图标（lucide），颜色跟随类别色，关闭时置灰
const SHE_SHI_TU = {
  yiliao: Cross,
  jiaoyu: GraduationCap,
  gouwu: ShoppingCart,
  yanglao: Armchair,
  jiaotong: Bus,
  xiuxian: Trees,
};
// AI 诊断卡：体检完成后自动生成诊断叙述（大模型优先，本地规则兜底），打字机逐字浮现
function AiZhenDuanKa({ report, peiZhi }) {
  const [wen, setWen] = useState('');
  const [xianShiWen, setXianShiWen] = useState('');
  const [zhuangTai, setZhuangTai] = useState('shengCheng'); // shengCheng | daZi | wanCheng
  const [laiYuan, setLaiYuan] = useState('');

  useEffect(() => {
    if (!report) return;
    let huo = true;
    setZhuangTai('shengCheng');
    setXianShiWen('');
    shengChengZhenDuan(report, peiZhi).then((j) => {
      if (!huo) return;
      setWen(j.wen);
      setLaiYuan(j.laiYuan);
      setZhuangTai('daZi');
    });
    return () => {
      huo = false;
    };
  }, [report]);

  // 打字机
  useEffect(() => {
    if (zhuangTai !== 'daZi') return undefined;
    if (xianShiWen.length >= wen.length) {
      setZhuangTai('wanCheng');
      return undefined;
    }
    const t = setTimeout(() => setXianShiWen(wen.slice(0, xianShiWen.length + 2)), 18);
    return () => clearTimeout(t);
  }, [zhuangTai, xianShiWen, wen]);

  if (!report) return null;
  // 来源说明要诚实区分三种情况：大模型生成 / 配置了但调用失败回退 / 根本没启用大模型
  const qiYong = peiZhi && peiZhi.ai && peiZhi.ai.qiYong;
  const biaoQian =
    zhuangTai === 'shengCheng'
      ? '生成中…'
      : laiYuan === 'ai'
        ? '大模型生成'
        : qiYong
          ? '本地规则 · 大模型失败已回退'
          : '本地规则引擎 · 未接入大模型';
  const biaoTi = laiYuan === 'ai' ? 'AI 诊断' : '诊断结论';
  return (
    <div className="chart-card ai-card">
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{biaoTi}</span>
        <span className={`ai-biao ${laiYuan === 'ai' ? 'ai' : 'bendi'}`}>{biaoQian}</span>
      </div>
      <div className="ai-wen">
        {xianShiWen}
        {zhuangTai === 'daZi' && <span className="ai-guang-biao">▌</span>}
      </div>
    </div>
  );
}

function SheShiTubiao({ f, yanSe, on = true }) {
  return (
    <span className="tubiao" style={{ color: on ? yanSe : '#b6bfc9' }}>
      <MorphIcon icon={SHE_SHI_TU[f] || Shapes} size={15} spring="snappy" />
    </span>
  );
}

// 初始默认中心点（仅作首屏兜底坐标，界面上已不展示样例社区；真实中心点由浏览器定位/地图点选/搜索产生）
const YANGLI = [
  { name: '长沙·砂子塘社区', lng: 112.9388, lat: 28.2281 },
  { name: '北京·中关村', lng: 116.3163, lat: 39.9836 },
  { name: '上海·人民广场', lng: 121.4737, lat: 31.2304 },
  { name: '广州·天河城', lng: 113.3245, lat: 23.1371 },
];

function chuangJianIpc() {
  const api = window.api;
  return {
    walkingRoute: (o, d) => api.walkingRoute(o, d),
    routeMatrix: (o, d) => api.routeMatrix(o, d),
    searchPoi: (c, k, r) => api.searchPoi(c, k, r),
    reverseGeocode: (p) => api.reverseGeocode(p),
  };
}
const isElectron = typeof window !== 'undefined' && window.api?.isElectron;

export function App() {
  const ak = import.meta.env.VITE_BMAP_AK;
  // 默认数据源=百度地图（符合赛道要求：必须调用百度地图开放能力），
  // 仅当 .env 未配置 VITE_BMAP_AK 时才退回 OSM 真实路网兜底模式
  const [mode, setMode] = useState(ak ? 'bmap' : 'osm');
  const [center, setCenter] = useState({ lng: YANGLI[0].lng, lat: YANGLI[0].lat });
  const [curName, setCurName] = useState(YANGLI[0].name);
  const [mubiaoFen, setMubiaoFen] = useState(15);
  const [dangwei, setDangwei] = useState('standard');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState(null);
  const [offline, setOffline] = useState(false);
  const [peiZhi, setPeiZhi] = useState(() => loadPeiZhi());
  const [adminOpen, setAdminOpen] = useState(false);
  const [dengLuKai, setDengLuKai] = useState(false);
  const [geRenKai, setGeRenKai] = useState(false); // 个人主页弹窗（点头像进入）
  const [guanZhuM, setGuanZhuM] = useState(null); // 用户在盲区清单里标记（高亮）的盲区 id
  const [yongHu, setYongHu] = useState(() => dangQianYongHu());
  // 管理员登录态（与用户会话分离，存 localStorage 以便控制台独立标签页共享）：管理员面板关闭时同步一次
  const [guanLiYuanZai, setGuanLiYuanZai] = useState(() => localStorage.getItem('sq_admin_session') === '1');
  const guanLiYuanTuiChu = () => {
    localStorage.removeItem('sq_admin_session');
    localStorage.removeItem('sq_admin_token');
    setGuanLiYuanZai(false);
  };
  const guanLiYuanGuanBi = () => {
    // 独立管理标签页（由主页面 window.open 打开）时「返回体检助手」直接关掉本标签页，回到原体检页
    if (window.location.hash === '#guanliyuan' && window.opener) {
      window.close();
      return;
    }
    if (window.location.hash === '#guanliyuan') {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setAdminOpen(false);
    setGuanLiYuanZai(localStorage.getItem('sq_admin_session') === '1');
  };
  // 在独立标签页打开管理员控制台（用户体检页与管理页彻底分离）；弹窗被拦截时退回本页打开
  const daKaiKongZhiTai = () => {
    const url = window.location.href.split('#')[0] + '#guanliyuan';
    const w = window.open(url, '_blank');
    if (!w) setAdminOpen(true);
  };
  const [souSuoWenBen, setSouSuoWenBen] = useState('');
  const [zhouBian, setZhouBian] = useState([]); // 定位周边推荐点
  // 浏览器定位状态：loading=正在定位 / ok=已拿到设备位置 / fail=没拿到（此时中心点仍是兜底默认坐标，不是用户真实位置）
  const [dingWeiTai, setDingWeiTai] = useState('loading');
  const [dingWeiYin, setDingWeiYin] = useState(''); // 定位失败原因（说人话，不直接把浏览器英文报错甩给用户）
  // 底图引擎：baidu=百度地图（官方 BMap GL SDK 渲染，默认使用），
  // tile=高德/OSM 瓦片（AK 被风控拦截时的兜底，MapCanvas 内 3 秒未就绪会自动切换）
  const [ditu, setDitu] = useState('baidu');
  const [xianshi, setXianshi] = useState(() => Object.fromEntries(Object.keys(COLOR).map((k) => [k, true])));
  // 自定义维度加入图层开关（管理员新增维度后自动出现在图例中）
  useEffect(() => {
    setXianshi((prev) => {
      const next = { ...prev };
      let gai = false;
      for (const z of peiZhi.ziDing || []) {
        if (!(z.f in next)) {
          next[z.f] = true;
          gai = true;
        }
      }
      return gai ? next : prev;
    });
  }, [peiZhi]);
  const runningRef = useRef(false);
  const providerRef = useRef(null); // 当前体检数据源，供「点击设施查步行路线」复用
  // 步行路线展示：{ uid, dian, zhuangTai: 'loading'|'ok'|'fail', polyline?, distanceM?, durationSec? }
  const [buXing, setBuXingLuXian] = useState(null);
  const jiaoHuRef = useRef(false); // 用户是否已在地图上操作过（手动点选中心）
  // 面板整块显隐（true=显示），由顶栏开关控制
  const [kai, setKai] = useState({ zuo: true, you: true, ai: true });
  // 体检失败/降级的具体原因。以前这里只有一句固定的「地图服务异常」，
  // 真正的报错被 catch 吞掉，用户只能看到体检卡住或没有报告，无从排查。
  const [tijianCuo, setTijianCuo] = useState('');
  const jinDuShiRef = useRef(0); // 最近一次进度推进的时间戳，供看门狗判断是否卡死

  function qieHuanKai(v) {
    setKai((prev) => ({ ...prev, [v]: !prev[v] }));
  }

  // 管理员入口：①右上角齿轮按钮（新标签页打开控制台）②URL 带 #guanliyuan ③连点 logo 三次。
  // 齿轮样式低调不抢眼，普通用户不易注意；进入仍需管理员账密
  const logoRef = useRef({ ci: 0, t: 0 });
  function logoLianDian() {
    const now = Date.now();
    const ji = logoRef.current;
    ji.ci = now - ji.t < 800 ? ji.ci + 1 : 1;
    ji.t = now;
    if (ji.ci >= 3) {
      ji.ci = 0;
      daKaiKongZhiTai();
    }
  }
  useEffect(() => {
    if (window.location.hash === '#guanliyuan') setAdminOpen(true);
    const jian = () => {
      if (window.location.hash === '#guanliyuan') setAdminOpen(true);
    };
    window.addEventListener('hashchange', jian);
    return () => window.removeEventListener('hashchange', jian);
  }, []);

  async function run(c = center) {
    // 同一时刻只允许一轮体检，防止叠加请求触碰百度并发上限
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setProgress(0);
    setOffline(false);
    setTijianCuo('');
    jinDuShiRef.current = Date.now();
    let provider;
    let daiChang = '';
    try {
      if (mode === 'server' && isElectron) provider = chuangJianIpc();
      else if (mode === 'osm') provider = chuangJianOsm({ zhongXin: c, banJingMi: 1500 });
      else if (mode === 'bmap') {
        // 双 AK 架构：数据层走服务端 AK（Web 服务 API 经 /bmapapi 代理，AK 由服务端注入），
        // 支持批量距离矩阵；REST 异常时由下方 catch 降级 OSM
        provider = chuangJianBmapServer({ api: '/bmapapi' });
      } else {
        provider = chuangJianOsm({ zhongXin: c, banJingMi: 1500 });
      }
    } catch (e) {
      // 不能静默换源：必须把原因带回界面，否则用户只看到结果不对却不知道为什么
      daiChang = `百度数据源初始化失败（${(e && e.message) || '未知原因'}），本轮改用 OSM 真实路网兜底`;
      setTijianCuo(daiChang);
      provider = chuangJianOsm({ zhongXin: c, banJingMi: 1500 });
    }
    providerRef.current = provider;
    setBuXingLuXian(null); // 新一轮体检开始，清除上一条步行路线
    const canshu = { zhongXin: c, mubiaoMiao: mubiaoFen * 60, dangwei, banJingMi: 1500 };
    // 按数据源设定请求节奏：OSM 算路在本地完成不受限；浏览器端 AK 配额最紧；服务端 AK（批量矩阵）可放开
    const jieZou =
      mode === 'osm'
        ? { qps: 50, bingfa: 8 }
        : mode === 'server'
        ? { qps: 5, bingfa: 6 }
        : mode === 'bmap'
        // 并发压到 8：实测并发 16 时百度地点检索大面积返回失败（27/31 个关键词失败），
        // 节奏太松反而把数据打残；单次调用 2~3 秒，靠"关键词并发提交 + 有限并发池"已经够快
        ? { qps: 6, bingfa: 8 }
        : { qps: 8, bingfa: 8 };
    try {
      let rep;
      try {
        rep = await yunXingTijian(provider, canshu, {
          jinDu: jinDu,
          peiZhi,
          ...jieZou,
        });
      } catch (e) {
        // 容错降级：百度服务不可用（限流 / 网络异常）时，
        // 自动切换到 OSM 真实路网继续体检，保证演示不中断。
        // 但配额超限（301/302）、AK 被禁用（4/5）是账号级硬限制，换数据源也救不回来，
        // 直接抛出去让界面说清楚原因，别让用户对着进度条白等一轮 OSM 兜底
        const xinXi = (e && e.message) || '';
        if (mode !== 'bmap' || /baidu:(4|5|301|302)|配额|AK/i.test(xinXi)) throw e;
        setTijianCuo(`百度数据源中断（${(e && e.message) || '网络异常'}），已自动降级为 OSM 真实路网`);
        const osm = chuangJianOsm({ zhongXin: c, banJingMi: 1500 });
        providerRef.current = osm; // 降级后路线查询跟随可用数据源
        rep = await yunXingTijian(osm, canshu, {
          jinDu: jinDu,
          peiZhi,
          qps: 50,
          bingfa: 8,
        });
        rep.warnings.push('百度地图服务不可用，已自动降级为 OSM 真实路网（结果仍基于真实道路计算）');
        setOffline(true);
      }
      setReport(rep);
      setGuanZhuM(null); // 新一轮体检，清掉旧盲区标记
      saveReport(rep, yongHu ? yongHu.zhangHao : '');
    } catch (e) {
      setOffline(true);
      setTijianCuo(
        `体检中断：${(e && e.message) || '数据源长时间无响应'}。可点「开始体检」重试，或在「体检参数」里换个数据源。`
      );
    } finally {
      setRunning(false);
      setProgress(1);
      runningRef.current = false;
    }
  }

  // 进度回调：既刷新进度条，也刷新「最近有进展」的时间戳
  function jinDu(p) {
    jinDuShiRef.current = Date.now();
    setProgress(p);
  }

  // 看门狗：体检进行中若 75 秒没有任何进度推进，判定数据源无响应，
  // 直接解锁按钮并给出原因，避免界面永远停在某个百分比上（此前出现过停在 0% 再也不动）
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => {
      if (Date.now() - jinDuShiRef.current < 75000) return;
      setTijianCuo('体检长时间没有进展（数据源可能被限流或无响应），已停止等待。请稍后重试或切换数据源。');
      setOffline(true);
      setRunning(false);
      runningRef.current = false;
    }, 5000);
    return () => clearInterval(t);
  }, [running]);

  // OSM 地理编码（Nominatim）：不依赖百度 AK 的地址搜索兜底
  async function souSuoOsm(w) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(w)}&format=json&limit=1`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    const j = await r.json();
    if (j && j[0]) return { lng: Number(j[0].lon), lat: Number(j[0].lat) };
    return null;
  }

  function yingYong(c) {
    setCenter(c);
    setCurName(souSuoWenBen.trim());
    run(c);
  }

  async function souSuo() {
    const w = souSuoWenBen.trim();
    if (!w) return;
    // 仅当底图是百度时才走百度地理编码；其余情况直接用 OSM，避免无谓触发百度 SDK
    if (ditu === 'baidu') {
      try {
        const B = await loadBmap();
        const gc = new B.Geocoder();
        const ok = await new Promise((resolve) => {
          gc.getPoint(w, (p) => {
            if (p) {
              // 百度返回 BD-09，转成内部统一的 WGS-84
              yingYong(bd09ZhuanWgs84(p.lng, p.lat));
              resolve(true);
            } else resolve(false);
          });
        });
        if (ok) return;
      } catch {
        /* 百度不可用 → 走 OSM */
      }
    }
    try {
      const q = await souSuoOsm(w);
      if (q) yingYong(q);
      else alert('未找到该地址，请换关键词试试');
    } catch {
      alert('地址服务暂不可用，请稍后重试或直接点地图选点');
    }
  }

  // ziDong=true 为首屏自动定位：失败静默回退到默认社区，不打断用户
  // 定位周边推荐：拉取当前位置附近的街区/社区名，作为可直接体检的候选点
  async function tuijianZhouBian(c) {
    const lie = [{ name: '当前位置', lng: c.lng, lat: c.lat }];
    try {
      const ql = `[out:json][timeout:25];nwr["place"~"^(neighbourhood|suburb|quarter|village|town|city_block)$"](around:2500,${c.lat},${c.lng});out center;`;
      const r = await fetch(`https://overpass.openstreetmap.fr/api/interpreter?data=${encodeURIComponent(ql)}`);
      const j = await r.json();
      const yi = new Set();
      const hou = [];
      for (const e of j.elements || []) {
        const ming = e.tags && e.tags.name;
        const lng = e.lon != null ? e.lon : e.center && e.center.lon;
        const lat = e.lat != null ? e.lat : e.center && e.center.lat;
        if (!ming || typeof lng !== 'number' || typeof lat !== 'number' || yi.has(ming)) continue;
        yi.add(ming);
        hou.push({ name: ming, lng, lat, juLi: liangDianJuLi(c, { lng, lat }) });
      }
      hou.sort((a, b) => a.juLi - b.juLi);
      for (const p of hou.slice(0, 5)) lie.push({ name: `${p.name}（${(p.juLi / 1000).toFixed(1)}km）`, lng: p.lng, lat: p.lat });
    } catch {
      /* 推荐失败只保留「当前位置」 */
    }
    setZhouBian(lie);
  }

  // 首屏自动体检守卫：进入页面后无论定位成败，都自动跑一轮，且只跑一次
  const shouCiTiJianRef = useRef(false);
  function ziDongTiJian(c) {
    if (shouCiTiJianRef.current) return;
    shouCiTiJianRef.current = true;
    run(c);
  }

  function dingWei(ziDong = false) {
    setDingWeiTai('loading');
    setDingWeiYin('');
    if (!navigator.geolocation) {
      setDingWeiTai('fail');
      setDingWeiYin('当前浏览器不支持定位');
      if (!ziDong) alert('当前浏览器不支持定位');
      if (ziDong) ziDongTiJian(); // 没有定位能力也照常在默认社区自动体检
      return;
    }
    if (!window.isSecureContext) {
      setDingWeiTai('fail');
      setDingWeiYin('非 HTTPS / localhost 环境，浏览器不允许定位');
      if (!ziDong) alert('定位需要 HTTPS 或 localhost 环境，请改用 http://localhost:5173 访问');
      if (ziDong) ziDongTiJian();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // 自动定位是异步的，若用户已先在地图上选好了位置，就不要再用定位结果覆盖他
        if (ziDong && jiaoHuRef.current) {
          setDingWeiTai('ok'); // 用户自己选过点了，自动定位结果按「已定位」结束，不再提示
          ziDongTiJian(); // 用用户选的点自动体检
          return;
        }
        // 应用内部统一使用 WGS-84（OSM 与 GPS 原生坐标系），渲染时按底图再转换
        const c = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        setCenter(c);
        setCurName('当前位置');
        setDingWeiTai('ok');
        tuijianZhouBian(c); // 定位成功后推荐周边可体检点
        if (!ziDong) run(c);
        else ziDongTiJian(c); // 首屏自动模式：拿到位置直接开跑
      },
      (err) => {
        // 1=权限被拒 2=位置不可用 3=超时，换成用户看得懂的说明
        const yuan =
          err && err.code === 1
            ? '浏览器定位权限被拒绝'
            : err && err.code === 3
            ? '定位超时，设备没返回位置'
            : '无法获取设备位置（可能未开启系统定位）';
        setDingWeiTai('fail');
        setDingWeiYin(yuan);
        if (!ziDong) alert('定位失败：' + yuan + '。可改在地图上选点或拖动蓝色图钉。');
        if (ziDong) ziDongTiJian(); // 定位失败不拦着：用兜底默认社区自动体检
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }

  // 首屏自动定位到当前位置，并自动开始体检（进入页面即可看结果，无需任何点击；
  // 定位被拒绝/失败时自动落回兜底默认社区继续跑，每次刷新只自动跑一轮）
  useEffect(() => {
    const t = setTimeout(() => dingWei(true), 800);
    return () => clearTimeout(t);
  }, []);

  function tiaoZhuanDian(p) {
    setCenter({ lng: p.lng, lat: p.lat });
    setCurName(p.name);
    run({ lng: p.lng, lat: p.lat });
  }

  function qieHuanFenlei(f) {
    setXianshi((prev) => ({ ...prev, [f]: !prev[f] }));
  }

  function exportJson() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'shenghuoquan-baogao.json';
    a.click();
  }

  // 地图选点确认 / 拖动图钉落点：只有用户明确确认后才回写中心点，避免误触就搬走体检中心
  const xuanZeZhongXin = useCallback((p) => {
    jiaoHuRef.current = true;
    setCenter(p);
    setCurName('地图选点');
    setBuXingLuXian(null); // 中心点变了，旧路线不再成立
  }, []);

  // 点击设施：沿真实路网计算「中心点 → 该设施」步行路线并展示（再次点击同一设施取消；qiangZhi 用于 AI 导航强制重算）
  async function dianJiSheShi(p, qiangZhi = false) {
    const prov = providerRef.current;
    if (!prov || runningRef.current) return;
    setBuXingLuXian((prev) =>
      !qiangZhi && prev && prev.uid && prev.uid === p.uid ? null : { uid: p.uid, dian: p, zhuangTai: 'loading' }
    );
    try {
      const r = await prov.walkingRoute(center, p);
      setBuXingLuXian((prev) =>
        prev && prev.uid === p.uid
          ? { ...prev, zhuangTai: 'ok', polyline: r.polyline, distanceM: r.distanceM, durationSec: r.durationSec }
          : prev
      );
    } catch {
      setBuXingLuXian((prev) => (prev && prev.uid === p.uid ? { ...prev, zhuangTai: 'fail' } : prev));
    }
  }

  // —— AI 导航：一句话选点（如「去购物」）→ AI/规则选最佳设施 → 自动画步行路线 ——
  const [daoHangWen, setDaoHangWen] = useState('');
  const [daoHangJie, setDaoHangJie] = useState(null);
  async function faQiDaoHang() {
    const wen = daoHangWen.trim();
    if (!wen || !report || runningRef.current) return;
    setDaoHangJie({ zhuangTai: 'loading' });
    const j = await aiXuanDian(wen, report, center, peiZhi && peiZhi.ai);
    setDaoHangJie(j);
    if (j.ok) dianJiSheShi(j.poi, true);
  }

  // —— AI 在线问答：用户与大模型自由聊天，自动带本轮体检摘要上下文 ——
  const [liaoTianLieBiao, setLiaoTianLieBiao] = useState([]);
  const [liaoTianWen, setLiaoTianWen] = useState('');
  const [liaoTianZhong, setLiaoTianZhong] = useState(false);
  const ltGunRef = useRef(null);
  // 新消息后自动滚到底部
  useEffect(() => {
    if (ltGunRef.current) ltGunRef.current.scrollTop = ltGunRef.current.scrollHeight;
  }, [liaoTianLieBiao, liaoTianZhong]);
  // zhiDing 可传推荐问法文本（点击芯片直接发送），不传则用输入框内容
  async function faQiLiaoTian(zhiDing) {
    const wen = (typeof zhiDing === 'string' ? zhiDing : liaoTianWen).trim();
    if (!wen || liaoTianZhong) return;
    const xinLie = [...liaoTianLieBiao, { role: 'user', wen }];
    setLiaoTianLieBiao(xinLie);
    setLiaoTianWen('');
    setLiaoTianZhong(true);
    const j = await aiLiaoTian(liaoTianLieBiao, wen, report, peiZhi && peiZhi.ai);
    setLiaoTianZhong(false);
    setLiaoTianLieBiao([...xinLie, j.ok ? { role: 'ai', wen: j.huiFu } : { role: 'cuo', wen: j.xinxi }]);
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand" onClick={logoLianDian} title="15 分钟生活圈智能体检助手">
          <span className="brand-icon">🧭</span>
          <span className="brand-title">15 分钟生活圈智能体检助手</span>
        </div>

        <div className="header-center">
          <div className="search-bar">
            <input
              placeholder="输入社区 / 街道名称搜索"
              value={souSuoWenBen}
            onChange={(e) => setSouSuoWenBen(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && souSuo()}
          />
          <button className="search-btn" onClick={souSuo}>
            <MorphIcon icon={Search} spring="snappy" size={15} />
            <span>搜索</span>
          </button>
        </div>
        <select className="time-select" value={mubiaoFen} onChange={(e) => setMubiaoFen(Number(e.target.value))}>
          <option value={5}>步行 5 分钟</option>
          <option value={10}>步行 10 分钟</option>
          <option value={15}>步行 15 分钟</option>
          <option value={20}>步行 20 分钟</option>
        </select>
      </div>

      <div className="header-right">
        <div className="header-toggles">
          <button
            type="button"
            className={`tog-btn ${kai.zuo ? 'on' : ''}`}
            title={kai.zuo ? '隐藏左下面板' : '显示左下面板'}
            onClick={() => qieHuanKai('zuo')}
          >
            <MorphIcon icon={kai.zuo ? PanelLeftClose : PanelLeftOpen} spring="snappy" size={15} />
            控制面板
          </button>
          <button
            type="button"
            className={`tog-btn ${kai.you ? 'on' : ''}`}
            title={kai.you ? '隐藏右侧报告' : '显示右侧报告'}
            onClick={() => qieHuanKai('you')}
          >
            <MorphIcon icon={kai.you ? PanelRightClose : PanelRightOpen} spring="snappy" size={15} />
            报告面板
          </button>
          <button
            type="button"
            className={`tog-btn ${kai.ai ? 'on' : ''}`}
            title={kai.ai ? '隐藏 AI 导航' : '显示 AI 导航'}
            onClick={() => qieHuanKai('ai')}
          >
            <MorphIcon icon={kai.ai ? Navigation : NavigationOff} spring="snappy" size={15} />
            AI 导航
          </button>
        </div>
        {/* 赛道要求必须使用百度地图，底图固定为百度，不提供第三方底图切换 */}
        <span className="ditu-chip" title="底图固定使用百度地图（赛道评审要求）">
          <MorphIcon icon={Map} size={13} spring="snappy" />
          底图 · 百度地图
        </span>
        {yongHu ? (
          <>
            <button
              className="src-chip src-chip-btn"
              title="进入个人主页"
              onClick={() => setGeRenKai(true)}
            >👤 {yongHu.zhangHao}</button>
            <button
              className="admin-btn"
              onClick={() => {
                yongHuTuiChu();
                setYongHu(null);
              }}
            >
              退出
            </button>
          </>
        ) : guanLiYuanZai ? (
          <>
            <span className="src-chip" title="管理员身份已登录">🛡 管理员</span>
            <button className="admin-btn" onClick={daKaiKongZhiTai} title="在独立标签页打开管理员控制台">打开控制台</button>
            <button className="admin-btn" onClick={guanLiYuanTuiChu}>退出</button>
          </>
        ) : (
          <>
            <button className="admin-btn" onClick={() => setDengLuKai(true)}>登录 / 注册</button>
            <button
              className="admin-gear"
              onClick={daKaiKongZhiTai}
              title="管理员入口"
              aria-label="管理员入口"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </>
        )}
      </div>
    </header>

      <div className="mapwrap">
        <MapCanvas
          report={report}
          center={center}
          onPick={xuanZeZhongXin}
          onPoiDianJi={dianJiSheShi}
          guanZhuId={guanZhuM}
          buXing={buXing}
          xianshi={xianshi}
          ditu={ditu}
          onDitu={setDitu}
        />
        {offline && <div className="offline">{tijianCuo || '地图服务异常，已降级真实路网兜底模式，请检查 AK / 网络'}</div>}
        {buXing && (
          <div className={`buxing-tip ${buXing.zhuangTai}`}>
            {buXing.zhuangTai === 'loading' && '正在沿真实路网计算步行路线…'}
            {buXing.zhuangTai === 'ok' &&
              `${buXing.dian.ming || '所选设施'}：沿街步行 ${Math.round(buXing.distanceM)} 米 · 约 ${Math.max(1, Math.round(buXing.durationSec / 60))} 分钟`}
            {buXing.zhuangTai === 'fail' && '步行路线计算失败（该设施可能不在路网覆盖范围内）'}
            <button type="button" className="link-btn" onClick={() => setBuXingLuXian(null)}>
              关闭
            </button>
          </div>
        )}
      </div>

      {/* 左下控制卡片：整块显隐由顶栏开关控制 */}
      <div className={`float-card left-bottom ${kai.zuo ? '' : 'hidden'}`}>
        <div className="panel-title">体检控制</div>

        <div className="sec">
          <div className="sec-title">
            定位周边推荐
            {dingWeiTai === 'ok' && <span className="sec-tag">已定位</span>}
          </div>
          {zhouBian.length === 0 && dingWeiTai === 'loading' && (
            <div className="empty-tip">正在获取你的位置…首次访问浏览器会弹出定位授权，请选择「允许」</div>
          )}
          {zhouBian.length === 0 && dingWeiTai === 'ok' && (
            <div className="empty-tip">已拿到你的位置，正在读取周边社区名…</div>
          )}
          {zhouBian.length === 0 && dingWeiTai === 'fail' && (
            <div className="empty-tip">
              没拿到设备定位：{dingWeiYin}。<br />
              当前中心点（{curName}）{jiaoHuRef.current ? '来自你手动选点' : '是兜底默认坐标，不是你的真实位置'}。<br />
              可点下面「重新定位」再试；也可在地图上单击选点后点「设为中心点」确认，或直接拖动地图上的蓝色图钉。
              <button type="button" className="link-btn" onClick={() => dingWei()}>
                重新定位
              </button>
            </div>
          )}
          {zhouBian.length > 0 && (
            <div className="chips-row">
              {zhouBian.map((p) => (
                <button key={p.name} className={`chip ${curName === p.name ? 'on' : ''}`} onClick={() => tiaoZhuanDian(p)}>
                  <MorphIcon icon={MapPin} spring="snappy" size={12} />
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="sec">
          <div className="sec-title">设施图层</div>
          <div className="layer-grid">
            {[
              ...Object.keys(COLOR).map((f) => ({ f, ming: MING[f], se: COLOR[f] })),
              ...(peiZhi.ziDing || []).map((z, i) => ({
                f: z.f,
                ming: z.ming,
                se: ['#f97316', '#0ea5e9', '#a3e635', '#f472b6', '#facc15', '#34d399'][i % 6],
              })),
            ].map(({ f, ming, se }) => (
              <label
                key={f}
                className={`layer-item ${xianshi[f] ? 'on' : ''}`}
                style={{ '--c': se }}
                onClick={() => qieHuanFenlei(f)}
              >
                <SheShiTubiao f={f} yanSe={se} on={xianshi[f]} />
                <span>{ming}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="sec">
          <div className="sec-title">体检参数</div>
          <div className="param-row">
            <div className="mini-field">
              <label>中心点经度</label>
              <input type="number" step="0.0001" value={center.lng} onChange={(e) => setCenter({ ...center, lng: Number(e.target.value) })} />
            </div>
            <div className="mini-field">
              <label>中心点纬度</label>
              <input type="number" step="0.0001" value={center.lat} onChange={(e) => setCenter({ ...center, lat: Number(e.target.value) })} />
            </div>
            <div className="mini-field">
              <label>采样</label>
              <select
                value={dangwei}
                onChange={(e) => setDangwei(e.target.value)}
                title="快速：方位少、出结果最快；标准：24 方位平衡；精细：36 方位最细但最慢"
              >
                <option value="fast">快速</option>
                <option value="standard">标准</option>
                <option value="fine">精细</option>
              </select>
            </div>
          </div>
          <div className="mini-field" style={{ marginTop: 8 }}>
            <label>数据源（仅影响 POI / 算路，地图底图始终是百度地图）</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="osm">真实路网 OSM · 真实街道 + 本地算路</option>
              {ak && <option value="bmap">百度地图 · 真实 API、耗配额</option>}
              {isElectron && <option value="server">百度服务端 · 批量矩阵</option>}
            </select>
            {mode !== 'bmap' && (
              <div className="hint">
                {mode === 'osm'
                  ? '兜底方案：街道与设施取自 OpenStreetMap 真实数据，等时圈由本地 Dijkstra 沿真实道路计算（实测 15 分钟可达约 1100-1160 米，符合步行 80 米/分钟）。四个样例社区已内置离线数据可直接算；其他任意点会按需联网获取周边 1~2 公里路网并缓存。注意：本模式不调用百度 API，正式评分请用百度地图。'
                  : '桌面端走主进程服务端 AK，支持批量距离矩阵，性能与配额更优。'}
              </div>
            )}
          </div>
        </div>

        <div className="btn-row">
          <button className="locate-btn" onClick={dingWei} title="定位到浏览器当前位置（也可以拖动地图上的蓝色图钉改中心点）">
            <MorphIcon icon={MapPin} size={15} spring="snappy" />
            定位
          </button>
          <button className="run-btn" onClick={() => run()} disabled={running}>
            {running ? `${Math.round(progress * 100)}%` : '开始体检'}
          </button>
        </div>
        <div className="progress"><i style={{ width: `${progress * 100}%` }} /></div>
      </div>

      {/* AI 导航：独立悬浮卡（不挤在体检控制面板里），显隐由顶栏「AI 导航」开关控制 */}
      <div className={`float-card ai-nav-card ${kai.ai ? '' : 'hidden'}`}>
        <div className="panel-title">
          AI 导航
          {peiZhi?.ai?.qiYong && <span className="sec-tag">大模型选点</span>}
        </div>
        <div className="a-row">
          <input
            className="a-input"
            placeholder="说一句要去哪，如：去购物 / 去看病 / 去锻炼"
            value={daoHangWen}
            onChange={(e) => setDaoHangWen(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') faQiDaoHang(); }}
            disabled={!report || running}
          />
          <button className="locate-btn" onClick={faQiDaoHang} disabled={!report || running}>
            出发
          </button>
        </div>
        {daoHangJie && daoHangJie.zhuangTai === 'loading' && (
          <div className="empty-tip">正在从本轮体检的设施里挑选最佳目的地…</div>
        )}
        {daoHangJie && daoHangJie.ok && (
          <div className="dh-jie">
            <div className="dh-muDi">
              🧭 {daoHangJie.poi.name}
              <span className={`ai-biao ${daoHangJie.laiYuan === 'ai' ? 'ai' : 'bendi'}`}>
                {daoHangJie.laiYuan === 'ai' ? '大模型选点' : '本地规则选点'}
              </span>
            </div>
            <div className="dh-liYou">{daoHangJie.liYou}</div>
            <div className="dh-luJing">步行路线已画在地图上，沿虚线走即可（点地图上其他设施可随时换目的地）。</div>
          </div>
        )}
        {daoHangJie && !daoHangJie.ok && !daoHangJie.zhuangTai && (
          <div className="a-tip a-tip-err">{daoHangJie.xinxi}</div>
        )}
        {!report && <div className="empty-tip">完成一轮体检后，才能从真实设施里选目的地。</div>}

        <div className="divider" />
        <div className="sec-title">在线问答{peiZhi?.ai?.qiYong && <span className="sec-tag">可结合本轮体检结果回答</span>}</div>
        {/* 豆包式对话界面：欢迎语 + 推荐问法芯片 + 头像气泡 + 底部圆角大输入框 */}
        <div className="lt-lie" ref={ltGunRef}>
          {liaoTianLieBiao.length === 0 && !liaoTianZhong && (
            <div className="lt-huanYing">
              <AiHuiZhang da />
              <b>你好，我是 AI 助手</b>
              <span>能结合本轮体检结果聊聊你关心的问题</span>
              <div className="lt-tui">
                {['我这个社区看病方便吗？', '盲区是什么意思？', '附近适合散步锻炼吗？'].map((t) => (
                  <button key={t} className="lt-tuiXiang" onClick={() => faQiLiaoTian(t)} disabled={liaoTianZhong}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}
          {liaoTianLieBiao.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="lt-hang user">
                <div className="lt-qiPao user">{m.wen}</div>
                <span className="lt-touXiang">我</span>
              </div>
            ) : (
              <div key={i} className="lt-hang ai">
                <AiHuiZhang />
                <div className={`lt-qiPao ${m.role}`}>{m.wen}</div>
              </div>
            )
          )}
          {liaoTianZhong && (
            <div className="lt-hang ai">
              <AiHuiZhang />
              <div className="lt-qiPao ai lt-siKao">
                <i /><i /><i />
              </div>
            </div>
          )}
        </div>
        <div className="lt-shuRu">
          <input
            className="lt-shuRu-kuang"
            placeholder="给 AI 助手发送消息"
            value={liaoTianWen}
            onChange={(e) => setLiaoTianWen(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') faQiLiaoTian(); }}
            disabled={liaoTianZhong}
          />
          <button
            className="lt-faSong"
            onClick={() => faQiLiaoTian()}
            disabled={liaoTianZhong || !liaoTianWen.trim()}
            title="发送"
          >
            {/* 本项目 lucide 导出的是图标节点数据而非组件，发送图标直接内联 SVG */}
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13" /><path d="M22 2 15 22 11 13 2 9z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 右侧面板：整块显隐由顶栏开关控制 */}
      <div className={`float-card right-panel ${kai.you ? '' : 'hidden'}`}>
        <div className="panel-title">
          体检报告{report ? ` · ${report.total} 分 ${report.dengji} 级` : ''}
        </div>

        <div className="score-card">
          <div className="score-label">综合得分</div>
          <div className="score-line">
            <b className="score-big">{report ? report.total : '--'}</b>
            {report && <span className={`dengji ${report.dengji}`}>{report.dengji} 级</span>}
          </div>
          {report && (
            <div className="score-meta">
              请求 {report.xinxi.qingQiuShu} 次 · 耗时 {(report.xinxi.haoShiMs / 1000).toFixed(1)}s · {report.xinxi.miDu}
            </div>
          )}
        </div>

        {/* 数据可信度告警：设施样本过少、部分检索失败、算路降级等都会在这里说清楚，
            否则用户只看到一个低分却不知道是「真的差」还是「没取到数据」 */}
        {report && Array.isArray(report.warnings) && report.warnings.length > 0 && (
          <div className="warn-box">
            <div className="warn-head">本次结果存在以下问题，得分与盲区结论请谨慎参考</div>
            {report.warnings.map((w, i) => (
              <div className="warn-item" key={i}>
                · {w}
              </div>
            ))}
          </div>
        )}

        {report && (
          <div className="sec">
            <div className="sec-title">{peiZhi?.ai?.qiYong ? 'AI 诊断' : '诊断结论'}</div>
            <AiZhenDuanKa report={report} peiZhi={peiZhi} />
          </div>
        )}

        {report && (
          <div className="sec">
            <div className="sec-title">图表分析（雷达 / 柱状）</div>
            <BaoGao report={report} />
          </div>
        )}

        <div className="sec">
          <div className="sec-title">服务盲区清单（{report ? report.mangquList.length : 0}）</div>
          {!report && !tijianCuo && <div className="empty-tip">点击「开始体检」后显示盲区</div>}
          {!report && tijianCuo && <div className="empty-tip">{tijianCuo}</div>}
          {report && report.mangquList.length === 0 && <div className="empty-tip">未识别明显盲区，覆盖良好</div>}
          {report && report.mangquList.map((m) => (
            <div className={`mq-item ${guanZhuM === m.id ? 'on' : ''}`} key={m.id}>
              <div className="mq-head">
                <b>{m.id}</b>
                <span className={`mq-tag ${m.level}`}>{m.level === 'red' ? '重度' : '轻度'}</span>
                <button
                  className={`mq-biaoJi ${guanZhuM === m.id ? 'on' : ''}`}
                  onClick={() => setGuanZhuM(guanZhuM === m.id ? null : m.id)}
                  title={guanZhuM === m.id ? '取消标记' : '在地图上标记并定位该盲区'}
                >
                  {guanZhuM === m.id ? '已标记' : '标记'}
                </button>
              </div>
              <div className="mq-body">
                缺口：{m.quekou.join('、')}<br />
                面积≈{(m.areaM2 / 10000).toFixed(1)} 万㎡ · 预计覆盖 {m.yujiFugaiRenkou} 人<br />
                {m.yiJu && (
                  <>
                    判定依据：{m.yiJu}<br />
                  </>
                )}
                {m.buJianDian && (
                  <>
                    补建点：({m.buJianDian.lng.toFixed(5)}, {m.buJianDian.lat.toFixed(5)})——地图上绿色 ✚ 标记<br />
                  </>
                )}
                {m.jianyi}
              </div>
            </div>
          ))}
        </div>

        {report && (
          <div className="sec">
            <div className="sec-title">改进建议</div>
            {report.jianYi.map((j, i) => (
              <div className="suggest" key={i}>· {j}</div>
            ))}
          </div>
        )}

        {report && (
          <button className="export-btn" onClick={exportJson}>
            导出报告 JSON
          </button>
        )}
      </div>

      <GuanLiYuan open={adminOpen} onClose={guanLiYuanGuanBi} peiZhi={peiZhi} onChange={setPeiZhi} />
      <DengLu open={dengLuKai} onClose={() => setDengLuKai(false)} onDengLu={setYongHu} />
      <GeRen
        open={geRenKai}
        onClose={() => setGeRenKai(false)}
        yongHu={yongHu}
        onTuiChu={() => {
          yongHuTuiChu();
          setYongHu(null);
          setGeRenKai(false);
        }}
        onHuiKan={(r) => {
          // 回看历史体检：地图中心移到该社区，并清空旧报告提示重新体检
          if (r && r.zhongXin && Number.isFinite(r.zhongXin.lng) && Number.isFinite(r.zhongXin.lat)) {
            setCenter({ lng: r.zhongXin.lng, lat: r.zhongXin.lat });
            setCurName(r.zhongXin.ming || '历史体检社区');
            setReport(null);
            setGeRenKai(false);
          }
        }}
      />
    </div>
  );
}
