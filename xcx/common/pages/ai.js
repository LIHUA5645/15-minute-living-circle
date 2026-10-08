// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// AI 助手（在线问答）：与网页端同一套提示词与上下文注入，问答内容一字同源；
// 收到「【导航】目的地」时用本地选点把目的地落到本轮真实设施上，再唤起系统地图导航。
// 未接入大模型时，仍可按「去最近的医院」这类说法走本地规则选点（与网页端的兜底分支一致）。
import { plat, biaoTab } from '../plat.js';
import { duFuWuDiZhi, fuWu } from '../peizhi.js';
import { duTai, duBaoGao, cunDaiXu, quDaiXu, qingDaiXu } from '../zhuangTai.js';
import { zhaoHuWen, guiDangKaiXin } from '../ai.js';
import { quTianQi } from '../adapters/bmapXcx.js';
import {
  aiLiaoTian,
  aiXuanDian,
  duAiPeiZhi,
  aiPeiZhiCuo,
  aiBuKeYongShuoMing,
  shiDaoHangYiTu,
  tiQuMuDiDi,
  duHuiHua,
  cunHuiHua,
  kongHuiHua
} from '../ai.js';
import { wgsDaoGcj } from '../zuobiao.js';
import { juLiMi } from '../bidui.js';
import { FENLEI_MING } from '../../core/types.js';

const TUI_JIAN = ['帮我找最近的医院', '我这个社区看病方便吗？', '盲区是什么意思？', '附近适合散步锻炼吗？'];
const BU_SU = 80; // 米/分钟

let xiaXiHao = 0; // 消息自增 id（列表 key 与滚动定位都用它，避免重复 key 告警）

const MING_CHANG = 14; // 侧栏里会话标题取提问的前几个字

// 会话标题：取该会话里第一条用户提问；没有内容就叫「新对话」
function huiHuaMing(h) {
  const shou = (h.jiLu || []).find(m => m.role === 'user' && m.wen);
  const w = shou ? String(shou.wen).trim() : '';
  if (!w) return '新对话';
  return w.length > MING_CHANG ? w.slice(0, MING_CHANG) + '…' : w;
}

// 会话时间：刚刚 / N 分钟前 / N 小时前 / N 天前 / M月D日
function shiJianWen(t) {
  const c = Math.max(0, Date.now() - (t || 0));
  if (c < 60e3) return '刚刚';
  if (c < 36e5) return Math.floor(c / 60e3) + ' 分钟前';
  if (c < 864e5) return Math.floor(c / 36e5) + ' 小时前';
  if (c < 6048e5) return Math.floor(c / 864e5) + ' 天前';
  const d = new Date(t);
  return d.getMonth() + 1 + '月' + d.getDate() + '日';
}

// 附件里能在端上读出正文的扩展名；docx / pdf 是二进制，读出来是乱码，不读
const WEN_BEN_LEI = ['txt', 'md', 'csv', 'json', 'log'];

function kuoZhan(ming) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(String(ming || ''));
  return m ? m[1].toLowerCase() : '';
}

