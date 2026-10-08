// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，08
// AI 半屏浮层（地图页与生活圈页共用）：在当前页直接把问题问完，不跳「助手」tab。
//
// 为什么抽成模块：这套东西（会话读写 + 发问 + 消息自增 id + 滚动定位）两个页面都要用，
// 各写一份迟早走样；而且会话本来就与助手页共用同一份存储（关掉浮层记录仍在历史对话里），
// 逻辑更该只有一处。页面里这样用：
//   import { AI_FU_SHU_JU, AI_FU_FANG_FA } from '../aiFu.js';
//   Page({ data: { ...AI_FU_SHU_JU }, ...AI_FU_FANG_FA });
// 视图（三端同构）见 pages/{ditu,baogao}/*.wxml 里的 .ai-fu 段，样式在 app.wxss 的 .ai-fu* 系列。
import { plat } from './plat.js';
import { fuWu } from './peizhi.js';
import { duTai, duBaoGao } from './zhuangTai.js';
import {
  duHuiHua,
  cunHuiHua,
  kongHuiHua,
  aiLiaoTian,
  duAiPeiZhi,
  aiBuKeYongShuoMing,
  aiXuanDian,
  shiDaoHangYiTu,
  tiQuMuDiDi,
  guiDangKaiXin
} from './ai.js';
import { FENLEI_MING } from '../core/types.js';

let xiaXiHao = 0; // 浮层里的消息自增 id（与助手页各自编号，互不干扰）

