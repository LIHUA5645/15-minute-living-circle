// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 地图首页（小程序打开的第一屏）：地图占满屏，操作与结论浮在上面。
//   · 顶部定位条：显示社区名与坐标，点开可选「用当前位置 / 地图上选点」
//   · 中部图层胶囊：等时圈 / 设施 / 盲区 / 我的标记
//   · 底部主卡：体检入口与进度、总分等级盲区数、参数折叠面板、数据通道脚注
//   · 点地图：就近命中盲区或设施，弹卡片（可算步行路线、导航、设为体检中心）
// 未体检时先画一个「预估可达圈」示意 15 分钟大体范围，让人一眼知道这次体检会覆盖多大。
import { plat, biaoTab } from '../plat.js';
import { fuWu } from '../peizhi.js';
import { duTai, duBaoGao, sheXianShi, sheZhongXin, cunBaoGao, quDaiXu, qingDaiXu } from '../zhuangTai.js';
import { paoYiLunTiJian, JIE_DUAN_MING } from '../tijian.js';
// AI 半屏浮层：在地图上直接问，不跳页（会话与助手页共用同一份存储，所以关掉后记录还在历史里）。
// 这套逻辑与生活圈页共用一份实现 —— 见 common/aiFu.js
import { AI_FU_SHU_JU, AI_FU_FANG_FA } from '../aiFu.js';
import { chuangJianBmapXcx, quTianQi } from '../adapters/bmapXcx.js';
import { zhaoHuWen } from '../ai.js';
// 周边地名与水域共用同一个 OSM 适配器（见该文件头部说明：刻意不新增文件，免得工具的模块表识别不到）
import { huoZhouBian } from '../adapters/shuiyuXcx.js';
import { gcjDaoWgs, wgsDaoGcj } from '../zuobiao.js';
import {
  dengShiQuanPolygons,
  shuiDuanLines,
  sheShiMarkers,
  mangQuCircles,
  mangQuBanJing,
  buJianMarkers,
  zhongXinMarkers,
  luXianPolyline,
  dianHui,
  dian,
  juLiMi,
  geShiMianJi,
  mangSe,
  fenSe,
  dengJiMing,
  FENLEI_SE
} from '../bidui.js';
import { FENLEI_MING } from '../../core/types.js';

const V_BUXING = 80; // 与引擎一致：步行速度 米/分钟
const K_RAOLU = 1.25; // 与引擎一致：路网绕行系数
// 设施图层的六类细分：顺序与 Web 端「设施图层」一致（tai.xianshi 里就是这几个键）
const SHE_SHI_LEI = ['yiliao', 'jiaoyu', 'gouwu', 'yanglao', 'jiaotong', 'xiuxian'];

// 搜索：以体检中心为圆心搜这么大范围（比体检的 1500 米大一些，找东西要广），最多回这么多条
const SOU_BAN_JING = 3000;
const SOU_ZUI_DUO = 12;
// 搜索面板的分类快捷：与网页端 SOU_LEI 同一套词、同一套徽章色（ci 是百度地点检索的关键词）。
// 图标是网页端同批 lucide 的 CSS 复刻（tu 对应 app.wxss 的 .ic-*），颜色随类别
const SOU_KUAI = [
  { tu: 'ic-ms', ming: '美食', ci: '美食', se: '#ff8f1f' },
  { tu: 'ic-jd', ming: '酒店', ci: '酒店', se: '#2f86f7' },
  { tu: 'ic-jn', ming: '景点', ci: '旅游景点', se: '#12b76a' },
  { tu: 'ic-cd', ming: '充电', ci: '充电站', se: '#f5b800' },
  { tu: 'ic-jy', ming: '加油', ci: '加油站', se: '#e5484d' },
  { tu: 'ic-xs', ming: '休闲', ci: '公园', se: '#1a8f57' },
  { tu: 'ic-sc', ming: '商场', ci: '购物中心', se: '#7c5cf0' }
];

// 天气的缓存与现象→图标映射抽到了 common/tianQi.js（AI 助手的天气感知共用同一份缓存）；
// 这里只负责展示：拉到就写进 data，拉不到留空

// 出行方式：与网页端 CHU_XING 同一套（步行 / 骑行 / 驾车 / 公交）。
// 网页端四种并行算好再让用户挑，小程序端**点哪个算哪个** —— 百度配额有限，没必要一次花四份
const LU_MO = [
  { mo: 'walking', ming: '步行', tu: 'ic-bu' },
  { mo: 'riding', ming: '骑行', tu: 'ic-qi' },
  { mo: 'driving', ming: '驾车', tu: 'ic-jia' },
  { mo: 'transit', ming: '公交', tu: 'ic-gong' }
];

// 公交算路要城市名：从「广东省广州市越秀区北京街道府前路」里取「广州市」，取不到用「中国」兜底
// （与网页端跳百度地图时取城市段的思路一致）
function chengShiDuan(diMing) {
  const m = String(diMing || '').match(/[\u4e00-\u9fa5]{2,6}市/);
  return m ? m[0] : '中国';
}

// 路线摘要：1 公里以内按米、超过按公里（一位小数）；超 1 小时按「X 小时 Y 分钟」
function luXianWen(mo, x) {
  const m = LU_MO.find(i => i.mo === mo);
  const ju = x.distanceM >= 1000 ? `${(x.distanceM / 1000).toFixed(1)} 公里` : `${Math.round(x.distanceM)} 米`;
  const miao = Number(x.durationSec) || 0;
  const shi =
    miao >= 3600
      ? `${Math.floor(miao / 3600)} 小时 ${Math.round((miao % 3600) / 60)} 分钟`
      : `${Math.max(1, Math.round(miao / 60))} 分钟`;
  return `${m ? m.ming : ''}约 ${shi} · ${ju}`;
}

