// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 地图页：等时圈热力 + 设施 + 盲区 + 补建点，点哪都能出卡片，能算步行路线并唤起导航。
// 设计取舍：设施散点画成「小半径圆」而不是 marker —— 省掉图标资源、也不怕 100+ 个 marker 卡顿；
// 卡片靠地图点击（bindtap 给坐标）就近命中，比让用户精确点到 7 像素的小圆现实得多。
import { plat } from '../plat.js';
import { duTai, duBaoGao, sheXianShi, sheZhongXin } from '../zhuangTai.js';
import {
  dengShiQuanPolygons,
  shuiDuanLines,
  sheShiCircles,
  mangQuCircles,
  mangQuBanJing,
  buJianMarkers,
  zhongXinMarkers,
  luXianPolyline,
  dianHui,
  dian,
  juLiMi,
  geShiMianJi,
  mangSe,
  FENLEI_SE
} from '../bidui.js';
import { wgsDaoGcj } from '../zuobiao.js';
import { chuangJianBmapXcx } from '../adapters/bmapXcx.js';
import { fuWu } from '../peizhi.js';
import { FENLEI_MING } from '../../core/types.js';

// 盲区卡片内容（地图点击命中、从报告页聚焦，两处共用一份拼装逻辑）
function mangKa(m) {
  return {
    lei: 'mangqu',
    biaoTi: `盲区 ${m.id}（${m.level === 'red' ? '重度' : '轻度'}）`,
    se: mangSe(m.level),
    hang: [
      `缺口：${(m.quekou || []).join('、') || '便民设施'}`,
      `面积：${geShiMianJi(m.areaM2)}`,
      m.yujiFugaiRenkou ? `预计影响人口：约 ${m.yujiFugaiRenkou} 人` : '',
      m.buJianDian ? `建议补建点：${m.buJianDian.lng.toFixed(5)}, ${m.buJianDian.lat.toFixed(5)}` : ''
    ].filter(Boolean),
    jianYi: m.jianyi || '',
    mangQu: m
  };
}

