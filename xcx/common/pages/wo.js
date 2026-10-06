// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 「我的」页：账号态、共享盲区标记、服务端地址、缓存清理、坐标系自检、关于。
// 登录/注册已独立成页（pages/denglu/denglu），这里只做入口与状态展示。
import { plat } from '../plat.js';
import { fuWu, duFuWuDiZhi, cunFuWuDiZhi } from '../peizhi.js';
import { duTai, sheYongHu } from '../zhuangTai.js';
import { chuangJianCunChu } from '../cunchu.js';
import { gcjDaoWgs, wgsDaoGcj } from '../zuobiao.js';

export function chuangJianWo() {
  return {
    data: {
      pingTai: plat.mingCheng,
      yongHu: null,
      touZiMu: '游',
      fuWuDiZhi: '',
      huanCunTiao: 0,
      woDeMangQu: [],
      dingWeiYuanShi: '',
      dingWeiZhuanHuan: '',
      banBen: '1.0'
    },

    onLoad() {
      this.setData({ fuWuDiZhi: duFuWuDiZhi(), huanCunTiao: chuangJianCunChu({}).tiaoShu() });
      this.shuaTai();
    },

    onShow() {
      this.setData({ fuWuDiZhi: duFuWuDiZhi() });
      this.shuaTai();
    },

    shuaTai() {
      const t = duTai();
      const hao = t.yongHu && t.yongHu.zhangHao;
      this.setData({ yongHu: t.yongHu || null, touZiMu: hao ? String(hao).slice(0, 1).toUpperCase() : '游' });
      if (hao) this.laMangQu();
    },

    sheRu(e) {
      this.setData({ [e.currentTarget.dataset.k]: e.detail.value });
    },

    quDengLu() {
      plat.navigateTo('/pages/denglu/denglu');
    },

    tuiChu() {
      sheYongHu(null);
      plat.removeStorage('sq_yonghu');
      this.setData({ yongHu: null, touZiMu: '游', woDeMangQu: [] });
      plat.toast({ title: '已退出登录' });
    },

    laMangQu() {
      const t = duTai();
      if (!t.yongHu || !t.yongHu.zhangHao) return;
      plat
        .request({ url: fuWu('/api/mangqu/lieBiao'), method: 'GET', timeout: 15000 })
        .then(r => {
          const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
          const lie = ((j && j.list) || []).map(m => ({
            id: m.id,
            zhangHao: m.zhangHao,
            beiZhu: m.beiZhu || '（无备注）',
            zuoBiao: `${Number(m.weiZhi.lng).toFixed(5)}, ${Number(m.weiZhi.lat).toFixed(5)}`,
            wo: m.zhangHao === t.yongHu.zhangHao
          }));
          this.setData({ woDeMangQu: lie });
        })
        .catch(() => {
          /* 服务端不可用时不打扰，列表留空 */
        });
    },

    shanMangQu(e) {
      const id = e.currentTarget.dataset.id;
      const t = duTai();
      if (!t.yongHu) return;
      plat
        .request({
          url: fuWu('/api/mangqu/shanChu'),
          method: 'POST',
          timeout: 15000,
          data: { id, zhangHao: t.yongHu.zhangHao }
        })
        .then(() => {
          plat.toast({ title: '已删除', icon: 'success' });
          this.laMangQu();
        })
        .catch(err => plat.toast({ title: (err && err.message) || '删除失败' }));
    },

    baoCunFuWu() {
      if (cunFuWuDiZhi(this.data.fuWuDiZhi)) plat.toast({ title: '已保存', icon: 'success' });
      else plat.toast({ title: '地址不能为空' });
    },

    qingHuanCun() {
      chuangJianCunChu({}).qingKong();
      this.setData({ huanCunTiao: 0 });
      plat.toast({ title: '缓存已清空', icon: 'success' });
    },

    // 坐标自检：把定位原始值与转换结果都摆出来，真机上一眼看出坐标系有没有对
    ceDingWei() {
      plat.loading('定位中…');
      plat
        .getLocation()
        .then(g => {
          const w = gcjDaoWgs(g);
          const hui = wgsDaoGcj(w);
          this.setData({
            dingWeiYuanShi: `原始：${Number(g.lng).toFixed(5)}, ${Number(g.lat).toFixed(5)}（按 GCJ-02 解读）`,
            dingWeiZhuanHuan: `引擎(WGS-84)：${w.lng.toFixed(5)}, ${w.lat.toFixed(5)}   回算(GCJ-02)：${hui.lng.toFixed(5)}, ${hui.lat.toFixed(5)}`
          });
        })
        .catch(e => plat.toast({ title: (e && e.message) || '定位失败' }))
        .then(() => plat.hideLoading());
    },

    onShareAppMessage() {
      return { title: '15 分钟生活圈体检助手', path: '/pages/ditu/ditu' };
    }
  };
}
