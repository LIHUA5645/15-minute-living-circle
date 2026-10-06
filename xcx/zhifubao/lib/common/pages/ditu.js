// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 地图首页（小程序打开的第一屏）：地图占满屏，操作与结论浮在上面。
//   · 顶部定位条：显示社区名与坐标，点开可选「用当前位置 / 地图上选点」
//   · 中部图层胶囊：等时圈 / 设施 / 盲区 / 我的标记
//   · 底部主卡：体检入口与进度、总分等级盲区数、参数折叠面板、数据通道脚注
//   · 点地图：就近命中盲区或设施，弹卡片（可算步行路线、导航、设为体检中心）
// 未体检时先画一个「预估可达圈」示意 15 分钟大体范围，让人一眼知道这次体检会覆盖多大。
import { plat } from '../plat.js';
import { peiZhi, fuWu } from '../peizhi.js';
import { duTai, duBaoGao, sheXianShi, sheZhongXin, cunBaoGao, sheCanShu } from '../zhuangTai.js';
import { paoYiLunTiJian, JIE_DUAN_MING } from '../tijian.js';
import { chuangJianBmapXcx, dangQianTongDao } from '../adapters/bmapXcx.js';
import { gcjDaoWgs, wgsDaoGcj } from '../zuobiao.js';
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
  fenSe,
  dengJiMing,
  FENLEI_SE
} from '../bidui.js';
import { FENLEI_MING } from '../../core/types.js';

const MO_MING = { zhiLian: '直连百度', fuWuDuan: '自有服务端' };
const V_BUXING = 80; // 与引擎一致：步行速度 米/分钟
const K_RAOLU = 1.25; // 与引擎一致：路网绕行系数
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

function muBiaoMing(miao) {
  const m = MU_BIAO.find(x => x.miao === Number(miao));
  return m ? m.ming : Math.round(Number(miao) / 60) + ' 分钟';
}

function dangWeiMing(zhi) {
  const m = DANG_WEI.find(x => x.zhi === zhi);
  return m ? m.ming : zhi;
}

