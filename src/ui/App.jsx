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
import { aiXuanDian, shiDaoHangYiTu } from '../core/aiDaohang.js';
import { guiHuaLuXian } from './luxian.js';
import { aiLiaoTian } from '../core/aiLiaoTian.js';
import { liangDianJuLi } from '../core/geo/jichu.js';
import { bd09ZhuanWgs84 } from '../core/geo/zuobiao.js';
import { MorphIcon } from 'morphicons/react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Search,
  MapPin,
  Map,
  Cross,
  GraduationCap,
  ShoppingCart,
  Armchair,
  Bus,
  Trees,
  Shapes,
  Navigation,
  NavigationOff
} from 'lucide';

// 悬浮面板层级计数器（各面板共享）：点击谁谁置顶，最高只到 29（顶栏 z30 之下），满了就整体重排
let mianBanCeng = 20;
function zhiDingMianBan(ka) {
  mianBanCeng += 1;
  if (mianBanCeng > 29) {
    // 快够到顶栏层级（z30）了：把所有悬浮面板按当前 z 从低到高重排回 21 起，计数器随之回落
    const qun = Array.from(document.querySelectorAll('.app .float-card'));
    qun.sort((a, b) => (parseInt(a.style.zIndex, 10) || 20) - (parseInt(b.style.zIndex, 10) || 20));
    qun.forEach((m, i) => {
      m.style.zIndex = String(21 + i);
    });
    mianBanCeng = 20 + qun.length;
  }
  ka.style.zIndex = String(mianBanCeng);
}

// 悬浮面板自由拖动：按住面板标题栏整块拖动。首次拖动时把 CSS 的 left/bottom/right/top
// 定位统一换算为内联 left/top（不影响显隐动画用的 transform），拖动范围严格限制在地图区域内
// 且永不越过蓝色顶栏底沿；点击面板任意位置即置顶（点击谁谁在最上层，互不常驻最上层）。
// 标题栏上的按钮 / 输入框按下不触发拖动。返回 ref 挂到对应面板上。
function yongMianBanTuoDong() {
  const ref = useRef(null);
  useEffect(() => {
    const ka = ref.current;
    const biao = ka && ka.querySelector(':scope > .panel-title');
    if (!ka || !biao) return undefined;
    biao.style.cursor = 'grab';
    biao.style.touchAction = 'none';
    let qi = null;
    // —— 碰撞互动（物理感）：撞到别的面板 → 对方果冻晃一下就停；晃动幅度与快慢由拖动速度决定，
    //    持续快速摩擦才会连着晃（每次晃完才允许下一次），慢速蹭过只有轻微一下 ——
    const pengZhuangLieBiao = new Set();
    const shangCiYao = new WeakMap(); // 每个面板上次晃动结束时间，防连触发
    let suDu = 0; // 平滑后的拖动速度（px/ms），决定水波强度与时长
    let shangYiDian = null;
    // 波浪线碰撞（纯视觉）：面板布局与文字完全固定不动——水波只体现在
    // 「涟漪圆环从碰撞点扩散」与「水面折射滤镜（内容看起来在水下扭动，实际位置不变）」；
    // 强度与时长仍由拖动速度决定。
    function yaoHuang(m) {
      const jv = ka.getBoundingClientRect();
      const r = m.getBoundingClientRect();
      // 波源：被撞面板上离拖动面板中心最近的点
      const ac = { x: jv.left + jv.width / 2, y: jv.top + jv.height / 2 };
      const dian = {
        x: Math.min(Math.max(ac.x, r.left), r.right),
        y: Math.min(Math.max(ac.y, r.top), r.bottom)
      };
      const shiChang = Math.round(Math.max(900, Math.min(1400, 1300 - suDu * 50)));
      shangCiYao.set(m, Date.now() + shiChang);
      // —— 粒子面：涟漪圆环从碰撞点一圈圈扩散（限在面板内，pointer-events 全关） ——
      const tao = document.createElement('span');
      tao.className = 'shuiBo-Tao';
      m.appendChild(tao);
      for (let i = 0; i < 3; i++) {
        const huan = document.createElement('i');
        huan.className = 'shuiHuan';
        huan.style.left = `${(dian.x - r.left).toFixed(1)}px`;
        huan.style.top = `${(dian.y - r.top).toFixed(1)}px`;
        tao.appendChild(huan);
        const dong3 = huan.animate(
          [
            { transform: 'translate(-50%, -50%) scale(0.12)', opacity: 0.85 },
            {
              transform: `translate(-50%, -50%) scale(${(3.2 + i * 1.6).toFixed(2)})`,
              opacity: 0
            }
          ],
          {
            duration: 640 + i * 170,
            delay: i * 110,
            easing: 'cubic-bezier(.2,.65,.35,1)',
            fill: 'forwards'
          }
        );
        dong3.onfinish = () => huan.remove();
      }
      setTimeout(() => tao.remove(), 1200);
    }
    function gengXinPengZhuang() {
      const jv = ka.getBoundingClientRect();
      const xianZai = Date.now();
      document.querySelectorAll('.app .float-card').forEach(m => {
        if (m === ka || m.classList.contains('hidden')) return;
        const r = m.getBoundingClientRect();
        const xiangJiao =
          jv.left < r.right - 6 &&
          jv.right > r.left + 6 &&
          jv.top < r.bottom - 6 &&
          jv.bottom > r.top + 6;
        if (xiangJiao && !pengZhuangLieBiao.has(m)) {
          // 刚撞上：必晃一下
          pengZhuangLieBiao.add(m);
          m.classList.add('pengZhuang');
          yaoHuang(m);
        } else if (xiangJiao && suDu > 0.55 && (shangCiYao.get(m) || 0) <= xianZai) {
          // 撞着不放还快速摩擦：晃完一阵再补一下（物理感：有速度才有新晃动）
          yaoHuang(m);
        } else if (!xiangJiao && pengZhuangLieBiao.has(m)) {
          pengZhuangLieBiao.delete(m);
          m.classList.remove('pengZhuang');
        }
      });
    }
    function qingChuPengZhuang() {
      pengZhuangLieBiao.forEach(m => m.classList.remove('pengZhuang'));
      pengZhuangLieBiao.clear();
      suDu = 0;
      shangYiDian = null;
    }
    // 碰撞只做视觉反馈（被撞面板果冻波纹晃动），不改变任何面板的位置
    // 点击面板任意位置 → 置顶（用户习惯：点谁谁在最上层）
    const dianJiZhiDing = () => zhiDingMianBan(ka);
    const xia = e => {
      if (e.button !== 0 || e.target.closest('button, input, select, textarea, a')) return;
      // 边界一律用地图区域（.mapwrap）算，且上界不超过蓝色顶栏底沿——绝不拖进顶栏底下
      const fu = ka.closest('.mapwrap') || ka.parentElement;
      const op = ka.offsetParent;
      if (!fu) return;
      const fr = fu.getBoundingClientRect();
      const or = op ? op.getBoundingClientRect() : { left: 0, top: 0 };
      const jv = ka.getBoundingClientRect();
      const tou = document.querySelector('.header');
      const dingBuXia = tou ? tou.getBoundingClientRect().bottom - or.top : 0;
      qi = {
        x: e.clientX,
        y: e.clientY,
        // 卡片当前位置换算成相对 offsetParent 的 left/top（内联样式即按此坐标系写入）
        l: jv.left - or.left,
        t: jv.top - or.top,
        w: jv.width,
        // 地图区域在 offsetParent 坐标系里的位置与大小；上界取「地图区域顶」与「顶栏底沿」的较大者
        dx: fr.left - or.left,
        dy: Math.max(fr.top - or.top, dingBuXia),
        fw: fr.width,
        fh: fr.height
      };
      biao.setPointerCapture(e.pointerId);
      biao.style.cursor = 'grabbing';
      ka.classList.add('tuoDongZhong');
      e.preventDefault();
    };
    const dong = e => {
      if (!qi) return;
      // 实时拖动速度（px/ms，指数平滑），决定水波强度与时长
      if (shangYiDian) {
        const ge = Math.max(1, e.timeStamp - shangYiDian.t);
        const benCi = Math.hypot(e.clientX - shangYiDian.x, e.clientY - shangYiDian.y) / ge;
        suDu = suDu * 0.65 + benCi * 0.35;
      }
      shangYiDian = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      const xl = Math.min(Math.max(qi.l + e.clientX - qi.x, qi.dx - qi.w + 90), qi.dx + qi.fw - 90);
      const yt = Math.min(Math.max(qi.t + e.clientY - qi.y, qi.dy), qi.dy + qi.fh - 52);
      ka.style.left = `${xl}px`;
      ka.style.top = `${yt}px`;
      ka.style.right = 'auto';
      ka.style.bottom = 'auto';
      gengXinPengZhuang();
    };
    const song = () => {
      qi = null;
      biao.style.cursor = 'grab';
      ka.classList.remove('tuoDongZhong');
      qingChuPengZhuang();
    };
    ka.addEventListener('pointerdown', dianJiZhiDing);
    biao.addEventListener('pointerdown', xia);
    biao.addEventListener('pointermove', dong);
    biao.addEventListener('pointerup', song);
    biao.addEventListener('pointercancel', song);
    return () => {
      ka.removeEventListener('pointerdown', dianJiZhiDing);
      biao.removeEventListener('pointerdown', xia);
      biao.removeEventListener('pointermove', dong);
      biao.removeEventListener('pointerup', song);
      biao.removeEventListener('pointercancel', song);
      qingChuPengZhuang();
    };
  }, []);
  return ref;
}

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
  xiuxian: '#e64980'
};
const MING = {
  yiliao: '医疗',
  jiaoyu: '教育',
  gouwu: '购物',
  yanglao: '养老',
  jiaotong: '交通',
  xiuxian: '休闲'
};

