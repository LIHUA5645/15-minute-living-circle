// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 「我的」页：账号（注册/登录/退出）、我的共享盲区标记、服务端地址、缓存清理、坐标自检。
import { plat } from '../plat.js';
import { fuWu, duFuWuDiZhi, cunFuWuDiZhi } from '../peizhi.js';
import { duTai, sheYongHu } from '../zhuangTai.js';
import { chuangJianCunChu } from '../cunchu.js';
import { gcjDaoWgs, wgsDaoGcj } from '../zuobiao.js';

function duiHua(url, data) {
  return plat
    .request({ url, method: 'POST', data, timeout: 20000 })
    .then(r => {
      const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
      if (!j || j.ok === false) throw new Error((j && j.xinxi) || '服务端返回失败');
      return j;
    });
}

export function chuangJianWo() {
  return {
    data: {
      pingTai: plat.mingCheng,
      yongHu: null,
      zhangHao: '',
      miMa: '',
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
      this.shuaTai();
    },

    shuaTai() {
      const t = duTai();
      this.setData({ yongHu: t.yongHu || null });
      if (t.yongHu && t.yongHu.zhangHao) this.laMangQu();
    },

    sheRu(e) {
      this.setData({ [e.currentTarget.dataset.k]: e.detail.value });
    },

    dengLu() {
      const { zhangHao, miMa } = this.data;
      if (!zhangHao || !miMa) {
        plat.toast({ title: '请填写账号与密码' });
        return;
      }
      plat.loading('登录中…');
      duiHua(fuWu('/api/dengLu'), { zhangHao, miMa })
        .then(j => {
          plat.hideLoading();
          sheYongHu(j.yongHu);
          plat.setStorage('sq_yonghu', j.yongHu);
          this.setData({ yongHu: j.yongHu });
          plat.toast({ title: '登录成功', icon: 'success' });
          this.laMangQu();
        })
        .catch(e => {
          plat.hideLoading();
          plat.modal({ title: '登录失败', content: (e && e.message) || '请稍后重试', showCancel: false });
        });
    },

    zhuCe() {
      const { zhangHao, miMa } = this.data;
      if (!zhangHao || !miMa) {
        plat.toast({ title: '请填写账号与密码' });
        return;
      }
      plat.loading('注册中…');
      duiHua(fuWu('/api/zhuCe'), { zhangHao, miMa })
        .then(() => {
          plat.hideLoading();
          plat.toast({ title: '注册成功，请登录', icon: 'success' });
        })
        .catch(e => {
          plat.hideLoading();
          plat.modal({ title: '注册失败', content: (e && e.message) || '请稍后重试', showCancel: false });
        });
    },

    tuiChu() {
      sheYongHu(null);
      plat.removeStorage('sq_yonghu');
      this.setData({ yongHu: null, woDeMangQu: [] });
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
            beiZhu: m.beiZhu || '',
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
            dingWeiZhuanHuan: `引擎(WGS-84)：${w.lng.toFixed(5)}, ${w.lat.toFixed(5)}　回算(GCJ-02)：${hui.lng.toFixed(5)}, ${hui.lat.toFixed(5)}`
          });
        })
        .catch(e => plat.toast({ title: (e && e.message) || '定位失败' }))
        .then(() => plat.hideLoading());
    }
  };
}
