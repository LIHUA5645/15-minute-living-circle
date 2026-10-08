/* global getCurrentPages */
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，07
// 「生活圈」页（tabBar 第 2 个）：结论一句话 → 步行等时圈/服务盲区（带时长档位与两种视图）
// → 分类缺口 → 六维得分 → 数据提示 → 盲区清单 → 补建建议 → AI 诊断。
// 指标口径全部取引擎输出的 dengShiQuan.tongJi 与 mangquTongJi（与网页端同一份），页面不再自算一套。
import { plat, biaoTab } from '../plat.js';
import { fuWu } from '../peizhi.js';
import { duTai, duBaoGao } from '../zhuangTai.js';
import { shengChengZhenDuan, duAiPeiZhi, aiPeiZhiCuo, duShengChengFangShi, cunShengChengFangShi, zhaoHuWen } from '../ai.js';
import { quTianQi } from '../adapters/bmapXcx.js';
// AI 半屏浮层：与地图页共用同一份实现（见 common/aiFu.js）—— 卡片上的「问问 AI 助手」不再跳去助手 tab，
// 就在本页升起来问（本页本就有本轮报告，AI 回答的上下文比在助手页更贴合当前这份结论）
import { AI_FU_SHU_JU, AI_FU_FANG_FA } from '../aiFu.js';
import { FENLEI_MING, FENLEI_QUANZHONG } from '../../core/types.js';
import {
  geShiMianJi,
  geShiHaoShi,
  fenSe,
  dengJiMing,
  mangSe,
  MI_CAISE,
  dengShiQuanPolygons,
  shuiDuanLines,
  mangQuCircles,
  zhongXinMarkers,
  dian
} from '../bidui.js';
import { liangDianJuLi } from '../../core/geo/jichu.js';

// 时长档位名（引擎按 [300, 600, 目标秒] 出档，这里只负责把秒翻成人话）
function miaoMing(miao) {
  const f = Math.round(miao / 60);
  return f + ' 分';
}