// 与助手页同款的小工具（附件展示用）
function daXiaoWen(n) {
  const b = Number(n) || 0;
  if (!b) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return Math.round(b / 1024) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
function kuoZhan(ming) {
  const m = /\.([a-zA-Z0-9]+)$/.exec(String(ming || ''));
  return m ? m[1].toLowerCase() : '';
}

// 浮层要用的 data 片段：页面直接展开进自己的 data
export const AI_FU_SHU_JU = {
  aiFuKai: false, // 浮层显隐；抽屉常驻渲染、只切 .kai，所以升起与落下都有动画
  aiLie: [], // 消息（结构与助手页同一套：role / wen / an / fu）
  aiWen: '',
  aiZhong: false, // 正在等回复（驱动"正在输入"三点）
  aiKeYong: false, // 大模型是否可用（头部状态胶囊）
  aiGun: '', // scroll-into-view 的目标 id
  yuYinMoShi: false, // 语音 / 键盘模式
  luYinZhong: false, // 录音中
  luYinQuXiao: false, // 上滑取消态
  luYinMiao: 0, // 已录秒数
  fujian: [] // 待发送附件
};

export const AI_FU_FANG_FA = {
  kaiAiFu() {
    // 地图页有个「定位方式小面板」（xuanDianKai），开浮层时顺手收起；
    // 生活圈页没这个字段，setData 补一个 false 也无害
    this.setData({ xuanDianKai: false });
    const t = duTai();
    let hh = duHuiHua(t.yongHu && t.yongHu.zhangHao);
    if (!hh.lie.length) {
      hh.lie = [kongHuiHua()];
      hh.dangQian = hh.lie[0].id;
    }
    if (!hh.lie.some(h => h.id === hh.dangQian)) hh.dangQian = hh.lie[0].id;
    // 新一轮体检完成后打开浮层：旧会话归档进历史、自动开一个新会话（与助手页同一套判据）
    hh = guiDangKaiXin(t.yongHu && t.yongHu.zhangHao, hh);
    this.hhZhuang = hh;
    const ben = hh.lie.find(h => h.id === hh.dangQian) || {};
    const lie = (ben.jiLu || []).map((m, i) => ({ ...m, id: i + 1 }));
    xiaXiHao = lie.length;
    this.setData({ aiFuKai: true, aiLie: lie }, () => this.aiGun());
    duAiPeiZhi().then(ai =>
      this.setData({ aiKeYong: !!(ai && ai.qiYong && ai.apiDiZhi && (ai.miYao || ai.miYaoYiCun) && ai.moXing) })
    );
  },

  guanAiFu() {
    if (!this.data.aiFuKai) return;
    this.aiCun();
    this.setData({ aiFuKai: false });
  },

  // 把浮层里的消息写回当前会话：助手页读的是同一份存储，所以关掉后记录仍在历史对话里
  aiCun() {
    const hh = this.hhZhuang;
    if (!hh) return;
    const ben = hh.lie.find(h => h.id === hh.dangQian);
    if (!ben) return;
    ben.jiLu = this.data.aiLie.map(m => ({ role: m.role, wen: m.wen, an: m.an || '' }));
    if (ben.jiLu.length) ben.shiJian = Date.now();
    const t = duTai();
    cunHuiHua(t.yongHu && t.yongHu.zhangHao, hh);
  },

  aiSheRu(e) {
    this.setData({ aiWen: e.detail.value });
  },

  aiGun() {
    const lie = this.data.aiLie;
    const zuiHou = lie.length ? lie[lie.length - 1] : null;
    const dao = this.data.aiZhong ? 'a-zhong' : zuiHou ? 'a' + zuiHou.id : '';
    if (!dao) return;
    // 置空再设同一个值：scroll-into-view 收到相同值不会重复触发滚动（见 README 第 10 节第 4 条踩坑）
    this.setData({ aiGun: '' }, () => this.setData({ aiGun: dao }));
  },

  async aiFaSong() {
    const wen = String(this.data.aiWen || '').trim();
    const fu = (this.data.fujian || []).slice();
    // 只带附件、不写字也允许发（与助手页 faSong 同一套规则）
    if ((!wen && !fu.length) || this.data.aiZhong) return;
    const t = duTai();
    const report = duBaoGao();
    // 附件怎么进模型：文本类读正文拼进提问，二进制只报名字，图片只在气泡展示（与助手页一致）
    let wenSong = wen;
    const WEN_BEN_LEI = ['txt', 'md', 'csv', 'json', 'log'];
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
    const lie = [...this.data.aiLie, { id: ++xiaXiHao, role: 'user', wen, fu }];
    this.setData({ aiLie: lie, aiWen: '', fujian: [], aiZhong: true }, () => this.aiGun());
    const ai = await duAiPeiZhi(true);
    const ke = !!(ai && ai.qiYong && ai.apiDiZhi && (ai.miYao || ai.miYaoYiCun) && ai.moXing);
    this.setData({ aiKeYong: ke });
    const shangXiaWen = t.zhongXin ? { lng: t.zhongXin.lng, lat: t.zhongXin.lat, ming: t.diMing } : null;
    let hui = '';
    let cuo = '';
    if (ke) {
      const r = await aiLiaoTian(lie.slice(0, -1), wenSong, report, ai, shangXiaWen);
      if (r.ok) hui = r.hui;
      else cuo = r.xinxi;
    } else {
      cuo = aiBuKeYongShuoMing(ai) || '大模型当前不可用，请稍后再试。';
    }
    // 导航意图：①模型回了「【导航】目的地」②未接入大模型时按本地词元判定。
    // 浮层背后就是地图（生活圈页则跳过去）：选中设施后**就地**画路线 + 开站内导航，
    // 不再像旧版那样把用户支去「助手」页
    const m = hui.match(/【导航】\s*([^\n]+)/);
    const muDi = m ? m[1].trim() : (!ke && shiDaoHangYiTu(wenSong) ? tiQuMuDiDi(wenSong) : '');
    let xuanHao = false;
    if (muDi) {
      const jiZhun = (report && report.zhongXin) || t.zhongXin;
      const x = await aiXuanDian(muDi, report, jiZhun, ai);
      if (x.ok) {
        hui = `好，去 ${x.poi.name}（${FENLEI_MING[x.poi.fenlei] || x.poi.fenlei}）——${x.liYou}。我在地图上给你规划过去。`;
        cuo = '';
        this.daoHangSheShi = x.poi;
        xuanHao = true;
      } else {
        hui = '';
        cuo = x.xinxi;
      }
    }
    const xin = [...this.data.aiLie];
    if (hui) xin.push({ id: ++xiaXiHao, role: 'ai', wen: hui, fu: fu.length ? fu : undefined });
    if (cuo) {
      const yao = /还没有体检结果|没有检索到任何设施/.test(cuo);
      xin.push({ id: ++xiaXiHao, role: 'cuo', wen: cuo, an: yao ? '收起，去跑一轮体检' : '' });
    }
    this.setData({ aiLie: xin, aiZhong: false }, () => {
      this.aiGun();
      this.aiCun();
      // 消息落定后再触发地图动作（收浮层、画线、开导航）
      if (xuanHao && this.daoHangSheShi) {
        if (typeof this.daoHangDaoSheShi === 'function') {
          this.daoHangDaoSheShi();
        } else {
          duTai().juJiaoDaoHang = this.daoHangSheShi;
          this.daoHangSheShi = null;
          plat.quYe('/pages/ditu/ditu');
          plat.toast({ title: '正在给你规划路线' });
        }
      }
    });
  },

  /* ── 语音输入（与助手页同一套：按住说话、松手识别即发、上滑取消）──
     落点不同：识别文本进 aiWen、发送走 aiFaSong */
  qieMoShi() {
    this.setData({ yuYinMoShi: !this.data.yuYinMoShi, luYinQuXiao: false });
  },

  async maiAn(e) {
    if (this.data.aiZhong || this.data.luYinZhong) return;
    const dian = e.touches && e.touches[0];
    this.luYinQi = dian ? dian.clientY : 0;
    this.luYinKaiShi = Date.now();
    this.luYinQuXiaoBiao = false;
    this.luYinYaoTing = false; // 松手意图标记：luYinKai 的 120ms 启动窗口内松手，靠它在启动后闭环收尾
    try {
      await plat.luYinKai();
    } catch (err) {
      if (!/cancel|取消/i.test((err && err.message) || ''))
        plat.toast({ title: (err && err.message) || '无法开始录音' });
      return;
    }
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
    this.luYinTimer = setInterval(() => {
      const m = this.data.luYinMiao + 1;
      this.setData({ luYinMiao: m });
      if (m >= 30) this.maiSong();
    }, 1000);
  },

  maiDong(e) {
    if (!this.data.luYinZhong) return;
    const dian = e.touches && e.touches[0];
    if (!dian) return;
    const shang = (this.luYinQi || 0) - dian.clientY;
    const qu = shang > 60;
    this.luYinQuXiaoBiao = qu;
    if (qu !== this.data.luYinQuXiao) this.setData({ luYinQuXiao: qu });
  },

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
    if (qu) return;
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
        this.setData({ aiWen: j.wen }, () => this.aiFaSong()); // 说完就发
      } else {
        plat.toast({ title: (j && j.xinxi) || '没听清，再说一次试试' });
      }
    } catch (err) {
      plat.hideLoading();
      plat.toast({ title: (err && err.message) || '语音识别失败' });
    }
  },

  maiQuXiao() {
    this.luYinQuXiaoBiao = true;
    this.maiSong();
  },

  /* ── 附件（拍照/相册/聊天文件），与助手页同一套 ── */
  async xuanFuJian() {
    if (this.data.aiZhong) return;
    const i = await plat.actionSheet(['拍照 / 从相册选', '从聊天记录选文件']);
    if (i === 0) return this.jiaTu();
    if (i === 1) return this.jiaWenJian();
  },

  async jiaTu() {
    try {
      const lie = await plat.xuanTu({ shu: 1 });
      const jia = [];
      for (const t of lie) {
        const lu = await plat.baoFile(t.lu);
        jia.push({ lei: 'image', lu, ming: '图片', daXiaoWen: daXiaoWen(t.daXiao), kuozhan: '' });
      }
      this.setData({ fujian: [...this.data.fujian, ...jia] });
    } catch (e) {
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

  // 浮层里的出口按钮（「收起，去跑一轮体检」）：收起浮层并切到地图页，把底部的「开始体检」露出来。
  // 「开始体检」只在地图页有，所以这里统一跳地图页（在地图页时它本来就是当前页，切一次无副作用）
  quAiTiJian() {
    this.aiCun();
    this.setData({ aiFuKai: false });
    plat.quYe('/pages/ditu/ditu');
    plat.toast({ title: '点「开始体检」跑一轮，跑完再点开我' });
  }
};