export function chuangJianDiTu() {
  return {
    data: {
      pingTai: plat.mingCheng,
      youBaoGao: false,
      latitude: 28.2281,
      longitude: 112.9388,
      scale: 15,
      polygons: [],
      circles: [],
      markers: [],
      polyline: [],
      xianShi: { iso: true, sheshi: true, mangqu: true, yonghu: true },
      ka: null, // 底部卡片
      zouLuZhong: false,
      luXianWen: ''
    },

    onLoad() {
      const t = duTai();
      this.setData({ xianShi: { iso: true, sheshi: true, mangqu: true, yonghu: true, ...t.xianshi } });
      this.huaTuCeng();
      this.laYongHuMangQu();
    },

    onShow() {
      this.huaTuCeng();
      // 从报告页带着「聚焦某盲区」过来
      const t = duTai();
      if (t.juJiaoMangQu) {
        const r = duBaoGao();
        const m = r && (r.mangquList || []).find(x => x.id === t.juJiaoMangQu);
        if (m) this.juJiaoMangQu(m);
        t.juJiaoMangQu = '';
      }
    },

    /* ── 图层 ── */
    huaTuCeng() {
      const r = duBaoGao();
      const t = duTai();
      if (!r) {
        this.setData({ youBaoGao: false });
        return;
      }
      const x = this.data.xianShi;
      const zx = r.zhongXin || t.zhongXin;
      const g = zx ? wgsDaoGcj(zx) : null;
      const polygons = x.iso === false ? [] : dengShiQuanPolygons(r.dengShiQuan && r.dengShiQuan.ceng);
      this.shuiXian = x.iso === false ? [] : shuiDuanLines(r.dengShiQuan && r.dengShiQuan.shuiDuan);
      const circles = [];
      if (x.sheshi !== false) circles.push(...sheShiCircles(r.poiSet, null));
      if (x.mangqu !== false) circles.push(...mangQuCircles(r.mangquList));
      const markers = zx ? zhongXinMarkers(zx, t.diMing || '体检中心') : [];
      if (x.mangqu !== false) markers.push(...buJianMarkers(r.mangquList));
      if (this.yongHuMarkers) markers.push(...this.yongHuMarkers);
      this.setData({
        youBaoGao: true,
        latitude: g ? g.lat : this.data.latitude,
        longitude: g ? g.lng : this.data.longitude,
        polygons,
        circles,
        markers,
        polyline: [...this.shuiXian, ...(this.luXian || [])]
      });
    },

    qieHuan(e) {
      const k = e.currentTarget.dataset.k;
      const v = this.data.xianShi[k] === false; // 取反
      sheXianShi(k, v);
      this.setData({ [`xianShi.${k}`]: v }, () => this.huaTuCeng());
    },

    /* ── 我的标记盲区（服务端共享） ── */
    laYongHuMangQu() {
      const t = duTai();
      if (!t.yongHu || !t.yongHu.zhangHao) return;
      plat
        .request({ url: fuWu('/api/mangqu/lieBiao'), method: 'GET', timeout: 12000 })
        .then(r => {
          const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
          const lie = (j && j.list) || [];
          this.yongHuMarkers = lie.map((m, i) => {
            const q = dian(m.weiZhi);
            return {
              id: 200 + i,
              latitude: q.latitude,
              longitude: q.longitude,
              width: 20,
              height: 26,
              callout: {
                content: `📍 ${m.zhangHao}`,
                color: '#ffffff',
                fontSize: 11,
                borderRadius: 6,
                bgColor: '#d6409f',
                padding: 5,
                display: 'BYCLICK',
                textAlign: 'center'
              }
            };
          });
          this.huaTuCeng();
        })
        .catch(() => {
          /* 服务端不可用就不显示这一层，不打扰 */
        });
    },

    /* ── 地图点击：就近命中盲区 → 设施 ── */
    dianTu(e) {
      const r = duBaoGao();
      if (!r || !e.detail) return;
      const p = dianHui(e.detail);
      if (!p) return;
      // ① 在某个盲区圈里？
      let zuiJinMang = null;
      let zuiJinJu = Infinity;
      for (const m of r.mangquList || []) {
        const zx = m.zhongxin || m.buJianDian;
        if (!zx) continue;
        const ju = juLiMi(p, zx);
        if (ju <= mangQuBanJing(m) && ju < zuiJinJu) {
          zuiJinJu = ju;
          zuiJinMang = m;
        }
      }
      if (zuiJinMang) {
        this.setData({ ka: mangKa(zuiJinMang) });
        return;
      }
      // ② 就近设施（60 米内取最近）
      const ge = (r.poiSet && r.poiSet.fenleiSet) || {};
      let zuiJin = null;
      let ju = Infinity;
      for (const f of Object.keys(ge)) {
        if (this.data.xianShi.sheshi === false) break;
        for (const q of ge[f] || []) {
          const d = juLiMi(p, q);
          if (d < ju) {
            ju = d;
            zuiJin = { ...q, fenlei: f };
          }
        }
      }
      if (zuiJin && ju <= 60) {
        this.setData({
          ka: {
            lei: 'sheshi',
            biaoTi: zuiJin.name || '未命名设施',
            se: FENLEI_SE[zuiJin.fenlei] || '#8a93a3',
            hang: [
              `类别：${FENLEI_MING[zuiJin.fenlei] || zuiJin.fenlei}`,
              zuiJin.address ? `地址：${zuiJin.address}` : '',
              `距点击处：${Math.round(ju)} 米`
            ].filter(Boolean),
            sheShi: zuiJin
          }
        });
        return;
      }
      this.setData({ ka: null });
    },

    // 补建点 marker 点击
    biaoJiTap(e) {
      const r = duBaoGao();
      const id = Number(e.detail && e.detail.markerId);
      if (!r || !(id >= 100)) return;
      const m = (r.mangquList || [])[id - 100];
      if (!m) return;
      this.setData({
        ka: {
          lei: 'bujian',
          biaoTi: `补建建议点 ${m.id}`,
          se: '#1a8f57',
          hang: [
            `拟补建：${(m.quekou || []).join('、') || '便民设施'}`,
            m.yujiFugaiRenkou ? `预计覆盖人口：约 ${m.yujiFugaiRenkou} 人` : '',
            m.buJianDian ? `坐标：${m.buJianDian.lng.toFixed(5)}, ${m.buJianDian.lat.toFixed(5)}` : ''
          ].filter(Boolean),
          jianYi: m.jianyi || ''
        }
      });
    },

    /* ── 卡片动作 ── */
    zouLu() {
      const ka = this.data.ka;
      const r = duBaoGao();
      const t = duTai();
      if (!ka || ka.lei !== 'sheshi' || !r) return;
      const qi = r.zhongXin || t.zhongXin;
      if (!qi) return;
      this.setData({ zouLuZhong: true, luXianWen: '' });
      chuangJianBmapXcx()
        .walkingRoute(qi, { lng: ka.sheShi.lng, lat: ka.sheShi.lat })
        .then(x => {
          this.luXian = luXianPolyline(x.polyline);
          this.setData({
            zouLuZhong: false,
            luXianWen: `步行约 ${Math.round(x.durationSec / 60)} 分钟 · ${Math.round(x.distanceM)} 米`,
            [`ka.hang`]: [...ka.hang.filter(h => !/^步行/.test(h)), `步行约 ${Math.round(x.durationSec / 60)} 分钟 · ${Math.round(x.distanceM)} 米`]
          });
          this.huaTuCeng();
        })
        .catch(e => {
          this.setData({ zouLuZhong: false });
          plat.toast({ title: (e && e.message) || '算路失败' });
        });
    },

    daoHang() {
      const ka = this.data.ka;
      if (!ka || ka.lei !== 'sheshi') return;
      const q = wgsDaoGcj({ lng: ka.sheShi.lng, lat: ka.sheShi.lat });
      plat.openLocation({ lng: q.lng, lat: q.lat, name: ka.sheShi.name || '目的地', address: ka.sheShi.address || '' });
    },

    sheWeiZhongXin() {
      const ka = this.data.ka;
      if (!ka || ka.lei !== 'sheshi') return;
      sheZhongXin({ lng: ka.sheShi.lng, lat: ka.sheShi.lat }, ka.sheShi.name || '地图选点');
      plat.toast({ title: '已设为体检中心，去首页跑体检' });
      this.huaTuCeng();
    },

    // 从报告页点「地图查看」跳过来：把视图对准该盲区并直接亮出卡片
    juJiaoMangQu(m) {
      const zx = m.zhongxin || m.buJianDian;
      if (!zx) return;
      const g = wgsDaoGcj(zx);
      this.setData({ latitude: g.lat, longitude: g.lng, scale: 16, ka: mangKa(m) });
    },

    guanKa() {
      this.setData({ ka: null });
    },

    quBaoGao() {
      plat.navigateTo('/pages/report/report');
    },

    quShouYe() {
      plat.navigateBack();
    }
  };
}
