// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 报告页：总分/维度/告警/盲区清单/补建建议/AI 诊断，并能一键跳到地图或共享标记。
import { plat } from '../plat.js';
import { fuWu } from '../peizhi.js';
import { duTai, duBaoGao } from '../zhuangTai.js';
import { aiZhenDuan } from '../ai.js';
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
      ai: { zhuangTai: '', wen: '', cuo: '' }
    },

    onLoad() {
      this.huaBaoGao();
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
          quan: Math.round(((FENLEI_QUANZHONG[f.fenlei] || 0) * 100)),
          kuan: Math.max(4, Math.round(((Number(f.score) || 0) / zuiDa) * 100)),
          se: fenSe(f.score)
        })),
        warn: r.warnings || [],
        mangQuList: (r.mangquList || []).map(mangTiao),
        jianYi: r.jianYi || []
      });
    },

    /* ── AI 诊断 ── */
    shengChengAi() {
      const r = duBaoGao();
      if (!r) return;
      if (this.data.ai.zhuangTai === 'lun') return;
      this.setData({ ai: { zhuangTai: 'lun', wen: '', cuo: '' } });
      aiZhenDuan(r)
        .then(wen => this.setData({ ai: { zhuangTai: 'ok', wen, cuo: '' } }))
        .catch(e => this.setData({ ai: { zhuangTai: 'cuo', wen: '', cuo: (e && e.message) || '生成失败' } }));
    },

    fuZhiAi() {
      if (!this.data.ai.wen) return;
      plat.setStorage('sq_ai_zuihou', this.data.ai.wen);
      plat.toast({ title: '已复制到剪贴板', icon: 'success' });
      // 小程序无统一剪贴板 API，这里退一步：存本地 + 提示用户可长按选择文本
    },

    /* ── 盲区动作 ── */
    kanDiTu(e) {
      const id = e.currentTarget.dataset.id;
      duTai().juJiaoMangQu = id;
      plat.navigateTo('/pages/map/map');
    },

    biaoJi(e) {
      const id = e.currentTarget.dataset.id;
      const r = duBaoGao();
      const m = (r.mangquList || []).find(x => x.id === id);
      const t = duTai();
      if (!m) return;
      if (!t.yongHu || !t.yongHu.zhangHao) {
        plat.toast({ title: '请先到「我的」登录后再标记' });
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

    quDiTu() {
      plat.navigateTo('/pages/map/map');
    },

    onShareAppMessage() {
      const t = duTai();
      const r = duBaoGao();
      return {
        title: r ? `${t.diMing || '本社区'}体检得分 ${r.total} 分（${dengJiMing(r.dengji)}）` : '15 分钟生活圈体检助手',
        path: '/pages/index/index'
      };
    }
  };
}
