// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
/* global getCurrentPages */
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 报告页：总分/维度/告警/盲区清单/补建建议/AI 诊断，并能一键跳地图或共享标记。
// AI 诊断与网页端一致：打开即自动生成；可切换「大模型 / 本地规则」；大模型失败如实说明原因并回退。
import { plat } from '../plat.js';
import { fuWu } from '../peizhi.js';
import { duTai, duBaoGao } from '../zhuangTai.js';
import { shengChengZhenDuan, duAiPeiZhi, aiPeiZhiCuo, duShengChengFangShi, cunShengChengFangShi } from '../ai.js';
import { FENLEI_MING, FENLEI_QUANZHONG } from '../../core/types.js';
import { geShiMianJi, geShiHaoShi, fenSe, dengJiMing, mangSe } from '../bidui.js';

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
    yiJuWen: (m.yiJu || []).join('；')
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
      }
    },

    onLoad() {
      this.huaBaoGao();
      this.shengCheng();
    },

    onUnload() {
      if (this.daZiTimer) clearTimeout(this.daZiTimer);
    },

    huaBaoGao() {
      const r = duBaoGao();
      if (!r) {
        this.setData({ youBaoGao: false });
        return;
      }
      const t = duTai();
      const pf = (r.fenleiPingfen || []).slice().sort((a, b) => Number(b.score) - Number(a.score));
      const zuiDa = Math.max(1, ...pf.map(f => Number(f.score) || 0));
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
        jianYi: r.jianYi || []
      });
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

    quAi() {
      plat.navigateTo('/pages/ai/ai');
    },

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
      else plat.navigateTo('/pages/ditu/ditu');
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
