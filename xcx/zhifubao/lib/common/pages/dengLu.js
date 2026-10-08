// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
/* global getCurrentPages */
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 登录 / 注册页：账号体系统一走自有服务端（与 Web 端同一套 /api 接口，存在 MySQL）。
// 页面里顺带给了「服务端地址 + 测连通」——登录失败十有八九是服务端没起或地址不对，
// 让人能在这一页就地改好，而不是来回跳页面排查。
import { plat } from '../plat.js';
import { fuWu, duFuWuDiZhi, cunFuWuDiZhi } from '../peizhi.js';
import { sheYongHu } from '../zhuangTai.js';

// 有上一页就返回，没有（分享冷启动）就去地图首页
function huiQu() {
  let ceng = 0;
  try {
    ceng = typeof getCurrentPages === 'function' ? getCurrentPages().length : 0;
  } catch {
    ceng = 0;
  }
  if (ceng > 1) plat.navigateBack();
  else plat.quYe('/pages/ditu/ditu');
}

function duiHua(url, data) {
  return plat.request({ url, method: 'POST', data, timeout: 20000 }).then(r => {
    const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    if (!j || j.ok === false) throw new Error((j && j.xinxi) || `服务端返回失败（HTTP ${r.statusCode}）`);
    return j;
  });
}

export function chuangJianDengLu() {
  return {
    data: {
      pingTai: plat.mingCheng,
      moShi: 'dengLu', // dengLu | zhuCe
      zhangHao: '',
      miMa: '',
      miMa2: '',
      mang: false,
      cuo: '',
      fuWuDiZhi: duFuWuDiZhi(),
      ceWen: ''
    },

    onLoad() {
      this.setData({ fuWuDiZhi: duFuWuDiZhi() });
    },

    qieMoShi(e) {
      const m = e.currentTarget.dataset.m;
      this.setData({ moShi: m === 'zhuCe' ? 'zhuCe' : 'dengLu', cuo: '' });
    },

    sheRu(e) {
      this.setData({ [e.currentTarget.dataset.k]: e.detail.value, cuo: '' });
    },

    tijiao() {
      if (this.data.mang) return;
      const { moShi, zhangHao, miMa, miMa2 } = this.data;
      const hao = String(zhangHao || '').trim();
      const ma = String(miMa || '');
      if (hao.length < 3) return this.setData({ cuo: '账号至少 3 位' });
      if (ma.length < 6) return this.setData({ cuo: '密码至少 6 位' });
      if (moShi === 'zhuCe' && ma !== String(miMa2 || '')) return this.setData({ cuo: '两次输入的密码不一致' });

      this.setData({ mang: true, cuo: '' });
      const shun = moShi === 'zhuCe'
        ? duiHua(fuWu('/api/zhuCe'), { zhangHao: hao, miMa: ma }).then(() =>
            duiHua(fuWu('/api/dengLu'), { zhangHao: hao, miMa: ma })
          )
        : duiHua(fuWu('/api/dengLu'), { zhangHao: hao, miMa: ma });

      shun
        .then(j => {
          sheYongHu(j.yongHu);
          plat.setStorage('sq_yonghu', j.yongHu);
          this.setData({ mang: false });
          plat.toast({ title: moShi === 'zhuCe' ? '注册成功，已登录' : '登录成功', icon: 'success' });
          setTimeout(huiQu, 400);
        })
        .catch(e => {
          const xinxi = (e && e.message) || '提交失败';
          const wangLuo = /fail|网络请求失败|timeout|超时|ERR_/i.test(xinxi);
          this.setData({
            mang: false,
            cuo: wangLuo
              ? `连不上服务端（${duFuWuDiZhi()}）：本地开发请先执行 npm run fuwu；真机请填 HTTPS 域名并加白名单`
              : xinxi
          });
        });
    },

    youKe() {
      huiQu();
    },

    baoCunFuWu() {
      if (cunFuWuDiZhi(this.data.fuWuDiZhi)) {
        this.setData({ ceWen: '地址已保存', cuo: '' });
        plat.toast({ title: '已保存', icon: 'success' });
      } else {
        this.setData({ ceWen: '地址不能为空' });
      }
    },

    // 测连通：打 /jianKang，顺便验证地址填得对不对
    ceFuWu() {
      const u = String(this.data.fuWuDiZhi || '').trim().replace(/\/+$/, '');
      if (!u) return this.setData({ ceWen: '请先填服务端地址' });
      cunFuWuDiZhi(u);
      this.setData({ ceWen: '正在测 ' + u + ' …' });
      plat
        .request({ url: u + '/jianKang', method: 'GET', timeout: 8000 })
        .then(r => {
          const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
          const hao = r.statusCode === 200 && j && j.ok;
          this.setData({ ceWen: hao ? `服务端正常（${j.fuWu || 'ok'}）` : `返回异常：HTTP ${r.statusCode}` });
        })
        .catch(e => this.setData({ ceWen: '连不上：' + ((e && e.message) || '网络错误') }));
    },

    onShareAppMessage() {
      return { title: '15 分钟生活圈体检助手', path: '/pages/ditu/ditu' };
    }
  };
}
