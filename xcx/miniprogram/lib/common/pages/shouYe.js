// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 首页：定位 → 选体检参数 → 一键体检（进度可见）→ 进报告/地图。
// 三端共用：视图差异只在各端 pages/index/index.wxml|axml|ttml，逻辑都在这里。
import { plat } from '../plat.js';
import { peiZhi } from '../peizhi.js';
import { duTai, sheZhongXin, sheCanShu, cunBaoGao, duBaoGao } from '../zhuangTai.js';
import { paoYiLunTiJian, JIE_DUAN_MING } from '../tijian.js';
import { chuangJianBmapXcx } from '../adapters/bmapXcx.js';
import { gcjDaoWgs, wgsDaoGcj } from '../zuobiao.js';
import { dengJiMing, fenSe } from '../bidui.js';

const MU_BIAO = [
  { miao: 600, ming: '10 分钟' },
  { miao: 900, ming: '15 分钟' },
  { miao: 1200, ming: '20 分钟' }
];
const DANG_WEI = [
  { zhi: 'fast', ming: '快' },
  { zhi: 'standard', ming: '标准' },
  { zhi: 'fine', ming: '精细' }
];

function shiJianWen(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function chuangJianShouYe() {
  return {
    data: {
      pingTai: plat.mingCheng,
      youZhongXin: false,
      diMing: '',
      zhongXinWen: '',
      muBiao: peiZhi.moRenMuBiaoMiao,
      muBiaoLie: MU_BIAO.map(x => ({ ...x, on: x.miao === peiZhi.moRenMuBiaoMiao })),
      dangwei: peiZhi.moRenDangWei,
      dangWeiLie: DANG_WEI.map(x => ({ ...x, on: x.zhi === peiZhi.moRenDangWei })),
      running: false,
      jinDu: 0,
      jieDuanWen: '',
      shangCi: null,
      shangCiFenSe: '#8a93a3',
      shangCiDengJi: ''
    },

    onLoad() {
      this.huiFuTai();
    },

    onShow() {
      // 从地图/我的页返回时，中心点或参数可能已变
      this.huiFuTai();
    },

    huiFuTai() {
      const t = duTai();
      const nong = {
        youZhongXin: !!t.zhongXin,
        // 旧摘要里可能存着「定位中…」（定位中途被打断的残留），恢复时归位
        diMing: t.diMing === '定位中…' ? '位置已就绪' : t.diMing || '尚未选择体检中心',
        zhongXinWen: t.zhongXin ? `${t.zhongXin.lng.toFixed(5)}, ${t.zhongXin.lat.toFixed(5)}` : '',
        muBiao: t.mubiaoMiao,
        muBiaoLie: MU_BIAO.map(x => ({ ...x, on: x.miao === t.mubiaoMiao })),
        dangwei: t.dangwei,
        dangWeiLie: DANG_WEI.map(x => ({ ...x, on: x.zhi === t.dangwei }))
      };
      const s = t.shangCi;
      if (s) {
        nong.shangCi = {
          total: s.total,
          mangquShu: s.mangquShu,
          shiJianWen: shiJianWen(s.shiJian),
          qingQiuShu: s.qingQiuShu
        };
        nong.shangCiFenSe = fenSe(s.total);
        nong.shangCiDengJi = dengJiMing(s.dengji);
      }
      // 内存里已有完整报告就不用提示「先体检」
      if (duBaoGao()) nong.youBaoGao = true;
      this.setData(nong);
    },

    // 用系统定位
    dingWei() {
      if (this.data.running) return;
      plat.loading('定位中…');
      plat
        .getLocation()
        .then(g => {
          const zx = gcjDaoWgs(g); // 定位给的是 GCJ-02，引擎要 WGS-84
          if (!zx) throw new Error('定位结果不可用');
          const g2 = wgsDaoGcj(zx); // 回显用 GCJ-02
          // 中间态只写中心点、不动 diMing（同 ditu.dingWei：'定位中…' 一旦持久化，打断后永久卡住）
          sheZhongXin(zx);
          this.setData({ youZhongXin: true, diMing: '定位中…', zhongXinWen: `${g2.lng.toFixed(5)}, ${g2.lat.toFixed(5)}` });
          return chuangJianBmapXcx()
            .reverseGeocode(zx)
            .then(r => {
              const ming = r.aoi || r.address || '当前位置';
              sheZhongXin(zx, ming);
              this.setData({ diMing: ming });
            })
            .catch(() => {
              sheZhongXin(zx, '当前位置');
              this.setData({ diMing: '当前位置' });
            });
        })
        .catch(e => {
          plat.modal({
            title: '定位失败',
            content:
              (e && e.message ? e.message + '\n' : '') +
              '可在地图上手动选点（首次使用需在开发者工具/真机上允许定位权限）。',
            showCancel: false
          });
        })
        .then(() => plat.hideLoading());
    },

    // 地图选点
    xuanDian() {
      if (this.data.running) return;
      plat
        .chooseLocation()
        .then(r => {
          const zx = gcjDaoWgs(r);
          if (!zx) throw new Error('未取到坐标');
          if (zx.lng < 73 || zx.lng > 136 || zx.lat < 3 || zx.lat > 54) throw new Error('请在国内范围内选点');
          const ming = r.name || r.address || '地图选点';
          sheZhongXin(zx, ming);
          const g2 = wgsDaoGcj(zx);
          this.setData({
            youZhongXin: true,
            diMing: ming,
            zhongXinWen: `${g2.lng.toFixed(5)}, ${g2.lat.toFixed(5)}`
          });
        })
        .catch(e => {
          if (e && /cancel/i.test(e.errMsg || e.message || '')) return; // 用户取消
          plat.toast({ title: (e && e.message) || '选点失败' });
        });
    },

    xuanMuBiao(e) {
      if (this.data.running) return;
      const miao = Number(e.currentTarget.dataset.miao);
      sheCanShu(miao, null);
      this.setData({ muBiao: miao, muBiaoLie: MU_BIAO.map(x => ({ ...x, on: x.miao === miao })) });
    },

    xuanDangWei(e) {
      if (this.data.running) return;
      const zhi = e.currentTarget.dataset.zhi;
      sheCanShu(null, zhi);
      this.setData({ dangwei: zhi, dangWeiLie: DANG_WEI.map(x => ({ ...x, on: x.zhi === zhi })) });
    },

    kaiShiTiJian() {
      if (this.data.running) return;
      const t = duTai();
      if (!t.zhongXin) {
        plat.toast({ title: '请先定位或在地图上选点' });
        return;
      }
      this.setData({ running: true, jinDu: 0, jieDuanWen: '准备中…' });
      plat.loading('正在体检…');
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
          plat.hideLoading();
          cunBaoGao(r);
          this.setData({ running: false, jinDu: 100, jieDuanWen: '完成', youBaoGao: true });
          this.huiFuTai();
          plat.toast({ title: `体检完成：${r.total} 分`, icon: 'none' });
          plat.quYe('/pages/baogao/baogao');
        })
        .catch(e => {
          plat.hideLoading();
          this.setData({ running: false });
          const xinxi = (e && e.message) || '体检失败';
          plat.modal({
            title: '体检未完成',
            content:
              xinxi +
              (/配额|302|240|权限/.test(xinxi)
                ? '\n\n这通常是百度服务端 AK 的当日配额或权限问题：换一把 AK（.env 的 BAIDU_SERVER_AK2）或明天再试。'
                : ''),
            showCancel: false
          });
        });
    },

    kanBaoGao() {
      if (!duBaoGao()) {
        plat.toast({ title: '本机还没有完整报告，请先跑一轮体检' });
        return;
      }
      plat.quYe('/pages/baogao/baogao');
    },

    kanDiTu() {
      if (!duBaoGao()) {
        plat.toast({ title: '本机还没有完整报告，请先跑一轮体检' });
        return;
      }
      plat.quYe('/pages/ditu/ditu');
    },

    quWoDe() {
      plat.quYe('/pages/wo/wo');
    },

    // 分享：带中心点，别人打开就是同一片社区
    onShareAppMessage() {
      const t = duTai();
      return {
        title: t.diMing ? `${t.diMing}·15分钟生活圈体检` : '15 分钟生活圈体检助手',
        path: '/pages/tijian/tijian'
      };
    }
  };
}