// 16 进制色 + 透明度 → rgba()：canvas 旧版上下文的 setFillStyle 对 8 位 hex 支持不稳，统一走 rgba
function touMing(se, a) {
  const s = String(se || '#2f9bff').replace('#', '');
  const n = parseInt(s.length === 3 ? s.replace(/(.)/g, '$1$1') : s, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const MI_DU_MING = { fast: '快', standard: '标准', fine: '精细' };

function mangTiao(m) {
  return {
    id: m.id,
    level: m.level,
    dengJiWen: m.level === 'red' ? '重度' : '轻度',
    se: mangSe(m.level),
    quekouWen: (m.quekou || []).join('、') || '便民设施',
    mianJiWen: geShiMianJi(m.areaM2),
    renKouWen: m.yujiFugaiRenkou ? `约 ${m.yujiFugaiRenkou} 人` : '',
    zuoBiaoWen: m.buJianDian ? `${m.buJianDian.lng.toFixed(5)}, ${m.buJianDian.lat.toFixed(5)}` : '',
    jianYi: m.jianyi || '',
    // 引擎给的 yiJu 是**字符串**（mangqu.js 里拼好的判据说明），老写法按数组 .join() 会直接抛错——
    // 只要本轮出现盲区，整页就白屏。这里两种形态都兜住
    yiJuWen: Array.isArray(m.yiJu) ? m.yiJu.join('；') : String(m.yiJu || '')
  };
}

// 来源标签：与网页端同一套写法
function laiYuanBiaoQian(laiYuan, huiTui, sheZhi, moXing, zaiShengCheng, duCuo) {
  const mo = moXing && moXing.length > 20 ? moXing.slice(0, 20) + '…' : moXing;
  if (zaiShengCheng) return mo ? `生成中 · ${mo}` : '生成中…';
  if (laiYuan === 'ai') return mo ? `大模型生成 · ${mo}` : '大模型生成';
  if (huiTui) return '本地规则 · 大模型失败已回退';
  if (sheZhi === 'bendi') return '本地规则引擎 · 按你的设置';
  // 「读不到服务器配置」和「管理员没配」得分清楚，否则用户会去管理员面板白找一趟
  return duCuo ? '本地规则引擎 · 读不到服务器配置' : '本地规则引擎 · 未接入大模型';
}

export function chuangJianBaoGao() {
  return {
    data: {
      youBaoGao: false,
      total: 0,
      dengJiWen: '',
      fenSe: '#8a93a3',
      qingQiuShu: 0,
      haoShiWen: '',
      miDuWen: '',
      diMing: '',
      weiDu: [],
      warn: [],
      mangQuList: [],
      jianYi: [],
      // ── 生活圈卡：结论 / 等时圈 / 指标 / 分类缺口 ──
      jielun: '',
      jielunFu: '',
      dangWeiLie: [], // [{miao, ming, on}] 时长档位胶囊
      dangMiao: 0, // 当前选中档（秒）
      dangMing: '',
      dituMoShi: 'jiaohu', // jiaohu=交互地图（腾讯底图）｜shiliang=矢量示意图（无底图，适合截图）
      tqPolygons: [],
      tqLines: [],
      tqCircles: [],
      tqMarkers: [],
      tqZhongXin: null,
      zhiA: [], // 四个主指标
      zhiB: [], // 三个盲区指标
      tuLi: [], // 图例
      queKou: [], // 分类缺口
      ai: {
        zhuangTai: '', // '' | shengCheng | daZi | wanCheng | cuo
        biaoQian: '',
        wen: '',
        xianShiWen: '',
        laiYuan: '',
        huiTui: false,
        cuoYin: '',
        sheKai: false,
        sheZhi: '',
        moXing: '',
        aiKeYong: false
      },
      // AI 半屏浮层（字段与地图页共用同一份，见 common/aiFu.js）
      ...AI_FU_SHU_JU
    },

    onLoad() {
      this.bao = duBaoGao();
      this.huaBaoGao();
      this.shengCheng();
    },

    onShow() {
      // 自定义 tabBar（微信端）的选中态由页面回报；支付宝/抖音原生文字 tabBar 会自动处理
      biaoTab(this, 1);
      // AI 浮层打开时的状态总结卡（与助手页同源文案，不入库）
      quTianQi(duTai().zhongXin).then(tq => {
        this.setData({ zhaoHu: zhaoHuWen(duBaoGao(), tq, duTai().diMing) });
      });
      // tab 页 onLoad 只跑一次：切到本页时体检可能还没跑完，回地图页跑完再切回来，
      // 报告已经变了 —— 不重取就一直停在「先体检」的引导态（用户反馈：体检完成了还让去体检）
      const r = duBaoGao();
      if (r !== this.bao) {
        this.bao = r;
        this.huaBaoGao();
      }
    },

    onUnload() {
      if (this.daZiTimer) clearTimeout(this.daZiTimer);
    },

    huaBaoGao() {
      const r = this.bao || duBaoGao();
      if (!r) {
        this.setData({ youBaoGao: false });
        return;
      }
      const t = duTai();
      const pf = (r.fenleiPingfen || []).slice().sort((a, b) => Number(b.score) - Number(a.score));
      const zuiDa = Math.max(1, ...pf.map(f => Number(f.score) || 0));
      // 默认选中「目标档」（体检参数里的目标时长），引擎的档位就是它
      const mb = Number((r.canshu && r.canshu.mubiaoMiao) || 900);
      const dangMiao = this.data.dangMiao || mb;
      this.setData({
        youBaoGao: true,
        diMing: t.diMing || '',
        total: r.total,
        dengJiWen: dengJiMing(r.dengji),
        fenSe: fenSe(r.total),
        qingQiuShu: (r.xinxi && r.xinxi.qingQiuShu) || 0,
        haoShiWen: geShiHaoShi(r.xinxi && r.xinxi.haoShiMs),
        miDuWen: MI_DU_MING[(r.xinxi && r.xinxi.miDu) || ''] || '',
        weiDu: pf.map(f => ({
          ming: FENLEI_MING[f.fenlei] || f.fenlei,
          fen: f.score,
          shu: f.shuliang || 0,
          quan: Math.round((FENLEI_QUANZHONG[f.fenlei] || 0) * 100),
          kuan: Math.max(4, Math.round(((Number(f.score) || 0) / zuiDa) * 100)),
          se: fenSe(f.score)
        })),
        warn: r.warnings || [],
        mangQuList: (r.mangquList || []).map(mangTiao),
        jianYi: r.jianYi || [],
        ...this.suanYiDang(dangMiao)
      }, () => this.huaLeiDa());
    },

        /* 六维评分雷达（canvas 2d 自绘，无三方库）：维度固定按六类顺序，
       缺数据的维度按 0 画 —— 图形完整比缺一角好读。三层网格 + 数据多边形 + 分值标签 */
    huaLeiDa() {
      const r = this.bao || duBaoGao();
      if (!r) return;
      const pf = {};
      (r.fenleiPingfen || []).forEach(f => {
        pf[f.fenlei] = Number(f.score) || 0;
      });
      const SHUN = ['yiliao', 'jiaoyu', 'gouwu', 'yanglao', 'jiaotong', 'xiuxian'];
      const shu = SHUN.map(k => ({ ming: FENLEI_MING[k] || k, fen: pf[k] || 0 }));
      // 页面实例自带 createSelectorQuery（三端一致）；dpr 固定 2 倍绘，清晰度够且跨端稳妥
      this.createSelectorQuery()
        .select('#leiDa')
        .fields({ node: true, size: true })
        .exec(jie => {
          const dian = jie && jie[0];
          if (!dian || !dian.node) return;
          const bu = dian.node;
          const kuan = dian.width;
          const gao = dian.height;
          const dpr = 2;
          bu.width = kuan * dpr;
          bu.height = gao * dpr;
          const bi = bu.getContext('2d');
          bi.scale(dpr, dpr);
          const cx = kuan / 2;
          const cy = gao / 2 + 6;
          const banJing = Math.min(kuan, gao) / 2 - 34;
          const jiao = i => (Math.PI * 2 * i) / 6 - Math.PI / 2; // 顶点朝上
          const zb = (i, b) => [cx + Math.cos(jiao(i)) * banJing * b, cy + Math.sin(jiao(i)) * banJing * b];
          bi.clearRect(0, 0, kuan, gao);
          // 三层网格
          bi.strokeStyle = '#e4e9ee';
          for (const ceng of [1 / 3, 2 / 3, 1]) {
            bi.beginPath();
            for (let i = 0; i <= 6; i++) {
              const [x, y] = zb(i % 6, ceng);
              i ? bi.lineTo(x, y) : bi.moveTo(x, y);
            }
            bi.stroke();
          }
          // 轴线 + 维度标签 + 分值
          bi.fillStyle = '#667085';
          bi.font = '11px sans-serif';
          bi.textAlign = 'center';
          for (let i = 0; i < 6; i++) {
            const [x, y] = zb(i, 1);
            bi.strokeStyle = '#eef2f6';
            bi.beginPath();
            bi.moveTo(cx, cy);
            bi.lineTo(x, y);
            bi.stroke();
            const [tx, ty] = zb(i, 1.18);
            bi.fillText(shu[i].ming, tx, ty);
            bi.fillStyle = '#3c4657';
            bi.fillText(String(shu[i].fen), tx, ty + 13);
            bi.fillStyle = '#667085';
          }
          // 数据多边形（半透明填充 + 描边 + 顶点）
          bi.beginPath();
          for (let i = 0; i <= 6; i++) {
            const [x, y] = zb(i % 6, Math.max(0.02, (shu[i % 6].fen || 0) / 100));
            i ? bi.lineTo(x, y) : bi.moveTo(x, y);
          }
          bi.closePath();
          bi.fillStyle = 'rgba(47, 134, 247, 0.22)';
          bi.fill();
          bi.strokeStyle = '#2f86f7';
          bi.lineWidth = 2;
          bi.stroke();
          bi.fillStyle = '#2f86f7';
          for (let i = 0; i < 6; i++) {
            const [x, y] = zb(i, Math.max(0.02, (shu[i].fen || 0) / 100));
            bi.beginPath();
            bi.arc(x, y, 2.5, 0, Math.PI * 2);
            bi.fill();
          }
        });
    },

/* ── 结论 / 指标 / 图例 / 分类缺口 / 地图数据：都按「当前选中档位」算 ── */

    // 最近的一处设施（名称 + 直线距离），结论副行用
    zuiJinSheShi(r) {
      const zx = r && r.zhongXin;
      const ge = (r && r.poiSet && r.poiSet.fenleiSet) || {};
      let zui = null;
      for (const lie of Object.values(ge)) {
        for (const p of lie || []) {
          if (!p || !Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
          const d = liangDianJuLi(zx, p);
          if (!zui || d < zui.d) zui = { d, ming: p.name || '设施' };
        }
      }
      return zui ? `${zui.ming} ${Math.round(zui.d)}m` : '';
    },

    // 地图数据：等时圈只画「不超过选中档」的层（外→内叠色），另加盲区圆与中心点
    diTuShuJu(miao) {
      const r = this.bao || {};
      const dq = r.dengShiQuan || {};
      const ceng = (dq.ceng || []).filter(c => c.miao <= miao);
      return {
        // 地图组件要 GCJ-02，引擎给的是 WGS-84（其余图层由 bidui 里的构造函数顺手转好了）
        tqZhongXin: r.zhongXin ? dian(r.zhongXin) : null,
        tqPolygons: dengShiQuanPolygons(ceng),
        tqLines: shuiDuanLines((dq.shuiDuan || []).filter(c => c.miao <= miao)),
        tqCircles: mangQuCircles(r.mangquList || []),
        tqMarkers: zhongXinMarkers(r.zhongXin, '体检中心')
      };
    },

    // 一档的完整展示数据（结论 / 指标 / 图例 / 缺口 / 地图），返回给 setData 的对象
    suanYiDang(miao) {
      const r = this.bao || {};
      const dq = r.dengShiQuan || {};
      const tj = dq.tongJi || {};
      const mg = r.mangquTongJi || {};
      const ge = k => ((mg.chaoShiGe && mg.chaoShiGe[k]) || 0);
      const bi = k => (mg.fenleiQueKou && mg.fenleiQueKou[k]) || 0;
      const bai = v => Math.round((Number(v) || 0) * 100) + '%';
      const m2 = (tj.mianJi && tj.mianJi[miao]) || 0;
      const zy = (tj.zuiYuan && tj.zuiYuan[miao]) || 0;
      const pf = (r.fenleiPingfen || []).slice().sort((a, b) => Number(a.score) - Number(b.score));
      const ruo = pf[0] || { fenlei: '', score: 0, shuliang: 0 };
      const ruoMing = FENLEI_MING[ruo.fenlei] || '配套';
      const keDa = (r.fenleiPingfen || []).reduce((s, f) => s + (Number(f.shuliang) || 0), 0);
      const zuiJin = this.zuiJinSheShi(r);
      // 分类缺口：三类必备设施各自「步行超时」的格占比（引擎按全体候选格统计，与盲区判定刻意分开）
      const queLie = [
        { ming: '菜市场', k: 'caiShiChang' },
        { ming: '药店', k: 'yaoDian' },
        { ming: '小学', k: 'xiaoXue' }
      ];
      return {
        dangMiao: miao,
        dangMing: miaoMing(miao),
        dangWeiLie: (dq.ceng || []).map(c => ({ miao: c.miao, ming: miaoMing(c.miao), on: c.miao === miao })),
        jielun: `${ruoMing}是短板：${ruo.score} 分，圈内 ${ruo.shuliang || 0} 处`,
        jielunFu: `步行 ${miaoMing(miao)}可达 ${keDa} 处设施${zuiJin ? `，最近 ${zuiJin}` : ''}`,
        zhiA: [
          { ming: '覆盖加权分', zhi: String(r.total == null ? '—' : r.total), dan: '', se: fenSe(r.total), fu: '综合得分' },
          {
            ming: '盲区格',
            zhi: `${mg.mangQuGe || 0}/${mg.geShuZong || 0}`,
            dan: '',
            se: '#e5484d',
            fu: '占比 ' + bai(mg.mangQuDianWeiBi)
          },
          { ming: '等时圈面积', zhi: m2 ? (m2 / 1e6).toFixed(2) : '—', dan: 'km²', se: '#12a150', fu: miaoMing(miao) + '可达范围' },
          { ming: '最远可达', zhi: zy ? String(zy) : '—', dan: 'm', se: '#2f9bff', fu: '离中心最远点' }
        ],
        zhiB: [
          { ming: '盲区点位占比', zhi: bai(mg.mangQuDianWeiBi), dan: '', se: '#e5484d' },
          { ming: '盲区面积', zhi: ((mg.mangQuMianJiM2 || 0) / 1e4).toFixed(2), dan: 'ha', se: '#e5484d' },
          { ming: '绕行系数', zhi: tj.raoXing == null ? '—' : String(tj.raoXing), dan: '', se: '#7c5cff' }
        ],
        tuLi: [
          { se: MI_CAISE[miao] || '#2f9bff', ming: '步行等时圈（步速 80m/min × 路网弯曲 1.25）' },
          { se: '#e5484d', ming: `服务盲区（三类必备设施全缺 · ${mg.juZhen ? '矩阵实测复核' : '直线估算复核'}）` },
          { se: '#8a93a3', ming: `引擎：${mg.juZhen ? 'routematrix 批量矩阵' : '直线估算 ×1.35'}` }
        ],
        queKou: queLie.map(q => ({
          ming: q.ming,
          bi: bi(q.k),
          biWen: bai(bi(q.k)),
          ge: ge(q.k),
          kuan: Math.max(2, Math.round(bi(q.k) * 100)),
          se: bi(q.k) > 0.5 ? '#e5484d' : bi(q.k) > 0.2 ? '#f59f00' : '#12a150'
        })),
        ...this.diTuShuJu(miao)
      };
    },

    // 切换时长档位：重算指标与地图，矢量视图还要重画 canvas
    xuanDang(e) {
      const miao = Number(e.currentTarget.dataset.miao);
      if (!miao || miao === this.data.dangMiao) return;
      this.setData(this.suanYiDang(miao), () => {
        if (this.data.dituMoShi === 'shiliang') this.huaShiYi();
      });
    },

    // 两种视图：交互地图（原生 map，可拖动缩放）｜矢量示意图（canvas，无底图，适合截图进报告）
    qieMoShi(e) {
      const m = e.currentTarget.dataset.m || 'jiaohu';
      if (m === this.data.dituMoShi) return;
      this.setData({ dituMoShi: m }, () => {
        // canvas 节点是 wx:if 挂上来的，等它渲染完再画
        if (m === 'shiliang') setTimeout(() => this.huaShiYi(), 80);
      });
    },

    // 画矢量示意图：等时圈叠色 + 盲区圆 + 中心点，按地理范围等比投影，不画底图
    huaShiYi() {
      const r = this.bao;
      if (!r || this.data.dituMoShi !== 'shiliang') return;
      const ctx = plat.canvas('shiYi', this);
      if (!ctx) return;
      const dq = r.dengShiQuan || {};
      const tj = dq.tongJi || {};
      const miao = this.data.dangMiao;
      const ceng = (dq.ceng || []).filter(c => c.miao <= miao);
      const zx = r.zhongXin;
      if (!zx) return;
      const zuiYuan = Math.max(300, ...(dq.ceng || []).map(c => (tj.zuiYuan && tj.zuiYuan[c.miao]) || 0));
      const W = this.shiYiKuan || 320;
      const H = 200;
      const ky = 110540;
      const kx = 111320 * Math.cos((zx.lat * Math.PI) / 180);
      const s = (Math.min(W, H) / 2) / (zuiYuan * 1.12); // 米 → px
      const X = p => W / 2 + (p.lng - zx.lng) * kx * s;
      const Y = p => H / 2 - (p.lat - zx.lat) * ky * s;
      ctx.setFillStyle('#f7fafc');
      ctx.fillRect(0, 0, W, H);
      // 比例尺网格（每 250 米一根细线），让「无底图」也能读出尺度
      ctx.setStrokeStyle('#e8edf3');
      ctx.setLineWidth(1);
      const bu = 250;
      for (let d = bu; d <= zuiYuan * 1.1; d += bu) {
        const r2 = d * s;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, r2, 0, Math.PI * 2);
        ctx.stroke();
      }
      // 等时圈：外→内叠色（与地图同一套色板）
      for (const c of ceng.slice().sort((a, b) => b.miao - a.miao)) {
        const se = MI_CAISE[c.miao] || '#2f9bff';
        for (const huan of c.polygon || []) {
          if (!huan || huan.length < 3) continue;
          ctx.beginPath();
          huan.forEach((p, i) => {
            const x = X(p);
            const y = Y(p);
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          });
          ctx.closePath();
          ctx.setFillStyle(touMing(se, 0.22));
          ctx.fill();
          ctx.setStrokeStyle(se);
          ctx.setLineWidth(1.2);
          ctx.stroke();
        }
      }
      // 盲区圆
      for (const m of r.mangquList || []) {
        const z = m.zhongxin || m.buJianDian;
        if (!z) continue;
        ctx.beginPath();
        ctx.arc(X(z), Y(z), Math.max(3, (m.banJingM || 60) * s), 0, Math.PI * 2);
        ctx.setFillStyle(touMing(mangSe(m.level), 0.28));
        ctx.fill();
        ctx.setStrokeStyle(mangSe(m.level));
        ctx.setLineWidth(1);
        ctx.stroke();
      }
      // 中心点
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 4, 0, Math.PI * 2);
      ctx.setFillStyle('#12a150');
      ctx.fill();
      ctx.draw();
    },

    onReady() {
      // canvas 的像素宽度要按屏幕折算（rpx → px），卡片左右内边距一并扣掉
      const xin = plat.zhuangTai ? plat.zhuangTai() : {};
      const w = Number((xin && xin.windowWidth) || 375);
      this.shiYiKuan = Math.round((w * (750 - 2 * 24 - 2 * 26)) / 750);
    },

    /* ── AI 诊断（自动生成 + 生成方式 + 打字机 + 回退说明） ── */
    async shengCheng() {
      const r = duBaoGao();
      if (!r) return;
      if (this.daZiTimer) clearTimeout(this.daZiTimer);
      const sheZhi = duShengChengFangShi();
      const pei = await duAiPeiZhi();
      const aiKeYong = !!(pei && pei.apiDiZhi && (pei.miYao || pei.miYaoYiCun));
      this.setData({
        'ai.zhuangTai': 'shengCheng',
        'ai.wen': '',
        'ai.xianShiWen': '',
        'ai.huiTui': false,
        'ai.cuoYin': '',
        'ai.sheKai': false,
        'ai.sheZhi': sheZhi,
        'ai.moXing': (pei && pei.moXing) || '',
        'ai.aiKeYong': aiKeYong,
        'ai.biaoQian': laiYuanBiaoQian('', false, sheZhi, (pei && pei.moXing) || '', true)
      });
      let jie = null;
      try {
        jie = await shengChengZhenDuan(r, { ai: pei }, sheZhi);
      } catch (e) {
        this.setData({
          'ai.zhuangTai': 'cuo',
          'ai.cuoYin': (e && e.message) || '生成失败',
          'ai.biaoQian': laiYuanBiaoQian('', false, sheZhi, '', false)
        });
        return;
      }
      this.daZi(jie);
      // 本地规则兜底时如实说明是「读不到服务器配置」——比笼统的「未接入大模型」可操作
      if (!aiKeYong && aiPeiZhiCuo())
        this.setData({ 'ai.biaoQian': '本地规则引擎 · 读不到服务器配置', 'ai.cuoYin': aiPeiZhiCuo() });
    },

    // 打字机：与网页端同款观感（分批显示，避免 setData 过频）
    daZi(jie) {
      const wen = jie.wen || '';
      // 诊断结论挂进全局状态：AI 聊天（aiLiaoTian）注入上下文，用户问「为什么」时结合它答
      duTai().zhengDuanWen = wen;
      this.setData({
        'ai.zhuangTai': 'daZi',
        'ai.wen': wen,
        'ai.xianShiWen': '',
        'ai.laiYuan': jie.laiYuan,
        'ai.huiTui': !!jie.jiangJi,
        'ai.cuoYin': jie.cuoYin || '',
        'ai.biaoQian': laiYuanBiaoQian(jie.laiYuan, !!jie.jiangJi, this.data.ai.sheZhi, this.data.ai.moXing, false)
      });
      let i = 0;
      const bu = 3;
      const zou = () => {
        i += bu;
        this.setData({ 'ai.xianShiWen': wen.slice(0, i) });
        if (i < wen.length) this.daZiTimer = setTimeout(zou, 28);
        else {
          this.daZiTimer = null;
          this.setData({ 'ai.zhuangTai': 'wanCheng' });
        }
      };
      zou();
    },

    kaiShe() {
      this.setData({ 'ai.sheKai': !this.data.ai.sheKai });
    },

    qieSheZhi(e) {
      const v = e.currentTarget.dataset.v;
      const ai = this.data.ai;
      if (v === 'ai' && !ai.aiKeYong) {
        plat.toast({ title: '管理员还没配置大模型' });
        return;
      }
      if (v === ai.sheZhi) {
        this.setData({ 'ai.sheKai': false });
        return;
      }
      cunShengChengFangShi(v);
      this.setData({ 'ai.sheZhi': v, 'ai.sheKai': false });
      this.shengCheng(); // 切换生成方式即重算（与网页端一致）
    },

    /* ── AI 半屏浮层（「问问 AI 助手」不再跳页，就在本页问）：实现见 common/aiFu.js，与地图页共用 ── */
    ...AI_FU_FANG_FA,

    /* ── 盲区动作 ── */
    huiDiTu() {
      let ceng = [];
      try {
        ceng = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
      } catch {
        ceng = [];
      }
      const shang = ceng.length > 1 ? ceng[ceng.length - 2] : null;
      const lu = (shang && (shang.route || shang.__route__)) || '';
      if (lu.indexOf('ditu') >= 0) plat.navigateBack();
      else plat.quYe('/pages/ditu/ditu');
    },

    kanDiTu(e) {
      const id = e.currentTarget.dataset.id;
      duTai().juJiaoMangQu = id;
      this.huiDiTu();
    },

    biaoJi(e) {
      const id = e.currentTarget.dataset.id;
      const r = duBaoGao();
      const m = (r.mangquList || []).find(x => x.id === id);
      const t = duTai();
      if (!m) return;
      if (!t.yongHu || !t.yongHu.zhangHao) {
        plat.toast({ title: '请先登录' });
        setTimeout(() => plat.navigateTo('/pages/denglu/denglu'), 300);
        return;
      }
      const zx = m.buJianDian || m.zhongxin;
      plat.loading('提交中…');
      plat
        .request({
          url: fuWu('/api/mangqu/biaoJi'),
          method: 'POST',
          timeout: 15000,
          data: {
            zhangHao: t.yongHu.zhangHao,
            lng: zx.lng,
            lat: zx.lat,
            beiZhu: `${t.diMing || ''} 盲区 ${m.id}：建议补建${(m.quekou || []).join('/') || '便民设施'}`
          }
        })
        .then(x => {
          plat.hideLoading();
          const j = typeof x.data === 'string' ? JSON.parse(x.data) : x.data;
          if (!j || j.ok === false) throw new Error((j && j.xinxi) || '提交失败');
          plat.toast({ title: '已标记，地图上可看到', icon: 'success' });
        })
        .catch(err => {
          plat.hideLoading();
          plat.modal({ title: '标记失败', content: (err && err.message) || '请稍后重试', showCancel: false });
        });
    },

    onShareAppMessage() {
      const t = duTai();
      const r = duBaoGao();
      return {
        title: r ? `${t.diMing || '本社区'}体检得分 ${r.total} 分（${dengJiMing(r.dengji)}）` : '15 分钟生活圈体检助手',
        path: '/pages/tijian/tijian'
      };
    }
  };
}
