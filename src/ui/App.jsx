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
import {
  dangQianYongHu,
  yongHuTuiChu,
  guanLiYuanLingPai,
  mangQuBiaoJi,
  mangQuLieBiao,
  mangQuShanChu
} from '../core/yonghu.js';
import { loadPeiZhi, saveReport } from './peiZhi.js';
import { loadBmap } from './loadBmap.js';
import { shengChengZhenDuan } from '../core/zhenduan.js';
import { aiXuanDian, shiDaoHangYiTu, tiQuMuDiDi } from '../core/aiDaohang.js';
import { guiHuaLuXian, guiHuaJiaoTong } from './luxian.js';
import { aiLiaoTian } from '../core/aiLiaoTian.js';
import { liangDianJuLi, fangWeiJiao } from '../core/geo/jichu.js';
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
  NavigationOff,
  Utensils,
  Hotel,
  Landmark,
  Zap,
  Fuel,
  ShoppingBag,
  History,
  Footprints,
  Bike,
  Car
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
    // 越界钳回：窗口缩小 / 初始定位等原因让卡片顶进蓝色顶栏底下时，
    // 自动把卡片 top 压回顶栏底沿之下——否则标题栏被盖住，想拖回来都拖不了
    function qianZhi() {
      const tou = document.querySelector('.header');
      if (!tou) return;
      const xiaYan = tou.getBoundingClientRect().bottom;
      const jv = ka.getBoundingClientRect();
      if (jv.top < xiaYan - 2) {
        const op = ka.offsetParent;
        const or = op ? op.getBoundingClientRect() : { left: 0, top: 0 };
        ka.style.top = `${xiaYan - or.top + 4}px`;
        ka.style.bottom = 'auto';
      }
    }
    window.addEventListener('resize', qianZhi);
    qianZhi();
    return () => {
      ka.removeEventListener('pointerdown', dianJiZhiDing);
      biao.removeEventListener('pointerdown', xia);
      biao.removeEventListener('pointermove', dong);
      biao.removeEventListener('pointerup', song);
      biao.removeEventListener('pointercancel', song);
      window.removeEventListener('resize', qianZhi);
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

// 秒数 → 人话时长（聊天推荐用）：90 秒内显示「X秒」，否则「X小时X分」
function haoShiWen(miao) {
  if (!Number.isFinite(miao)) return null;
  if (miao < 90) return `${Math.max(1, Math.round(miao))}秒`;
  const shi = Math.floor(miao / 3600);
  const fen = Math.round((miao % 3600) / 60);
  return `${shi > 0 ? `${shi}小时` : ''}${fen}分`;
}

// 搜索面板分类快捷：与手机地图一致的一排高频地点类型（ci 为百度地点检索关键词），
// 图标用 lucide 语义图标（与设施图例同套组件体系），se 为各类徽章底色
const SOU_LEI = [
  { tu: Utensils, ming: '美食', ci: '美食', se: '#ff8f1f' },
  { tu: Hotel, ming: '酒店', ci: '酒店', se: '#2f86f7' },
  { tu: Landmark, ming: '景点', ci: '旅游景点', se: '#12b76a' },
  { tu: Zap, ming: '充电', ci: '充电站', se: '#f5b800' },
  { tu: Fuel, ming: '加油', ci: '加油站', se: '#e5484d' },
  { tu: Trees, ming: '休闲', ci: '公园', se: '#1a8f57' },
  { tu: ShoppingBag, ming: '商场', ci: '购物中心', se: '#7c5cf0' }
];

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
  // —— 太阳光影：按本地时间把太阳方位折算成全局阴影变量（--guang-x/y/yan），
  // 地图气泡 / 选点卡 / 路线提示条的投影早晨偏西、正午最短最淡、傍晚偏东，
  // 夜间换月光冷影；每分钟自校一次，与手机地图「光影随时间」的质感看齐
  useEffect(() => {
    const gengXinGuang = () => {
      const xianZai = new Date();
      const shi = xianZai.getHours() + xianZai.getMinutes() / 60;
      let x, y, yan;
      if (shi >= 6 && shi < 18) {
        const t = (shi - 6) / 12; // 0=日出 0.5=正午 1=日落
        x = -Math.cos(t * Math.PI); // 影子方向与太阳相反：日出在东影子偏西 → 日落在西影子偏东
        const chang = Math.abs(Math.cos(t * Math.PI)); // 太阳越顶影子越短
        y = 0.5 + 0.35 * chang;
        const nong = 0.3 - 0.1 * chang; // 正午光照最强，影子最淡
        yan = `rgba(31, 41, 61, ${nong.toFixed(3)})`;
      } else {
        // 夜间月光：冷调短影，上半夜偏东、下半夜偏西
        x = shi >= 18 ? 0.5 : -0.5;
        y = 0.55;
        yan = 'rgba(59, 76, 122, 0.26)';
      }
      const gen = document.documentElement.style;
      gen.setProperty('--guang-x', `${(x * 16).toFixed(1)}px`);
      gen.setProperty('--guang-y', `${(y * 16).toFixed(1)}px`);
      gen.setProperty('--guang-yan', yan);
    };
    gengXinGuang();
    const ding = setInterval(gengXinGuang, 60000);
    return () => clearInterval(ding);
  }, []);
  const [dengLuKai, setDengLuKai] = useState(false);
  const [geRenKai, setGeRenKai] = useState(false); // 个人主页弹窗（点头像进入）
  const [guanZhuM, setGuanZhuM] = useState(null); // 用户在盲区清单里标记（高亮）的盲区 id
  const [yongHu, setYongHu] = useState(() => dangQianYongHu());
  // —— 用户标记盲区：算法盲区之外，用户在地图上补标真实缺设施的位置（红图钉 + 备注，按账号持久化） ——
  const [yongHuMangQu, setYongHuMangQu] = useState([]);
  const [biaoJiZhong, setBiaoJiZhong] = useState(false); // 标记模式：点地图落标记
  const [daiBiaoMangQu, setDaiBiaoMangQu] = useState(null); // 已点下、待填备注的坐标
  const [yongHuBeiZhu, setYongHuBeiZhu] = useState('');
  const [juJiaoYongHu, setJuJiaoYongHu] = useState(null); // {dian, ci} 清单点「定位」时飞到该点
  const [mqCunZhong, setMqCunZhong] = useState(false); // 标记保存中
  const [mqCunCuo, setMqCunCuo] = useState(''); // 标记保存失败原因（输入卡内展示）
  const [mqFuWuCuo, setMqFuWuCuo] = useState(false); // 盲区共享服务未连接
  const [mqDwZhong, setMqDwZhong] = useState(false); // 浏览器定位中
  const [mqDwCuo, setMqDwCuo] = useState(''); // 定位失败原因
  // 「标在我的位置」：浏览器 GPS（WGS-84，与系统内部坐标系一致，无需换算）→ 地图飞过去 → 弹备注卡
  function biaoJiWoDeWeiZhi() {
    if (!yongHu) {
      setDengLuKai(true); // 与地图标记一致：必须登录
      return;
    }
    if (!navigator.geolocation) {
      setMqDwCuo('当前浏览器不支持定位，请改用地图点选');
      return;
    }
    setMqDwZhong(true);
    setMqDwCuo('');
    navigator.geolocation.getCurrentPosition(
      pos => {
        const dian = { lng: pos.coords.longitude, lat: pos.coords.latitude };
        setMqDwZhong(false);
        setDaiBiaoMangQu(dian);
        setYongHuBeiZhu('');
        setMqCunCuo('');
        setJuJiaoYongHu({ dian, ci: Date.now() }); // 地图飞到我所在位置，确认落点
      },
      err => {
        setMqDwZhong(false);
        setMqDwCuo(
          err && err.code === 1
            ? '定位被拒绝：请允许浏览器获取位置权限后重试'
            : '定位失败：请稍后重试，或用「📍 标记盲区」在地图上点选'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }
  // 从服务端拉取共享盲区标记（读公开）；失败时置服务不可用提示
  function jiaZaiYongHuMangQu() {
    mangQuLieBiao()
      .then(j => {
        setYongHuMangQu(j && j.ok ? j.list || [] : []);
        setMqFuWuCuo(!(j && j.ok));
      })
      .catch(() => {
        setYongHuMangQu([]);
        setMqFuWuCuo(true);
      });
  }
  // 只显示离当前体检中心 2 公里内的共享标记：换地方 / 挪位置后，
  // 身边范围之外的标记自动从清单与地图上隐藏，不干扰当前位置的阅读
  const fuJinMangQu = yongHuMangQu.filter(
    m => m.weiZhi && Number.isFinite(m.weiZhi.lng) && liangDianJuLi(center, m.weiZhi) <= 2000
  );
  const yinCangShu = yongHuMangQu.length - fuJinMangQu.length;
  // 初次加载 + 每 10 秒轮询：所有人的标记实时共享
  useEffect(() => {
    jiaZaiYongHuMangQu();
    const ding = setInterval(jiaZaiYongHuMangQu, 10000);
    return () => clearInterval(ding);
  }, []);
  // 登录态变化：退出标记模式与待填卡
  useEffect(() => {
    setBiaoJiZhong(false);
    setDaiBiaoMangQu(null);
  }, [yongHu && yongHu.zhangHao]);
  // 地图标记模式下点击：记下坐标，弹备注输入卡
  function biaoJiDianJi(p) {
    setDaiBiaoMangQu(p);
    setYongHuBeiZhu('');
    setMqCunCuo('');
    setMqDwCuo('');
  }
  // 保存标记：走服务端 MySQL，按登录账号落库，全员可见
  function baoCunYongHuMangQu() {
    if (!daiBiaoMangQu || !yongHu || mqCunZhong) return;
    setMqCunZhong(true);
    setMqCunCuo('');
    mangQuBiaoJi(yongHu.zhangHao, daiBiaoMangQu, (yongHuBeiZhu || '').trim() || '（未填写备注）')
      .then(j => {
        setMqCunZhong(false);
        if (j && j.ok) {
          const luoDian = daiBiaoMangQu;
          setDaiBiaoMangQu(null);
          setYongHuBeiZhu('');
          setBiaoJiZhong(false);
          setJuJiaoYongHu({ dian: luoDian, ci: Date.now() }); // 保存后地图飞到标记点，一眼确认落点
          jiaZaiYongHuMangQu();
        } else {
          setMqCunCuo((j && j.xinxi) || '保存失败，请稍后再试');
        }
      })
      .catch(() => {
        setMqCunZhong(false);
        setMqCunCuo('服务未连接，无法保存标记');
      });
  }
  function shanYongHuMangQu(id) {
    // 管理员（本浏览器已登录管理员）持令牌可删任意标记；普通用户仅限本人
    const guanLi = guanLiYuanZai && guanLiYuanLingPai();
    if (!guanLi && !yongHu) return;
    mangQuShanChu(id, guanLi ? '' : yongHu.zhangHao, guanLi || null)
      .then(j => {
        if (j && j.ok) jiaZaiYongHuMangQu();
      })
      .catch(() => {});
  }
  // 标记模式 Esc 退出
  useEffect(() => {
    if (!biaoJiZhong) return undefined;
    const an = e => {
      if (e.key === 'Escape') {
        setBiaoJiZhong(false);
        setDaiBiaoMangQu(null);
      }
    };
    window.addEventListener('keydown', an);
    return () => window.removeEventListener('keydown', an);
  }, [biaoJiZhong]);
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
  // —— 搜索面板：分类快捷 + 历史记录 + 附近结果（仿手机地图搜索页） ——
  const [souSuoMian, setSouSuoMian] = useState(false); // 面板展开
  const [souSuoLiShiBan, setSouSuoLiShiBan] = useState([]); // 面板里的历史列表（展开时刷新）
  const [souSuoJie, setSouSuoJie] = useState(null); // 分类检索结果 { lei, lie, cuo }
  const [souSuoFang, setSouSuoFang] = useState(false); // 分类检索中
  const [souSuoMuDi, setSouSuoMuDi] = useState(null); // 搜索选中的目的地 { ming, lng, lat }——地图上打橙色旗标
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

  // fetch 加超时包装：地理编码请求不设超时的话，网络不通时会永久挂起，表现为「点搜索没反应」
  function daiChaoShi(chengNuo, haoMiao) {
    return Promise.race([
      chengNuo,
      new Promise((_, jue) => setTimeout(() => jue(new Error('请求超时')), haoMiao))
    ]);
  }
  // OSM 地理编码（Nominatim）：不依赖百度 AK 的地址搜索兜底（带 8 秒中止，防挂死）
  async function souSuoOsm(w) {
    const kong = new AbortController();
    const ding = setTimeout(() => kong.abort(), 8000);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(w)}&format=json&limit=1`;
      const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: kong.signal });
      const j = await r.json();
      if (j && j[0]) return { lng: Number(j[0].lon), lat: Number(j[0].lat) };
      return null;
    } finally {
      clearTimeout(ding);
    }
  }

  // 中心点变更统一入口：定位/选点/改坐标后，旧体检报告与旧路线都属于旧位置，一并失效——
  // 否则 AI 问答、导航还会拿着旧位置的数据说事（用户重新定位了，程序却不知道）
  const qieHuanZhongXin = useCallback((p, ming) => {
    jiaoHuRef.current = true;
    setCenter(p);
    if (ming) setCurName(ming);
    setBuXingLuXian(null);
    setDaoHangJie(null);
    setLuXianZu({});
    muDiRef.current = null;
    setYinLiangXian(null);
    setSouSuoMuDi(null); // 换了体检中心，之前搜索选中的目的地旗标一并清除
    tingZhiBoFang();
    // 换中心点后旧路线全部作废，全屏导航页若还开着会只剩一个点了没反应的「继续导航」——直接退出回普通视图
    setDaoHangPing(false);
    chongFangRef.current = false; // 旧路线作废，自动重放标记一并清掉
    setReport(prev => (prev ? null : prev));
  }, []);

  // 搜索成功记录到本地历史（localStorage）：下次搜同样的词零配额、零延迟直接命中
  function jiSouSuoLiShi(ci, dian) {
    if (!ci) return;
    try {
      const lie = JSON.parse(localStorage.getItem('sq_souSuoLiShi') || '[]').filter(
        x => x.w !== ci
      );
      lie.unshift({ w: ci, lng: dian.lng, lat: dian.lat, shi: Date.now() });
      localStorage.setItem('sq_souSuoLiShi', JSON.stringify(lie.slice(0, 50)));
    } catch {
      /* 存储异常不影响搜索主流程 */
    }
  }
  function yingYong(c) {
    // 顶栏搜索 = 找地点并直接规划前往路线（打目的地旗标 + 四方式并行 + 弹方案窗），
    // 不再搬迁体检中心重跑体检（换体检中心请用「定位 / 双击选点 / 拖动图钉」）。
    // 导航中搜索先退出全屏导航——导航守卫会拦下地图重画，不退出表现为「搜了没反应」
    if (daoHangPing) tingZhiDaiLu();
    const ming = souSuoWenBen.trim();
    jiSouSuoLiShi(ming, c);
    setSouSuoMuDi({ ming, lng: c.lng, lat: c.lat });
    if (!providerRef.current) {
      try {
        providerRef.current = chuangJianBmapWeb();
      } catch {
        /* SDK 未就绪时 guiHuaQuanBu 内部会兜住提示 */
      }
    }
    const dian = { uid: 'sou', lng: c.lng, lat: c.lat, ming };
    muDiRef.current = { uid: 'sou', dian };
    setBuXingLuXian({ uid: 'sou', dian, zhuangTai: 'loading', chuXing });
    setLuXianZu({});
    guiHuaQuanBu(dian);
    setJiaoTongKai(true);
  }
  // 读取 / 清空搜索历史（面板展开时刷新到状态）
  function duSouSuoLiShi() {
    try {
      return JSON.parse(localStorage.getItem('sq_souSuoLiShi') || '[]');
    } catch {
      return [];
    }
  }
  function qingSouSuoLiShi() {
    try {
      localStorage.removeItem('sq_souSuoLiShi');
    } catch {
      /* 忽略 */
    }
    setSouSuoLiShiBan([]);
  }
  // 分类快捷检索：以当前中心为圆心 5 公里搜该类 POI，结果列表点一条即定位。
  // 两级链路：①服务端地点检索（/bmapapi，多 AK 轮换；当日配额易被体检耗尽）；
  // ②浏览器 AK 的 LocalSearch（chuangJianBmapWeb，配额与服务器 AK 独立，体检同款链路）
  async function souLei(le) {
    setSouSuoFang(true);
    setSouSuoJie({ lei: le.ming, lie: [] });
    setSouSuoMian(true);
    let lie = [];
    let cuo = false;
    try {
      const r = await daiChaoShi(
        fetch(
          // 百度 place 检索的 location 格式为「纬度,经度」，别按习惯写成经度在前（会查成 0 结果）
          `/bmapapi/place/v2/search?query=${encodeURIComponent(le.ci)}&location=${center.lat.toFixed(6)},${center.lng.toFixed(6)}&radius=5000&output=json&scope=2`,
          { headers: { Accept: 'application/json' } }
        ),
        8000
      );
      const j = await r.json();
      if (j && j.status === 0 && j.results) {
        lie = j.results
          .filter(x => x && x.location && Number.isFinite(x.location.lng))
          .slice(0, 8)
          .map(x => {
            // 百度 place 返回 BD-09 坐标，必须转回内部 WGS-84——
            // 不转的话后续再按 WGS→BD09 画图/规划会双重偏移 500 米以上（旗标落河、路线穿水）
            const w = bd09ZhuanWgs84(x.location.lng, x.location.lat);
            return {
              ming: x.name || '未命名地点',
              di: x.address || x.area || '',
              lng: w.lng,
              lat: w.lat,
              ju: liangDianJuLi(center, w)
            };
          });
      }
    } catch {
      cuo = true;
    }
    if (!lie.length) {
      try {
        const wang = chuangJianBmapWeb();
        const out = await wang.searchPoi(center, [le.ci], 5000);
        lie = (out || [])
          .slice(0, 8)
          .map(x => ({
            ming: x.name || '未命名地点',
            di: x.address || '',
            lng: x.lng,
            lat: x.lat,
            ju: liangDianJuLi(center, x)
          }))
          .filter(x => Number.isFinite(x.lng));
      } catch {
        cuo = true;
      }
    }
    setSouSuoJie({ lei: le.ming, lie, cuo: cuo && !lie.length });
    setSouSuoFang(false);
  }
  // 点结果条目：把该点设为「目的地」——地图上打紫色旗标、四种方式并行规划、
  // 弹「路线方案」窗口供选择出行方式（点路线卡即可开始导航）；记入搜索历史。
  // 不走 dianJiSheShi（它在体检进行中会直接返回）——选目的地与体检互不阻塞，直接全方式规划
  function dingWeiJieGuo(x) {
    jiSouSuoLiShi(x.ming, { lng: x.lng, lat: x.lat });
    if (daoHangPing) tingZhiDaiLu();
    setSouSuoMuDi({ ming: x.ming, lng: x.lng, lat: x.lat });
    if (!providerRef.current) {
      try {
        providerRef.current = chuangJianBmapWeb();
      } catch {
        /* SDK 未就绪时 guiHuaQuanBu 内部会兜住提示 */
      }
    }
    const dian = { uid: 'sou', lng: x.lng, lat: x.lat, ming: x.ming };
    muDiRef.current = { uid: 'sou', dian };
    setBuXingLuXian({ uid: 'sou', dian, zhuangTai: 'loading', chuXing });
    setLuXianZu({});
    guiHuaQuanBu(dian);
    setJiaoTongKai(true);
    setSouSuoMian(false);
    setSouSuoJie(null);
  }

  async function souSuo() {
    const w = souSuoWenBen.trim();
    if (!w) return;
    const cuo = []; // 每一级失败原因都记下来，全挂时直接展示给用户，不再「无声无息」
    // ⓪ 本地优先（我们自己的算法，零配额零延迟）：
    //    ①当前体检报告的设施名称匹配（命中多个取离当前中心最近的）；
    //    ②历史搜索记录——同样的词或互为包含关系直接命中
    const guanJian = w.toLowerCase();
    if (report && report.poiSet && report.poiSet.fenleiSet) {
      const quanBu = Object.values(report.poiSet.fenleiSet)
        .flat()
        .filter(p => p && p.name && Number.isFinite(p.lng) && Number.isFinite(p.lat));
      const xiang = quanBu
        .filter(p => {
          const ming = p.name.toLowerCase();
          if (guanJian.length >= 2 && (ming.includes(guanJian) || guanJian.includes(ming)))
            return true;
          return p.name.includes(w) || w.includes(p.name);
        })
        .sort((a, b) => liangDianJuLi(center, a) - liangDianJuLi(center, b))[0];
      if (xiang) {
        yingYong({ lng: xiang.lng, lat: xiang.lat });
        return;
      }
    }
    try {
      const lie = JSON.parse(localStorage.getItem('sq_souSuoLiShi') || '[]');
      const mingZhong = lie.find(
        x =>
          Number.isFinite(x.lng) &&
          (x.w === w ||
            (x.w.length >= 2 && x.w.includes(w)) ||
            (w.length >= 2 && w.includes(x.w)))
      );
      if (mingZhong) {
        yingYong({ lng: mingZhong.lng, lat: mingZhong.lat });
        return;
      }
    } catch {
      /* 历史读取失败忽略，继续走在线链路 */
    }
    // ① 首选：本地代理百度地理编码（/bmapapi，服务端注入 BAIDU_SERVER_AK）——
    //    不依赖浏览器 GL SDK 是否就绪、不依赖 GL 里的 Geocoder 回调是否触发
    try {
      const r = await daiChaoShi(
        fetch(`/bmapapi/geocoding/v3/?address=${encodeURIComponent(w)}&output=json`, {
          headers: { Accept: 'application/json' }
        }),
        6000
      );
      const j = await r.json();
      if (j && j.status === 0 && j.result && j.result.location) {
        // 百度返回 BD-09，转成内部统一的 WGS-84
        yingYong(bd09ZhuanWgs84(j.result.location.lng, j.result.location.lat));
        return;
      }
      cuo.push('地理编码：' + ((j && j.message) || '无结果'));
    } catch (e) {
      cuo.push('地理编码：' + ((e && e.message) || '网络异常'));
    }
    // ② 次选：百度地点检索（小区 / 店名这类 POI 名地理编码常认不出，走这里）——
    //    以当前中心为圆心 50 公里圆形检索，取第一个结果（注意：该接口当日配额耗尽会返回 302）
    try {
      const r2 = await daiChaoShi(
        fetch(
          `/bmapapi/place/v2/search?query=${encodeURIComponent(w)}&location=${center.lng.toFixed(6)},${center.lat.toFixed(6)}&radius=50000&output=json`,
          { headers: { Accept: 'application/json' } }
        ),
        6000
      );
      const j2 = await r2.json();
      const shou = j2 && j2.status === 0 && j2.results && j2.results[0] && j2.results[0].location;
      if (shou) {
        yingYong(bd09ZhuanWgs84(j2.results[0].location.lng, j2.results[0].location.lat));
        return;
      }
      cuo.push('地点检索：' + ((j2 && j2.message) || '无结果'));
    } catch (e) {
      cuo.push('地点检索：' + ((e && e.message) || '网络异常'));
    }
    // ③ 再选：浏览器 GL SDK 的 Geocoder（仅百度底图时尝试，回调 6 秒不来即放弃，绝不永久挂起）
    if (ditu === 'baidu') {
      try {
        const B = await loadBmap();
        if (B && B.Geocoder) {
          const ok = await new Promise(resolve => {
            const ding = setTimeout(() => resolve(false), 6000);
            let gc;
            try {
              gc = new B.Geocoder();
            } catch {
              clearTimeout(ding);
              return resolve(false);
            }
            gc.getPoint(w, p => {
              clearTimeout(ding);
              if (p) {
                yingYong(bd09ZhuanWgs84(p.lng, p.lat));
                resolve(true);
              } else resolve(false);
            });
          });
          if (ok) return;
          cuo.push('GL 编码：无结果');
        }
      } catch {
        cuo.push('GL 编码：SDK 不可用');
      }
    }
    // ④ 兜底：OSM（已带超时，国内网络不通时 8 秒内给明确提示，而不是一直没动静）
    try {
      const q = await souSuoOsm(w);
      if (q) {
        yingYong(q);
        return;
      }
      alert(`没找到「${w}」，请换更具体的关键词（区县 / 街道 / 门牌）再试`);
    } catch {
      alert(`地址服务暂不可用（${cuo.join('；')}）。可直接在地图上双击选点，或稍后再试`);
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
        qieHuanZhongXin(c, '当前位置');
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
    qieHuanZhongXin({ lng: p.lng, lat: p.lat }, p.name);
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
  const xuanZeZhongXin = useCallback(
    p => {
      qieHuanZhongXin(p, '地图选点');
    },
    [qieHuanZhongXin]
  );

  // 点击设施 / AI 选点：确定目的地后四种出行方式并行规划——步行走服务端真实路网，
  // 骑行/驾车/公交走浏览器端百度 JS API；各方式路线陆续画上地图（不同颜色），
  // 「路线方案」窗口里点方式标签即切换采用的路线
  function dianJiSheShi(p, qiangZhi = false) {
    const prov = providerRef.current;
    if (!prov || runningRef.current) return;
    if (!qiangZhi) setChuXing('walk'); // 手动点设施默认回到步行
    muDiRef.current = { uid: p.uid || 'dest', dian: p };
    setBuXingLuXian({ uid: p.uid || 'dest', dian: p, zhuangTai: 'loading', chuXing });
    setLuXianZu({});
    guiHuaQuanBu(p);
  }
  // 全方式并行规划（结果陆续写入 luXianZu，谁先算完谁先上地图）
  async function guiHuaQuanBu(dian) {
    if (!providerRef.current) return;
    setLuXianZu(s => ({ ...s, walk: { zhuangTai: 'loading' } }));
    providerRef.current
      .walkingRoute(center, dian)
      .then(r =>
        setLuXianZu(s => ({
          ...s,
          walk: {
            zhuangTai: 'ok',
            polyline: r.polyline,
            distanceM: r.distanceM,
            durationSec: r.durationSec
          }
        }))
      )
      .catch(() => setLuXianZu(s => ({ ...s, walk: { zhuangTai: 'fail' } })));
    setLuXianZu(s => ({
      ...s,
      riding: { zhuangTai: 'loading' },
      driving: { zhuangTai: 'loading' },
      transit: { zhuangTai: 'loading', fangAn: null, xuan: 0 }
    }));
    guiHuaLuXian('riding', center, dian)
      .then(r => setLuXianZu(s => ({ ...s, riding: { zhuangTai: 'ok', ...r } })))
      .catch(() => setLuXianZu(s => ({ ...s, riding: { zhuangTai: 'fail' } })));
    guiHuaLuXian('driving', center, dian, { policy: jiaShiCe })
      .then(r => setLuXianZu(s => ({ ...s, driving: { zhuangTai: 'ok', ...r } })))
      .catch(() => setLuXianZu(s => ({ ...s, driving: { zhuangTai: 'fail' } })));
    guiHuaJiaoTong(center, dian, { policy: gongJiaoCe })
      .then(r =>
        setLuXianZu(s => ({ ...s, transit: { zhuangTai: 'ok', fangAn: r.fangAn, xuan: 0 } }))
      )
      .catch(() =>
        setLuXianZu(s => ({ ...s, transit: { zhuangTai: 'fail', fangAn: null, xuan: 0 } }))
      );
  }
  // 偏好变更：重规划单一方式（驾车策略 / 公交策略）
  async function chongXinGuiHuaDan(mode) {
    const mu = muDiRef.current;
    if (!mu || zaiGuiHuaRef.current) return;
    zaiGuiHuaRef.current = true;
    try {
      if (mode === 'driving') {
        setLuXianZu(s => ({ ...s, driving: { zhuangTai: 'loading' } }));
        const r = await guiHuaLuXian('driving', center, mu.dian, { policy: jiaShiCe });
        setLuXianZu(s => ({ ...s, driving: { zhuangTai: 'ok', ...r } }));
      } else if (mode === 'transit') {
        setLuXianZu(s => ({ ...s, transit: { zhuangTai: 'loading', fangAn: null, xuan: 0 } }));
        const r = await guiHuaJiaoTong(center, mu.dian, { policy: gongJiaoCe });
        setLuXianZu(s => ({ ...s, transit: { zhuangTai: 'ok', fangAn: r.fangAn, xuan: 0 } }));
      }
    } catch {
      setLuXianZu(s => ({ ...s, [mode]: { zhuangTai: 'fail' } }));
    } finally {
      zaiGuiHuaRef.current = false;
    }
  }

  // —— 模拟导航带路：百度地图式全屏导航页，小蓝点沿步行路线前进、视角跟随、转向提示 ——
  const [daoHangTai, setDaoHangTai] = useState(null); // {kai, weiZhi, shengYuM, quanChengM, jinDuM, buWen, buJiao}
  const fangWeiCunRef = useRef(0); // 最近一次有效行进方位角（到终点前后点重合时保持不变，防镜头猛转）
  // 航向朝上旋转视角开关：默认关（镜头北朝上，画面稳定不晕）；开了才随行进方向旋转镜头
  const [shiJiaoXuan, setShiJiaoXuan] = useState(false);
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
  const muDiRef = useRef(null); // 当前目的地引用（uid + 设施点）
  const chongFangRef = useRef(false); // 方式切换后路线就绪需重放导航
  const zaiGuiHuaRef = useRef(false); // 出行方式重规划进行中（防重复触发）
  const daiDaoHangRef = useRef(null); // 体检期间收到的导航请求，体检完成后自动执行
  // 出行方式：步行（默认，走服务端真实路网）/ 骑行 / 驾车 / 公交（走浏览器端 JS API 规划）
  const [chuXing, setChuXing] = useState('walk');
  // 四方式路线组：{ walk|riding|driving: {zhuangTai, polyline, distanceM, durationSec},
  //   transit: {zhuangTai, fangAn, xuan} }——并行规划、地图同时显示，chuXing 为当前采用方式
  const [luXianZu, setLuXianZu] = useState({});
  const luXianZuRef = useRef({});
  luXianZuRef.current = luXianZu;
  const [jiaShiCe, setJiaShiCe] = useState(0); // 驾车偏好：0常规 1躲避拥堵 2高速优先 3少收费
  const [gongJiaoCe, setGongJiaoCe] = useState(0); // 公交偏好：0推荐 1地铁优先 2少换乘 3少步行 4不坐地铁
  const [yinLiangKai, setYinLiangKai] = useState(true); // 步行/骑行阴凉路段高亮
  const [yinLiangXian, setYinLiangXian] = useState(null); // 阴凉路段分段（绿色叠层）
  const [jiaoTongKai, setJiaoTongKai] = useState(false); // 路线方案弹窗
  // 点选某套公交方案：换画到地图上的路线，导航中则重放
  function xuanJiaoTongFangAn(i) {
    const zu = luXianZuRef.current.transit;
    if (!zu || !zu.fangAn || !zu.fangAn[i]) return;
    const mu = muDiRef.current;
    if (!mu) return;
    setLuXianZu(s => ({ ...s, transit: { ...s.transit, xuan: i } }));
    const f = zu.fangAn[i];
    const xin = {
      uid: mu.uid,
      dian: mu.dian,
      zhuangTai: 'ok',
      chuXing: 'transit',
      polyline: f.polyline,
      distanceM: f.juLiMi,
      durationSec: f.haoShiMiao
    };
    setBuXingLuXian(xin);
    setJiaoTongKai(false); // 选好方案收起弹窗，回卡片看摘要
    if (daoHangTai || daoHangPing) kaiShiDaiLu(xin);
  }
  // 四种出行方式：tu 为 lucide 语义图标（与全站图标体系统一），ming 为纯文字名；
  // 旧的 emoji biao 字段已废弃，界面一律 MorphIcon(tu) + ming 渲染
  const CHU_XING = [
    { jian: 'walk', ming: '步行', tu: Footprints },
    { jian: 'riding', ming: '骑行', tu: Bike },
    { jian: 'driving', ming: '驾车', tu: Car },
    { jian: 'transit', ming: '公交', tu: Bus }
  ];
  const chuXingBiao = (CHU_XING.find(c => c.jian === (buXing && buXing.chuXing)) || CHU_XING[0])
    .ming;
  // 只停播放、不出全屏导航页（换出行方式重规划时用，避免把用户踢出导航）
  function tingZhiBoFang() {
    if (daoHangDongRef.current) cancelAnimationFrame(daoHangDongRef.current);
    daoHangDongRef.current = null;
    setDaoHangTai(null);
  }
  // 导航页里的「暂停」：停掉动画但保留进度（daoHangTai 置 kai=false），
  // 「继续导航」可从当前里程接着走，而不是从头重来
  function zhanTingBoFang() {
    if (daoHangDongRef.current) cancelAnimationFrame(daoHangDongRef.current);
    daoHangDongRef.current = null;
    setDaoHangTai(prev => (prev && prev.kai ? { ...prev, kai: false } : prev));
  }
  const [suiShouTai, setSuiShouTai] = useState(''); // 标记此处按钮态：'' / cun 保存中 / ok 成功闪烁
  const [suiShouKa, setSuiShouKa] = useState(null); // 随手标记小窗 {lng, lat, ju}——先填备注再确认
  const [suiShouBei, setSuiShouBei] = useState('');
  const [suiShouCuo, setSuiShouCuo] = useState('');
  // 导航途中「标记此处」：弹出小窗（显示当前位置坐标 + 可填备注），确认后才落库共享
  function suiShouBiaoJi() {
    if (!daoHangTai || !daoHangTai.weiZhi) return;
    if (!yongHu) {
      setDengLuKai(true); // 未登录：直接弹登录窗口（登录后回来再按一次即可标记）
      return;
    }
    setSuiShouBei('');
    setSuiShouCuo('');
    setSuiShouKa({
      lng: daoHangTai.weiZhi.lng,
      lat: daoHangTai.weiZhi.lat,
      juText: `距目的地约 ${Math.max(1, Math.round(daoHangTai.shengYuM))} 米`
    });
  }
  // 小窗确认保存：备注可空（自动兜底默认文案）
  function queRenSuiShou() {
    if (!suiShouKa || !yongHu || suiShouTai === 'cun') return;
    setSuiShouTai('cun');
    const beiZhu = (suiShouBei || '').trim() || '导航途中随手标记';
    mangQuBiaoJi(yongHu.zhangHao, { lng: suiShouKa.lng, lat: suiShouKa.lat }, beiZhu)
      .then(j => {
        setSuiShouTai('');
        if (j && j.ok) {
          jiaZaiYongHuMangQu(); // 立即刷新共享标记列表（地图图层退出导航后恢复显示）
          setSuiShouKa(null);
          setSuiShouTai('ok');
          setTimeout(() => setSuiShouTai(''), 1500);
        } else {
          setSuiShouCuo((j && j.xinxi) || '保存失败，请稍后再试');
        }
      })
      .catch(() => {
        setSuiShouTai('');
        setSuiShouCuo('标记服务未连接，保存失败');
      });
  }
  // 导航途中单击地图：在点击处标记盲区（弹标记小窗；未登录先弹登录）
  function biaoJiDaoHangDian(p) {
    if (!yongHu) {
      setDengLuKai(true);
      return;
    }
    setSuiShouBei('');
    setSuiShouCuo('');
    setSuiShouKa({
      lng: p.lng,
      lat: p.lat,
      juText:
        daoHangTai && daoHangTai.weiZhi
          ? `距当前所在位置约 ${Math.max(1, Math.round(liangDianJuLi(daoHangTai.weiZhi, p)))} 米`
          : ''
    });
  }
  function tingZhiDaiLu() {
    tingZhiBoFang();
    tingZhiGpsGenSui();
    setDaoHangPing(false);
    // 已退出全屏导航页，「方式切换后自动重放」标记必须清掉——
    // 否则之后设新终点路线就绪时会被当成本次切方式的重放请求，导航页自动弹回来
    chongFangRef.current = false;
  }
  // 切换出行方式：只是「切换采用的路线」——各方式路线早已并行规划好并画在地图上；
  // 若该方式还没规划好（极少数），补一次全量规划。导航中切换自动重放新路线
  function qieHuanChuXing(mode) {
    if (mode === chuXing) return;
    const zaiNav = !!daoHangTai || daoHangPing;
    tingZhiBoFang();
    setChuXing(mode);
    setJiaoTongKai(true); // 弹「路线方案」窗口（公交多方案 / 其他单路线）
    chongFangRef.current = zaiNav; // 路线就绪后若在导航中则自动重放
    if (muDiRef.current && !luXianZuRef.current[mode]) guiHuaQuanBu(muDiRef.current.dian);
  }
  // 聊天「你想怎么去」方式卡被点击：切换采用该方式路线 + 弹路线方案窗 + AI 回一句推荐
  // （推荐逻辑：选中的恰是最快方式就直接夸；不是则把最快方式报出来供参考）
  function xuanAiChuXing(mode) {
    const c = CHU_XING.find(x => x.jian === mode);
    if (!c) return;
    qieHuanChuXing(mode);
    setJiaoTongKai(true); // 已是当前方式时 qieHuanChuXing 会提前返回，这里保证方案弹窗一定打开
    const x = luXianZuRef.current[mode];
    const miao = x && x.zhuangTai === 'ok' ? x.durationSec : null;
    const shi = miao == null ? '正在规划，路线好了地图马上画出来' : `预计 ${haoShiWen(miao)}`;
    const paiXu = CHU_XING.map(k => {
      const l = luXianZuRef.current[k.jian];
      return { jian: k.jian, ming: k.ming, miao: l && l.zhuangTai === 'ok' ? l.durationSec : Infinity };
    }).sort((a, b) => a.miao - b.miao);
    const zuiKuai = paiXu[0];
    const BU_YUAN = 1500; // 步行超过 25 分钟视为「较远」，不适合步行
    let tui = '';
    if (mode === 'walk' && miao != null && miao > BU_YUAN) {
      // 路程远时步行不合适：从其余方式里挑最快的明确推荐
      const qiTa = paiXu.filter(k => k.jian !== 'walk' && Number.isFinite(k.miao));
      tui = qiTa.length
        ? `提示：全程步行约 ${haoShiWen(miao)}，比较远——更推荐「${qiTa[0].ming}」，只要 ${haoShiWen(qiTa[0].miao)}。`
        : '提示：全程步行较远，途中注意休息或改用其他方式。';
    } else if (miao != null && zuiKuai && zuiKuai.jian === mode) {
      tui = '推荐就选它——这已经是几种方式里最快的了。';
    } else if (zuiKuai && Number.isFinite(zuiKuai.miao)) {
      tui = `顺带一提：「${zuiKuai.ming}」只要 ${haoShiWen(zuiKuai.miao)}，要是想更快可以考虑换成它。`;
    }
    const huiTiao = {
      role: 'ai',
      wen: `🧭 好的，按「${c.ming}」带你走，${shi}。${tui}路线卡已在地图上方，点路线卡即可开始导航。`
    };
    setLiaoTianLieBiao(prev => [...prev, huiTiao]);
    ltBaoCun([huiTiao], null);
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
  // 沿折线取「从起点算起 ju 米处」的插值坐标（导航小蓝点 / 前方引导点共用）
  function yanXianQuDian(xian, duan, quanCheng, ju) {
    const muBiao = Math.min(quanCheng, Math.max(0, ju));
    let lei = 0;
    for (let i = 0; i < duan.length; i++) {
      if (lei + duan[i] >= muBiao) {
        const t = duan[i] ? (muBiao - lei) / duan[i] : 0;
        const a = xian[i];
        const b2 = xian[i + 1];
        return { lng: a.lng + (b2.lng - a.lng) * t, lat: a.lat + (b2.lat - a.lat) * t };
      }
      lei += duan[i];
    }
    return xian[xian.length - 1];
  }
  // 稳定方位角：当前位置与前方引导点重合（临近终点被 clamp 到同一点）时，
  // fangWeiJiao 会算出 0（正北），镜头到站前会猛转一圈——此时保持上一个方位不变
  function wenDingFangWei(wei, qian) {
    if (Math.abs(wei.lng - qian.lng) < 1e-9 && Math.abs(wei.lat - qian.lat) < 1e-9) {
      return fangWeiCunRef.current;
    }
    fangWeiCunRef.current = fangWeiJiao(wei, qian);
    return fangWeiCunRef.current;
  }
  // 开始导航：进入全屏导航页并播放（视觉速度约 12m/s，全程最短 10 秒、最长 60 秒）；
  // 可显式传入路线；congJinDuM 传已走里程则从该处继续（「继续导航」用），缺省从头走
  function kaiShiDaiLu(luZhiDing, congJinDuM) {
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
    const qiDu = Math.min(quanCheng - 1, Math.max(0, Number(congJinDuM) || 0));
    const zongMiao = Math.min(60, Math.max(10, (quanCheng - qiDu) / 12));
    const qiShi = performance.now();
    setDaoHangPing(true);
    const qiWei = yanXianQuDian(lu.polyline, duan, quanCheng, qiDu);
    const qiQian = yanXianQuDian(lu.polyline, duan, quanCheng, qiDu + 60);
    setDaoHangTai({
      kai: true,
      quanChengM: quanCheng,
      shengYuM: quanCheng - qiDu,
      jinDuM: qiDu,
      weiZhi: qiWei,
      qianWang: qiQian, // 开局也看向前方，构图从第一帧就正确
      fangWei: wenDingFangWei(qiWei, qiQian), // 实时方位角（度，顺时针 0=正北），驱动小蓝点箭头朝向
      buWen: '沿路线出发',
      buJiao: buZou.length ? buZou[0].jiao : 0
    });
    const bu = now => {
      const p = Math.min(1, (now - qiShi) / (zongMiao * 1000));
      const muBiao = qiDu + (quanCheng - qiDu) * p;
      const wei = yanXianQuDian(lu.polyline, duan, quanCheng, muBiao);
      // 相机视线放在前方 60 米：小蓝点沉到屏幕下三分之一，前方路面占视野主体（真导航构图）
      const qianWang = yanXianQuDian(lu.polyline, duan, quanCheng, muBiao + 60);
      // 当前所处「步」：八方位转向提示（北为 0°）
      const FANG = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
      // 内层不能叫 bu：外层动画帧函数就叫 bu，重名会把 1568 行 requestAnimationFrame(bu)
      // 遮蔽成传步对象，rAF 抛 TypeError，动画第一帧后即冻结（表现为暂停/继续导航都没反应）
      const dqBu = buZou.find(s => muBiao >= s.qiLei && muBiao < s.zhiLei);
      const daoDaQian = quanCheng - muBiao < 30;
      const buWen = daoDaQian
        ? '即将到达目的地'
        : dqBu
          ? `${FANG[Math.round(dqBu.jiao / 45) % 8]}向直行 · 剩余 ${Math.max(1, Math.round(dqBu.zhiLei - muBiao))} 米`
          : '沿路线前进';
      const buJiao = dqBu ? dqBu.jiao : 0;
      setDaoHangTai({
        kai: p < 1,
        quanChengM: quanCheng,
        shengYuM: quanCheng * (1 - p),
        jinDuM: muBiao,
        weiZhi: wei,
        qianWang,
        fangWei: wenDingFangWei(wei, qianWang),
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

  // —— GPS 实时跟随：真实设备定位驱动小蓝点（模拟动画之外的另一种走法）——
  // 坐标系说明：navigator.geolocation 返回 WGS-84，应用内路线折线亦统一 WGS-84，直接使用无需转换
  const [gpsGenSui, setGpsGenSui] = useState(false);
  const gpsWatchRef = useRef(null); // watchPosition 句柄
  const gpsJinDuRef = useRef(0); // 最近一次 GPS 投影出的已走里程（定位失败退回模拟时用）
  const gpsDaoDaRef = useRef(false); // GPS 模式下是否已报过「到达」（防重复推送）
  // 把一个点投影到路线上，返回沿线的已走里程（米）——GPS 定位点不会精确落在路线上，需吸附到最近线段
  function luJingTouYing(polyline, duan, p) {
    // 局部平面近似：经度乘 cos(lat) 折算米，纬度按 110540 米/度，短距离误差可忽略
    const weidu = (p.lat * Math.PI) / 180;
    const mj = g => g * 111320 * Math.cos(weidu);
    const mw = w => w * 110540;
    const px = mj(p.lng);
    const py = mw(p.lat);
    let zuiJin = Infinity;
    let lei = 0;
    let jieGuo = 0;
    for (let i = 1; i < polyline.length; i++) {
      const ax = mj(polyline[i - 1].lng);
      const ay = mw(polyline[i - 1].lat);
      const bx = mj(polyline[i].lng);
      const by = mw(polyline[i].lat);
      const dx = bx - ax;
      const dy = by - ay;
      const chang2 = dx * dx + dy * dy;
      let t = chang2 ? ((px - ax) * dx + (py - ay) * dy) / chang2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
      if (d < zuiJin) {
        zuiJin = d;
        jieGuo = lei + duan[i - 1] * t;
      }
      lei += duan[i - 1];
    }
    // 除里程外同时返回定位点到路线的垂直距离：桌面浏览器常用 IP 粗定位，
    // 定位点可能离路线几百上千米，这种「漂移」点不能拿来推进导航进度
    return { li: jieGuo, ju: zuiJin === Infinity ? 0 : zuiJin };
  }
  // 按 GPS 位置刷新导航状态（投影里程 → 剩余 / 指引 / 相机引导点，与模拟动画同一套状态结构）
  // 投影点离路线超过 300 米视为定位漂移（IP 粗定位 / 信号弱），不推进进度，蓝点停在原地
  function gpsShuaXin(lu, c) {
    const duan = [];
    let quanCheng = 0;
    for (let i = 1; i < lu.polyline.length; i++) {
      const d = liangDianJuLi(lu.polyline[i - 1], lu.polyline[i]);
      duan.push(d);
      quanCheng += d;
    }
    const buZou = shengChengBuZou(lu.polyline);
    const touYing = luJingTouYing(lu.polyline, duan, c);
    if (touYing.ju > 300) {
      setDaoHangTai(prev =>
        prev ? { ...prev, kai: true, buWen: 'GPS 信号弱，定位漂移中，蓝点暂不移动' } : prev
      );
      return;
    }
    const jinDu = Math.min(quanCheng, Math.max(0, touYing.li));
    gpsJinDuRef.current = jinDu;
    const FANG = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    const dqBu = buZou.find(s => jinDu >= s.qiLei && jinDu < s.zhiLei);
    const daoDaQian = quanCheng - jinDu < 30;
    const wei = yanXianQuDian(lu.polyline, duan, quanCheng, jinDu);
    const qian = yanXianQuDian(lu.polyline, duan, quanCheng, jinDu + 60);
    setDaoHangTai({
      kai: true,
      quanChengM: quanCheng,
      shengYuM: quanCheng - jinDu,
      jinDuM: jinDu,
      weiZhi: wei,
      qianWang: qian,
      fangWei: wenDingFangWei(wei, qian), // 蓝点箭头朝向：沿线前进方向（度，顺时针 0=正北）
      buWen: daoDaQian
        ? '即将到达目的地'
        : dqBu
          ? `${FANG[Math.round(dqBu.jiao / 45) % 8]}向直行 · 剩余 ${Math.max(1, Math.round(dqBu.zhiLei - jinDu))} 米`
          : '沿路线前进',
      buJiao: dqBu ? dqBu.jiao : 0
    });
    if (daoDaQian && !gpsDaoDaRef.current) {
      gpsDaoDaRef.current = true;
      const ming = lu.dian && lu.dian.name;
      const daoTiao = {
        role: 'ai',
        wen: `🏁 你已到达${ming ? `「${ming}」` : '目的地'}附近（GPS 实时定位）。`
      };
      setLiaoTianLieBiao(prev => [...prev, daoTiao]);
      ltBaoCun([daoTiao], null);
    }
  }
  // 开启 GPS 跟随：停掉模拟动画，改用设备持续定位
  function qiDongGpsGenSui() {
    if (!navigator.geolocation || !navigator.geolocation.watchPosition) return;
    if (daoHangDongRef.current) {
      cancelAnimationFrame(daoHangDongRef.current);
      daoHangDongRef.current = null;
    }
    gpsDaoDaRef.current = false;
    setGpsGenSui(true);
    setDaoHangTai(prev => (prev ? { ...prev, kai: true, buWen: 'GPS 定位中…' } : prev));
    gpsWatchRef.current = navigator.geolocation.watchPosition(
      pos => {
        const lu = buXingRef.current;
        if (!lu || lu.zhuangTai !== 'ok' || !lu.polyline || lu.polyline.length < 2) return;
        // 精度圈大于 100 米的定位（IP 粗定位）不可信，直接丢弃，等更准的定位再来
        if (pos.coords && pos.coords.accuracy && pos.coords.accuracy > 100) {
          setDaoHangTai(prev =>
            prev ? { ...prev, kai: true, buWen: `GPS 定位精度差（±${Math.round(pos.coords.accuracy)} 米），等待更准的定位…` } : prev
          );
          return;
        }
        gpsShuaXin(lu, { lng: pos.coords.longitude, lat: pos.coords.latitude });
      },
      () => {
        // 定位失败 / 被拒绝：绝不能悄悄退回模拟行走——模拟会自己往终点走，
        // 用户人没动却看见蓝点一路走到目的地（此前正是这个假象）。
        // 停在当前进度并明确告知，由用户决定是否切回模拟。
        if (!gpsWatchRef.current) return; // 错误可能连发多次，已处理过就忽略
        tingZhiGpsGenSui();
        setDaoHangTai(prev =>
          prev ? { ...prev, kai: false, buWen: 'GPS 定位失败，已停在原地' } : prev
        );
        const cuoTiao = {
          role: 'ai',
          wen: '📡 没拿到有效的 GPS 定位，已把蓝点停在原地，不会自己往前走了。桌面浏览器多用 IP 粗定位、精度差，建议换手机端使用 GPS 跟随；也可以点「继续导航」切回模拟行走。'
        };
        setLiaoTianLieBiao(prev => [...prev, cuoTiao]);
        ltBaoCun([cuoTiao], null);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
    );
  }
  // 关闭 GPS 跟随：摘掉 watch，回到模拟模式
  function tingZhiGpsGenSui() {
    if (gpsWatchRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(gpsWatchRef.current);
    }
    gpsWatchRef.current = null;
    setGpsGenSui(false);
  }

  // 路线被清掉 / 换了新路线 / 组件卸载时，自动停止播放（全屏导航页保留，供重新开始）
  useEffect(() => {
    if (!buXing || buXing.zhuangTai !== 'ok') {
      tingZhiBoFang();
      tingZhiGpsGenSui();
    }
  }, [buXing]);
  useEffect(
    () => () => {
      tingZhiBoFang();
      tingZhiGpsGenSui();
    },
    []
  );
  // 当前采用方式的路线就绪后同步到 buXing（导航 / 地图高亮用它）；方式切换后导航中自动重放
  useEffect(() => {
    const x = luXianZu[chuXing];
    const mu = muDiRef.current;
    if (!mu || !x || x.zhuangTai !== 'ok') return;
    const f = chuXing === 'transit' && x.fangAn ? x.fangAn[x.xuan || 0] : null;
    const polyline = chuXing === 'transit' ? (f ? f.polyline : null) : x.polyline;
    if (!polyline) return;
    const xin = {
      uid: mu.uid,
      dian: mu.dian,
      zhuangTai: 'ok',
      chuXing,
      polyline,
      distanceM: chuXing === 'transit' ? f.juLiMi : x.distanceM,
      durationSec: chuXing === 'transit' ? f.haoShiMiao : x.durationSec
    };
    const tong =
      buXingRef.current &&
      buXingRef.current.chuXing === chuXing &&
      buXingRef.current.polyline === polyline;
    if (tong) return;
    setBuXingLuXian(xin);
    if (chongFangRef.current) {
      chongFangRef.current = false;
      kaiShiDaiLu(xin);
    }
  }, [luXianZu, chuXing, daoHangTai, daoHangPing]);
  // 步行 / 骑行的阴凉路段：路线点 45 米内有绿地休闲类设施即视为阴凉，聚成绿色分段
  useEffect(() => {
    if (
      !(chuXing === 'walk' || chuXing === 'riding') ||
      !yinLiangKai ||
      !buXing ||
      buXing.zhuangTai !== 'ok' ||
      !report
    ) {
      setYinLiangXian(null);
      return;
    }
    const lvDian = (
      (report.poiSet && report.poiSet.fenleiSet && report.poiSet.fenleiSet.xiuxian) ||
      []
    ).slice();
    const xian = buXing.polyline || [];
    if (!lvDian.length || xian.length < 2) {
      setYinLiangXian({ duan: [], mi: 0 });
      return;
    }
    const duanZu = [];
    let duan = [];
    let yinMi = 0;
    for (let i = 0; i < xian.length; i++) {
      const pt = xian[i];
      const youYin = lvDian.some(p => liangDianJuLi(pt, p) <= 45);
      if (youYin) {
        duan.push(pt);
        if (i > 0) yinMi += liangDianJuLi(xian[i - 1], pt);
      } else if (duan.length) {
        if (duan.length > 1) duanZu.push(duan);
        duan = [];
      }
    }
    if (duan.length > 1) duanZu.push(duan);
    setYinLiangXian({ duan: duanZu, mi: Math.round(yinMi) });
  }, [buXing, chuXing, yinLiangKai, report]);
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
  // AI 已找到、等待用户确认「要不要去」的目的地：确认前不画路线、不弹方案窗
  const [daiQuMuDi, setDaiQuMuDi] = useState(null);
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
  // 执行导航（目的地名称由大模型语义判断给出，或词元兜底抽取）：
  // ①体检设施里按名称匹配最近的；②匹配不到走百度 POI 检索（不依赖体检结果）
  async function zhiXingDaoHang(muMing, wen, xinLie) {
    if (!muMing) {
      setLiaoTianZhong(false);
      const cuoTiao = {
        role: 'cuo',
        wen: '没听清要去哪，试试「带我去最近的医院」或「我想去广西博物馆」。'
      };
      setLiaoTianLieBiao([...xinLie, cuoTiao]);
      ltBaoCun([{ role: 'user', wen }, cuoTiao], wen);
      return;
    }
    // 体检进行中：先挂起进度卡，等体检完成后自动执行（与词元路径同一体验）
    if (runningRef.current) {
      daiDaoHangRef.current = wen;
      setLiaoTianZhong(false);
      setLiaoTianLieBiao([...liaoTianLieBiao.filter(m => m.role !== 'dai'), { role: 'dai', wen }]);
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
    // ① 体检设施名称匹配
    if (report && report.poiSet && report.poiSet.fenleiSet) {
      const quanBu = Object.values(report.poiSet.fenleiSet)
        .flat()
        .filter(p => p && p.name && Number.isFinite(p.lng) && Number.isFinite(p.lat));
      const xiang = quanBu
        .filter(p => (p.name || '').includes(muMing))
        .map(p => ({ ...p, zhiXianJu: liangDianJuLi(center, p) }))
        .sort((a, b) => a.zhiXianJu - b.zhiXianJu);
      if (xiang.length) {
        const muBiao = xiang[0];
        // 先问用户「要不要去」，确认后再规划路线并询问出行方式（不直接画路线）
        setDaiQuMuDi({ ming: muBiao.name, lng: muBiao.lng, lat: muBiao.lat, ju: muBiao.zhiXianJu });
        setLiaoTianZhong(false);
        const huiTiao = {
          role: 'ai',
          quRen: true,
          wen: `🧭 按你的要求找到了「${muBiao.name}」，直线约 ${Math.round(muBiao.zhiXianJu)} 米。需要我带你去吗？`
        };
        setLiaoTianLieBiao([...xinLie, huiTiao]);
        ltBaoCun([{ role: 'user', wen }, huiTiao], wen);
        return;
      }
    }
    // ② 任意地名：百度 POI 检索（30 公里，不依赖体检结果）
    try {
      let prov = providerRef.current;
      if (!prov) {
        // 体检还没启动时数据源尚未创建：按需建一个浏览器端百度适配器——
        // 地名检索（LocalSearch）只依赖 BMapGL，不需要等体检
        try {
          prov = chuangJianBmapWeb();
          providerRef.current = prov;
        } catch {
          throw new Error('百度地图尚未加载完成，稍等几秒再试，或先完成一轮体检');
        }
      }
      if (!prov.searchPoi) throw new Error('当前数据源不支持按地名检索目的地');
      const lie = await prov.searchPoi(center, [muMing], 30000);
      const houXuan = (lie || [])
        .map(p => {
          const w = bd09ZhuanWgs84(p.lng, p.lat);
          return { ...p, lng: w.lng, lat: w.lat, zhiXianJu: liangDianJuLi(center, w) };
        })
        .sort((a, b) => a.zhiXianJu - b.zhiXianJu);
      const muBiao = houXuan.find(p => (p.name || '').includes(muMing)) || houXuan[0];
      if (!muBiao) throw new Error(`周边 30 公里内没有找到「${muMing}」`);
      // 同样先确认「要不要去」，用户点头才开始规划
      setDaiQuMuDi({ ming: muBiao.name, lng: muBiao.lng, lat: muBiao.lat, ju: muBiao.zhiXianJu });
      setLiaoTianZhong(false);
      const huiTiao = {
        role: 'ai',
        quRen: true,
        wen: `🧭 已为你找到「${muBiao.name}」，直线约 ${Math.round(muBiao.zhiXianJu)} 米。需要我带你去吗？`
      };
      setLiaoTianLieBiao([...xinLie, huiTiao]);
      ltBaoCun([{ role: 'user', wen }, huiTiao], wen);
    } catch (e) {
      setLiaoTianZhong(false);
      const cuoTiao = { role: 'cuo', wen: (e && e.message) || '目的地检索失败' };
      setLiaoTianLieBiao([...xinLie, cuoTiao]);
      ltBaoCun([{ role: 'user', wen }, cuoTiao], wen);
    }
  }
  // 「带我去」确认：这时才开始规划四种方式路线 + 打目的地旗标 + 弹方案窗问方式
  function queRenDaiQu() {
    const m = daiQuMuDi;
    if (!m) return;
    setDaiQuMuDi(null);
    if (daoHangPing) tingZhiDaiLu();
    setSouSuoMuDi({ ming: m.ming, lng: m.lng, lat: m.lat });
    if (!providerRef.current) {
      try {
        providerRef.current = chuangJianBmapWeb();
      } catch {
        /* SDK 未就绪时 guiHuaQuanBu 内部会兜住提示 */
      }
    }
    const dian = { uid: 'ai', lng: m.lng, lat: m.lat, ming: m.ming };
    muDiRef.current = { uid: 'ai', dian };
    setBuXingLuXian({ uid: 'ai', dian, zhuangTai: 'loading', chuXing });
    setLuXianZu({});
    guiHuaQuanBu(dian);
    setJiaoTongKai(true);
    const huiTiao = {
      role: 'ai',
      fangShiAn: true,
      wen: '🧭 好的，路线正在规划。你想用哪种方式过去？耗时由短到长排在下面，点一个我就按它带你走：'
    };
    setLiaoTianLieBiao(prev => [...prev, huiTiao]);
    ltBaoCun([huiTiao], null);
  }
  // 「先不去」：不画路线，礼貌收尾
  function juJueDaiQu() {
    setDaiQuMuDi(null);
    const huiTiao = {
      role: 'ai',
      wen: '好的，先不去。之后想走了再跟我说「带我去XX」就行，我随叫随到。'
    };
    setLiaoTianLieBiao(prev => [...prev, huiTiao]);
    ltBaoCun([huiTiao], null);
  }

  // zhiDing 可传推荐问法文本（点击芯片直接发送），不传则用输入框内容
  async function faQiLiaoTian(zhiDing) {
    const wen = (typeof zhiDing === 'string' ? zhiDing : liaoTianWen).trim();
    if (!wen || liaoTianZhong) return;
    const xinLie = [...liaoTianLieBiao, { role: 'user', wen }];
    setLiaoTianLieBiao(xinLie);
    setLiaoTianWen('');
    setLiaoTianZhong(true);
    // 体检进行中：词元判定导航意图先挂起（进度卡实时显示体检进度），大模型裁决等体检完成后进行
    if (runningRef.current && shiDaoHangYiTu(wen)) {
      daiDaoHangRef.current = wen;
      setLiaoTianZhong(false);
      setLiaoTianLieBiao([...liaoTianLieBiao.filter(m => m.role !== 'dai'), { role: 'dai', wen }]);
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
    // 大模型在场：语义判断交给 AI 自己——它回一行「【导航】地名」就是要导航，否则是正常回答。
    // 词元规则只在大模型未启用或调用失败时兜底
    const aiKai = !!(
      peiZhi &&
      peiZhi.ai &&
      peiZhi.ai.qiYong &&
      peiZhi.ai.apiDiZhi &&
      peiZhi.ai.miYao &&
      peiZhi.ai.moXing
    );
    if (aiKai) {
      let j = null;
      try {
        j = await aiLiaoTian(liaoTianLieBiao, wen, report, peiZhi && peiZhi.ai, {
          lng: center.lng,
          lat: center.lat,
          ming: curName
        });
      } catch {
        j = null; // 网络异常：掉到词元兜底
      }
      if (j && j.ok) {
        const hui = (j.hui || '').trim();
        setLiaoTianZhong(false);
        if (hui.startsWith('【导航】')) {
          // 大模型自己判断出这是导航请求，并给出了目的地名称
          await zhiXingDaoHang(hui.replace(/^【导航】/, '').trim(), wen, xinLie);
          return;
        }
        const huiTiao = { role: 'ai', wen: hui };
        setLiaoTianLieBiao([...xinLie, huiTiao]);
        ltBaoCun([{ role: 'user', wen }, huiTiao], wen);
        return;
      }
      // 模型调用失败：掉到词元兜底（导航走本地规则选点，不依赖模型）
    }

    // —— 词元兜底（AI 未启用 / 模型调用失败）：关键词导航意图 → 本地规则选点 + POI 检索 ——
    if (shiDaoHangYiTu(wen)) {
      const muMing = tiQuMuDiDi(wen);
      let dh = null;
      // 有报告：本地规则选点（兜底路径强制本地，不重试已失败的大模型）
      if (report) {
        dh = await aiXuanDian(wen, report, center, null);
        setDaoHangJie(dh);
      }
      if (dh && dh.ok) {
        setJiaoTongKai(true);
        dianJiSheShi(dh.poi, true);
      }
      if ((!dh || !dh.ok) && muMing) {
        await zhiXingDaoHang(muMing, wen, xinLie);
        return;
      }
      if (dh) {
        setLiaoTianZhong(false);
        const huiTiao = dh.ok
          ? {
              role: 'ai',
              wen: `🧭 带你去「${dh.poi.name}」：${dh.liYou}。路线已画在地图上，点地图上其他设施可随时换目的地。`
            }
          : { role: 'cuo', wen: dh.xinxi };
        setLiaoTianLieBiao([...xinLie, huiTiao]);
        ltBaoCun([{ role: 'user', wen }, huiTiao], wen);
        return;
      }
      // 没有报告、没有明确地名：给明确引导
      if (!report) {
        const tiTiao = {
          role: 'ai',
          wen: `还没有「${curName}」的体检结果。你可以：①直接说「我想去某个地方」（如「我想去广西博物馆」），我按地名检索并规划路线；②点「开始体检」完成一轮体检，我就能从真实设施里帮你选目的地。`
        };
        setLiaoTianZhong(false);
        setLiaoTianLieBiao([...xinLie, tiTiao]);
        ltBaoCun([{ role: 'user', wen }, tiTiao], wen);
        return;
      }
    }
    // 在线问答（AI 未启用时 aiLiaoTian 会返回配置引导）
    const j = await aiLiaoTian(liaoTianLieBiao, wen, report, peiZhi && peiZhi.ai, {
      lng: center.lng,
      lat: center.lat,
      ming: curName
    });
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
              placeholder="搜索地点，规划前往路线"
              value={souSuoWenBen}
              onChange={e => setSouSuoWenBen(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && souSuo()}
              onFocus={() => {
                setSouSuoLiShiBan(duSouSuoLiShi());
                setSouSuoMian(true);
              }}
              onBlur={() => setTimeout(() => setSouSuoMian(false), 200)}
            />
            <button
              className="search-btn"
              onClick={() => {
                setSouSuoLiShiBan(duSouSuoLiShi());
                souSuo();
              }}
            >
              <MorphIcon icon={Search} spring="snappy" size={15} />
              <span>搜索</span>
            </button>
            {/* 搜索面板：分类快捷 + 附近结果 + 历史记录（仿手机地图搜索页） */}
            {souSuoMian && (
              <div className="souSuo-mian" onMouseDown={e => e.preventDefault()}>
                <div className="souSuo-lei-lie">
                  {SOU_LEI.map(le => (
                    <button key={le.ming} className="souSuo-lei" onClick={() => souLei(le)}>
                      <span className="souSuo-lei-biao" style={{ background: le.se }}>
                        <MorphIcon icon={le.tu} size={11} spring="snappy" />
                      </span>
                      {le.ming}
                    </button>
                  ))}
                </div>
                {souSuoJie && (
                  <div className="souSuo-jie">
                    <div className="souSuo-jie-biao">
                      「{souSuoJie.lei}」附近
                      {souSuoFang ? ' 检索中…' : ` ${souSuoJie.lie.length} 个结果`}
                    </div>
                    {!souSuoFang && souSuoJie.lie.length === 0 && (
                      <div className="souSuo-kong">
                        {souSuoJie.cuo ? '检索失败（配额或网络）' : '附近 5 公里内没有找到'}
                      </div>
                    )}
                    {!souSuoFang &&
                      souSuoJie.lie.map((x, i) => (
                        <button key={i} className="souSuo-jie-xiang" onClick={() => dingWeiJieGuo(x)}>
                          <b>{x.ming}</b>
                          <span>
                            {x.di}
                            {x.ju != null ? ` · 约 ${Math.round(x.ju)} 米` : ''}
                          </span>
                        </button>
                      ))}
                  </div>
                )}
                <div className="souSuo-ls-ding">
                  <b>历史记录</b>
                  {souSuoLiShiBan.length > 0 && (
                    <button className="souSuo-ls-qing" onClick={qingSouSuoLiShi}>
                      清空
                    </button>
                  )}
                </div>
                {souSuoLiShiBan.length === 0 ? (
                  <div className="souSuo-kong">还没有搜索记录，搜一次就会留在这里</div>
                ) : (
                  souSuoLiShiBan.slice(0, 6).map(x => (
                    <button
                      key={x.w}
                      className="souSuo-ls-xiang"
                      onClick={() => {
                        setSouSuoWenBen(x.w);
                        yingYong({ lng: x.lng, lat: x.lat });
                        setSouSuoMian(false);
                      }}
                    >
                      <span className="souSuo-ls-sou">
                        <MorphIcon icon={History} size={13} spring="snappy" />
                      </span>
                      {x.w}
                    </button>
                  ))
                )}
              </div>
            )}
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
              className={`tog-btn ${kai.ai ? 'on' : ''}`}
              title={kai.ai ? '隐藏 AI 导航' : '显示 AI 导航'}
              onClick={() => qieHuanKai('ai')}
            >
              <MorphIcon icon={kai.ai ? Navigation : NavigationOff} spring="snappy" size={15} />
              AI 导航
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
          yongHuMangQu={fuJinMangQu}
          souSuoMuDi={souSuoMuDi}
          biaoJiKai={biaoJiZhong}
          onBiaoJiDianJi={biaoJiDianJi}
          onDaoHangBiaoJi={biaoJiDaoHangDian}
          juJiaoYongHu={juJiaoYongHu}
          buXing={buXing}
          xianshi={xianshi}
          ditu={ditu}
          onDitu={setDitu}
          daoHang={daoHangTai}
          xuanZhuan={shiJiaoXuan}
          gongJu={diTuGongJu}
          gongJuSheZhi={diTuGongJuSheZhi}
          luXianZu={luXianZu}
          yinLiangXian={yinLiangXian}
        />
        {/* 用户标记盲区：标记模式提示条 + 落点后的备注输入卡 */}
        {biaoJiZhong && !daiBiaoMangQu && (
          <div className="mq-biao-tiShi">📍 标记模式：点击地图上缺设施的位置 · 按 Esc 退出</div>
        )}
        {daiBiaoMangQu && (
          <div className="mq-biao-ka">
            <div className="mq-biao-biao">
              📍 标记盲区 · {daiBiaoMangQu.lng.toFixed(5)}, {daiBiaoMangQu.lat.toFixed(5)}
            </div>
            <input
              className="mq-biao-shu"
              autoFocus
              placeholder="这里缺什么？如：这个小区没有药店"
              value={yongHuBeiZhu}
              onChange={e => setYongHuBeiZhu(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') baoCunYongHuMangQu();
                if (e.key === 'Escape') {
                  setDaiBiaoMangQu(null);
                  setBiaoJiZhong(false);
                }
              }}
            />
            {mqCunCuo && <div className="mq-biao-cuo">{mqCunCuo}</div>}
            <div className="mq-biao-cao">
              <button className="mq-biao-cun" onClick={baoCunYongHuMangQu} disabled={mqCunZhong}>
                {mqCunZhong ? '保存中…' : '保存标记'}
              </button>
              <button
                className="mq-biao-qu"
                onClick={() => {
                  setDaiBiaoMangQu(null);
                  setBiaoJiZhong(false);
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}
        {/* 百度地图式全屏导航页（入口在 AI 导航卡对话里，地图上不再放按钮） */}
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
                  title={`切换为${c.ming}路线`}
                >
                  <MorphIcon icon={c.tu} size={13} spring="snappy" />
                  {c.ming}
                </button>
              ))}
            </div>
            {/* 操控：播放中给「暂停」，停住给「继续导航」（从当前里程接着走），走完给「重新导航」
                ——此前中途停下或到站后页面没有开始入口，只能退出；
                「标记此处」把当前小蓝点位置一键标成共享盲区，途中发现缺口随走随记 */}
            <div className="daoPing-cao">
              <button
                type="button"
                className={`daoPing-biao ${suiShouTai === 'ok' ? 'ok' : ''}`}
                onClick={suiShouBiaoJi}
                disabled={suiShouTai === 'cun'}
                title="把当前位置一键标成共享盲区（全员可见）"
              >
                <MorphIcon icon={MapPin} size={13} spring="snappy" />
                {suiShouTai === 'cun' ? '标记中…' : suiShouTai === 'ok' ? '已标记' : '标记此处'}
              </button>
              {/* 航向视角开关：默认北朝上画面稳定不晕；开了镜头才随行进方向旋转（航向朝上） */}
              <button
                type="button"
                className={shiJiaoXuan ? 'ok' : ''}
                onClick={() => setShiJiaoXuan(x => !x)}
                title={
                  shiJiaoXuan
                    ? '当前为航向朝上（镜头随行进方向旋转），点此切回北朝上（画面更稳不易晕）'
                    : '当前为北朝上（画面稳定），点此开启航向朝上（镜头随行进方向旋转，手机导航同款）'
                }
              >
                🧭 {shiJiaoXuan ? '航向' : '朝北'}
              </button>
              {gpsGenSui ? (
                /* GPS 实时跟随中：小蓝点由设备定位驱动，暂停/继续无意义，给一个切回模拟的出口 */
                <button
                  type="button"
                  className="ok"
                  onClick={tingZhiGpsGenSui}
                  title="正在按设备 GPS 实时定位跟随；点此切回模拟行走"
                >
                  📡 GPS 实时
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={qiDongGpsGenSui}
                    disabled={!buXing || buXing.zhuangTai !== 'ok'}
                    title="用设备 GPS 实时定位驱动小蓝点（走到哪蓝点到哪）；定位失败会停在原地并提示，不会自己往前走"
                  >
                    📡 GPS 跟随
                  </button>
                  {daoHangTai && daoHangTai.kai ? (
                    <button type="button" onClick={zhanTingBoFang} title="暂停模拟行走">
                      ⏸ 暂停
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        kaiShiDaiLu(
                          null,
                          daoHangTai &&
                            daoHangTai.quanChengM > 0 &&
                            daoHangTai.jinDuM >= daoHangTai.quanChengM - 1
                            ? 0
                            : daoHangTai
                              ? daoHangTai.jinDuM
                              : 0
                        )
                      }
                      disabled={!buXing || buXing.zhuangTai !== 'ok'}
                      title={
                        !buXing || buXing.zhuangTai !== 'ok'
                          ? '当前没有可用路线：请先选目的地或设中心点后重新规划'
                          : '从当前位置继续模拟行走'
                      }
                    >
                      {!buXing || buXing.zhuangTai !== 'ok'
                        ? '🚫 暂无路线'
                        : daoHangTai &&
                            daoHangTai.quanChengM > 0 &&
                            daoHangTai.jinDuM >= daoHangTai.quanChengM - 1
                          ? '🔁 重新导航'
                          : '▶ 继续导航'}
                    </button>
                  )}
                </>
              )}
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
        {/* 路线提示条：仅在非导航状态显示——导航页顶部横幅占同一位置，
            且全程/剩余信息导航页里本来就有，留着只会压住导航横幅 */}
        {buXing && !daoHangPing && (
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
              可点下面「重新定位」再试；也可在地图上<b>双击</b>
              选点后点「设为中心点」确认，或直接拖动地图上的蓝色图钉。
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
                onChange={e => qieHuanZhongXin({ ...center, lng: Number(e.target.value) })}
              />
            </div>
            <div className="mini-field">
              <label>中心点纬度</label>
              <input
                type="number"
                step="0.0001"
                value={center.lat}
                onChange={e => qieHuanZhongXin({ ...center, lat: Number(e.target.value) })}
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
                title={`切换为${c.ming}路线`}
              >
                <MorphIcon icon={c.tu} size={13} spring="snappy" />
                {c.ming}
              </button>
            ))}
          </div>
        )}
        {daoHangJie && !daoHangJie.ok && !daoHangJie.zhuangTai && (
          <div className="a-tip a-tip-err">{daoHangJie.xinxi}</div>
        )}
        {/* 已选路线摘要行：所有出行方式统一，点开看方案窗口 */}
        {buXing && buXing.zhuangTai === 'ok' && (
          <button
            className="jiaoTong-zhaiYao"
            onClick={() => setJiaoTongKai(true)}
            title="点开查看路线方案"
          >
            <span className="jiaoTong-zhai-shi">
              {buXing.durationSec < 90
                ? `${Math.max(1, Math.round(buXing.durationSec))}秒`
                : `${Math.floor(buXing.durationSec / 3600) > 0 ? `${Math.floor(buXing.durationSec / 3600)}小时` : ''}${Math.round((buXing.durationSec % 3600) / 60)}分`}
            </span>
            <span className="jiaoTong-zhai-xian">
              {(() => {
                const zu = luXianZu.transit;
                if (chuXing === 'transit' && zu && zu.fangAn && zu.fangAn[zu.xuan || 0]) {
                  return zu.fangAn[zu.xuan || 0].xian
                    .map(x => `${x.lei === 'ditie' ? '🚇' : '🚌'}${x.ming}`)
                    .join(' → ');
                }
                return (CHU_XING.find(c => c.jian === chuXing) || CHU_XING[0]).ming + ' · 真实路网';
              })()}
            </span>
            <span className="jiaoTong-zhai-kan">
              {chuXing === 'transit' ? '全部方案 ›' : '路线方案 ›'}
            </span>
          </button>
        )}

        <div className="divider" />

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
                  <div className="lt-dai-jin-wai">
                    <div className="lt-dai-jin">
                      <i style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} />
                    </div>
                    {/* 跑步小人：站在进度条上方用脚跑（外层不裁剪，避免被条内 overflow 藏掉），终点插旗 */}
                    <span
                      className="lt-dai-pao"
                      style={{ left: `${Math.min(100, Math.round(progress * 100))}%` }}
                    >
                      🏃
                    </span>
                    <span className="lt-dai-zhong">🏁</span>
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
                <div className={`lt-qiPao ${m.role}`}>
                  {m.wen}
                  {/* 「需要我带你去吗」确认按钮：点了带我去才开始规划路线 */}
                  {m.quRen && (
                    <div className="lt-fangShi">
                      <button className="lt-fangAn on" onClick={queRenDaiQu}>
                        <MorphIcon icon={Navigation} size={13} spring="snappy" />
                        带我去
                      </button>
                      <button className="lt-fangAn" onClick={juJueDaiQu}>
                        先不去
                      </button>
                    </div>
                  )}
                  {/* 「你想怎么去」方式卡：实时读各方式规划结果，耗时由短到长排列（规划中垫底） */}
                  {m.fangShiAn &&
                    (CHU_XING.some(c => luXianZu[c.jian]) ? (
                      <div className="lt-fangShi">
                        {CHU_XING.map(c => {
                          const l = luXianZu[c.jian];
                          return {
                            jian: c.jian,
                            ming: c.ming,
                            tu: c.tu,
                            miao: l && l.zhuangTai === 'ok' ? l.durationSec : null,
                            wu: l && l.zhuangTai === 'fail', // 该方式规划失败：没有当前方案
                            // 步行超过 25 分钟视为「较远」，卡片上明示不建议步行
                            yuan: c.jian === 'walk' && l && l.zhuangTai === 'ok' && l.durationSec > 1500
                          };
                        })
                          .sort(
                            (a, b) =>
                              (a.miao == null ? 1 : 0) - (b.miao == null ? 1 : 0) ||
                              a.miao - b.miao
                          )
                          .map(x => (
                            <button
                              key={x.jian}
                              className={`lt-fangAn ${chuXing === x.jian ? 'on' : ''}`}
                              onClick={() => xuanAiChuXing(x.jian)}
                              disabled={x.wu}
                              title={
                                x.wu
                                  ? `${x.ming}没有当前方案，请选择其他出行方式`
                                  : x.miao != null
                                    ? `按${x.ming}规划路线（约${haoShiWen(x.miao)}）`
                                    : `${x.ming}路线规划中…`
                              }
                            >
                              <MorphIcon icon={x.tu} size={13} spring="snappy" />
                              {x.ming} ·{' '}
                              {x.wu
                                ? '无方案'
                                : x.miao != null
                                  ? `约${haoShiWen(x.miao)}${x.yuan ? '（较远）' : ''}`
                                  : '规划中…'}
                            </button>
                          ))}
                      </div>
                    ) : (
                      <span className="lt-fangShi-guoQi">
                        （本次路线已失效，重新说「带我去…」即可再规划）
                      </span>
                    ))}
                </div>
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
          {!report && !tijianCuo && (
            <div className="empty-tip">
              算法盲区在完成一轮体检后自动生成；手动标记的盲区显示在下方「共享盲区标记」，两者相互独立。
            </div>
          )}
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
                  面积≈{(m.areaM2 / 10000).toFixed(1)} 万㎡ · 预计覆盖约 {m.yujiFugaiRenkou}{' '}
                  人（按人口密度估算）
                  <br />
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

          {/* 用户共享盲区标记：算法之外的真实缺口，登录后在地图上补标，全员实时共享 */}
          <div className="sec-title yh-mq-biao">
            <span>共享盲区标记（{fuJinMangQu.length}）</span>
            <span className="yh-mq-biao-an">
              <button
                className="mq-biao-an pos"
                onClick={biaoJiWoDeWeiZhi}
                disabled={mqDwZhong}
                title={yongHu ? '用浏览器定位，把盲区标在我当前位置' : '登录后才能标记'}
              >
                {mqDwZhong ? '🛰 定位中…' : '🛰 我的位置'}
              </button>
              <button
                className={`mq-biao-an ${biaoJiZhong ? 'on' : ''}`}
                onClick={() => {
                  if (!yongHu) {
                    setDengLuKai(true); // 标记必须登录
                    return;
                  }
                  setMqDwCuo('');
                  setBiaoJiZhong(!biaoJiZhong);
                  setDaiBiaoMangQu(null);
                }}
                title={yongHu ? '点地图位置补标盲区' : '登录后才能标记'}
              >
                {biaoJiZhong ? '点地图落标记…' : '📍 标记盲区'}
              </button>
            </span>
          </div>
          {mqDwCuo && <div className="a-tip a-tip-err">{mqDwCuo}</div>}
          {mqFuWuCuo && <div className="empty-tip">服务未连接，共享标记功能需要本地服务在线。</div>}
          {!mqFuWuCuo && fuJinMangQu.length === 0 && (
            <div className="empty-tip">
              {yongHu
                ? '附近 2 公里内还没有标记。点「📍 标记盲区」或「🛰 我的位置」补上算法没发现的缺口。'
                : '登录后即可在地图上标记盲区，所有人的标记实时共享显示。'}
            </div>
          )}
          {yinCangShu > 0 && (
            <div className="empty-tip">已隐藏 {yinCangShu} 个距离当前位置 2 公里外的标记。</div>
          )}
          {fuJinMangQu.map(m => (
            <div className="mq-item" key={m.id}>
              <div className="mq-head">
                <b>📍 自标</b>
                <span className="mq-tag user">{m.zhangHao}</span>
                <button
                  className="mq-biaoJi"
                  onClick={() => setJuJiaoYongHu({ dian: m.weiZhi, ci: Date.now() })}
                  title="在地图上定位该标记"
                >
                  定位
                </button>
                {((yongHu && m.zhangHao === yongHu.zhangHao) || guanLiYuanZai) && (
                  <button
                    className="mq-biaoJi"
                    onClick={() => shanYongHuMangQu(m.id)}
                    title={
                      guanLiYuanZai && !(yongHu && m.zhangHao === yongHu.zhangHao)
                        ? '管理员删除'
                        : '删除该标记（仅限本人）'
                    }
                  >
                    删除
                  </button>
                )}
              </div>
              <div className="mq-body">
                {m.beiZhu}
                <br />
                <span className="mq-shiJian">
                  {new Date(m.shiJian).toLocaleString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}{' '}
                  · ({m.weiZhi.lng.toFixed(5)}, {m.weiZhi.lat.toFixed(5)})
                </span>
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
      {/* 路线方案弹窗：公交展示多方案卡，步行/骑行/驾车展示单张路线卡 */}
      {jiaoTongKai && (
        <div className="admin-mask" onClick={() => setJiaoTongKai(false)}>
          <div className="admin-panel jiaoTong-chuang" onClick={e => e.stopPropagation()}>
            <div className="admin-head">
              <div className="panel-title">
                {chuXing === 'transit' ? '🚌 公交方案' : '🧭 路线方案'}
              </div>
              <button className="lt-ls-guan" onClick={() => setJiaoTongKai(false)}>
                关闭
              </button>
            </div>
            {/* 方式标签：点谁就采用谁的路线（地图上同时显示全部，选中的加粗） */}
            <div className="jiaoTong-fangShi">
              {CHU_XING.map(c => {
                const x = luXianZu[c.jian];
                const zt = x ? x.zhuangTai : 'wei';
                return (
                  <button
                    key={c.jian}
                    className={`jiaoTong-fang ${chuXing === c.jian ? 'on' : ''}`}
                    onClick={() => qieHuanChuXing(c.jian)}
                    title={
                      zt === 'loading'
                        ? '规划中…'
                        : zt === 'fail'
                          ? '该方式规划失败'
                          : '采用该方式的路线'
                    }
                  >
                    <MorphIcon icon={c.tu} size={13} spring="snappy" />
                    {c.ming}
                    <i className={`jiaoTong-dian ${zt}`} />
                  </button>
                );
              })}
            </div>
            {(() => {
              const x = luXianZu[chuXing];
              const zaiJia = x && x.zhuangTai === 'loading';
              const shiBai = x && x.zhuangTai === 'fail';
              const ok = x && x.zhuangTai === 'ok';
              if (zaiJia || (!x && muDiRef.current)) {
                return (
                  <div className="empty-tip" style={{ padding: '26px 14px' }}>
                    正在沿真实路网规划「
                    {(CHU_XING.find(c => c.jian === chuXing) || CHU_XING[0]).ming}
                    」路线…
                  </div>
                );
              }
              if (shiBai) {
                return (
                  <div className="empty-tip" style={{ padding: '26px 14px' }}>
                    没有当前方案——目的地可能不在该方式的覆盖范围内，请选择其他出行方式。
                  </div>
                );
              }
              if (!ok) {
                return (
                  <div className="empty-tip" style={{ padding: '26px 14px' }}>
                    还没有路线——先完成体检或选择目的地。
                  </div>
                );
              }
              if (chuXing === 'transit') {
                // 公交规划成功但 0 条方案（郊区 / 超出公交覆盖）：明确提示换方式，而不是渲染空列表
                const gongJiaoLie = x.fangAn || [];
                if (!gongJiaoLie.length) {
                  return (
                    <div className="empty-tip" style={{ padding: '26px 14px' }}>
                      没有当前方案——起点周边没有可达的公交换乘，请选择其他出行方式。
                    </div>
                  );
                }
                return (
                  <>
                    {/* 公交偏好：跟随百度官方枚举 */}
                    <div className="jiaoTong-ceLue">
                      {[
                        [0, '综合推荐'],
                        [1, '地铁优先'],
                        [2, '少换乘'],
                        [3, '少步行'],
                        [4, '不坐地铁']
                      ].map(([v, biao]) => (
                        <button
                          key={v}
                          className={`ceLue-an ${gongJiaoCe === v ? 'on' : ''}`}
                          onClick={() => {
                            setGongJiaoCe(v);
                            chongXinGuiHuaDan('transit');
                          }}
                          disabled={zaiGuiHuaRef.current}
                        >
                          {biao}
                        </button>
                      ))}
                    </div>
                    <div className="jiaoTong-lieBiao">
                      {x.fangAn &&
                        x.fangAn.map((f, i) => {
                          const h = Math.floor(f.haoShiMiao / 3600);
                          const m = Math.round((f.haoShiMiao % 3600) / 60);
                          const huan = f.xian.filter(y => y.lei !== 'walk').length - 1;
                          return (
                            <button
                              key={i}
                              className={`jiaoTong-ka ${(x.xuan || 0) === i ? 'on' : ''}`}
                              onClick={() => xuanJiaoTongFangAn(i)}
                              title="选用该方案画路线"
                            >
                              <div className="jiaoTong-ka-ding">
                                <b className="jiaoTong-shi">
                                  {f.haoShiMiao < 90
                                    ? `${Math.max(1, Math.round(f.haoShiMiao))}秒`
                                    : `${h > 0 ? `${h}小时` : ''}${m}分`}
                                </b>
                                <span className="jiaoTong-biao">
                                  {i === 0 ? '综合最优' : `备选${i}`}
                                </span>
                              </div>
                              <div className="jiaoTong-fu">
                                步行 {Math.round(f.buXingMi)} 米 · {f.xian.length} 段
                                {huan > 0 ? ` · 换乘 ${huan} 次` : ' · 直达'}
                              </div>
                              <div className="jiaoTong-xian">
                                {f.xian.map((y, k) => (
                                  <span key={k} className={`jiaoTong-xian-an ${y.lei}`}>
                                    {y.lei === 'ditie' ? '🚇 ' : '🚌 '}
                                    {y.ming}
                                  </span>
                                ))}
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </>
                );
              }
              // 步行 / 骑行 / 驾车：单张路线卡 + 偏好
              const shiBu = chuXing === 'walk' || chuXing === 'riding';
              return (
                <>
                  {chuXing === 'driving' && (
                    <div className="jiaoTong-ceLue">
                      {[
                        [0, '常规'],
                        [1, '躲避拥堵'],
                        [2, '高速优先'],
                        [3, '少收费']
                      ].map(([v, biao]) => (
                        <button
                          key={v}
                          className={`ceLue-an ${jiaShiCe === v ? 'on' : ''}`}
                          onClick={() => {
                            setJiaShiCe(v);
                            chongXinGuiHuaDan('driving');
                          }}
                          disabled={zaiGuiHuaRef.current}
                        >
                          {biao}
                        </button>
                      ))}
                    </div>
                  )}
                  {shiBu && (
                    <div className="jiaoTong-ceLue">
                      <button
                        className={`ceLue-an ${yinLiangKai ? 'on' : ''}`}
                        onClick={() => setYinLiangKai(!yinLiangKai)}
                        title="沿路 45 米内有公园绿地即视为阴凉路段，绿色加粗显示"
                      >
                        🌳 阴凉路段高亮
                      </button>
                      <span className="ceLue-shuo">
                        {yinLiangXian
                          ? yinLiangXian.mi > 0
                            ? `阴凉路段约 ${yinLiangXian.mi} 米（绿色标出）`
                            : '本路线暂未识别到阴凉路段'
                          : '…'}
                      </span>
                    </div>
                  )}
                  <div
                    className="jiaoTong-ka on"
                    onClick={() => {
                      // 点路线卡本体 = 直接开始导航：导航用的是当前采用方式同步后的路线（buXing）
                      kaiShiDaiLu();
                      setJiaoTongKai(false);
                    }}
                    title="点击直接开始导航（模拟走完这条路线）"
                  >
                    <div className="jiaoTong-ka-ding">
                      <b className="jiaoTong-shi">
                        {x.durationSec < 90
                          ? `${Math.max(1, Math.round(x.durationSec))}秒`
                          : `${Math.floor(x.durationSec / 3600) > 0 ? `${Math.floor(x.durationSec / 3600)}小时` : ''}${Math.round((x.durationSec % 3600) / 60)}分`}
                      </b>
                      <span className="jiaoTong-biao">
                        {(CHU_XING.find(c => c.jian === chuXing) || CHU_XING[0]).ming} · 真实路网
                      </span>
                    </div>
                    <div className="jiaoTong-fu">
                      全程 {Math.round(x.distanceM)} 米 · 点击本卡直接开始导航
                      {chuXing === 'walk' && x.durationSec > 1500
                        ? ' · 步行较远，可考虑驾车 / 公交'
                        : ''}
                    </div>
                  </div>
                </>
              );
            })()}
            <div className="lt-ls-tiShi">
              地图同时显示各方式路线，当前采用的加粗；点路线卡即可直接开始导航。
            </div>
          </div>
        </div>
      )}
      <DengLu open={dengLuKai} onClose={() => setDengLuKai(false)} onDengLu={setYongHu} />
      {/* 「标记此处」小窗：确认当前位置并填备注（可不填）后落库共享 */}
      {suiShouKa && (
        <div className="admin-mask" onClick={() => setSuiShouKa(null)}>
          <div className="admin-panel suiShou-ka" onClick={e => e.stopPropagation()}>
            <div className="admin-head">
              <div className="panel-title">标记此处 · 共享盲区</div>
              <button className="a-btn a-btn-ghost" onClick={() => setSuiShouKa(null)}>
                关闭
              </button>
            </div>
            <div className="admin-body">
              <div className="a-tip">
                当前位置（{suiShouKa.lng.toFixed(5)}, {suiShouKa.lat.toFixed(5)}）
                {suiShouKa.juText ? ` · ${suiShouKa.juText}` : ''}
              </div>
              <div className="a-field">
                <span className="a-label">备注（可不填，60 字内）</span>
                <input
                  className="a-input"
                  placeholder="例：这段路缺路灯 / 人行道被占"
                  value={suiShouBei}
                  onChange={e => setSuiShouBei(e.target.value)}
                  maxLength={60}
                />
              </div>
              {suiShouCuo && (
                <div className="a-tip a-tip-err">
                  {suiShouCuo}
                </div>
              )}
              <button className="a-btn a-btn-primary" onClick={queRenSuiShou} disabled={suiShouTai === 'cun'}>
                {suiShouTai === 'cun' ? '保存中…' : '保存标记'}
              </button>
            </div>
          </div>
        </div>
      )}
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
            qieHuanZhongXin(
              { lng: r.zhongXin.lng, lat: r.zhongXin.lat },
              r.zhongXin.ming || '历史体检社区'
            );
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