function daXiaoWen(n) {
  const b = Number(n) || 0;
  if (!b) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return Math.round(b / 1024) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

export function chuangJianAi() {
  return {
    data: {
      pingTai: plat.mingCheng,
      lieBiao: [], // [{role:'user'|'ai'|'cuo', wen}]
      zhaoHu: '', // 进入聊天时的状态总结式招呼（不入库，每次进入都新鲜生成）
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
      youBaoGao: false,
      huiHua: [], // 侧栏列表：[{id, ming, shiJianWen, shu, dangQian}]
      huiHuaKai: false, // 侧栏是否展开（展开动画由 .hh-ce.kai 的 transform 过渡做）
      dangQianId: '', // 当前会话 id（与侧栏项比对用）
      fujian: [], // 待发送的附件：[{lei:'image'|'wenjian', lu, ming, daXiaoWen, kuozhan}]
      luYinZhong: false, // 是否正在录音（按钮切高亮态）
      luYinQuXiao: false, // 手指滑进「取消」区（浮层转红）
      luYinMiao: 0, // 录音秒数（服务端音频上限约 30 秒）
      yuYinMoShi: false, // 语音模式：输入框整条换成「按住 说话」（与微信一致）
      fuWuTiShi: '' // 地址还是 127.0.0.1 时的补充提示（真机必须换内网地址）
    },

    // 自动重连的定时器与次数（不参与渲染，放 data 外面）
    chongLianTimer: null,
    chongLianCi: 0,

    onLoad() {
      const t = duTai();
      let hh = duHuiHua(t.yongHu && t.yongHu.zhangHao);
      // 首次使用（或历史被删空）先开一条空白会话：侧栏不该是空的，页面也得有个地方写
      if (!hh.lie.length) {
        hh.lie = [kongHuiHua()];
        hh.dangQian = hh.lie[0].id;
      }
      if (!hh.lie.some(h => h.id === hh.dangQian)) hh.dangQian = hh.lie[0].id;
      // 新一轮体检完成后进聊天：旧会话归档进历史、自动开一个新会话
      hh = guiDangKaiXin(t.yongHu && t.yongHu.zhangHao, hh);
      this.hhZhuang = hh; // 会话真身放页面实例上，不进 data（只把渲染要用的派生出来）
      // 历史记录里的 id 是「上一次会话」的自增号，冷启动后计数器又从 1 开始，
      // 直接沿用会在 wx:key 上撞号（控制台一直刷 Do not set same key）。
      // 统一重排一遍，并把计数器推到已用最大值之后
      const lieBiao = (((this.dangQianHuiHua() || {}).jiLu) || []).map((m, i) => ({ ...m, id: i + 1 }));
      xiaXiHao = lieBiao.length;
      this.setData({ lieBiao, youBaoGao: !!duBaoGao(), ...this.hhShuJu() });
      this.laPeiZhi(true); // 进页面就重读一次配置，别拿别的页面留下的旧状态
      this.gun();
    },

    onShow() {
      // 自定义 tabBar（微信端）的选中态由页面回报
      biaoTab(this, 2);
      // 体检完成后再切回来：旧会话归档开新（与 onLoad 同一套判据）
      const xinHh = guiDangKaiXin(duTai().yongHu && duTai().yongHu.zhangHao, this.hhZhuang);
      if (xinHh !== this.hhZhuang) {
        this.hhZhuang = xinHh;
        const lieBiao = (((this.dangQianHuiHua() || {}).jiLu) || []).map((m, i) => ({ ...m, id: i + 1 }));
        xiaXiHao = lieBiao.length;
        this.setData({ lieBiao, ...this.hhShuJu() });
      }
      // 进入聊天先打一圈招呼：总结报告要点 + 天气（不入库，每次进入都新鲜）
      quTianQi(duTai().zhongXin).then(tq => {
        this.setData({ zhaoHu: zhaoHuWen(duBaoGao(), tq, duTai().diMing) });
      });
      // 从别的页切回来也贴着最新一条（与微信聊天的观感一致）
      this.gun();
      // 若是「去体检」回来的：把刚才那个问题自动接着问一遍（体检已跑完才有意义）
      const dai = quDaiXu();
      if (dai && !this.data.zhong) {
        qingDaiXu();
        if (duBaoGao()) this.setData({ wen: dai }, () => this.faSong());
        else plat.toast({ title: '体检还没跑完，稍后可以再问我一次' });
      }
    },

    onHide() {
      // 切到别的页时收起侧栏：回来不该还停在一个半开的抽屉上
      this.guanHuiHua();
    },

    onUnload() {
      if (this.luYinTimer) clearInterval(this.luYinTimer);
      if (this.data.luYinZhong) plat.luYinTing(); // 别把录音留在后台继续占麦克风
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
          // 真机最常见的坑：地址还是 127.0.0.1（那指的是手机自己）。提示条上直接说清去哪改
          fuWuTiShi: /127\.0\.0\.1|localhost/i.test(duFuWuDiZhi())
            ? '（真机预览请把它改成电脑的内网地址，见 npm run fuwu 启动日志里打印的那个）'
            : '',
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

    // ── 会话（历史对话侧栏）──

    // 当前会话对象
    dangQianHuiHua() {
      const hh = this.hhZhuang;
      return hh ? hh.lie.find(h => h.id === hh.dangQian) || null : null;
    },

    // 侧栏要渲染的数据：标题 / 时间 / 条数 / 是否当前
    hhShuJu() {
      const hh = this.hhZhuang || { dangQian: '', lie: [] };
      return {
        huiHua: hh.lie.map(h => ({
          id: h.id,
          ming: huiHuaMing(h),
          shiJianWen: shiJianWen(h.shiJian),
          shu: (h.jiLu || []).length,
          dangQian: h.id === hh.dangQian
        })),
        dangQianId: hh.dangQian
      };
    },

    kaiHuiHua() {
      this.setData({ huiHuaKai: true });
    },

    guanHuiHua() {
      if (this.data.huiHuaKai) this.setData({ huiHuaKai: false });
    },

    // 把「当前会话」的消息载进页面（重排 id，与 onLoad 同一套规矩），并落盘
    zaiHuiHua() {
      if (!this.hhZhuang) return;
      const ben = this.dangQianHuiHua();
      const lieBiao = ((ben && ben.jiLu) || []).map((m, i) => ({ ...m, id: i + 1 }));
      xiaXiHao = lieBiao.length;
      this.setData({ lieBiao, daoHang: null, huiHuaKai: false, ...this.hhShuJu() }, () => this.gun());
      const t = duTai();
      cunHuiHua(t.yongHu && t.yongHu.zhangHao, this.hhZhuang);
    },

    qieHuanHuiHua(e) {
      const id = e.currentTarget.dataset.id;
      if (id === this.data.dangQianId) return this.guanHuiHua(); // 点的是当前会话：只收起侧栏
      this.cun(); // 先把当前会话写回，免得切走时丢最后几条
      this.hhZhuang.dangQian = id;
      this.zaiHuiHua();
    },

    shanHuiHua(e) {
      const id = e.currentTarget.dataset.id;
      const hh = this.hhZhuang;
      if (!hh) return;
      plat.modal({ title: '删除这条对话', content: '删除后无法恢复（只影响本机）', showCancel: true }).then(que => {
        if (!que) return;
        hh.lie = hh.lie.filter(h => h.id !== id);
        if (!hh.lie.length) hh.lie = [kongHuiHua()]; // 删光了也留一条空的，页面不至于没处写
        if (!hh.lie.some(h => h.id === hh.dangQian)) hh.dangQian = hh.lie[0].id;
        this.zaiHuiHua();
      });
    },

    // 把当前消息列表写回所属会话并落盘（标题 / 条数随之刷新）
    cun() {
      const hh = this.hhZhuang;
      const ben = this.dangQianHuiHua();
      if (!hh || !ben) return;
      ben.jiLu = this.data.lieBiao.map(m => ({ role: m.role, wen: m.wen, fu: m.fu || [], an: m.an || '' }));
      if (ben.jiLu.length) ben.shiJian = Date.now(); // 空会话不动时间，侧栏顺序才稳定
      const t = duTai();
      cunHuiHua(t.yongHu && t.yongHu.zhangHao, hh);
      this.setData(this.hhShuJu());
    },

    sheRu(e) {
      this.setData({ wen: e.detail.value });
    },

    // ── 附件（相机 / 相册 / 聊天文件）──

    // 输入条「＋」：底部动作表分流
    async xuanFuJian() {
      if (this.data.zhong) return;
      const i = await plat.actionSheet(['拍照 / 从相册选', '从聊天记录选文件']);
      if (i === 0) return this.jiaTu();
      if (i === 1) return this.jiaWenJian();
    },

    async jiaTu() {
      try {
        const lie = await plat.xuanTu({ shu: 1 });
        const jia = [];
        for (const t of lie) {
          // 存到本地换回持久路径：临时路径一重启就失效，历史里的图会变空白
          const lu = await plat.baoFile(t.lu);
          jia.push({
            lei: 'image',
            lu,
            ming: '图片',
            daXiaoWen: daXiaoWen(t.daXiao),
            kuozhan: ''
          });
        }
        this.setData({ fujian: [...this.data.fujian, ...jia] });
      } catch (e) {
        // 用户主动取消不算错误
        if (!/cancel|取消/i.test((e && e.message) || '')) plat.toast({ title: (e && e.message) || '选择图片失败' });
      }
    },

    async jiaWenJian() {
      try {
        const lie = await plat.xuanWenJian({ shu: 1 });
        const jia = lie.map(f => ({
          lei: 'wenjian',
          lu: f.lu,
          ming: f.ming || '文件',
          daXiaoWen: daXiaoWen(f.daXiao),
          kuozhan: kuoZhan(f.ming)
        }));
        this.setData({ fujian: [...this.data.fujian, ...jia] });
      } catch (e) {
        if (!/cancel|取消/i.test((e && e.message) || '')) plat.toast({ title: (e && e.message) || '选择文件失败' });
      }
    },

    shanFuJian(e) {
      const i = Number(e.currentTarget.dataset.i);
      this.setData({ fujian: this.data.fujian.filter((_, k) => k !== i) });
    },

    // ── 语音输入（按住说话，与微信一致）──
    // 按住开始录、松手结束并识别，识别结果**直接发出去**（「按住说话」的手感就是说完就发）；
    // 松手前手指上滑超过 60px 则取消本次录音

    // 语音 / 键盘模式切换：切到语音时输入框整条变成「按住 说话」（微信就是这么做的，
    // 语音模式下没有发送按钮——松手即发）
    qieMoShi() {
      this.setData({ yuYinMoShi: !this.data.yuYinMoShi, luYinQuXiao: false });
    },

    async maiAn(e) {
      if (this.data.zhong || this.data.luYinZhong) return;
      const dian = e.touches && e.touches[0];
      this.luYinQi = dian ? dian.clientY : 0; // 记起点，用来判断上滑取消
      this.luYinKaiShi = Date.now();
      this.luYinQuXiaoBiao = false;
      this.luYinYaoTing = false; // 用户已松手的意图标记（luYinKai 有 120ms 启动窗口，窗口内松手靠它闭环）
      try {
        await plat.luYinKai();
      } catch (err) {
        if (!/cancel|取消/i.test((err && err.message) || ''))
          plat.toast({ title: (err && err.message) || '无法开始录音' });
        return;
      }
      // 启动窗口内用户已经松手：立即收尾，绝不能把浮层挂起来没人管
      if (this.luYinYaoTing) {
        this.luYinYaoTing = false;
        try {
          await plat.luYinTing();
        } catch {
          /* 忽略 */
        }
        return;
      }
      this.setData({ luYinZhong: true, luYinQuXiao: false, luYinMiao: 0 });
      // 秒数 + 到点自动收：服务端音频上限约 30 秒，别让用户白录一场
      this.luYinTimer = setInterval(() => {
        const m = this.data.luYinMiao + 1;
        this.setData({ luYinMiao: m });
        if (m >= 30) this.maiSong();
      }, 1000);
    },

    // 手指滑动：上滑超过 60px 进入「松开取消」区（微信同款阈值手感）
    maiDong(e) {
      if (!this.data.luYinZhong) return;
      const dian = e.touches && e.touches[0];
      if (!dian) return;
      const shang = (this.luYinQi || 0) - dian.clientY;
      const qu = shang > 60;
      this.luYinQuXiaoBiao = qu;
      if (qu !== this.data.luYinQuXiao) this.setData({ luYinQuXiao: qu });
    },

    // 松手：取消的丢弃，否则识别后直接发送。
    // 若还在 luYinKai 启动窗口（luYinZhong 尚未置 true），先记下意图，maiAn 启动完成后自会收尾
    async maiSong() {
      if (!this.data.luYinZhong) {
        this.luYinYaoTing = true;
        return;
      }
      const qu = !!this.luYinQuXiaoBiao;
      if (this.luYinTimer) clearInterval(this.luYinTimer);
      this.luYinTimer = null;
      const miao = Date.now() - (this.luYinKaiShi || Date.now());
      const lu = await plat.luYinTing();
      this.setData({ luYinZhong: false, luYinQuXiao: false, luYinMiao: 0 });
      if (qu) return; // 上滑取消：跟微信一样静默处理，不弹提示
      if (miao < 800 || !lu) return plat.toast({ title: '说话时间太短' });
      plat.loading('识别中…');
      try {
        const b64 = await plat.duBase64(lu);
        const r = await plat.request({
          url: fuWu('/api/yuyin'),
          method: 'POST',
          data: { yin: b64 },
          timeout: 30000
        });
        const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        plat.hideLoading();
        if (j && j.ok && j.wen) {
          this.setData({ wen: j.wen }, () => this.faSong()); // 说完就发
        } else {
          plat.toast({ title: (j && j.xinxi) || '没听清，再说一次试试' });
        }
      } catch (err) {
        plat.hideLoading();
        plat.toast({ title: (err && err.message) || '语音识别失败' });
      }
    },

    // touchcancel（来电、系统打断等）：按取消处理，别把半截录音发出去
    maiQuXiao() {
      this.luYinQuXiaoBiao = true;
      this.maiSong();
    },

    // 备用入口：点一下开始、再点一下结束（长按不方便时用，识别结果追加进输入框不直接发）
    async luYin() {
      if (this.data.luYinZhong) {
        if (this.luYinTimer) clearTimeout(this.luYinTimer);
        this.luYinTimer = null;
        const lu = await plat.luYinTing();
        this.setData({ luYinZhong: false });
        if (!lu) return;
        plat.loading('识别中…');
        try {
          const b64 = await plat.duBase64(lu);
          const r = await plat.request({
            url: fuWu('/api/yuyin'),
            method: 'POST',
            data: { yin: b64 },
            timeout: 30000
          });
          const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
          plat.hideLoading();
          if (j && j.ok && j.wen) {
            // 追加而不是覆盖：允许先打字再说一句补上
            this.setData({ wen: (this.data.wen ? this.data.wen + ' ' : '') + j.wen });
          } else {
            plat.toast({ title: (j && j.xinxi) || '没听清，再说一次试试' });
          }
        } catch (e) {
          plat.hideLoading();
          plat.toast({ title: (e && e.message) || '语音识别失败' });
        }
        return;
      }
      if (this.data.zhong) return;
      try {
        await plat.luYinKai();
        this.setData({ luYinZhong: true });
        plat.toast({ title: '正在录音，说完再点一下结束' });
        // 服务端有体积上限（约 30 秒），到点自动结束，免得录太久白录一场
        this.luYinTimer = setTimeout(() => {
          if (this.data.luYinZhong) this.luYin();
        }, 30000);
      } catch (e) {
        if (!/cancel|取消/i.test((e && e.message) || '')) plat.toast({ title: (e && e.message) || '无法开始录音' });
      }
    },

    // 滚到底：正在思考就滚到「…」气泡，否则滚到最后一条消息。
    // 两个坑：① 不能在 setData 同一轮里立刻滚——那一刻新元素还没渲染出来，滚不动，
    //         所以调用方都要放在 setData 的回调里；② scroll-into-view 设成同一个值不会再触发滚动，
    //         中间隔一次清空，保证每条新消息都真滚下去
    gun() {
      const lie = this.data.lieBiao;
      const zuiHou = lie.length ? lie[lie.length - 1] : null;
      const dao = this.data.zhong ? 'm-zhong' : zuiHou ? 'm' + zuiHou.id : '';
      if (!dao) return;
      this.setData({ gunDao: '' }, () => this.setData({ gunDao: dao }));
    },

    dianTuiJian(e) {
      const w = e.currentTarget.dataset.w;
      this.setData({ wen: w }, () => this.faSong());
    },

    // 顶部「新对话」与侧栏底部「＋ 新对话」都走这里：新开一条并切过去。
    // 旧对话仍留在侧栏里随时能翻回来，所以不再需要「清空当前」这种破坏性动作
    qingKong() {
      const hh = this.hhZhuang;
      if (!hh) return;
      this.cun(); // 先把当前这条写回
      const h = kongHuiHua();
      hh.lie = [h, ...hh.lie];
      hh.dangQian = h.id;
      this.zaiHuiHua();
    },

    async faSong() {
      const wen = String(this.data.wen || '').trim();
      const fu = this.data.fujian.slice();
      // 只带附件、不写字也允许发（比如直接发一张图看看）
      if ((!wen && !fu.length) || this.data.zhong) return;
      const t = duTai();
      const report = duBaoGao();
      // 附件怎么进模型：文本类（txt/md/csv/json/log）把正文读出来拼进提问，模型就能"看到"内容；
      // docx/pdf/xlsx 是二进制，端上解析不了，只把文件名告诉它；图片只在气泡里展示（端上不做图像识别）
      let wenSong = wen;
      for (const f of fu) {
        if (f.lei !== 'wenjian') continue;
        const qian = wenSong ? '\n\n' : '';
        if (WEN_BEN_LEI.includes(f.kuozhan)) {
          try {
            const nei = await plat.duWenBen(f.lu, 3000);
            if (nei) wenSong += qian + `【附件「${f.ming}」的内容】\n${nei}`;
          } catch {
            /* 读不出来就只带文件名，不打断发送 */
          }
        } else {
          wenSong += qian + `（我附了一个文件：${f.ming}，端上无法解析它的正文）`;
        }
      }
      if (fu.some(f => f.lei === 'image')) wenSong += (wenSong ? '\n\n' : '') + '（我还附了图片，端上暂不做图像识别）';
      const lieBiao = [...this.data.lieBiao, { id: ++xiaXiHao, role: 'user', wen, fu }];
      // 滚底放进回调：这一刻新气泡才渲染出来（直接跟着 setData 调会滚不动）
      this.setData({ lieBiao, wen: '', fujian: [], zhong: true, daoHang: null }, () => this.gun());

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
        const r = await aiLiaoTian(lieBiao.slice(0, -1), wenSong, report, ai, shangXiaWen);
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
      if (cuo) {
        // 这两类「卡住」的提示，配一个一步到位的出口：直接去地图页跑体检
        // ⚠️ 这里的判定词必须和 ai.js 里那句提示的用词一致：改了文案就得同步改这里，
        // 否则新文案匹配不上，按钮会莫名其妙不再出现（上一版就踩了这个）
        const yaoTiJian = /还没有体检结果|没有检索到任何设施/.test(cuo);
        xinLie.push({ id: ++xiaXiHao, role: 'cuo', wen: cuo, an: yaoTiJian ? '去地图页跑一轮体检' : '' });
      }
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
      plat.quYe('/pages/baogao/baogao');
    },

    // 提示气泡里配的出口按钮：把人直接送到地图页跑体检。
    // ⚠️ 不能叫 quDiTu：页面里已经有一个同名方法（那是「返回上一页」），
    // 重名会互相覆盖（eslint 的 no-dupe-keys 抓到了这个）
    // 提示气泡里配的出口按钮：记住这次的问题 → 去地图页跑体检 → 跑完自动回来接着问。
    // ⚠️ 不能叫 quDiTu：页面里已有一个同名方法（那是「返回上一页」），重名会互相覆盖
    quTiJian() {
      const zuiHou = [...this.data.lieBiao].reverse().find(m => m.role === 'user');
      if (zuiHou && zuiHou.wen) cunDaiXu(zuiHou.wen);
      plat.quYe('/pages/ditu/ditu');
    },

    quDiTu() {
      plat.navigateBack();
    },

    onShareAppMessage() {
      return { title: '15 分钟生活圈体检助手', path: '/pages/ditu/ditu' };
    }
  };
}