// 六类设施图例：语义图标（lucide），颜色跟随类别色，关闭时置灰
const SHE_SHI_TU = {
  yiliao: Cross,
  jiaoyu: GraduationCap,
  gouwu: ShoppingCart,
  yanglao: Armchair,
  jiaotong: Bus,
  xiuxian: Trees
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
    shengChengZhenDuan(report, peiZhi).then(j => {
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
  { name: '广州·天河城', lng: 113.3245, lat: 23.1371 }
];

function chuangJianIpc() {
  const api = window.api;
  return {
    walkingRoute: (o, d) => api.walkingRoute(o, d),
    routeMatrix: (o, d) => api.routeMatrix(o, d),
    searchPoi: (c, k, r) => api.searchPoi(c, k, r),
    reverseGeocode: p => api.reverseGeocode(p)
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
  // 管理员控制台在独立标签页保存配置后，本页通过 storage 事件实时同步，无需刷新
  useEffect(() => {
    function tongBuPeiZhi(e) {
      if (!e.key || e.key === 'sq_admin_conf') setPeiZhi(loadPeiZhi());
    }
    window.addEventListener('storage', tongBuPeiZhi);
    return () => window.removeEventListener('storage', tongBuPeiZhi);
  }, []);
  const [adminOpen, setAdminOpen] = useState(false);
  const [dengLuKai, setDengLuKai] = useState(false);
  const [geRenKai, setGeRenKai] = useState(false); // 个人主页弹窗（点头像进入）
  const [guanZhuM, setGuanZhuM] = useState(null); // 用户在盲区清单里标记（高亮）的盲区 id
  const [yongHu, setYongHu] = useState(() => dangQianYongHu());
  // 管理员登录态（与用户会话分离，存 localStorage 以便控制台独立标签页共享）：管理员面板关闭时同步一次
  const [guanLiYuanZai, setGuanLiYuanZai] = useState(
    () => localStorage.getItem('sq_admin_session') === '1'
  );
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
  const [xianshi, setXianshi] = useState(() =>
    Object.fromEntries(Object.keys(COLOR).map(k => [k, true]))
  );
  // 自定义维度加入图层开关（管理员新增维度后自动出现在图例中）
  useEffect(() => {
    setXianshi(prev => {
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
    setKai(prev => ({ ...prev, [v]: !prev[v] }));
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
      // 生产静态部署（Pages）走浏览器端检索：体检前先等百度地图 JS SDK 就绪，
      // 否则自动体检（定位回调里触发）会早于 BMapGL 加载，适配器拿不到 SDK 而白白降级 OSM
      if (mode === 'bmap' && !import.meta.env.DEV && !window.BMapGL) {
        await loadBmap();
      }
      if (mode === 'server' && isElectron) provider = chuangJianIpc();
      else if (mode === 'osm') provider = chuangJianOsm({ zhongXin: c, banJingMi: 1500 });
      else if (mode === 'bmap') {
        // 双 AK 架构：
        // ① 开发态（vite dev）→ 服务端 AK：Web 服务 API 经 /bmapapi 本地代理，支持批量距离矩阵；
        // ② 生产静态部署（GitHub Pages / Gitee Pages 等）→ 没有 /bmapapi 中间件，
        //    改用浏览器端 BMap GL SDK（LocalSearch / DirectionService）检索，仍为百度真实数据。
        // 两种路径都是百度开放能力，符合赛道要求；REST 异常时由下方 catch 降级 OSM
        if (import.meta.env.DEV) {
          provider = chuangJianBmapServer({ api: '/bmapapi' });
        } else {
          provider = chuangJianBmapWeb();
        }
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
            ? // 并发压到 8：实测并发 16 时百度地点检索大面积返回失败（27/31 个关键词失败），
              // 节奏太松反而把数据打残；单次调用 2~3 秒，靠"关键词并发提交 + 有限并发池"已经够快
              { qps: 6, bingfa: 8 }
            : { qps: 8, bingfa: 8 };
    try {
      let rep;
      try {
        rep = await yunXingTijian(provider, canshu, {
          jinDu: jinDu,
          peiZhi,
          ...jieZou
        });
      } catch (e) {
        // 容错降级：百度服务不可用（限流 / 网络异常）时，
        // 自动切换到 OSM 真实路网继续体检，保证演示不中断。
        // 但配额超限（301/302）、AK 被禁用（4/5）是账号级硬限制，换数据源也救不回来，
        // 直接抛出去让界面说清楚原因，别让用户对着进度条白等一轮 OSM 兜底
        const xinXi = (e && e.message) || '';
        if (mode !== 'bmap' || /baidu:(4|5|301|302)|配额|AK/i.test(xinXi)) throw e;
        setTijianCuo(
          `百度数据源中断（${(e && e.message) || '网络异常'}），已自动降级为 OSM 真实路网`
        );
        const osm = chuangJianOsm({ zhongXin: c, banJingMi: 1500 });
        providerRef.current = osm; // 降级后路线查询跟随可用数据源
        rep = await yunXingTijian(osm, canshu, {
          jinDu: jinDu,
          peiZhi,
          qps: 50,
          bingfa: 8
        });
        rep.warnings.push(
          '百度地图服务不可用，已自动降级为 OSM 真实路网（结果仍基于真实道路计算）'
        );
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
      setTijianCuo(
        '体检长时间没有进展（数据源可能被限流或无响应），已停止等待。请稍后重试或切换数据源。'
      );
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
        const ok = await new Promise(resolve => {
          gc.getPoint(w, p => {
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
      const r = await fetch(
        `https://overpass.openstreetmap.fr/api/interpreter?data=${encodeURIComponent(ql)}`
      );
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
      for (const p of hou.slice(0, 5))
        lie.push({ name: `${p.name}（${(p.juLi / 1000).toFixed(1)}km）`, lng: p.lng, lat: p.lat });
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
      pos => {
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
      err => {
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
    setXianshi(prev => ({ ...prev, [f]: !prev[f] }));
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
  const xuanZeZhongXin = useCallback(p => {
    jiaoHuRef.current = true;
    setCenter(p);
    setCurName('地图选点');
    setBuXingLuXian(null); // 中心点变了，旧路线不再成立
  }, []);

  // 点击设施：沿真实路网计算「中心点 → 该设施」步行路线并展示（再次点击同一设施取消；qiangZhi 用于 AI 导航强制重算）
  async function dianJiSheShi(p, qiangZhi = false) {
    const prov = providerRef.current;
    if (!prov || runningRef.current) return;
    if (!qiangZhi) setChuXing('walk'); // 手动点设施默认回到步行
    setBuXingLuXian(prev =>
      !qiangZhi && prev && prev.uid && prev.uid === p.uid
        ? null
        : { uid: p.uid, dian: p, zhuangTai: 'loading', chuXing: 'walk' }
    );
    try {
      const r = await prov.walkingRoute(center, p);
      setBuXingLuXian(prev =>
        prev && prev.uid === p.uid
          ? {
              ...prev,
              zhuangTai: 'ok',
              chuXing: 'walk',
              polyline: r.polyline,
              distanceM: r.distanceM,
              durationSec: r.durationSec
            }
          : prev
      );
    } catch {
      setBuXingLuXian(prev => (prev && prev.uid === p.uid ? { ...prev, zhuangTai: 'fail' } : prev));
    }
  }

  // —— 模拟导航带路：百度地图式全屏导航页，小蓝点沿步行路线前进、视角跟随、转向提示 ——
  const [daoHangTai, setDaoHangTai] = useState(null); // {kai, weiZhi, shengYuM, quanChengM, jinDuM, buWen, buJiao}
  const [daoHangPing, setDaoHangPing] = useState(false); // 全屏导航页显隐
  const daoHangDongRef = useRef(null);
  // 地图工具状态（AI 导航卡与地图工具条共用，MapCanvas 负责落到地图上）
  const [diTuLuKuang, setDiTuLuKuang] = useState(false);
  const [diTuWeiXing, setDiTuWeiXing] = useState(false);
  const [diTuQingXie, setDiTuQingXie] = useState(false);
  const diTuGongJu = { luKuang: diTuLuKuang, weiXing: diTuWeiXing, qingXie: diTuQingXie };
  const diTuGongJuSheZhi = {
    luKuang: setDiTuLuKuang,
    weiXing: setDiTuWeiXing,
    qingXie: setDiTuQingXie
  };
  const buXingRef = useRef(null);
  buXingRef.current = buXing;
  const zaiGuiHuaRef = useRef(false); // 出行方式重规划进行中（防重复触发）
  const daiDaoHangRef = useRef(null); // 体检期间收到的导航请求，体检完成后自动执行
  // 出行方式：步行（默认，走服务端真实路网）/ 骑行 / 驾车 / 公交（走浏览器端 JS API 规划）
  const [chuXing, setChuXing] = useState('walk');
  const CHU_XING = [
    { jian: 'walk', biao: '🚶 步行' },
    { jian: 'riding', biao: '🚲 骑行' },
    { jian: 'driving', biao: '🚗 驾车' },
    { jian: 'transit', biao: '🚌 公交' }
  ];
  const chuXingBiao = (CHU_XING.find(c => c.jian === (buXing && buXing.chuXing)) || CHU_XING[0])
    .biao;
  // 只停播放、不出全屏导航页（换出行方式重规划时用，避免把用户踢出导航）
  function tingZhiBoFang() {
    if (daoHangDongRef.current) cancelAnimationFrame(daoHangDongRef.current);
    daoHangDongRef.current = null;
    setDaoHangTai(null);
  }
  function tingZhiDaiLu() {
    tingZhiBoFang();
    setDaoHangPing(false);
  }
  // 切换出行方式：以当前路线目的地为准重新规划；导航中切换则规划成功后自动重新开始带路
  async function qieHuanChuXing(mode) {
    if (mode === chuXing) return;
    const lu = buXingRef.current;
    if (!lu || !lu.dian || zaiGuiHuaRef.current) return;
    setChuXing(mode);
    if (mode === 'walk') {
      // 步行走回原服务端真实路网链路（带缓存）
      const zaiNav = !!daoHangTai;
      tingZhiBoFang();
      zaiGuiHuaRef.current = true;
      setBuXingLuXian({ uid: lu.uid, dian: lu.dian, zhuangTai: 'loading', chuXing: 'walk' });
      try {
        const prov = providerRef.current;
        if (!prov) throw new Error('地图数据源未就绪');
        const r = await prov.walkingRoute(center, lu.dian);
        const xin = {
          uid: lu.uid,
          dian: lu.dian,
          zhuangTai: 'ok',
          chuXing: 'walk',
          polyline: r.polyline,
          distanceM: r.distanceM,
          durationSec: r.durationSec
        };
        setBuXingLuXian(xin);
        if (zaiNav || daoHangPing) kaiShiDaiLu(xin);
      } catch {
        setBuXingLuXian({ uid: lu.uid, dian: lu.dian, zhuangTai: 'fail', chuXing: 'walk' });
      } finally {
        zaiGuiHuaRef.current = false;
      }
      return;
    }
    const zaiNav = !!daoHangTai || daoHangPing;
    tingZhiBoFang();
    zaiGuiHuaRef.current = true;
    setBuXingLuXian({ uid: lu.uid, dian: lu.dian, zhuangTai: 'loading', chuXing: mode });
    try {
      const r = await guiHuaLuXian(mode, center, lu.dian);
      const xin = {
        uid: lu.uid,
        dian: lu.dian,
        zhuangTai: 'ok',
        chuXing: mode,
        polyline: r.polyline,
        distanceM: r.distanceM,
        durationSec: r.durationSec
      };
      setBuXingLuXian(xin);
      if (zaiNav) kaiShiDaiLu(xin);
    } catch (e) {
      // 规划失败：回到原路线，并在对话区给出可读原因
      setBuXingLuXian(lu);
      setDaoHangJie({ ok: false, xinxi: (e && e.message) || '路线规划失败' });
    } finally {
      zaiGuiHuaRef.current = false;
    }
  }
  // 按方向变化把折线切成若干「步」（八方位），生成转向提示用
  function shengChengBuZou(xian) {
    const jiaoDu = (a, b2) => {
      const d = (Math.atan2(b2.lng - a.lng, b2.lat - a.lat) * 180) / Math.PI;
      return (d + 360) % 360;
    };
    const buZou = [];
    let qiJiao = null;
    let duanM = 0;
    let lei = 0;
    for (let i = 1; i < xian.length; i++) {
      const d = liangDianJuLi(xian[i - 1], xian[i]);
      const j = jiaoDu(xian[i - 1], xian[i]);
      if (qiJiao === null) qiJiao = j;
      const cha = Math.abs(((j - qiJiao + 540) % 360) - 180);
      if (cha > 30 && duanM > 30) {
        buZou.push({ jiao: qiJiao, qiLei: lei - duanM, zhiLei: lei });
        qiJiao = j;
        duanM = 0;
      }
      duanM += d;
      lei += d;
    }
    if (duanM > 0) buZou.push({ jiao: qiJiao, qiLei: lei - duanM, zhiLei: lei });
    return buZou;
  }
  // 开始导航：进入全屏导航页并播放（视觉速度约 12m/s，全程最短 10 秒、最长 60 秒）；可显式传入路线
  function kaiShiDaiLu(luZhiDing) {
    const lu = luZhiDing || buXingRef.current;
    if (!lu || lu.zhuangTai !== 'ok' || !lu.polyline || lu.polyline.length < 2) return;
    if (daoHangDongRef.current) cancelAnimationFrame(daoHangDongRef.current);
    const buZou = shengChengBuZou(lu.polyline);
    const duan = [];
    let quanCheng = 0;
    for (let i = 1; i < lu.polyline.length; i++) {
      const d = liangDianJuLi(lu.polyline[i - 1], lu.polyline[i]);
      duan.push(d);
      quanCheng += d;
    }
    const zongMiao = Math.min(60, Math.max(10, quanCheng / 12));
    const qiShi = performance.now();
    setDaoHangPing(true);
    setDaoHangTai({
      kai: true,
      quanChengM: quanCheng,
      shengYuM: quanCheng,
      jinDuM: 0,
      weiZhi: lu.polyline[0],
      buWen: '沿路线出发',
      buJiao: buZou.length ? buZou[0].jiao : 0
    });
    const bu = now => {
      const p = Math.min(1, (now - qiShi) / (zongMiao * 1000));
      const muBiao = quanCheng * p;
      let lei = 0;
      let wei = lu.polyline[lu.polyline.length - 1];
      for (let i = 0; i < duan.length; i++) {
        if (lei + duan[i] >= muBiao) {
          const t = duan[i] ? (muBiao - lei) / duan[i] : 0;
          const a = lu.polyline[i];
          const b2 = lu.polyline[i + 1];
          wei = { lng: a.lng + (b2.lng - a.lng) * t, lat: a.lat + (b2.lat - a.lat) * t };
          break;
        }
        lei += duan[i];
      }
      // 当前所处「步」：八方位转向提示（北为 0°）
      const FANG = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
      const bu = buZou.find(s => muBiao >= s.qiLei && muBiao < s.zhiLei);
      const daoDaQian = quanCheng - muBiao < 30;
      const buWen = daoDaQian
        ? '即将到达目的地'
        : bu
          ? `${FANG[Math.round(bu.jiao / 45) % 8]}向直行 · 剩余 ${Math.max(1, Math.round(bu.zhiLei - muBiao))} 米`
          : '沿路线前进';
      const buJiao = bu ? bu.jiao : 0;
      setDaoHangTai({
        kai: p < 1,
        quanChengM: quanCheng,
        shengYuM: quanCheng * (1 - p),
        jinDuM: muBiao,
        weiZhi: wei,
        buWen,
        buJiao
      });
      if (p < 1) {
        daoHangDongRef.current = requestAnimationFrame(bu);
      } else {
        daoHangDongRef.current = null;
        // 到达：聊天里报一声（导航页停留，底部显示已到达，点退出返回）
        const ming = lu.dian && lu.dian.name;
        const daoTiao = {
          role: 'ai',
          wen: `🏁 已带你到达${ming ? `「${ming}」` : '目的地'}附近，这一路设施覆盖情况可以在报告里细看。`
        };
        setLiaoTianLieBiao(prev => [...prev, daoTiao]);
        ltBaoCun([daoTiao], null);
      }
    };
    daoHangDongRef.current = requestAnimationFrame(bu);
  }
  // 路线被清掉 / 换了新路线 / 组件卸载时，自动停止播放（全屏导航页保留，供重新开始）
  useEffect(() => {
    if (!buXing || buXing.zhuangTai !== 'ok') tingZhiBoFang();
  }, [buXing]);
  useEffect(() => () => tingZhiBoFang(), []);
  // 体检完成后自动执行体检期间挂起的导航请求（用户说「带我去xx」，体检完自动选点带路）
  useEffect(() => {
    if (!daiDaoHangRef.current) return;
    if (!report || runningRef.current) return;
    const wen = daiDaoHangRef.current;
    daiDaoHangRef.current = null;
    // 移除挂起进度卡（下一帧再执行，避免旧卡片被并进新消息列表）
    setLiaoTianLieBiao(prev => prev.filter(m => m.role !== 'dai'));
    setTimeout(() => faQiLiaoTian(wen), 0);
  }, [report, running]);

  // —— AI 导航：不再有独立输入框，统一走下方对话输入 ——
  // 对话里出现导航意图（如「帮我找最近的医院」）时自动选点并画步行路线，
  // 结果展示在本区，同时回一条聊天气泡；普通问题仍走在线问答
  const [daoHangJie, setDaoHangJie] = useState(null);

  // —— AI 在线问答：用户与大模型自由聊天，自动带本轮体检摘要上下文 ——
  const [liaoTianLieBiao, setLiaoTianLieBiao] = useState([]);
  // 三个悬浮面板（体检控制 / AI 导航 / 体检报告）的自由拖拽
  const zuoTuoRef = yongMianBanTuoDong();
  const daoHangTuoRef = yongMianBanTuoDong();
  const youTuoRef = yongMianBanTuoDong();
  const [liaoTianWen, setLiaoTianWen] = useState('');
  const [liaoTianZhong, setLiaoTianZhong] = useState(false);
  const ltGunRef = useRef(null);

  // —— 聊天历史：会话按账号存 localStorage，可回看 / 续聊 / 删除 ——
  const [ltLiShi, setLtLiShi] = useState([]); // 全部历史会话 [{id, shiJian, biaoTi, xiaoXi}]
  const [ltLiShiKai, setLtLiShiKai] = useState(false); // 历史面板显隐
  const ltDangQianId = useRef(null); // 当前会话 id（null = 首条消息时新建会话）
  const ltCunJian = zhangHao => `sq_lt_lishi_${zhangHao || 'youke'}`;
  function ltDuQu() {
    try {
      const lie = JSON.parse(localStorage.getItem(ltCunJian(yongHu && yongHu.zhangHao)) || '[]');
      return Array.isArray(lie) ? lie : [];
    } catch {
      return [];
    }
  }
  function ltXieRu(lieBiao) {
    // 最多留 20 个会话，每个会话最多 100 条消息，防 localStorage 撑爆
    try {
      localStorage.setItem(
        ltCunJian(yongHu && yongHu.zhangHao),
        JSON.stringify(
          lieBiao.slice(0, 20).map(hui => ({ ...hui, xiaoXi: (hui.xiaoXi || []).slice(-100) }))
        )
      );
    } catch {
      /* 存储满时静默放弃，不影响聊天 */
    }
  }
  // 把一组消息（本条提问 + 回答）追加进当前会话并落盘；无会话则按首条提问建标题
  function ltBaoCun(xinXiaoXi, shouWen) {
    const lie = ltDuQu();
    if (!ltDangQianId.current) {
      ltDangQianId.current = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      lie.unshift({
        id: ltDangQianId.current,
        shiJian: Date.now(),
        biaoTi: String(shouWen || '').slice(0, 24),
        xiaoXi: []
      });
    }
    const hui = lie.find(s => s.id === ltDangQianId.current);
    if (hui) hui.xiaoXi = [...(hui.xiaoXi || []), ...xinXiaoXi];
    ltXieRu(lie);
    setLtLiShi(lie);
  }
  // 回看历史：把该会话消息载入当前聊天视图，可直接接着聊
  function huiKanLiShi(hui) {
    ltDangQianId.current = hui.id;
    setLiaoTianLieBiao([...(hui.xiaoXi || [])]);
    setLtLiShiKai(false);
  }
  function shanChuLiShi(id) {
    const lie = ltDuQu().filter(s => s.id !== id);
    ltXieRu(lie);
    setLtLiShi(lie);
    if (ltDangQianId.current === id) {
      ltDangQianId.current = null;
      setLiaoTianLieBiao([]);
    }
  }
  function xinDuiHua() {
    ltDangQianId.current = null;
    setLiaoTianLieBiao([]);
    setLtLiShiKai(false);
    daiDaoHangRef.current = null; // 开新对话时丢弃体检期间挂起的导航请求
  }
  // 登录账号变化时重载该账号的历史
  useEffect(() => {
    ltDangQianId.current = null;
    setLtLiShi(ltDuQu());
    setLtLiShiKai(false);
  }, [yongHu && yongHu.zhangHao]);

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
    // 导航意图（如「帮我找最近的医院」「带我去吧」）：直接 AI 选点 + 自动画步行路线，结果同步回聊天
    if (shiDaoHangYiTu(wen)) {
      // 体检进行中：先应答并挂起请求（聊天里放实时进度卡，随体检进度自动刷新），完成后自动选点带路
      if (runningRef.current) {
        daiDaoHangRef.current = wen;
        setLiaoTianZhong(false);
        setLiaoTianLieBiao([
          ...liaoTianLieBiao.filter(m => m.role !== 'dai'),
          { role: 'dai', wen }
        ]);
        ltBaoCun(
          [
            { role: 'user', wen },
            {
              role: 'ai',
              wen: '收到！体检进行中，完成后会自动按你的要求选点并带你去，不用再发一遍。'
            }
          ],
          wen
        );
        return;
      }
      // 没有报告且没在体检：给明确引导（不挂起，因为不知道用户什么时候才会体检）
      if (!report) {
        const tiTiao = {
          role: 'ai',
          wen: '还没有体检结果，无法从真实设施里选目的地——点「开始体检」完成一轮体检，我会自动按你的要求带你去；或把数据源切到「离线样例」立即体验。'
        };
        setLiaoTianZhong(false);
        setLiaoTianLieBiao([...xinLie, tiTiao]);
        ltBaoCun([{ role: 'user', wen }, tiTiao], wen);
        return;
      }
      const dh = await aiXuanDian(wen, report, center, peiZhi && peiZhi.ai);
      setDaoHangJie(dh);
      if (dh.ok) dianJiSheShi(dh.poi, true);
      setLiaoTianZhong(false);
      const huiTiao = dh.ok
        ? {
            role: 'ai',
            wen: `🧭 带你去「${dh.poi.name}」：${dh.liYou}。步行路线已画在地图上，点地图上其他设施可随时换目的地。`
          }
        : { role: 'cuo', wen: dh.xinxi };
      setLiaoTianLieBiao([...xinLie, huiTiao]);
      ltBaoCun([{ role: 'user', wen }, huiTiao], wen);
      return;
    }
    const j = await aiLiaoTian(liaoTianLieBiao, wen, report, peiZhi && peiZhi.ai);
    setLiaoTianZhong(false);
    const huiTiao = j.ok ? { role: 'ai', wen: j.hui } : { role: 'cuo', wen: j.xinxi };
    setLiaoTianLieBiao([...xinLie, huiTiao]);
    ltBaoCun([{ role: 'user', wen }, huiTiao], wen);
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
              onChange={e => setSouSuoWenBen(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && souSuo()}
            />
            <button className="search-btn" onClick={souSuo}>
              <MorphIcon icon={Search} spring="snappy" size={15} />
              <span>搜索</span>
            </button>
          </div>
          <select
            className="time-select"
            value={mubiaoFen}
            onChange={e => setMubiaoFen(Number(e.target.value))}
          >
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
              <MorphIcon
                icon={kai.zuo ? PanelLeftClose : PanelLeftOpen}
                spring="snappy"
                size={15}
              />
              控制面板
            </button>
            <button
              type="button"
              className={`tog-btn ${kai.you ? 'on' : ''}`}
              title={kai.you ? '隐藏右侧报告' : '显示右侧报告'}
              onClick={() => qieHuanKai('you')}
            >
              <MorphIcon
                icon={kai.you ? PanelRightClose : PanelRightOpen}
                spring="snappy"
                size={15}
              />
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
              >
                👤 {yongHu.zhangHao}
              </button>
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
              <span className="src-chip" title="管理员身份已登录">
                🛡 管理员
              </span>
              <button
                className="admin-btn"
                onClick={daKaiKongZhiTai}
                title="在独立标签页打开管理员控制台"
              >
                打开控制台
              </button>
              <button className="admin-btn" onClick={guanLiYuanTuiChu}>
                退出
              </button>
            </>
          ) : (
            <>
              <button className="admin-btn" onClick={() => setDengLuKai(true)}>
                登录 / 注册
              </button>
              <button
                className="admin-gear"
                onClick={daKaiKongZhiTai}
                title="管理员入口"
                aria-label="管理员入口"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="15"
                  height="15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </>
          )}
        </div>
      </header>

      <div className={`mapwrap ${daoHangPing ? 'daoHang-quanPing' : ''}`}>
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
          daoHang={daoHangTai}
          gongJu={diTuGongJu}
          gongJuSheZhi={diTuGongJuSheZhi}
        />
        {/* 百度地图式全屏导航页：路线就绪时出「开始导航」入口，导航中铺满屏幕 */}
        {buXing &&
          buXing.zhuangTai === 'ok' &&
          buXing.polyline &&
          buXing.polyline.length > 1 &&
          !daoHangPing && (
            <button className="daiLu-ruKou" onClick={kaiShiDaiLu} title="进入全屏导航">
              🧭 开始导航
            </button>
          )}
        {daoHangPing && (
          <>
            {/* 顶部转向提示卡：八方位箭头 + 指引文字（百度导航同款蓝色大卡） */}
            <div className="daoPing-ding">
              <span
                className="daoPing-jian"
                style={{ transform: `rotate(${daoHangTai ? daoHangTai.buJiao : 0}deg)` }}
              >
                <svg viewBox="0 0 24 24" width="26" height="26" fill="#ffffff">
                  <path d="M12 2l7 18-7-4-7 4z" />
                </svg>
              </span>
              <div className="daoPing-ding-wen">
                <b>{daoHangTai ? daoHangTai.buWen : '已到达目的地'}</b>
                <span>
                  {daoHangTai
                    ? `剩余 ${Math.round(daoHangTai.shengYuM)} 米 · 约 ${Math.max(1, Math.round(daoHangTai.shengYuM / 80))} 分钟`
                    : '导航结束，点下方「退出导航」返回'}
                </span>
              </div>
            </div>
            {/* 顶部左侧退出 */}
            <button className="daoPing-tui" onClick={tingZhiDaiLu} title="退出导航">
              ← 退出导航
            </button>
            {/* 出行方式切换：像手机导航一样可选步行 / 骑行 / 驾车 / 公交，切换即重新规划并重放 */}
            <div className="daoPing-fangShi">
              {CHU_XING.map(c => (
                <button
                  key={c.jian}
                  className={chuXing === c.jian ? 'on' : ''}
                  onClick={() => qieHuanChuXing(c.jian)}
                  disabled={zaiGuiHuaRef.current}
                  title={`切换为${c.biao.slice(2)}路线`}
                >
                  {c.biao}
                </button>
              ))}
            </div>
            {/* 底部信息卡：目的地 / 里程 / 进度条 */}
            <div className="daoPing-di">
              <div className="daoPing-di-hang">
                <span className="daoPing-muDi">
                  {chuXingBiao} · {buXing && buXing.dian ? buXing.dian.ming || '目的地' : '目的地'}
                </span>
                <span className="daoPing-shu">
                  {daoHangTai
                    ? `全程 ${Math.round(daoHangTai.quanChengM)} 米 · 已走 ${Math.round(daoHangTai.jinDuM)} 米`
                    : '导航完成'}
                </span>
              </div>
              <div className="daoPing-jin">
                <i
                  style={{
                    width: daoHangTai
                      ? `${Math.min(100, Math.round((daoHangTai.jinDuM / Math.max(1, daoHangTai.quanChengM)) * 100))}%`
                      : '100%'
                  }}
                />
              </div>
            </div>
          </>
        )}
        {offline && (
          <div className="offline">
            {tijianCuo || '地图服务异常，已降级真实路网兜底模式，请检查 AK / 网络'}
          </div>
        )}
        {buXing && (
          <div className={`buxing-tip ${buXing.zhuangTai}`}>
            {buXing.zhuangTai === 'loading' && '正在沿真实路网计算路线…'}
            {buXing.zhuangTai === 'ok' &&
              `${buXing.dian.ming || '所选设施'}：${chuXingBiao} ${Math.round(
                buXing.distanceM
              )} 米 · 约 ${Math.max(1, Math.round(buXing.durationSec / 60))} 分钟`}
            {buXing.zhuangTai === 'fail' && '路线计算失败（该设施可能不在路网覆盖范围内）'}
            <button type="button" className="link-btn" onClick={() => setBuXingLuXian(null)}>
              关闭
            </button>
          </div>
        )}
      </div>

      {/* 左下控制卡片：整块显隐由顶栏开关控制 */}
      <div ref={zuoTuoRef} className={`float-card left-bottom ${kai.zuo ? '' : 'hidden'}`}>
        <div className="panel-title">体检控制</div>

        <div className="sec">
          <div className="sec-title">
            定位周边推荐
            {dingWeiTai === 'ok' && <span className="sec-tag">已定位</span>}
          </div>
          {zhouBian.length === 0 && dingWeiTai === 'loading' && (
            <div className="empty-tip">
              正在获取你的位置…首次访问浏览器会弹出定位授权，请选择「允许」
            </div>
          )}
          {zhouBian.length === 0 && dingWeiTai === 'ok' && (
            <div className="empty-tip">已拿到你的位置，正在读取周边社区名…</div>
          )}
          {zhouBian.length === 0 && dingWeiTai === 'fail' && (
            <div className="empty-tip">
              没拿到设备定位：{dingWeiYin}。<br />
              当前中心点（{curName}）
              {jiaoHuRef.current ? '来自你手动选点' : '是兜底默认坐标，不是你的真实位置'}。<br />
              可点下面「重新定位」再试；也可在地图上单击选点后点「设为中心点」确认，或直接拖动地图上的蓝色图钉。
              <button type="button" className="link-btn" onClick={() => dingWei()}>
                重新定位
              </button>
            </div>
          )}
          {zhouBian.length > 0 && (
            <div className="chips-row">
              {zhouBian.map(p => (
                <button
                  key={p.name}
                  className={`chip ${curName === p.name ? 'on' : ''}`}
                  onClick={() => tiaoZhuanDian(p)}
                >
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
              ...Object.keys(COLOR).map(f => ({ f, ming: MING[f], se: COLOR[f] })),
              ...(peiZhi.ziDing || []).map((z, i) => ({
                f: z.f,
                ming: z.ming,
                se: ['#f97316', '#0ea5e9', '#a3e635', '#f472b6', '#facc15', '#34d399'][i % 6]
              }))
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
              <input
                type="number"
                step="0.0001"
                value={center.lng}
                onChange={e => setCenter({ ...center, lng: Number(e.target.value) })}
              />
            </div>
            <div className="mini-field">
              <label>中心点纬度</label>
              <input
                type="number"
                step="0.0001"
                value={center.lat}
                onChange={e => setCenter({ ...center, lat: Number(e.target.value) })}
              />
            </div>
            <div className="mini-field">
              <label>采样</label>
              <select
                value={dangwei}
                onChange={e => setDangwei(e.target.value)}
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
            <select value={mode} onChange={e => setMode(e.target.value)}>
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
          <button
            className="locate-btn"
            onClick={dingWei}
            title="定位到浏览器当前位置（也可以拖动地图上的蓝色图钉改中心点）"
          >
            <MorphIcon icon={MapPin} size={15} spring="snappy" />
            定位
          </button>
          <button className="run-btn" onClick={() => run()} disabled={running}>
            {running ? `${Math.round(progress * 100)}%` : '开始体检'}
          </button>
        </div>
        <div className="progress">
          <i style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {/* AI 导航：独立悬浮卡（不挤在体检控制面板里），显隐由顶栏「AI 导航」开关控制 */}
      <div ref={daoHangTuoRef} className={`float-card ai-nav-card ${kai.ai ? '' : 'hidden'}`}>
        <div className="panel-title">
          AI 导航
          {peiZhi?.ai?.qiYong && <span className="sec-tag">大模型选点</span>}
        </div>
        {/* 快捷目的地：一键发导航指令；路线就绪后卡内也有「开始导航」入口 */}
        <div className="dh-kuaiJie">
          {['医院', '超市', '学校', '公园', '药店'].map(c => (
            <button
              key={c}
              className="dh-kuai"
              onClick={() => faQiLiaoTian(`帮我找最近的${c}`)}
              disabled={!report || running}
              title={`导航到最近的${c}`}
            >
              最近{c[0] === '医' ? '' : '的'}
              {c}
            </button>
          ))}
        </div>
        {/* 地图图层控制（与地图左上角工具条同一套开关，双向联动） */}
        {ditu === 'baidu' && (
          <div className="dh-tuCeng">
            <span className="dh-tuCeng-biao">地图</span>
            {[
              ['luKuang', '🚦 路况', '实时路况图层'],
              ['weiXing', '🛰 卫星', '卫星影像 / 普通地图'],
              ['qingXie', '🏔 3D', '3D 倾斜视角']
            ].map(([jian, biao, ti]) => (
              <button
                key={jian}
                className={`dh-tuCeng-an ${diTuGongJu[jian] ? 'on' : ''}`}
                onClick={() => diTuGongJuSheZhi[jian](!diTuGongJu[jian])}
                title={ti}
              >
                {biao}
              </button>
            ))}
          </div>
        )}
        {buXing &&
          buXing.zhuangTai === 'ok' &&
          buXing.polyline &&
          buXing.polyline.length > 1 &&
          !daoHangPing && (
            <button className="dh-kaiShi" onClick={kaiShiDaiLu} title="进入全屏导航">
              🧭 开始导航 · 沿当前路线带路
            </button>
          )}
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
            <div className="dh-luJing">
              路线已画在地图上；可切出行方式（步行 / 骑行 / 驾车 /
              公交），或点「开始导航」进入全屏导航。
            </div>
          </div>
        )}
        {/* 出行方式切换：有路线时显示，与全屏导航页共用同一状态 */}
        {buXing && buXing.zhuangTai !== 'loading' && (
          <div className="dh-chuXing">
            {CHU_XING.map(c => (
              <button
                key={c.jian}
                className={chuXing === c.jian ? 'on' : ''}
                onClick={() => qieHuanChuXing(c.jian)}
                disabled={zaiGuiHuaRef.current || !report}
                title={`切换为${c.biao.slice(2)}路线`}
              >
                {c.biao}
              </button>
            ))}
          </div>
        )}
        {daoHangJie && !daoHangJie.ok && !daoHangJie.zhuangTai && (
          <div className="a-tip a-tip-err">{daoHangJie.xinxi}</div>
        )}

        <div className="divider" />
        <div className="sec-title lt-biaoHang">
          <span>
            在线问答{peiZhi?.ai?.qiYong && <span className="sec-tag">可结合本轮体检结果回答</span>}
          </span>
          <span className="lt-caoZu">
            <button
              className={`lt-caoAn ${ltLiShiKai ? 'on' : ''}`}
              onClick={() => {
                setLtLiShi(ltDuQu());
                setLtLiShiKai(true);
              }}
              title="查看历史聊天"
            >
              🕘 历史{ltLiShi.length ? ` (${ltLiShi.length})` : ''}
            </button>
            <button className="lt-caoAn" onClick={xinDuiHua} title="清空当前聊天，开启新对话">
              ＋ 新对话
            </button>
          </span>
        </div>
        {/* 豆包式对话界面：欢迎语 + 推荐问法芯片 + 头像气泡 + 底部圆角大输入框 */}
        <div className="lt-lie" ref={ltGunRef}>
          {liaoTianLieBiao.length === 0 && !liaoTianZhong && (
            <div className="lt-huanYing">
              <AiHuiZhang da />
              <b>你好，我是 AI 助手</b>
              <span>能结合本轮体检结果聊聊你关心的问题</span>
              <div className="lt-tui">
                {[
                  '帮我找最近的医院',
                  '我这个社区看病方便吗？',
                  '盲区是什么意思？',
                  '附近适合散步锻炼吗？'
                ].map(t => (
                  <button
                    key={t}
                    className="lt-tuiXiang"
                    onClick={() => faQiLiaoTian(t)}
                    disabled={liaoTianZhong}
                  >
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
            ) : m.role === 'dai' ? (
              // 挂起导航实时进度卡：随体检进度实时刷新（progress 状态驱动），完成后自动移除
              <div key={i} className="lt-hang ai">
                <AiHuiZhang />
                <div className="lt-qiPao ai lt-daiKa">
                  <b>
                    <span className="lt-dai-shaLou">⏳</span> 收到，体检完成后自动带你去
                  </b>
                  <div className="lt-dai-jin">
                    <i style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} />
                  </div>
                  <span>
                    体检进行中 · {Math.min(100, Math.round(progress * 100))}% ·
                    完成后自动选点并画路线，不用再发一遍
                  </span>
                </div>
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
                <i />
                <i />
                <i />
              </div>
            </div>
          )}
        </div>
        <div className="lt-shuRu">
          <input
            className="lt-shuRu-kuang"
            placeholder="给 AI 助手发送消息"
            value={liaoTianWen}
            onChange={e => setLiaoTianWen(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') faQiLiaoTian();
            }}
            disabled={liaoTianZhong}
          />
          <button
            className="lt-faSong"
            onClick={() => faQiLiaoTian()}
            disabled={liaoTianZhong || !liaoTianWen.trim()}
            title="发送"
          >
            {/* 本项目 lucide 导出的是图标节点数据而非组件，发送图标直接内联 SVG */}
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 2 11 13" />
              <path d="M22 2 15 22 11 13 2 9z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 右侧面板：整块显隐由顶栏开关控制 */}
      <div ref={youTuoRef} className={`float-card right-panel ${kai.you ? '' : 'hidden'}`}>
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
              请求 {report.xinxi.qingQiuShu} 次 · 耗时 {(report.xinxi.haoShiMs / 1000).toFixed(1)}s
              · {report.xinxi.miDu}
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
          {report && report.mangquList.length === 0 && (
            <div className="empty-tip">未识别明显盲区，覆盖良好</div>
          )}
          {report &&
            report.mangquList.map(m => (
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
                  缺口：{m.quekou.join('、')}
                  <br />
                  面积≈{(m.areaM2 / 10000).toFixed(1)} 万㎡ · 预计覆盖 {m.yujiFugaiRenkou} 人<br />
                  {m.yiJu && (
                    <>
                      判定依据：{m.yiJu}
                      <br />
                    </>
                  )}
                  {m.buJianDian && (
                    <>
                      补建点：({m.buJianDian.lng.toFixed(5)}, {m.buJianDian.lat.toFixed(5)}
                      )——地图上绿色 ✚ 标记
                      <br />
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
              <div className="suggest" key={i}>
                · {j}
              </div>
            ))}
          </div>
        )}

        {report && (
          <button className="export-btn" onClick={exportJson}>
            导出报告 JSON
          </button>
        )}
      </div>

      <GuanLiYuan
        open={adminOpen}
        onClose={guanLiYuanGuanBi}
        peiZhi={peiZhi}
        onChange={setPeiZhi}
      />
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
        onHuiKan={r => {
          // 回看历史体检：地图中心移到该社区，并清空旧报告提示重新体检
          if (
            r &&
            r.zhongXin &&
            Number.isFinite(r.zhongXin.lng) &&
            Number.isFinite(r.zhongXin.lat)
          ) {
            setCenter({ lng: r.zhongXin.lng, lat: r.zhongXin.lat });
            setCurName(r.zhongXin.ming || '历史体检社区');
            setReport(null);
            setGeRenKai(false);
          }
        }}
      />
      {/* 聊天历史弹窗：独立窗口回看 / 续聊 / 删除历史会话 */}
      {ltLiShiKai && (
        <div className="admin-mask" onClick={() => setLtLiShiKai(false)}>
          <div className="admin-panel lt-ls-chuang" onClick={e => e.stopPropagation()}>
            <div className="admin-head">
              <div className="panel-title">🕘 聊天历史</div>
              <button className="lt-ls-guan" onClick={() => setLtLiShiKai(false)}>
                关闭
              </button>
            </div>
            <div className="lt-ls-lie">
              {ltLiShi.length === 0 && (
                <div className="lt-ls-kong">还没有历史聊天记录，去对话框聊两句吧。</div>
              )}
              {ltLiShi.map(hui => {
                const shi = new Date(hui.shiJian);
                const zuiHou = (hui.xiaoXi || []).slice(-1)[0];
                return (
                  <div key={hui.id} className="lt-ls-hang" onClick={() => huiKanLiShi(hui)}>
                    <div className="lt-ls-zhu">
                      <b className="lt-ls-biao">{hui.biaoTi || '（无标题对话）'}</b>
                      <span className="lt-ls-yu">
                        {zuiHou
                          ? `${zuiHou.role === 'user' ? '我' : 'AI'}：${String(zuiHou.wen).slice(0, 40)}`
                          : ''}
                      </span>
                    </div>
                    <div className="lt-ls-fu">
                      {shi.getMonth() + 1}月{shi.getDate()}日{' '}
                      {String(shi.getHours()).padStart(2, '0')}:
                      {String(shi.getMinutes()).padStart(2, '0')} · {(hui.xiaoXi || []).length} 条
                      <button
                        className="lt-ls-shan"
                        title="删除该会话"
                        onClick={e => {
                          e.stopPropagation();
                          shanChuLiShi(hui.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="lt-ls-tiShi">
              点任意会话载入聊天窗口，可直接接着聊；× 只删该条会话。
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