function shiJianWen(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 盲区卡片内容（点击命中、从报告页聚焦两处共用）
function mangKa(m) {
  return {
    lei: 'mangqu',
    biaoTi: `盲区 ${m.id}（${m.level === 'red' ? '重度' : '轻度'}）`,
    se: mangSe(m.level),
    hang: [
      `缺口：${(m.quekou || []).join('、') || '便民设施'}`,
      `面积：${geShiMianJi(m.areaM2)}`,
      m.yujiFugaiRenkou ? `预计影响人口：约 ${m.yujiFugaiRenkou} 人` : '',
      m.buJianDian ? `建议补建点：${m.buJianDian.lng.toFixed(5)}, ${m.buJianDian.lat.toFixed(5)}` : ''
    ].filter(Boolean),
    jianYi: m.jianyi || '',
    mangQu: m
  };
}

export function chuangJianDiTu() {
  return {
    data: {
      // 地图
      latitude: 28.2281,
      longitude: 112.9388,
      scale: 15,
      polygons: [],
      circles: [],
      markers: [],
      polyline: [],
      // 顶部定位条
      diMing: '点击定位',
      youZhongXin: false,
      zhongXinWen: '',
      dingWeiZhong: false,
      xuanDianKai: false,
      // 定位周边推荐（「切换」面板顶部那一排）：定位只给一个坐标，得翻译成能点的地名
      zhouBian: [],
      zhouBianZhong: false,
      // AI 半屏浮层（字段与生活圈页共用同一份，见 common/aiFu.js）
      ...AI_FU_SHU_JU,
      youYongHu: false,
      yongHuHao: '',
      // 图层：等时圈 / 盲区 / 我的标记各一个总开关；设施另按六类细分（见 sheShiLie）
      xianShi: { iso: true, mangqu: true, yonghu: true },
      // 六类面板默认展开：藏在「点设施胶囊才展开」里太隐蔽（用户反馈"一直找不到"），
      // 进页面就把医疗/教育/购物/养老/交通/休闲摆在图层胶囊下面；嫌它占地就点「设施」收起
      sheShiKai: true,
      sheShiLie: [], // 六类胶囊的展示数据（名称 / 类别色 / 选中态）
      youSheShi: true, // 六类里是否还有在显示的（「设施」胶囊亮不亮）
      youJiuSheShi: false, // 存储里有没有上次体检的设施散点（冷启动后地图仍能画出来，见 huaTuCeng）
      tianQiWen: '', // 主卡右上角的当前位置天气（「26° 多云」），拉不到就留空、不占位
      tianQiTu: '', // 天气现象对应的图标类（.ic-tq-*，由 tianQiTu(wen) 映射）
      daoHang: null, // 站内模拟导航态：{ shengMi, miao } 行进中 | { daoDa: true } 已到达 | null 未导航
      // 底部主卡
      youBaoGao: false,
      total: 0,
      dengJiWen: '',
      fenSe: '#8a93a3',
      mangQuShu: 0,
      shiJianWen: '',
      running: false,
      jinDu: 0,
      jieDuanWen: '',
      // 信息卡
      ka: null,
      luZhong: false, // 算路中（点出行方式胶囊之后）
      luMo: 'walking', // 当前算的出行方式（决定哪个胶囊高亮）
      luMoLie: LU_MO.map(i => ({ ...i })),
      luXianWen: '', // 路线摘要（「骑行约 5 分钟 · 1.2 公里」）
      // 搜索：平时只在顶条里露一个放大镜，点开后整条换成输入行
      souKai: false,
      souWen: '',
      souLie: [],
      souZhong: false,
      souFanWeiWen: SOU_BAN_JING >= 1000 ? `${SOU_BAN_JING / 1000} 公里` : `${SOU_BAN_JING} 米`,
      souKuai: SOU_KUAI,
      souLiShi: [], // 搜索历史（点结果时才记，按账号分开存）
      // 地图工具（路况 / 卫星 / 3D）：与网页端工具条同一套开关。
      // 三个开关落到 map 组件上统一走 setting —— 微信文档明确：skew / rotate 这类动画属性
      // 分开 setData 不会同时生效，必须经 setting 一起改；3D 要 enable3D + enableOverlooking + skew 三者齐
      luKuang: false,
      weiXing: false,
      qingXie: false,
      diTuGong: {
        enableTraffic: false,
        enableSatellite: false,
        enable3D: false,
        enableOverlooking: false,
        skew: 0
      }
    },

    onLoad() {
      this.shuaTai();
      this.huaTuCeng();
      this.laYongHuMangQu();
      // 第一屏就是地图：没定过位就直接静默定位一次，省得用户先点一下
      if (!duTai().zhongXin) this.dingWei(true);
      else this.laTianQi();
    },

    onShow() {
      // 微信端自定义 tabBar 要页面自己回报选中项（图标是 CSS 自绘的，见 custom-tab-bar/）
      biaoTab(this, 0);
      this.shuaTai();
      this.huaTuCeng();
      // AI 浮层打开时的状态总结卡（与助手页同源文案，不入库）
      quTianQi(duTai().zhongXin).then(tq => {
        this.setData({ zhaoHu: zhaoHuWen(duBaoGao(), tq, duTai().diMing) });
      });
      // 报告页浮层「带我去」接力：目的地已挂在全局，落地成卡片 + 路线 + 站内导航
      if (duTai().juJiaoDaoHang) {
        this.daoHangSheShi = duTai().juJiaoDaoHang;
        duTai().juJiaoDaoHang = null;
        this.daoHangDaoSheShi();
      }
      // 从 AI 的「去地图页跑一轮体检」过来：直接开跑，不用用户再点一次「开始体检」
      if (quDaiXu() && !duBaoGao() && !this.data.running) {
        if (duTai().zhongXin) {
          plat.toast({ title: '正在按刚才的问题跑一轮体检…' });
          this.kaiShiTiJian();
        } else {
          qingDaiXu();
          plat.toast({ title: '先定好位置，我再按刚才的问题跑体检' });
        }
      }
      const t = duTai();
      if (t.juJiaoMangQu) {
        const r = duBaoGao();
        const m = r && (r.mangquList || []).find(x => x.id === t.juJiaoMangQu);
        if (m) this.juJiaoMangQu(m);
        t.juJiaoMangQu = '';
      }
    },

    /* ── 状态回填 ── */
    shuaTai() {
      const t = duTai();
      const r = duBaoGao();
      const g = t.zhongXin ? wgsDaoGcj(t.zhongXin) : null;
      const xs = { iso: true, mangqu: true, yonghu: true, ...t.xianshi };
      const nong = {
        youYongHu: !!(t.yongHu && t.yongHu.zhangHao),
        yongHuHao: (t.yongHu && t.yongHu.zhangHao) || '',
        youZhongXin: !!t.zhongXin,
        // 旧版本会把「定位中…」持久化进摘要（定位中途被打断就永远卡住），恢复时归位
        diMing: t.zhongXin ? (t.diMing === '定位中…' ? '位置已就绪' : t.diMing || '体检中心') : '点击定位',
        zhongXinWen: g ? `${g.lng.toFixed(5)}, ${g.lat.toFixed(5)}` : '',
        xianShi: xs,
        ...this.sheShiZhuangTai(xs)
      };
      if (g) {
        nong.latitude = g.lat;
        nong.longitude = g.lng;
      }
      if (r) {
        nong.youBaoGao = true;
        nong.total = r.total;
        nong.dengJiWen = dengJiMing(r.dengji);
        nong.fenSe = fenSe(r.total);
        nong.mangQuShu = (r.mangquList || []).length;
        nong.shiJianWen = shiJianWen(t.baoGaoShi || (t.shangCi && t.shangCi.shiJian) || Date.now());
      } else if (t.shangCi && t.shangCi.poi) {
        // 内存里没有报告，但存储里有上次的设施副本：地图照样有标记（见 huaTuCeng），
        // 底部与面板各用一句说明区分口径 —— 别让人以为这是本轮结果
        nong.youJiuSheShi = true;
      }
      this.setData(nong);
    },

    /* ── 定位 / 选点 ── */
    qieKaiXuanDian() {
      const kai = !this.data.xuanDianKai;
      this.setData({ xuanDianKai: kai });
      // 打开面板顺手拉一次周边地名（服务端有网格缓存，很快；还没定位就先不拉）
      if (kai && !this.data.zhouBian.length) this.laZhouBian();
    },

    /* 定位周边推荐：把「你在哪」翻译成一排能点的地名。首项固定是当前中心，其余按距离由近到远；
       服务端拿不到就只剩首项（如实，不自己编地名） */
    laZhouBian() {
      const t = duTai();
      if (!t.zhongXin || this.data.zhouBianZhong) return;
      const zx = t.zhongXin;
      const dangQian = {
        ming: t.diMing || '当前位置',
        fu: '当前体检中心',
        lng: zx.lng,
        lat: zx.lat,
        dangQian: true
      };
      this.setData({ zhouBianZhong: true });
      huoZhouBian(zx, 2500).then(lie => {
        // 与「当前位置」几乎重合的地名（OSM 里多半就是它自己）不再重复出现
        const qiTa = lie
          .filter(x => juLiMi(zx, x) > 60)
          .map(x => ({
            ming: x.ming,
            fu: x.juMi >= 1000 ? `${(x.juMi / 1000).toFixed(1)}km` : `${x.juMi} 米`,
            lng: x.lng,
            lat: x.lat,
            dangQian: false
          }));
        this.setData({ zhouBian: [dangQian, ...qiTa], zhouBianZhong: false });
      });
    },

    /* 点周边地名：把那一点设成体检中心（与「在地图上选点」同一个出口），收起面板并重画图层 */
    dianZhouBian(e) {
      const i = Number(e.currentTarget.dataset.i);
      const p = this.data.zhouBian[i];
      if (!p) return;
      sheZhongXin({ lng: p.lng, lat: p.lat }, p.ming);
      this.setData({ xuanDianKai: false, ka: null, zhouBian: [] });
      this.shuaTai();
      this.huaTuCeng();
      plat.toast({ title: '已切换体检中心，可以开始体检了' });
    },

    /* 主卡右上角的当前位置天气（「26° 多云」）：缓存与现象映射都在 common/tianQi.js，
       AI 助手的天气感知共用同一份缓存。失败静默 —— 天气是锦上添花，不该弹错打扰体检主流程 */
    laTianQi() {
      quTianQi(duTai().zhongXin).then(x => {
        if (x) this.setData({ tianQiWen: `${x.wendu}° ${x.wen}`.trim(), tianQiTu: x.tu });
      });
    },

    /* AI 浮层选好目的地（aiXuanDian 落到真实设施）：弹卡片 → 自动算步行路线 → 自动开站内导航。
       报告页浮层则先跳到地图页（经 tai.juJiaoDaoHang 接力，onShow 里消费） */
    daoHangDaoSheShi() {
      const s = this.daoHangSheShi;
      if (!s || !Number.isFinite(s.lng)) return;
      this.daoHangSheShi = null;
      if (this.data.aiFuKai) this.aiCun();
      this.setData({
        aiFuKai: false,
        ka: {
          lei: 'sheshi',
          biaoTi: s.name || '目的地',
          se: FENLEI_SE[s.fenlei] || '#8a93a3',
          hang: [`类别：${FENLEI_MING[s.fenlei] || s.fenlei}`, s.address ? `地址：${s.address}` : '', 'AI 已为你选点，正在规划步行路线'].filter(Boolean),
          sheShi: s
        },
        luXianWen: '',
        luMo: 'walking',
        daoHang: null
      });
      this.daoHangDaiKai = true;
      this.suanLu({ currentTarget: { dataset: { mo: 'walking' } } });
    },

    /* ── 站内真实导航：持续定位驱动，GPS 走到哪、引导跟到哪 ──
       每个真实定位点「投影」到路线上（最近点吸附，算法与 Web 端 luJingTouYing 同思路）：
       垂距 = 是否偏航，弧长位置 = 已走里程 → 剩余距离/时间随之更新，地图中心跟随真实位置。
       蓝点用 map 组件自带的 show-location（真实位置本来就有蓝点，不用再造）。
       到达判定：沿路剩余 < 30 米。退出时 offLocationChange + stopLocationUpdate 并重画图层 */
    kaiDaoHang() {
      const lu = this.luXian && this.luXian[0];
      const dianLie = lu && lu.points;
      if (!dianLie || dianLie.length < 2) {
        plat.toast({ title: '先点上方出行方式算出路线' });
        return;
      }
      if (this.daoHangTing) return; // 已在导航中
      const shu = this.daoHangShu || { zongMi: 0, miao: 0 };
      // 总弧长只算一次（定位点每次来都要查位置）
      let zongHu = 0;
      const duanChang = [];
      for (let i = 0; i < dianLie.length - 1; i++) {
        const chang = juLiMi(dianLie[i].longitude, dianLie[i].latitude, dianLie[i + 1].longitude, dianLie[i + 1].latitude);
        duanChang.push(chang);
        zongHu += chang;
      }
      this.daoHangLu = { dianLie, duanChang, zongHu: zongHu || shu.zongMi };
      this.setData({ daoHang: { shengMi: shu.zongMi || Math.round(zongHu), miao: shu.miao } });
      this.daoHangTing = plat.dingWeiChiXu((d, cuo) => {
        if (cuo || !d) {
          this.tingDaoHang();
          plat.toast({ title: (cuo && cuo.message) || '定位失败，已退出导航' });
          return;
        }
        // 投影：找最近的线段与垂点，得到垂距（偏航）与弧长位置（已走）
        const zx = d.longitude * Math.cos((d.latitude * Math.PI) / 180) * 111320;
        const zy = d.latitude * 110540;
        let lei = 0;
        let zui = { ju: Infinity, hu: 0 };
        for (let i = 0; i < dianLie.length - 1; i++) {
          const a = dianLie[i];
          const b = dianLie[i + 1];
          const jing = Math.cos((a.latitude * Math.PI) / 180) * 111320;
          const ax = a.longitude * jing, ay = a.latitude * 110540;
          const bx = b.longitude * jing, by = b.latitude * 110540;
          const dx = bx - ax, dy = by - ay;
          const duan2 = dx * dx + dy * dy;
          let t = duan2 ? ((zx - ax) * dx + (zy - ay) * dy) / duan2 : 0;
          t = Math.max(0, Math.min(1, t));
          const ju = Math.hypot(zx - (ax + dx * t), zy - (ay + dy * t));
          if (ju < zui.ju) zui = { ju, hu: lei + duanChang[i] * t };
          lei += duanChang[i];
        }
        const shengHu = Math.max(0, this.daoHangLu.zongHu - zui.hu);
        const shengMi = Math.round(shengHu);
        const b = this.daoHangLu.zongHu ? shengHu / this.daoHangLu.zongHu : 0;
        const jinDu = {
          shengMi,
          miao: Math.max(0, Math.round((shu.miao || 0) * b)),
          pian: Math.round(zui.ju)
        };
        if (shengMi < 30) {
          jinDu.daoDa = true;
        }
        this.setData({ daoHang: jinDu, latitude: d.latitude, longitude: d.longitude });
        if (jinDu.daoDa) this.tingDaoHang(true);
      });
      if (!this.daoHangTing) this.daoHangTing = true; // 启动失败时 dingWeiChiXu 的回调也会进来兜底
    },

    tingDaoHang(daoDa) {
      if (this.daoHangTing && this.daoHangTing !== true) plat.dingWeiTing();
      this.daoHangTing = null;
      if (daoDa !== true) this.setData({ daoHang: null });
      this.huaTuCeng();
    },

    dingWei(jingMo) {
      const ziDong = jingMo === true;
      if (this.data.dingWeiZhong) return;
      this.setData({ dingWeiZhong: true, xuanDianKai: false });
      return plat
        .getLocation()
        .then(g => {
          const zx = gcjDaoWgs(g); // 定位给 GCJ-02，引擎要 WGS-84
          if (!zx) throw new Error('定位结果不可用');
          // 中间态只写中心点、不动 diMing：'定位中…' 会被 sheZhongXin 持久化进摘要，
          // 定位若中途被打断（切页/杀 app），下次冷启动定位条就永远卡在「定位中…」
          sheZhongXin(zx);
          this.setData({ diMing: '定位中…' });
          this.shuaTai();
          return chuangJianBmapXcx()
            .reverseGeocode(zx)
            .then(r => {
              const ming = r.aoi || r.address || '当前位置';
              sheZhongXin(zx, ming);
              this.shuaTai();
            })
            .catch(() => sheZhongXin(zx, '当前位置'));
        })
        .then(() => {
          this.setData({ dingWeiZhong: false });
          this.huaTuCeng();
          this.laTianQi(); // 中心点定了，天气跟着补上（内部有缓存）
        })
        .catch(e => {
          this.setData({ dingWeiZhong: false });
          // 自动定位失败不弹窗（用户没主动点），只在定位条上留提示
          if (ziDong) {
            this.setData({ diMing: '未定位，点这里手动选点' });
            return;
          }
          plat.modal({
            title: '定位失败',
            content:
              ((e && e.message) || '') +
              '\n可在「在地图上选点」手动指定中心，或检查开发者工具是否允许定位权限。',
            showCancel: false
          });
        });
    },

    /* 回到定位点并放大：地图被拖走或缩得很小以后，一键把视图拉回体检中心。
       回的是「中心点」而不是手机当前位置 —— 用户可能把某个设施设成了中心（.sheZhongXin）。
       scale 只在比 17 小时才抬高：已经在放大档就不再动它，免得出现"点一下反而变小" */
    huiDaoZhongXin() {
      const t = duTai();
      if (!t.zhongXin) {
        plat.toast({ title: '还没有定位点：先定位，或在地图上选点' });
        return;
      }
      const g = wgsDaoGcj(t.zhongXin);
      this.setData({ latitude: g.lat, longitude: g.lng, scale: Math.max(this.data.scale, 17) });
    },

    xuanDian() {
      this.setData({ xuanDianKai: false });
      return plat
        .chooseLocation()
        .then(r => {
          const zx = gcjDaoWgs(r);
          if (!zx) throw new Error('未取到坐标');
          if (zx.lng < 73 || zx.lng > 136 || zx.lat < 3 || zx.lat > 54)
            throw new Error('请在国内范围内选点');
          sheZhongXin(zx, r.name || r.address || '地图选点');
          this.shuaTai();
          this.huaTuCeng();
        })
        .catch(e => {
          if (/cancel/i.test((e && (e.errMsg || e.message)) || '')) return; // 用户取消
          plat.toast({ title: (e && e.message) || '选点失败' });
        });
    },

    /* ── 图层 ── */
    qieHuan(e) {
      const k = e.currentTarget.dataset.k;
      const v = this.data.xianShi[k] === false; // 原来关着就打开
      sheXianShi(k, v);
      this.setData({ [`xianShi.${k}`]: v }, () => this.huaTuCeng());
    },

    /* 设施六类细分：点「设施」胶囊展开/收起面板；单类与「全部」都写回同一份 tai.xianshi。
       「没跑体检时散点为空」这件事写在面板里（ditu.wxml 的 .she-shuo），不放 toast ——
       面板默认就是展开的，用户看不到"展开"这个动作，提示只有待在面板里才一定看得见 */
    qieSheShi() {
      this.setData({ sheShiKai: !this.data.sheShiKai });
    },

    xuanSheShi(e) {
      const k = e.currentTarget.dataset.k;
      const v = this.data.xianShi[k] === false;
      sheXianShi(k, v);
      const xianShi = { ...this.data.xianShi, [k]: v };
      this.setData({ xianShi, ...this.sheShiZhuangTai(xianShi) }, () => this.huaTuCeng());
    },

    /* 「全部」：本来全开就全关，否则全开 —— 不用点六遍 */
    quanSheShi() {
      const x = this.data.xianShi;
      const kai = !SHE_SHI_LEI.every(k => x[k] !== false);
      const bu = {};
      SHE_SHI_LEI.forEach(k => {
        sheXianShi(k, kai);
        bu[k] = kai;
      });
      const xianShi = { ...x, ...bu };
      this.setData({ xianShi, ...this.sheShiZhuangTai(xianShi) }, () => this.huaTuCeng());
    },

    /* 六类胶囊的展示数据 + 「设施」胶囊亮不亮：都从 xianShi 派生，不另存一份状态 */
    sheShiZhuangTai(x = this.data.xianShi) {
      const lie = SHE_SHI_LEI.map(k => ({
        k,
        ming: FENLEI_MING[k] || k,
        se: FENLEI_SE[k] || '#8a93a3',
        on: x[k] !== false
      }));
      return { sheShiLie: lie, youSheShi: lie.some(i => i.on) };
    },

    /* ── 地图工具（路况 / 卫星 / 3D）──
       与网页端工具条同一套语义：路况＝实时路况图层，卫星＝卫星影像，3D＝倾斜近景。
       网页端 3D 走 setTilt(52)；小程序 map 的倾斜是数值属性 skew（0~40），
       开 3D 时一并打开俯视与 3D 楼块，关掉就全部归零（开着 3D 楼块但视角是平的会像"没反应"） */
    qieDiTuGong(e) {
      const k = e.currentTarget.dataset.k;
      if (!['luKuang', 'weiXing', 'qingXie'].includes(k)) return;
      const v = !this.data[k];
      // 整个 setting 换一份新对象：map 的 setting 是对象属性，整体换引用最稳
      // （只往对象里补一个路径的 setData，在原生组件上未必触发更新）
      const gong = { ...this.data.diTuGong };
      if (k === 'luKuang') gong.enableTraffic = v;
      else if (k === 'weiXing') gong.enableSatellite = v;
      else {
        gong.enable3D = v;
        gong.enableOverlooking = v;
        gong.skew = v ? 40 : 0;
      }
      this.setData({ [k]: v, diTuGong: gong });
    },

    /* ── 体检 ── */
    kaiShiTiJian() {
      if (this.data.running) return;
      const t = duTai();
      if (!t.zhongXin) {
        plat.toast({ title: '先获取位置或在地图上选点' });
        this.setData({ xuanDianKai: true });
        return;
      }
      this.setData({ running: true, jinDu: 0, jieDuanWen: '准备中…', ka: null });
      paoYiLunTiJian({
        zhongXin: t.zhongXin,
        mubiaoMiao: t.mubiaoMiao,
        dangwei: t.dangwei,
        onJinDu: p => {
          const zheng = Math.round(p * 100);
          if (zheng !== this.data.jinDu) this.setData({ jinDu: zheng });
        },
        onJieDuan: j => {
          const wen = JIE_DUAN_MING[j];
          if (wen && wen !== this.data.jieDuanWen) this.setData({ jieDuanWen: wen });
        }
      })
        .then(r => {
          cunBaoGao(r);
          this.setData({ running: false, jinDu: 100, jieDuanWen: '完成' });
          this.shuaTai();
          this.huaTuCeng();
          this.laYongHuMangQu();
          plat.toast({ title: `体检完成：${r.total} 分`, icon: 'none' });
          // 来自 AI 页的「去地图页跑体检」：跑完自动回到助手，把那个问题接着问完
          if (quDaiXu()) plat.quYe('/pages/ai/ai');
        })
        .catch(e => {
          const xinxi = (e && e.message) || '体检失败';
          this.setData({ running: false });
          plat.modal({
            title: '体检未完成',
            content:
              xinxi +
              (/status|配额|220|302|240|合法域名|not in domain/i.test(xinxi)
                ? '\n\n提示：这是百度接口没放行/配额用尽或域名未加白名单。本地开发请在「详情 → 本地设置」勾选“不校验合法域名”；真机需在小程序后台把 api.map.baidu.com 与自有服务端域名加入 request 合法域名。'
                : ''),
            showCancel: false
          });
        });
    },

    /* ── 图层构建 ──
       按需重算：每一层有自己的"指纹"（数据来源引用 + 该层开关），指纹没变就复用上次算好的数组，
       只把**真变了的那一层** setData 给原生渲染层。
       之前是每次调用都把等时圈（上千个点）、设施标记、盲区圆全部重算并整包推过去 ——
       点一下图层开关就要传几万字节，手感就是"卡一下"；网页端 MapCanvas 早就这样按层比对
       （它的 keysRef 只重建变化的那层），这里对齐它的做法。 */
    huaTuCeng() {
      const r = duBaoGao();
      const t = duTai();
      const x = this.data.xianShi;
      const jiu = this.ceng || null;
      const chu = {}; // 本轮要 setData 的项

      // ① 等时圈（+ 跨水面的虚线）：报告换了或开关变了才重算
      const kaiIso = !!(r && x.iso !== false);
      const zhiIso = kaiIso ? r : null;
      if (!jiu || jiu.zhiIso !== zhiIso) {
        const polygons = [];
        let shuiXian = [];
        if (kaiIso) {
          polygons.push(...dengShiQuanPolygons(r.dengShiQuan && r.dengShiQuan.ceng));
          shuiXian = shuiDuanLines(r.dengShiQuan && r.dengShiQuan.shuiDuan);
        }
        this.shuiXian = shuiXian;
        chu.polygons = polygons;
      }

      // ② 设施散点：数据来源（本轮报告 / 存储副本）+ 六类开关。每类一个小圆徽章图标，
      //    走 markers 而不是色块 —— 图标在小程序里只能靠图片（见 bidui.js 顶部的说明）
      const laiYuan = r || (t.shangCi && t.shangCi.poi) || null;
      const zhiLei = SHE_SHI_LEI.map(k => (x[k] !== false ? 1 : 0)).join('');
      if (!jiu || jiu.zhiShe !== laiYuan || jiu.zhiLei !== zhiLei) {
        if (r) chu.she = sheShiMarkers(r.poiSet, x);
        // 冷启动 / 清缓存后：报告不在内存，用存储里的截断副本把设施画出来 ——
        // 地图不该因为"报告只在内存"就空着。等时圈与盲区没存，仍要重跑一轮才有
        else if (t.shangCi && t.shangCi.poi) chu.she = sheShiMarkers({ fenleiSet: t.shangCi.poi }, x);
        else chu.she = [];
        // 点图标要按 markerId 反查设施（平台只回 id，认不出是谁）。映射表自己留着，
        // 把 poi 从 marker 上摘掉 —— 它只服务于点击，不必跟着上百个标记一起推给渲染层
        // （实测 125 个标记里 poi 占了近三成体积，摘掉后一次点按少传约 25 KB）
        const biao = {};
        for (const m of chu.she) {
          if (m.poi) biao[m.id] = m.poi;
          delete m.poi;
        }
        this.sheShiBiao = biao;
      }

      // ③ 盲区圆 + 补建点
      const kaiMang = !!(r && x.mangqu !== false);
      const zhiMang = kaiMang ? r : null;
      if (!jiu || jiu.zhiMang !== zhiMang) {
        const circles = [];
        let jian = [];
        if (kaiMang) {
          circles.push(...mangQuCircles(r.mangquList));
          jian = buJianMarkers(r.mangquList);
        }
        chu.circles = circles;
        chu.jian = jian;
      }

      // ④ 我的标记（服务端共享，可能为空）—— 指纹取 this.yongHuMarkers 这个**稳定引用**：
      //    写成 `this.yongHuMarkers || []` 的话每轮都是新数组，指纹永远不等、永远要重传
      const yongLai = x.yonghu !== false ? this.yongHuMarkers : null;
      if (!jiu || jiu.yongLai !== yongLai) chu.yong = yongLai || [];

      // 至少变了一层才推给渲染层
      if (Object.keys(chu).length) {
        const zx = (r && r.zhongXin) || t.zhongXin;
        const markers = [];
        if (zx) markers.push(...zhongXinMarkers(zx, t.diMing || '体检中心')); // 中心点永远在最前
        markers.push(
          ...(chu.she || (jiu && jiu.she) || []),
          ...(chu.jian || (jiu && jiu.jian) || []),
          ...(chu.yong || (jiu && jiu.yong) || [])
        );
        // 圆圈只在「这一层变了」或「要补预估圈」时才重传，否则别跟着一起推
        const yaoQuan = !r && zx && t.mubiaoMiao;
        if (chu.circles !== undefined || yaoQuan) {
          const circles = [...(chu.circles || (jiu && jiu.circles) || [])];
          if (yaoQuan) {
            const ban = (V_BUXING * (t.mubiaoMiao / 60)) / K_RAOLU;
            const q = dian(zx);
            circles.push({
              latitude: q.latitude,
              longitude: q.longitude,
              radius: ban,
              fillColor: '#1a8f5722',
              // 与盲区圆同一套规范：实色描边 + 整数宽度（见 bidui.js 的说明）
              color: '#1a8f57',
              strokeWidth: 1
            });
          }
          chu.circles = circles;
        }
        chu.markers = markers;
        // 折线只在等时圈那层变时才重传（路线本身由 shouLuXian 单独推）
        if (chu.polygons !== undefined) chu.polyline = [...(this.shuiXian || []), ...(this.luXian || [])];
        // 中心点只在真的变了时才设：每次都设会让原生地图重定一次视野，看着也是一卡
        const g = zx ? wgsDaoGcj(zx) : null;
        if (g && (Math.abs(g.lat - this.data.latitude) > 1e-6 || Math.abs(g.lng - this.data.longitude) > 1e-6)) {
          chu.latitude = g.lat;
          chu.longitude = g.lng;
        }
        this.setData(chu);
      }

      // 记下本轮各层的指纹与结果，供下一次比对
      this.ceng = {
        zhiIso: chu.polygons !== undefined ? zhiIso : jiu && jiu.zhiIso,
        zhiShe: chu.she !== undefined ? laiYuan : jiu && jiu.zhiShe,
        zhiLei: chu.she !== undefined ? zhiLei : jiu && jiu.zhiLei,
        she: chu.she !== undefined ? chu.she : jiu && jiu.she,
        zhiMang: chu.circles !== undefined ? zhiMang : jiu && jiu.zhiMang,
        circles: chu.circles !== undefined ? chu.circles : jiu && jiu.circles,
        jian: chu.jian !== undefined ? chu.jian : jiu && jiu.jian,
        yongLai: chu.yong !== undefined ? yongLai : jiu && jiu.yongLai,
        yong: chu.yong !== undefined ? chu.yong : jiu && jiu.yong
      };
    },

    /* ── 我的标记盲区（服务端共享；服务端没起就安静跳过） ── */
    laYongHuMangQu() {
      const t = duTai();
      if (!t.yongHu || !t.yongHu.zhangHao) return;
      plat
        .request({ url: fuWu('/api/mangqu/lieBiao'), method: 'GET', timeout: 12000 })
        .then(r => {
          const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
          this.yongHuMarkers = ((j && j.list) || []).map((m, i) => {
            const q = dian(m.weiZhi);
            return {
              id: 200 + i,
              latitude: q.latitude,
              longitude: q.longitude,
              width: 20,
              height: 26,
              callout: {
                content: `标记 ${m.zhangHao}`,
                color: '#ffffff',
                fontSize: 11,
                borderRadius: 6,
                bgColor: '#d6409f',
                padding: 5,
                display: 'BYCLICK',
                textAlign: 'center'
              }
            };
          });
          this.huaTuCeng();
        })
        .catch(() => {
          /* 服务端不可用：不显示这一层，不打扰 */
        });
    },

    /* ── 地图点击：就近命中盲区 → 设施 ── */
    dianTu(e) {
      const r = duBaoGao();
      if (!r || !e.detail) return;
      const p = dianHui(e.detail);
      if (!p) return;
      let zuiJinMang = null;
      let zuiJinJu = Infinity;
      for (const m of r.mangquList || []) {
        const zx = m.zhongxin || m.buJianDian;
        if (!zx) continue;
        const ju = juLiMi(p, zx);
        if (ju <= mangQuBanJing(m) && ju < zuiJinJu) {
          zuiJinJu = ju;
          zuiJinMang = m;
        }
      }
      if (zuiJinMang) {
        this.setData({ ka: mangKa(zuiJinMang) });
        return;
      }
      const ge = (r.poiSet && r.poiSet.fenleiSet) || {};
      let zuiJin = null;
      let ju = Infinity;
      for (const f of Object.keys(ge)) {
        // 与地图上看到的一致：被关掉的类别不参与命中
        if (this.data.xianShi[f] === false) continue;
        for (const q of ge[f] || []) {
          const d = juLiMi(p, q);
          if (d < ju) {
            ju = d;
            zuiJin = { ...q, fenlei: f };
          }
        }
      }
      if (zuiJin && ju <= 60) {
        // 换了目标：上一条路线与摘要一起作废
        this.setData({
          ka: {
            lei: 'sheshi',
            biaoTi: zuiJin.name || '未命名设施',
            se: FENLEI_SE[zuiJin.fenlei] || '#8a93a3',
            hang: [
              `类别：${FENLEI_MING[zuiJin.fenlei] || zuiJin.fenlei}`,
              zuiJin.address ? `地址：${zuiJin.address}` : '',
              `距点击处：${Math.round(ju)} 米`
            ].filter(Boolean),
            sheShi: zuiJin
          },
          luXianWen: '',
          luMo: 'walking'
        });
        this.shouLuXian();
        return;
      }
      this.setData({ ka: null });
    },

    /* 点地图上的图标：设施（id ≥ 300）/ 补建建议点（100 ~ 199）。
       设施标记的 id 是渲染时按顺序编出来的，光看 id 认不出是谁 —— 由 markers 里的 poi 字段反查
       （见 bidui.js 的 sheShiMarkers）。卡片里有出行方式与「用地图软件导航」，
       「点图标 → 导航」这条路径就是靠这里打通的 */
    biaoJiTap(e) {
      const id = Number(e.detail && e.detail.markerId);
      // 设施标记 id → 设施的映射表在 huaTuCeng 里建好了，直接查表 —— 既不用在 markers 里
      // 逐个 find（上百个标记时更快），也不用把 poi 塞进 setData 的数据里
      const p = (this.sheShiBiao || {})[id];
      if (p) {
        // 换了目标：上一条路线与摘要一起作废（只收线，不动地图中心）
        this.setData({
          ka: {
            lei: 'sheshi',
            biaoTi: p.name || '未命名设施',
            se: FENLEI_SE[p.fenlei] || '#8a93a3',
            hang: [
              `类别：${FENLEI_MING[p.fenlei] || p.fenlei || '设施'}`,
              p.address ? `地址：${p.address}` : ''
            ].filter(Boolean),
            sheShi: p
          },
          luXianWen: '',
          luMo: 'walking'
        });
        this.shouLuXian();
        return;
      }
      const r = duBaoGao();
      if (!r || !(id >= 100 && id < 200)) return;
      const m = (r.mangquList || [])[id - 100];
      if (!m) return;
      this.setData({
        ka: {
          lei: 'bujian',
          biaoTi: `补建建议点 ${m.id}`,
          se: '#1a8f57',
          hang: [
            `拟补建：${(m.quekou || []).join('、') || '便民设施'}`,
            m.yujiFugaiRenkou ? `预计覆盖人口：约 ${m.yujiFugaiRenkou} 人` : '',
            m.buJianDian ? `坐标：${m.buJianDian.lng.toFixed(5)}, ${m.buJianDian.lat.toFixed(5)}` : ''
          ].filter(Boolean),
          jianYi: m.jianyi || ''
        }
      });
    },

    /* ── 卡片动作 ── */
    /* 算路：点出行方式胶囊即算一条并画在地图上（步行 / 骑行 / 驾车 / 公交）。
       起终点 = 体检中心 → 目标设施；**没跑过体检也能算**（用当前中心点），所以不再要求有报告。
       公交只给耗时距离、不画线：接口只回步行段的 path，拼出来是断的（见 bmapXcx.quLuXian） */
    suanLu(e) {
      const mo = (e && e.currentTarget.dataset.mo) || 'walking';
      const ka = this.data.ka;
      const t = duTai();
      const r = duBaoGao();
      if (!ka || ka.lei !== 'sheshi' || this.data.luZhong) return;
      const qi = (r && r.zhongXin) || t.zhongXin;
      if (!qi) {
        plat.toast({ title: '还没有起点：先定位，或在地图上选点' });
        return;
      }
      this.setData({ luZhong: true, luMo: mo, luXianWen: '' });
      chuangJianBmapXcx()
        .quLuXian(mo, qi, { lng: ka.sheShi.lng, lat: ka.sheShi.lat }, { region: chengShiDuan(t.diMing) })
        .then(x => {
          this.luXian = luXianPolyline(x.polyline);
          // 站内导航要用真实总距/总时（动画时长按它压缩，信息条按它显示剩余）
          this.daoHangShu = { zongMi: Number(x.distanceM) || 0, miao: Number(x.durationSec) || 0 };
          this.setData({ luZhong: false, luXianWen: luXianWen(mo, x) });
          this.huaTuCeng();
          // AI 浮层「带我去」链路：路线算好自动进入站内导航
          if (this.daoHangDaiKai) {
            this.daoHangDaiKai = false;
            this.kaiDaoHang();
          }
        })
        .catch(err => {
          this.setData({ luZhong: false });
          plat.toast({ title: (err && err.message) || '算路失败' });
        });
    },

    /* 交给地图软件带路：小程序里不能直接唤起地图 App（微信禁止外部 App 跳转），
       openLocation 是唯一官方通道 —— 它带着目的地打开微信地图；用户在那里点「路线」时，
       微信会列出手机上装的高德 / 百度 / 腾讯地图供选择（网页端是 baidumap:// + 网页版兜底，
       两端"尊重平台能力"的思路一致，只是通道不同）。
       坐标要 GCJ-02 —— 引擎里存的是 WGS-84，与地图页其它图层一样在这里过一次转换 */
    daoHang() {
      const ka = this.data.ka;
      if (!ka || ka.lei !== 'sheshi') return;
      const q = wgsDaoGcj({ lng: ka.sheShi.lng, lat: ka.sheShi.lat });
      if (!q) {
        plat.toast({ title: '这个设施没有坐标，打不开地图' });
        return;
      }
      plat
        .openLocation({ lng: q.lng, lat: q.lat, name: ka.sheShi.name || '目的地', address: ka.sheShi.address || '' })
        .then(r => {
          // 平台层把失败收敛成 null：这里得说出来，否则用户以为是没反应
          if (r === null) plat.toast({ title: '打开地图失败：检查一下定位权限' });
        });
    },

    sheWeiZhongXin() {
      const ka = this.data.ka;
      if (!ka || ka.lei !== 'sheshi') return;
      sheZhongXin({ lng: ka.sheShi.lng, lat: ka.sheShi.lat }, ka.sheShi.name || '地图选点');
      this.setData({ ka: null });
      this.shuaTai();
      this.huaTuCeng();
      plat.toast({ title: '已设为体检中心，可以开始体检了' });
    },

    juJiaoMangQu(m) {
      const zx = m.zhongxin || m.buJianDian;
      if (!zx) return;
      const g = wgsDaoGcj(zx);
      this.setData({ latitude: g.lat, longitude: g.lng, scale: 16, ka: mangKa(m) });
    },

    guanKa() {
      // 关卡片顺手把路线与导航收掉：卡片没了、线还留在地图上，会被当成体检画出来的东西
      if (this.daoHangTing) this.tingDaoHang();
      this.setData({ ka: null, luXianWen: '', luMo: 'walking', daoHang: null });
      this.shouLuXian();
    },

    /* 只把路线从地图上收掉，**不动地图中心** —— 关卡片 / 换目标时用。
       别改调 huaTuCeng()：它会把中心点再 setData 一遍，地图会被拽回体检中心 */
    shouLuXian() {
      this.luXian = null;
      this.setData({ polyline: [...(this.shuiXian || [])] });
    },

    /* ── 搜索（顶条里的放大镜 → 整条换成输入行）── */

    kaiSou() {
      // 顺手把会挡住结果列表的东西收掉：六类面板 / 定位面板 / 上一条卡片；历史列表刷新到最新
      this.setData({
        souKai: true,
        sheShiKai: false,
        xuanDianKai: false,
        ka: null,
        souLiShi: this.duSouLiShi()
      });
    },

    /* 历史记录：按账号分开存（游客一份、登录用户各一份），最多留 20 条。
       记的时机与网页端一致 —— 是「点了某条结果」才算用过，光搜不点不记 */
    souLiShiJian() {
      const t = duTai();
      return 'sq_souSuoLiShi_' + ((t.yongHu && t.yongHu.zhangHao) || 'youke');
    },

    duSouLiShi() {
      try {
        const lie = plat.getStorage(this.souLiShiJian());
        if (Array.isArray(lie)) return lie;
      } catch {
        /* 忽略 */
      }
      // storage 空了（多半被「清除缓存」清的）→ 从用户文件回填（panDu 失败返回 null）
      const pan = plat.panDu && plat.panDu('souSuoLiShi_' + ((duTai().yongHu && duTai().yongHu.zhangHao) || 'youke'));
      if (Array.isArray(pan)) {
        try {
          plat.setStorage(this.souLiShiJian(), pan);
        } catch {
          /* 忽略 */
        }
        return pan;
      }
      return [];
    },

    jiSouLi(wen, dian) {
      if (!wen || !dian) return;
      const lie = this.duSouLiShi().filter(x => x.w !== wen);
      lie.unshift({ w: wen, lng: dian.lng, lat: dian.lat, shi: Date.now() });
      const jian = lie.slice(0, 20);
      try {
        plat.setStorage(this.souLiShiJian(), jian);
      } catch {
        /* 存不上就算了：只是少一次快捷回访 */
      }
      // 用户文件兜底：清缓存后搜索历史还能从这恢复（AI 会话历史同一套机制）
      if (plat.panCun) {
        plat.panCun('souSuoLiShi_' + ((duTai().yongHu && duTai().yongHu.zhangHao) || 'youke'), jian);
      }
    },

    qingSouLi() {
      try {
        plat.removeStorage(this.souLiShiJian());
      } catch {
        /* 忽略 */
      }
      if (plat.panShan) {
        plat.panShan('souSuoLiShi_' + ((duTai().yongHu && duTai().yongHu.zhangHao) || 'youke'));
      }
      this.setData({ souLiShi: [] });
    },

    // 点分类快捷：把检索词填进输入框并立刻搜（与网页端一致，ci 就是百度检索的关键词）
    dianSouKuai(e) {
      const ci = e.currentTarget.dataset.ci;
      if (!ci) return;
      this.souRu({ detail: { value: ci } });
    },

    // 点历史：直接回到当时搜到的那个点（坐标是当时存的，不用再打一次接口）
    dianSouLi(e) {
      const i = Number(e.currentTarget.dataset.i);
      const x = this.data.souLiShi[i];
      if (!x || !Number.isFinite(x.lng)) return;
      const t = duTai();
      let juWen = '';
      if (t.zhongXin) {
        const ju = juLiMi(t.zhongXin, x);
        juWen = ju >= 1000 ? `${(ju / 1000).toFixed(1)} 公里` : `${Math.round(ju)} 米`;
      }
      this.luXian = null;
      this.setData({
        ka: {
          lei: 'sheshi',
          biaoTi: x.w,
          se: '#2f9bff',
          hang: [juWen ? `距体检中心：${juWen}` : ''].filter(Boolean),
          sheShi: { lng: x.lng, lat: x.lat, name: x.w }
        },
        luXianWen: '',
        luMo: 'walking',
        souKai: false
      });
      const g = wgsDaoGcj({ lng: x.lng, lat: x.lat });
      if (g) this.setData({ latitude: g.lat, longitude: g.lng, scale: 16 });
    },

    guanSou() {
      if (this.souQi) clearTimeout(this.souQi);
      this.setData({ souKai: false, souWen: '', souLie: [], souZhong: false });
    },

    // 输入即搜：220ms 防抖 —— 百度配额有限，不能每敲一个字就打一次接口
    souRu(e) {
      const wen = e.detail.value;
      this.setData({ souWen: wen });
      if (this.souQi) clearTimeout(this.souQi);
      if (!String(wen || '').trim()) {
        this.setData({ souLie: [], souZhong: false });
        return;
      }
      this.setData({ souZhong: true });
      this.souQi = setTimeout(() => this.souSuo(), 220);
    },

    async souSuo() {
      const wen = String(this.data.souWen || '').trim();
      if (!wen) return;
      const t = duTai();
      if (!t.zhongXin) {
        this.setData({ souZhong: false });
        plat.toast({ title: '先定个位再搜：右侧「切换」→ 用当前位置' });
        return;
      }
      this.setData({ souZhong: true });
      try {
        // 复用体检那套百度地点检索：以体检中心为圆心、一次关键词
        const lie = await chuangJianBmapXcx().searchPoi(t.zhongXin, [wen], SOU_BAN_JING);
        const chu = lie
          .map(p => ({ ...p, ju: juLiMi(t.zhongXin, p) }))
          .filter(p => Number.isFinite(p.ju))
          .sort((a, b) => a.ju - b.ju)
          .slice(0, SOU_ZUI_DUO)
          .map(p => {
            const juLiWen = p.ju >= 1000 ? `${(p.ju / 1000).toFixed(1)} 公里` : `${Math.round(p.ju)} 米`;
            return {
              uid: p.uid || p.name,
              name: p.name,
              lng: p.lng,
              lat: p.lat,
              address: p.address || '',
              juLiWen,
              fu: [p.address, juLiWen].filter(Boolean).join(' · ')
            };
          });
        this.setData({ souLie: chu, souZhong: false });
      } catch (err) {
        this.setData({ souZhong: false, souLie: [] });
        plat.toast({ title: (err && err.message) || '搜索失败' });
      }
    },

    // 点结果：把它当目的地，弹与设施同一张卡片 —— 卡片里就能算路 / 用地图软件导航 / 设为体检中心
    dianSouJie(e) {
      const i = Number(e.currentTarget.dataset.i);
      const p = this.data.souLie[i];
      if (!p) return;
      this.jiSouLi(this.data.souWen, p); // 点了才算用过：记进历史（在清空输入前取词）
      this.luXian = null;
      this.setData({
        ka: {
          lei: 'sheshi',
          biaoTi: p.name,
          se: '#2f9bff',
          hang: [p.address ? `地址：${p.address}` : '', `距体检中心：${p.juLiWen}`].filter(Boolean),
          sheShi: { lng: p.lng, lat: p.lat, name: p.name, address: p.address }
        },
        luXianWen: '',
        luMo: 'walking',
        souKai: false,
        souWen: '',
        souLie: []
      });
      // 顺带把地图挪过去：让人看见搜到的是哪
      const g = wgsDaoGcj({ lng: p.lng, lat: p.lat });
      if (g) this.setData({ latitude: g.lat, longitude: g.lng, scale: 16 });
    },

    quBaoGao() {
      if (!duBaoGao()) {
        plat.toast({ title: '先跑一轮体检才有报告' });
        return;
      }
      plat.quYe('/pages/baogao/baogao');
    },

    quTiaoZhen() {
      plat.navigateTo('/pages/tijian/tijian');
    },

    quWoDe() {
      plat.quYe('/pages/wo/wo');
    },

    quDengLu() {
      plat.navigateTo('/pages/denglu/denglu');
    },

    quAi() {
      this.setData({ xuanDianKai: false });
      plat.quYe('/pages/ai/ai');
    },

    /* ── AI 半屏浮层（在地图上直接问，不跳页）：实现见 common/aiFu.js，与生活圈页共用一份 ── */
    ...AI_FU_FANG_FA,

    onShareAppMessage() {
      const t = duTai();
      return {
        title: t.diMing ? `${t.diMing}·15分钟生活圈体检` : '15 分钟生活圈体检助手',
        path: '/pages/ditu/ditu'
      };
    }
  };
}
