// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 小程序端自检：不用装微信/支付宝/抖音开发者工具，在 Node 里把三段链路跑一遍——
//   ① 坐标转换（WGS-84 ↔ GCJ-02，误差要小于 1 米）
//   ② 适配器（打桩 plat.request，校验 URL 形状与出入站坐标转换是否正确）
//   ③ 引擎与渲染数据（用 mock provider 跑完整流水线，再把报告转成 map 组件要的 polygons）
// 用法：node tests/xcx-zijian.mjs [服务端地址]
//   带地址时额外测水域接口（/shuiyu）；服务端未启动会自动跳过并说明
import { chuangJianMock } from '../src/adapters/mock.js';
import { yunXingTijian } from '../xcx/miniprogram/lib/core/pipeline.js';
import { HuanCun } from '../xcx/miniprogram/lib/core/scheduler/xianliu.js';
import { plat } from '../xcx/miniprogram/lib/common/plat.js';
import { cunFuWuDiZhi } from '../xcx/miniprogram/lib/common/peizhi.js';
import {
  chuangJianBmapXcx,
  dangQianTongDao
} from '../xcx/miniprogram/lib/common/adapters/bmapXcx.js';
import { huoShuiYu } from '../xcx/miniprogram/lib/common/adapters/shuiyuXcx.js';
import {
  dengShiQuanPolygons,
  shuiDuanLines,
  chouXi,
  buJianMarkers,
  mangQuCircles
} from '../xcx/miniprogram/lib/common/bidui.js';
import { gcjDaoWgs, wgsDaoGcj } from '../xcx/miniprogram/lib/common/zuobiao.js';
import { liangDianJuLi } from '../xcx/miniprogram/lib/core/geo/jichu.js';