function shiJianWen(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 盲区卡片内容（点击命中、从报告页聚焦两处共用）
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
      // 地图
      latitude: 28.2281,
      longitude: 112.9388,
      scale: 15,
      polygons: [],
      circles: [],
      markers: [],
      polyline: [],
      // 顶部定位条
      diMing: '点击定位',
      youZhongXin: false,
      zhongXinWen: '',
      dingWeiZhong: false,
      xuanDianKai: false,
      youYongHu: false,
      yongHuHao: '',
      // 图层
      xianShi: { iso: true, sheshi: true, mangqu: true, yonghu: true },
      // 底部主卡
      youBaoGao: false,
      total: 0,
      dengJiWen: '',
      fenSe: '#8a93a3',
      mangQuShu: 0,
      shiJianWen: '',
      running: false,
      jinDu: 0,
      jieDuanWen: '',
      muBiao: peiZhi.moRenMuBiaoMiao,
      muBiaoWen: muBiaoMing(peiZhi.moRenMuBiaoMiao),
      muBiaoLie: MU_BIAO.map(x => ({ ...x, on: x.miao === peiZhi.moRenMuBiaoMiao })),
      dangWei: peiZhi.moRenDangWei,
      dangWeiWen: dangWeiMing(peiZhi.moRenDangWei),
      dangWeiLie: DANG_WEI.map(x => ({ ...x, on: x.zhi === peiZhi.moRenDangWei })),
      canShuKai: false,
      // 信息卡与脚注
      ka: null,
      zouLuZhong: false,
      luXianWen: '',
      moShi: MO_MING[dangQianTongDao()] || ''
    },

    onLoad() {
      this.shuaTai();
      this.huaTuCeng();
      this.laYongHuMangQu();
      // 第一屏就是地图：没定过位就直接静默定位一次，省得用户先点一下
      if (!duTai().zhongXin) this.dingWei(true);
    },

    onShow() {
      this.shuaTai();
      this.huaTuCeng();
      const t = duTai();
      if (t.juJiaoMangQu) {
        const r = duBaoGao();
        const m = r && (r.mangquList || []).find(x => x.id === t.juJiaoMangQu);
        if (m) this.juJiaoMangQu(m);
        t.juJiaoMangQu = '';
      }
    },

    /* ── 状态回填 ── */
    shuaTai() {
      const t = duTai();
      const r = duBaoGao();
      const g = t.zhongXin ? wgsDaoGcj(t.zhongXin) : null;
      const nong = {
        youYongHu: !!(t.yongHu && t.yongHu.zhangHao),
        yongHuHao: (t.yongHu && t.yongHu.zhangHao) || '',
        youZhongXin: !!t.zhongXin,
        diMing: t.zhongXin ? t.diMing || '体检中心' : '点击定位',
        zhongXinWen: g ? `${g.lng.toFixed(5)}, ${g.lat.toFixed(5)}` : '',
        muBiao: t.mubiaoMiao,
        muBiaoWen: muBiaoMing(t.mubiaoMiao),
        muBiaoLie: MU_BIAO.map(x => ({ ...x, on: x.miao === t.mubiaoMiao })),
        dangWei: t.dangwei,
        dangWeiWen: dangWeiMing(t.dangwei),
        dangWeiLie: DANG_WEI.map(x => ({ ...x, on: x.zhi === t.dangwei })),
        xianShi: { iso: true, sheshi: true, mangqu: true, yonghu: true, ...t.xianshi },
        moShi: MO_MING[dangQianTongDao()] || ''
      };
      if (g) {
        nong.latitude = g.lat;
        nong.longitude = g.lng;
      }
      if (r) {
        nong.youBaoGao = true;
        nong.total = r.total;
        nong.dengJiWen = dengJiMing(r.dengji);
        nong.fenSe = fenSe(r.total);
        nong.mangQuShu = (r.mangquList || []).length;
        nong.shiJianWen = shiJianWen(t.baoGaoShi || (t.shangCi && t.shangCi.shiJian) || Date.now());
      }
      this.setData(nong);
    },

    /* ── 定位 / 选点 ── */
    qieKaiXuanDian() {
      this.setData({ xuanDianKai: !this.data.xuanDianKai });
    },

    dingWei(jingMo) {
      const ziDong = jingMo === true;
      if (this.data.dingWeiZhong) return;
      this.setData({ dingWeiZhong: true, xuanDianKai: false });
      return plat
        .getLocation()
        .then(g => {
          const zx = gcjDaoWgs(g); // 定位给 GCJ-02，引擎要 WGS-84
          if (!zx) throw new Error('定位结果不可用');
          sheZhongXin(zx, '定位中…');
          this.shuaTai();
          return chuangJianBmapXcx()
            .reverseGeocode(zx)
            .then(r => {
              const ming = r.aoi || r.address || '当前位置';
              sheZhongXin(zx, ming);
              this.shuaTai();
            })
            .catch(() => sheZhongXin(zx, '当前位置'));
        })
        .then(() => {
          this.setData({ dingWeiZhong: false });
          this.huaTuCeng();
        })
        .catch(e => {
          this.setData({ dingWeiZhong: false });
          // 自动定位失败不弹窗（用户没主动点），只在定位条上留提示
          if (ziDong) {
            this.setData({ diMing: '未定位，点这里手动选点' });
            return;
          }
          plat.modal({
            title: '定位失败',
            content:
              ((e && e.message) || '') +
              '\n可在「在地图上选点」手动指定中心，或检查开发者工具是否允许定位权限。',
            showCancel: false
          });
        });
    },

    xuanDian() {
      this.setData({ xuanDianKai: false });
      return plat
        .chooseLocation()
        .then(r => {
          const zx = gcjDaoWgs(r);
          if (!zx) throw new Error('未取到坐标');
          if (zx.lng < 73 || zx.lng > 136 || zx.lat < 3 || zx.lat > 54)
            throw new Error('请在国内范围内选点');
          sheZhongXin(zx, r.name || r.address || '地图选点');
          this.shuaTai();
          this.huaTuCeng();
        })
        .catch(e => {
          if (/cancel/i.test((e && (e.errMsg || e.message)) || '')) return; // 用户取消
          plat.toast({ title: (e && e.message) || '选点失败' });
        });
    },

    /* ── 图层与参数 ── */
    qieHuan(e) {
      const k = e.currentTarget.dataset.k;
      const v = this.data.xianShi[k] === false;
      sheXianShi(k, v);
      this.setData({ [`xianShi.${k}`]: v }, () => this.huaTuCeng());
    },

    qieKaiCanShu() {
      this.setData({ canShuKai: !this.data.canShuKai });
    },

    xuanMuBiao(e) {
      if (this.data.running) return;
      const miao = Number(e.currentTarget.dataset.miao);
      sheCanShu(miao, null);
      this.setData(
        { muBiao: miao, muBiaoWen: muBiaoMing(miao), muBiaoLie: MU_BIAO.map(x => ({ ...x, on: x.miao === miao })) },
        () => this.huaTuCeng()
      );
    },

    xuanDangWei(e) {
      if (this.data.running) return;
      const zhi = e.currentTarget.dataset.zhi;
      sheCanShu(null, zhi);
      this.setData({ dangWei: zhi, dangWeiWen: dangWeiMing(zhi), dangWeiLie: DANG_WEI.map(x => ({ ...x, on: x.zhi === zhi })) });
    },

    /* ── 体检 ── */
    kaiShiTiJian() {
      if (this.data.running) return;
      const t = duTai();
      if (!t.zhongXin) {
        plat.toast({ title: '先获取位置或在地图上选点' });
        this.setData({ xuanDianKai: true });
        return;
      }
      this.setData({ running: true, jinDu: 0, jieDuanWen: '准备中…', ka: null, canShuKai: false });
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
          cunBaoGao(r);
          this.setData({ running: false, jinDu: 100, jieDuanWen: '完成' });
          this.shuaTai();
          this.huaTuCeng();
          this.laYongHuMangQu();
          plat.toast({ title: `体检完成：${r.total} 分`, icon: 'none' });
        })
        .catch(e => {
          const xinxi = (e && e.message) || '体检失败';
          this.setData({ running: false });
          plat.modal({
            title: '体检未完成',
            content:
              xinxi +
              (/status|配额|220|302|240|合法域名|not in domain/i.test(xinxi)
                ? '\n\n提示：这是百度接口没放行/配额用尽或域名未加白名单。本地开发请在「详情 → 本地设置」勾选“不校验合法域名”；真机需在小程序后台把 api.map.baidu.com 与自有服务端域名加入 request 合法域名。'
                : ''),
            showCancel: false
          });
        });
    },

    /* ── 图层构建 ── */
    huaTuCeng() {
      const r = duBaoGao();
      const t = duTai();
      const x = this.data.xianShi;
      const circles = [];
      const markers = [];
      const polygons = [];
      let shuiXian = [];

      if (r) {
        if (x.iso !== false) {
          polygons.push(...dengShiQuanPolygons(r.dengShiQuan && r.dengShiQuan.ceng));
          shuiXian = shuiDuanLines(r.dengShiQuan && r.dengShiQuan.shuiDuan);
        }
        if (x.sheshi !== false) circles.push(...sheShiCircles(r.poiSet, null));
        if (x.mangqu !== false) {
          circles.push(...mangQuCircles(r.mangquList));
          markers.push(...buJianMarkers(r.mangquList));
        }
      }

      // 体检中心标记（有中心点就画；没有报告时它是唯一的地标）
      const zx = (r && r.zhongXin) || t.zhongXin;
      if (zx) markers.unshift(...zhongXinMarkers(zx, t.diMing || '体检中心'));

      // 还没体检：画一个「预估可达圈」示意范围（半径 = 速度 × 时长 ÷ 绕行系数）
      if (!r && zx && t.mubiaoMiao) {
        const ban = (V_BUXING * (t.mubiaoMiao / 60)) / K_RAOLU;
        const q = dian(zx);
        circles.push({
          latitude: q.latitude,
          longitude: q.longitude,
          radius: ban,
          fillColor: '#1a8f5722',
          color: '#1a8f57aa',
          strokeWidth: 1.5
        });
      }

      if (this.yongHuMarkers && x.yonghu !== false) markers.push(...this.yongHuMarkers);

      const g = zx ? wgsDaoGcj(zx) : null;
      this.shuiXian = shuiXian;
      this.setData({
        ...(g ? { latitude: g.lat, longitude: g.lng } : {}),
        polygons,
        circles,
        markers,
        polyline: [...this.shuiXian, ...(this.luXian || [])]
      });
    },

    /* ── 我的标记盲区（服务端共享；服务端没起就安静跳过） ── */
    laYongHuMangQu() {
      const t = duTai();
      if (!t.yongHu || !t.yongHu.zhangHao) return;
      plat
        .request({ url: fuWu('/api/mangqu/lieBiao'), method: 'GET', timeout: 12000 })
        .then(r => {
          const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
          this.yongHuMarkers = ((j && j.list) || []).map((m, i) => {
            const q = dian(m.weiZhi);
            return {
              id: 200 + i,
              latitude: q.latitude,
              longitude: q.longitude,
              width: 20,
              height: 26,
              callout: {
                content: `标记 ${m.zhangHao}`,
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
          /* 服务端不可用：不显示这一层，不打扰 */
        });
    },

    /* ── 地图点击：就近命中盲区 → 设施 ── */
    dianTu(e) {
      const r = duBaoGao();
      if (!r || !e.detail) return;
      const p = dianHui(e.detail);
      if (!p) return;
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

    biaoJiTap(e) {
      const r = duBaoGao();
      const id = Number(e.detail && e.detail.markerId);
      if (!r || !(id >= 100 && id < 200)) return;
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
          const wen = `步行约 ${Math.round(x.durationSec / 60)} 分钟 · ${Math.round(x.distanceM)} 米`;
          this.setData({ zouLuZhong: false, luXianWen: wen, 'ka.hang': [...ka.hang.filter(h => !/^步行/.test(h)), wen] });
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
      this.setData({ ka: null });
      this.shuaTai();
      this.huaTuCeng();
      plat.toast({ title: '已设为体检中心，可以开始体检了' });
    },

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
      if (!duBaoGao()) {
        plat.toast({ title: '先跑一轮体检才有报告' });
        return;
      }
      plat.navigateTo('/pages/baogao/baogao');
    },

    quTiaoZhen() {
      plat.navigateTo('/pages/tijian/tijian');
    },

    quWoDe() {
      plat.navigateTo('/pages/wo/wo');
    },

    quDengLu() {
      plat.navigateTo('/pages/denglu/denglu');
    },

    quAi() {
      this.setData({ xuanDianKai: false });
      plat.navigateTo('/pages/ai/ai');
    },

    onShareAppMessage() {
      const t = duTai();
      return {
        title: t.diMing ? `${t.diMing}·15分钟生活圈体检` : '15 分钟生活圈体检助手',
        path: '/pages/ditu/ditu'
      };
    }
  };
}
