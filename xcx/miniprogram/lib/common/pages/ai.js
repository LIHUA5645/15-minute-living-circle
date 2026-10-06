// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// AI 助手（在线问答）：与网页端同一套提示词与上下文注入，问答内容一字同源；
// 收到「【导航】目的地」时用本地选点把目的地落到本轮真实设施上，再唤起系统地图导航。
// 未接入大模型时，仍可按「去最近的医院」这类说法走本地规则选点（与网页端的兜底分支一致）。
import { plat } from '../plat.js';
import { duFuWuDiZhi } from '../peizhi.js';
import { duTai, duBaoGao } from '../zhuangTai.js';
import {
  aiLiaoTian,
  aiXuanDian,
  duAiPeiZhi,
  aiPeiZhiCuo,
  aiBuKeYongShuoMing,
  shiDaoHangYiTu,
  tiQuMuDiDi,
  duLiaoTianJiLu,
  cunLiaoTianJiLu
} from '../ai.js';
import { wgsDaoGcj } from '../zuobiao.js';
import { juLiMi } from '../bidui.js';
import { FENLEI_MING } from '../../core/types.js';

const TUI_JIAN = ['帮我找最近的医院', '我这个社区看病方便吗？', '盲区是什么意思？', '附近适合散步锻炼吗？'];
const BU_SU = 80; // 米/分钟

let xiaXiHao = 0; // 消息自增 id（列表 key 与滚动定位都用它，避免重复 key 告警）