// 主体放进 async 函数：既能用 await，也不依赖各环境对「顶层 await」的支持
async function main() {
  const FU_WU = process.argv[2] || 'http://127.0.0.1:8787';
  let tongGuo = 0;
  let shiBai = 0;
  const xing = (ming, hao, zhu) => {
    if (hao) {
      tongGuo++;
      console.log('  ✓ ' + ming + (zhu ? '（' + zhu + '）' : ''));
    } else {
      shiBai++;
      console.log('  ✗ ' + ming + (zhu ? '（' + zhu + '）' : ''));
    }
  };

  /* ── 给 plat 装上 Node 版实现：请求走 fetch，存储走内存 ── */
  const cun = new Map();
  // 真请求实现（第 ⑤ 节水域测试要用回来，别被②的打桩实现顶掉）
  const zhenQingQiu = async ({ url, method = 'GET', data, timeout }) => {
    const ctrl = new AbortController();
    const ji = setTimeout(() => ctrl.abort(), timeout || 20000);
    try {
      const r = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : JSON.stringify(data || {}),
        signal: ctrl.signal
      });
      const txt = await r.text();
      let j = txt;
      try {
        j = JSON.parse(txt);
      } catch {
        /* 非 JSON 原样返回 */
      }
      return { statusCode: r.status, data: j };
    } finally {
      clearTimeout(ji);
    }
  };
  plat.request = zhenQingQiu;
  plat.getStorage = k => (cun.has(k) ? cun.get(k) : null);
  plat.setStorage = (k, v) => {
    cun.set(k, v);
    return true;
  };
  plat.removeStorage = k => cun.delete(k);

  cunFuWuDiZhi(FU_WU);
  const zx = { lng: 112.9388, lat: 28.2281 }; // 长沙·砂子塘（与 Web 端默认中心一致）

  console.log('小程序端自检（服务端 ' + FU_WU + '）\n');

  /* ① 坐标转换 */
  console.log('① 坐标转换');
  const gcj = wgsDaoGcj(zx);
  const hui = gcjDaoWgs(gcj);
  xing(
    'WGS→GCJ→WGS 往返误差 < 1 米',
    liangDianJuLi(zx, hui) < 1,
    liangDianJuLi(zx, hui).toFixed(3) + ' 米'
  );
  xing(
    'GCJ 偏移符合国内量级（200~900 米）',
    liangDianJuLi(zx, gcj) > 200 && liangDianJuLi(zx, gcj) < 900,
    Math.round(liangDianJuLi(zx, gcj)) + ' 米'
  );

  /* ② 适配器：打桩 plat.request，校验 URL 形状 + 出入站坐标转换 */
  console.log('\n② 适配器（打桩请求）');
  const qingQiu = [];
  let daZhuang = {};
  plat.request = async can => {
    qingQiu.push(can.url);
    return { statusCode: 200, data: JSON.parse(JSON.stringify(daZhuang)) };
  };
  const bmap = chuangJianBmapXcx();

  daZhuang = {
    status: 0,
    result: {
      routes: [
        {
          duration: 480,
          distance: 640,
          steps: [{ path: `${gcj.lat + 0.001},${gcj.lng + 0.001};${gcj.lat},${gcj.lng}` }]
        }
      ]
    }
  };
  const lu = await bmap.walkingRoute(zx, { lng: 112.945, lat: 28.2305 });
  xing(
    'walkingRoute 解析出时长/距离/折线',
    lu.durationSec === 480 && lu.polyline.length === 2,
    `${lu.durationSec}s / ${lu.distanceM}m / ${lu.polyline.length} 点`
  );
  xing(
    '出站坐标已转 BD-09（纬度在前）',
    /[?&]origin=28\.\d+%2C112\.\d+/.test(qingQiu[0]),
    qingQiu[0].slice(qingQiu[0].indexOf('origin='), qingQiu[0].indexOf('origin=') + 26)
  );
  xing(
    '折线已转回 WGS-84（与打桩里的 BD-09 不同）',
    Math.abs(lu.polyline[0].lng - (gcj.lng + 0.001)) > 0.001
  );

  qingQiu.length = 0;
  daZhuang = {
    status: 0,
    results: [
      {
        uid: 'u1',
        name: '社区卫生服务中心',
        address: '砂子塘路 1 号',
        location: { lat: gcj.lat + 0.002, lng: gcj.lng + 0.001 }
      }
    ]
  };
  const poi = await bmap.searchPoi(zx, ['社区卫生服务中心'], 1500);
  xing(
    'searchPoi 解析出 POI 且坐标为 WGS-84',
    poi.length === 1 && Math.abs(poi[0].lat - zx.lat) < 0.01,
    poi[0] ? poi[0].name : ''
  );
  xing(
    'searchPoi 打的是百度 place/v2/search（默认直连通道，带 ak 与 output=json）',
    /place\/v2\/search/.test(qingQiu[0]) &&
      /output=json/.test(qingQiu[0]) &&
      /api\.map\.baidu\.com/.test(qingQiu[0]) &&
      /ak=/.test(qingQiu[0]),
    qingQiu[0].slice(0, 58) + '…'
  );
  xing('适配器标注 danGuanJianCi（引擎据此展开并发检索）', bmap.danGuanJianCi === true);

  daZhuang = {
    status: 0,
    result: {
      formatted_address: '湖南省长沙市雨花区砂子塘路',
      sematic_description: '砂子塘社区附近'
    }
  };
  const fan = await bmap.reverseGeocode(zx);
  xing('reverseGeocode 取到社区名（含区划与描述）', /砂子塘/.test(fan.address + fan.aoi), fan.aoi);

  /* ③ 抽稀与渲染数据 */
  console.log('\n③ 抽稀与地图渲染数据');
  const yuan = [];
  for (let i = 0; i < 1200; i++) {
    const jiao = (i / 1200) * Math.PI * 2;
    yuan.push({ lng: zx.lng + 0.01 * Math.cos(jiao), lat: zx.lat + 0.01 * Math.sin(jiao) });
  }
  const chou = chouXi(yuan, 180);
  xing('抽稀后点数 ≤ 上限 1.5 倍', chou.length <= 270, `${yuan.length} → ${chou.length}`);
  xing('抽稀保留首尾点', chou[0] === yuan[0] && chou[chou.length - 1] === yuan[yuan.length - 1]);

  const jia = {
    ceng: [
      { miao: 900, polygon: [yuan] },
      { miao: 300, polygon: [yuan.slice(0, 200)] }
    ],
    shuiDuan: [{ miao: 900, duan: [yuan.slice(0, 30)] }]
  };
  const duo = dengShiQuanPolygons(jia.ceng);
  const xu = shuiDuanLines(jia.shuiDuan);
  xing(
    '等时圈转成 polygons（外层在前，带 fillColor 透明通道）',
    duo.length === 2 && /^#ff6b6b[0-9a-f]{2}$/.test(duo[0].fillColor),
    duo[0].fillColor
  );
  xing(
    'polygon 点位是 latitude/longitude（GCJ-02）',
    duo[0].points[0].latitude > 3 && duo[0].points[0].longitude > 73
  );
  xing('跨水面虚线转成 polyline（dottedLine）', xu.length === 1 && xu[0].dottedLine === true);
  xing('补建点/盲区圈转换不报错', buJianMarkers([]) !== null && mangQuCircles([]) !== null);

  /* ④ 引擎（mock provider，零网络零配额） */
  console.log('\n④ 引擎流水线（mock provider，快档）');
  const t0 = Date.now();
  const bao = await yunXingTijian(
    chuangJianMock(),
    { zhongXin: zx, mubiaoMiao: 900, dangwei: 'fast', banJingMi: 1200 },
    { huanCun: new HuanCun(null) }
  );
  xing(
    '产出报告（总分/等级/维度/盲区）',
    typeof bao.total === 'number' &&
      Array.isArray(bao.fenleiPingfen) &&
      Array.isArray(bao.mangquList),
    `${bao.total} 分 / ${bao.dengji} / 盲区 ${bao.mangquList.length} 处 / ${Date.now() - t0}ms`
  );
  xing(
    '报告字段名与 Web 端一致（dengShiQuan.ceng）',
    !!(bao.dengShiQuan && Array.isArray(bao.dengShiQuan.ceng))
  );

  /* ⑤ 双通道：直连百度优先，失败自动退自有服务端 */
  console.log('\n⑤ 双通道（直连优先 → 服务端兜底）');
  let zouGuo = [];
  plat.request = async can => {
    zouGuo.push(can.url);
    // 直连一律返回「配额超限」，服务端返回正常 → 应当自动落到服务端
    if (can.url.indexOf('api.map.baidu.com') >= 0)
      return { statusCode: 200, data: { status: 302, message: '天配额超限，限制访问' } };
    return {
      statusCode: 200,
      data: {
        status: 0,
        result: { formatted_address: '服务端通道返回的地址', sematic_description: '兜底成功' }
      }
    };
  };
  const fan2 = await bmap.reverseGeocode(zx);
  xing(
    '直连失败（302 配额）自动落到服务端并成功',
    /兜底成功/.test(fan2.aoi) && zouGuo.length === 2,
    zouGuo.map(u => (u.indexOf('api.map.baidu.com') >= 0 ? '直连' : '服务端')).join(' → ')
  );
  xing('命中服务端后记住通道（后续请求不再先撞一次失败）', dangQianTongDao() === 'fuWuDuan');
  zouGuo = [];
  await bmap.reverseGeocode(zx);
  xing(
    '后续请求直接走服务端（只发 1 次）',
    zouGuo.length === 1 && zouGuo[0].indexOf('api.map.baidu.com') < 0
  );

  // 批量算路：小程序类 AK 通常未开通（240）。撞一次就该记住，后续直接抛错让引擎走直线估算
  zouGuo = [];
  plat.request = async can => {
    zouGuo.push(can.url);
    return { statusCode: 200, data: { status: 240, message: 'APP 服务被禁用' } };
  };
  let juZhenCuo = '';
  try {
    await bmap.routeMatrix([zx], [zx]);
  } catch (e) {
    juZhenCuo = e.message;
  }
  const diYiCiQingQiu = zouGuo.length;
  let diErCiBuQingQiu = false;
  try {
    await bmap.routeMatrix([zx], [zx]);
  } catch {
    diErCiBuQingQiu = zouGuo.length === diYiCiQingQiu;
  }
  xing(
    '批量算路未开通（240）只撞一次，之后直接抛错（引擎转直线估算）',
    /240|禁用|不可用/.test(juZhenCuo) && diErCiBuQingQiu,
    `首次 ${diYiCiQingQiu} 次请求，二次不再请求`
  );

  /* ⑥ 真实直连探针：带小程序 Referer 直接打百度（1 次请求，验证 AK 与接口放行） */
  console.log('\n⑥ 真实直连探针（小程序 AK + servicewechat Referer）');
  const ak = 'uHFdon2724NMyiOf46wBtanBd7uCyPGN';
  const tanUrl = `https://api.map.baidu.com/direction/v2/walking?origin=${(zx.lat + 0.002).toFixed(6)},${zx.lng.toFixed(6)}&destination=${zx.lat.toFixed(6)},${(zx.lng + 0.003).toFixed(6)}&output=json&ak=${ak}`;
  try {
    const r = await fetch(tanUrl, {
      headers: { Referer: 'https://servicewechat.com/wx45cdc69a7eabe6f8/devtools/page-frame.html' }
    });
    const j = await r.json();
    xing(
      '小程序 AK 直连步行算路被放行',
      j.status === 0,
      'status=' + j.status + ' ' + (j.message || '')
    );
  } catch (e) {
    xing('小程序 AK 直连步行算路被放行', false, e.message);
  }

  /* ⑦ AI 与网页端一致性（提示词与本地规则逐字对齐） */
  console.log('\n⑦ AI 一致性（与网页端对齐）');
  const { benDiZhenDuan: wBenDi, duiHuaJieKouZhi: wJieKou } =
    await import('../src/core/zhenduan.js');
  const { shiDaoHangYiTu: wYiTu, tiQuMuDiDi: wTiQu } = await import('../src/core/aiDaohang.js');
  const {
    benDiZhenDuan: xBenDi,
    duiHuaJieKouZhi: xJieKou,
    shiDaoHangYiTu: xYiTu,
    tiQuMuDiDi: xTiQu
  } = await import('../xcx/miniprogram/lib/common/ai.js');

  xing(
    '本地规则诊断：小程序与网页端输出完全一致',
    wBenDi(bao) === xBenDi(bao),
    xBenDi(bao).length + ' 字'
  );
  const jieKou = [
    'https://x.com/v1',
    'https://x.com/v1/chat/completions',
    'https://x.com/responses',
    'https://x.com/responses/chat/completions',
    'https://x.com/completions',
    'https://x.com'
  ];
  xing(
    '接口地址规整：6 组输入两边一致',
    jieKou.every(u => wJieKou(u) === xJieKou(u)),
    jieKou.map(u => xJieKou(u).replace('https://x.com', '')).join(' | ')
  );
  const juZi = [
    '去最近的医院',
    '我想去广西博物馆',
    '看病方便吗？',
    '帮我导航回家',
    '附近适合散步锻炼吗？',
    '带我去超市'
  ];
  xing(
    '导航意图判定：6 句两边一致',
    juZi.every(s => wYiTu(s) === xYiTu(s)),
    juZi.map(s => (xYiTu(s) ? '导航' : '问答')).join('/')
  );
  xing(
    '目的地抽取：6 句两边一致',
    juZi.every(s => wTiQu(s) === xTiQu(s)),
    juZi
      .slice(0, 3)
      .map(s => `${s}→${xTiQu(s) || '空'}`)
      .join('；')
  );

  // 提示词逐字一致（源码级比对：同样的关键句必须同时出现在网页端与小程序端）
  const { readFileSync } = await import('node:fs');
  const webZhen = readFileSync('src/core/zhenduan.js', 'utf-8');
  const webLiao = readFileSync('src/core/aiLiaoTian.js', 'utf-8');
  const webDao = readFileSync('src/core/aiDaohang.js', 'utf-8');
  const xcxAi = readFileSync('xcx/miniprogram/lib/common/ai.js', 'utf-8');
  const juZhi = [
    ['诊断系统提示', '你是资深的社区规划专家'],
    ['诊断结构要求', '请以社区规划专家口吻写一段 250 字以内的中文诊断'],
    ['聊天系统提示', '你是「15 分钟生活圈智能体检助手」的在线问答助手'],
    ['聊天导航约定', '都只回复一行：【导航】目的地名称'],
    ['聊天反推诿约定', '严禁回复「打开手机地图搜一搜」'],
    ['聊天后台话题约定', '这属于后台配置，请让管理员看「AI 设置」'],
    ['选点系统提示', '你是社区生活圈导航助手，只输出 JSON'],
    ['选点输出格式', '只输出 JSON，格式：{"i": 序号, "liYou": "20字以内选择理由"}']
  ];
  const queShi = juZhi.filter(
    ([, s]) => !(xcxAi.includes(s) && (webZhen + webLiao + webDao).includes(s))
  );
  xing(
    '提示词关键句：小程序与网页端逐字一致（8 处）',
    queShi.length === 0,
    queShi.length ? '缺失：' + queShi.map(q => q[0]).join('、') : '全部命中'
  );

  /* ⑧ 水域接口（需要服务端在跑） */
  console.log('\n⑧ 水域接口（服务端 ' + FU_WU + '）');
  plat.request = zhenQingQiu; // 换回真请求：②里打桩的实现只用于校验 URL 形状
  cunFuWuDiZhi(FU_WU);
  const jianKang = await plat
    .request({ url: FU_WU + '/jianKang', method: 'GET', timeout: 5000 })
    .then(r => (typeof r.data === 'object' && r.data.ok) || r.statusCode === 200)
    .catch(() => false);
  if (!jianKang) {
    console.log('  · 服务端未启动，跳过（先跑 node fuwuqi/fuwu-qi.mjs）');
  } else {
    const shui = await huoShuiYu(zx, 2600);
    xing(
      '取到水域多边形（预置样例或服务端缓存）',
      !!(shui && shui.geShu > 0),
      shui ? `${shui.geShu} 处 / 来源 ${shui.laiYuan}` : '未取到'
    );
  }

  console.log(`\n结果：通过 ${tongGuo} 项，失败 ${shiBai} 项`);
  if (shiBai) process.exit(1);
}

main().catch(e => {
  console.error('自检脚本异常：', e);
  process.exit(1);
});