export function chuangJianAi() {
  return {
    data: {
      pingTai: plat.mingCheng,
      lieBiao: [], // [{role:'user'|'ai'|'cuo', wen}]
      wen: '',
      zhong: false,
      tuiJian: TUI_JIAN,
      aiKeYong: false,
      aiCuo: '', // 读服务器配置失败的原因（非空时表头如实说明「读不到配置」，而不是说成没配）
      fuWuDiZhi: '', // 当前服务端地址（提示条上直接摆出来，免得用户去「我的」页翻）
      chongLianZhong: false, // 是否正在自动重连（提示条上如实显示）
      moXing: '',
      moXingWen: '',
      daoHang: null, // {ming, se, ju, liYou}
      gunDao: '',
      youBaoGao: false
    },

    // 自动重连的定时器与次数（不参与渲染，放 data 外面）
    chongLianTimer: null,
    chongLianCi: 0,

    onLoad() {
      const t = duTai();
      // 历史记录里的 id 是「上一次会话」的自增号，冷启动后计数器又从 1 开始，
      // 直接沿用会在 wx:key 上撞号（控制台一直刷 Do not set same key）。
      // 统一重排一遍，并把计数器推到已用最大值之后
      const lieBiao = duLiaoTianJiLu(t.yongHu && t.yongHu.zhangHao).map((m, i) => ({ ...m, id: i + 1 }));
      xiaXiHao = lieBiao.length;
      this.setData({ lieBiao, youBaoGao: !!duBaoGao() });
      this.laPeiZhi(true); // 进页面就重读一次配置，别拿别的页面留下的旧状态
      this.gun();
    },

    onUnload() {
      this.tingChongLian();
      this.cun();
    },

    // 返回「是否已接入」，方便调用方（重试按钮）据此提示
    laPeiZhi(qiangZhi) {
      return duAiPeiZhi(qiangZhi).then(ai => {
        const ke = !!(ai && ai.qiYong && ai.apiDiZhi && (ai.miYao || ai.miYaoYiCun) && ai.moXing);
        const mo = (ai && ai.moXing) || '';
        this.setData({
          aiKeYong: ke,
          aiCuo: ke ? '' : aiPeiZhiCuo(),
          fuWuDiZhi: duFuWuDiZhi(),
          moXing: mo,
          moXingWen: mo ? (mo.length > 20 ? mo.slice(0, 20) + '…' : mo) : ''
        });
        // 读不到就悄悄自动重连：用户把服务端起起来（或换完网段）就能自动接上，不必手点
        this.tingChongLian();
        if (ke) this.chongLianCi = 0;
        else this.qiChongLian();
        return ke;
      });
    },

    // 自动重连：每 6 秒重读一次配置，最多 5 次；接通即停并提示一次
    qiChongLian() {
      this.chongLianCi = (this.chongLianCi || 0) + 1;
      if (this.chongLianCi > 5) {
        this.setData({ chongLianZhong: false });
        return;
      }
      this.setData({ chongLianZhong: true });
      this.chongLianTimer = setTimeout(async () => {
        this.chongLianTimer = null;
        const ke = await this.laPeiZhi(true); // 内部按结果决定是否继续下一轮
        if (ke) plat.toast({ title: '已自动接通服务器' });
      }, 6000);
    },
    tingChongLian() {
      if (this.chongLianTimer) clearTimeout(this.chongLianTimer);
      this.chongLianTimer = null;
      if (this.data.chongLianZhong) this.setData({ chongLianZhong: false });
    },

    // 读不到服务器配置时的「重试」：用户照着提示起好服务端 / 改完地址后点一下就能接着聊，不必退出重进
    async chongShiPeiZhi() {
      plat.loading('重读配置…');
      this.chongLianCi = 0; // 手动重试算重新开始一轮自动重连
      const ke = await this.laPeiZhi(true);
      plat.hideLoading();
      plat.toast({ title: ke ? '已接通服务器' : '还是读不到，请检查服务端地址与启动状态' });
    },

    cun() {
      const t = duTai();
      cunLiaoTianJiLu(t.yongHu && t.yongHu.zhangHao, this.data.lieBiao);
    },

    sheRu(e) {
      this.setData({ wen: e.detail.value });
    },

    gun() {
      const lie = this.data.lieBiao;
      const zuiHou = lie.length ? lie[lie.length - 1] : null;
      this.setData({ gunDao: zuiHou ? 'm' + zuiHou.id : '' });
    },

    dianTuiJian(e) {
      const w = e.currentTarget.dataset.w;
      this.setData({ wen: w }, () => this.faSong());
    },

    qingKong() {
      plat.modal({ title: '开始新对话', content: '当前对话记录将清空（只影响本机）', showCancel: true }).then(que => {
        if (!que) return;
        xiaXiHao = 0;
        this.setData({ lieBiao: [], daoHang: null });
        this.cun();
      });
    },

    async faSong() {
      const wen = String(this.data.wen || '').trim();
      if (!wen || this.data.zhong) return;
      const t = duTai();
      const report = duBaoGao();
      const lieBiao = [...this.data.lieBiao, { id: ++xiaXiHao, role: 'user', wen }];
      this.setData({ lieBiao, wen: '', zhong: true, daoHang: null });
      this.gun();

      // 发送前强制复核一次配置：表头可能是几分钟前读的（那会儿服务端好好的），
      // 中途服务端停了、地址改了都会变——不复核就会出现「表头说已接入、回复说没配置」
      const ai = await duAiPeiZhi(true);
      const aiKeYong = !!(ai && ai.qiYong && ai.apiDiZhi && (ai.miYao || ai.miYaoYiCun) && ai.moXing);
      this.setData({
        aiKeYong,
        aiCuo: aiKeYong ? '' : aiPeiZhiCuo(),
        moXingWen: ai.moXing ? (ai.moXing.length > 20 ? ai.moXing.slice(0, 20) + '…' : ai.moXing) : ''
      });
      const shangXiaWen = t.zhongXin ? { lng: t.zhongXin.lng, lat: t.zhongXin.lat, ming: t.diMing } : null;

      let hui = '';
      let cuo = '';
      if (aiKeYong) {
        // 历史里最后一条刚 push 的是本次提问，传给模型时要去掉（函数内部会再拼一次）
        const r = await aiLiaoTian(lieBiao.slice(0, -1), wen, report, ai, shangXiaWen);
        if (r.ok) hui = r.hui;
        else cuo = r.xinxi;
      } else {
        // 与问答内部同一套话术：读不到服务端配置时不能再说成「管理员没配」
        cuo = aiBuKeYongShuoMing(ai) || '大模型当前不可用，请稍后再试。';
      }

      // 导航意图：①模型回了「【导航】目的地」②或未接入大模型时按本地词元判定
      const m = hui.match(/【导航】\s*([^\n]+)/);
      const muDi = m ? m[1].trim() : (aiKeYong ? '' : shiDaoHangYiTu(wen) ? tiQuMuDiDi(wen) : '');
      if (muDi) {
        const jiZhun = (report && report.zhongXin) || t.zhongXin;
        const x = await aiXuanDian(muDi, report, jiZhun, ai);
        if (x.ok) {
          const ju = jiZhun ? Math.round(juLiMi(jiZhun, x.poi)) : 0;
          this.taoDian = x.poi;
          hui = `${x.poi.name}（${FENLEI_MING[x.poi.fenlei] || x.poi.fenlei}）——${x.liYou}`;
          cuo = '';
          this.setData({
            daoHang: {
              ming: x.poi.name,
              juWen: ju ? `直线约 ${ju} 米 · 步行约 ${Math.max(1, Math.round(ju / BU_SU))} 分钟` : '',
              liYou: x.liYou
            }
          });
        } else {
          hui = '';
          cuo = x.xinxi;
        }
      }

      const xinLie = [...this.data.lieBiao];
      if (hui) xinLie.push({ id: ++xiaXiHao, role: 'ai', wen: hui });
      if (cuo) xinLie.push({ id: ++xiaXiHao, role: 'cuo', wen: cuo });
      this.setData({ lieBiao: xinLie, zhong: false }, () => {
        this.gun();
        this.cun();
      });
    },

    // 带我去：唤起系统地图（导航仍交给系统地图，与网页端「尊重平台能力」的思路一致）
    daiWoQu() {
      const d = this.data.daoHang;
      if (!d || !this.taoDian) return;
      const q = wgsDaoGcj({ lng: this.taoDian.lng, lat: this.taoDian.lat });
      plat.openLocation({
        lng: q.lng,
        lat: q.lat,
        name: this.taoDian.name || d.ming,
        address: this.taoDian.address || ''
      });
    },

    buQu() {
      this.setData({ daoHang: null });
    },

    quBaoGao() {
      plat.navigateTo('/pages/baogao/baogao');
    },

    quDiTu() {
      plat.navigateBack();
    },

    onShareAppMessage() {
      return { title: '15 分钟生活圈体检助手', path: '/pages/ditu/ditu' };
    }
  };
}
