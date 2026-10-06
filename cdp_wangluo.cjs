// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，29
// 临时调试脚本：连上已开启远程调试的浏览器，排查「百度底图空白（不请求瓦片）」。
//   用法：node cdp_wangluo.cjs [端口] [模式]
//     zhen   —— 只读诊断当前页面（默认）：BMapGL / 画布 / WebGL 上下文 / 瓦片请求
//     reload —— 重载页面后监听 25 秒网络，统计瓦片请求与失败原因
//     shiyan —— 逐项调用 setMapStyleV2 / setMapType / 平移缩放，看哪一项会让瓦片请求停住
const DUAN = process.argv[2] || '9334';
const MO = process.argv[3] || 'zhen';

async function lianJie() {
  for (let i = 0; i < 15; i++) {
    try {
      const lie = await (await fetch('http://127.0.0.1:' + DUAN + '/json/list')).json();
      const ye =
        lie.find(x => x.type === 'page' && /5173|localhost|127\.0\.0\.1/.test(x.url || '')) ||
        lie.find(x => x.type === 'page');
      if (!ye) throw new Error('没有可用页面');
      const ws = new WebSocket(ye.webSocketDebuggerUrl);
      await new Promise(jie => (ws.onopen = jie));
      return { ws, ye };
    } catch (e) {
      await new Promise(jie => setTimeout(jie, 1000));
      if (i === 14) throw new Error('CDP 端口 ' + DUAN + ' 不可用：' + e.message);
    }
  }
}

// 从 React fiber 里把地图实例挖出来（mapRef.current），免去改产品代码
const ZHAO_SHI_LI = `(() => {
  const d = document.querySelector('.map-inner');
  if (!d) return null;
  const k = Object.keys(d).find(x => x.indexOf('__reactFiber$') === 0);
  let f = k ? d[k] : null;
  while (f) {
    let h = f.memoizedState;
    while (h) {
      const v = h.memoizedState;
      try {
        if (v && v.current && v.current.map && typeof v.current.map.getZoom === 'function') return v.current.map;
        if (v && v.map && typeof v.map.getZoom === 'function') return v.map;
      } catch (e) {}
      h = h.next;
    }
    f = f.return;
  }
  return null;
})()`;

// 只读诊断表达式
const TAN_ZHEN = `(() => {
  const d = document.querySelector('.map-inner');
  const hua = document.querySelectorAll('.map-inner canvas');
  const cv = hua[0];
  const ziYuan = performance.getEntriesByType('resource');
  const waPian = ziYuan.filter(r => /qt=vtile/i.test(r.name));
  const shiLi = window.__ditu || (${ZHAO_SHI_LI});
  window.__ditu = shiLi;
  let gl = '未取到';
  try {
    if (cv) {
      const g = cv.getContext('webgl2') || cv.getContext('webgl') || cv.getContext('experimental-webgl');
      gl = g
        ? '上下文正常 lost=' + (g.isContextLost ? g.isContextLost() : '?') + ' / ' + g.getParameter(g.VERSION)
        : '该 canvas 没有 GL 上下文';
    }
  } catch (e) { gl = '取上下文失败：' + e.message; }
  let xin = {};
  if (shiLi) {
    try {
      xin = {
        层级: Math.round(shiLi.getZoom() * 1000) / 1000,
        类型: shiLi.getMapType ? shiLi.getMapType() : '',
        中心: shiLi.getCenter() ? shiLi.getCenter().lng.toFixed(5) + ',' + shiLi.getCenter().lat.toFixed(5) : ''
      };
      if (typeof shiLi.getDisplayOptions === 'function') xin.显示项 = JSON.stringify(shiLi.getDisplayOptions());
    } catch (e) { xin.取失败 = e.message; }
  }
  return JSON.stringify({
    url: location.href,
    可见性: document.visibilityState + (document.hasFocus() ? ' / 有焦点' : ' / 无焦点'),
    地图实例: shiLi ? '已拿到' : '未拿到',
    画布数: hua.length,
    画布尺寸: cv ? cv.width + 'x' + cv.height : '',
    容器尺寸: d ? d.clientWidth + 'x' + d.clientHeight : '',
    提示条: (document.querySelector('.map-tip') || {}).textContent || '',
    瓦片请求数: waPian.length,
    最近瓦片: waPian.slice(0, 2).map(r => r.name.replace(/^https?:\\/\\//, '').slice(0, 90)),
    WebGL: gl,
    地图: xin
  }, null, 1);
})()`;

// 找补建点图钉（绿 ✚）：从 React fiber 里取 MapCanvas 的 report，再用 map.getOverlays() 反查 Marker 拿到
// 它的屏幕坐标（BD-09 → 相对容器像素），供 CDP 派发真实鼠标点击
const ZHAO_BUJIAN = `(async () => {
  const deng = t => new Promise(j => setTimeout(j, t));
  // 左右浮层面板与 AI 导航卡都盖在地图上，可能正好压住图钉（点上去其实是点在面板上）——
  // 先把能收的面板收起来，等滑出动画过去再算坐标
  [...document.querySelectorAll('.tog-btn')].forEach(b => {
    if ((b.title || '').indexOf('隐藏') === 0) b.click();
  });
  await deng(800);
  const d = document.querySelector('.map-inner');
  if (!d) return JSON.stringify({ cuo: '没有地图容器' });
  const k = Object.keys(d).find(x => x.indexOf('__reactFiber$') === 0);
  let f = k ? d[k] : null;
  let map = null;
  let report = null;
  while (f) {
    const p = f.memoizedProps;
    try {
      if (p && p.report && p.center) report = p.report;
      const h = f.memoizedState;
      let s = h;
      while (s && !map) {
        const v = s.memoizedState;
        if (v && v.current && v.current.map && typeof v.current.map.getZoom === 'function') map = v.current.map;
        s = s.next;
      }
    } catch (e) {}
    f = f.return;
  }
  if (!map) return JSON.stringify({ cuo: '没拿到地图实例' });
  const qingDan = [...document.querySelectorAll('.mq-item')].length;
  if (!report) return JSON.stringify({ cuo: '页面还没有体检报告', 清单条数: qingDan });
  const you = (report.mangquList || []).filter(m => m.buJianDian).length;
  if (!you) return JSON.stringify({ cuo: '本轮报告没有补建点', 清单条数: qingDan, 盲区数: (report.mangquList || []).length });
  let houXuan = null;
  const qingXing = [];
  try {
    const lie = map.getOverlays ? map.getOverlays() : [];
    const r = d.getBoundingClientRect();
    for (const o of lie) {
      const t = o.getTitle && o.getTitle();
      if (!t || t.indexOf('补建点') !== 0) continue;
      const px = map.pointToPixel(o.getPosition());
      const x = Math.round(r.left + px.x);
      const y = Math.round(r.top + px.y);
      const yao = document.elementFromPoint(x, y);
      const ming = yao ? yao.tagName + '.' + (yao.className || '') : '取不到';
      const keDian = !!(yao && (yao.tagName === 'CANVAS' || (yao.closest && yao.closest('.map-view'))));
      qingXing.push({ t, x, y, ming, keDian });
      // 挑一个确实没被浮层面板 / 工具条挡住的图钉来点
      if (!houXuan && keDian && x > r.left + 4 && x < r.right - 4 && y > r.top + 4 && y < r.bottom - 4)
        houXuan = { t, x, y };
    }
  } catch (e) {}
  if (!houXuan)
    return JSON.stringify({ cuo: '没有可点到的补建点图钉（可能都被面板挡住）', 图钉情况: qingXing });
  window.__zb = { x: houXuan.x, y: houXuan.y };
  return JSON.stringify({
    命中: true,
    视口X: houXuan.x,
    视口Y: houXuan.y,
    图钉: houXuan.t,
    清单条数: qingDan,
    有补建点的盲区: you
  });
})()`;

// 点击之后的复查：①信息窗有没有弹 ②右侧条目有没有亮 ③点击落在哪个 DOM 上
// 若事件压根没进来，再直调 App 侧的 onBuJianDianJi 回调，把「事件命中」与「右侧联动」分开定位
const CHA_DIAN_JI = `(async () => {
  const deng = t => new Promise(j => setTimeout(j, t));
  const zb = window.__zb || {};
  const yao = zb.x ? document.elementFromPoint(zb.x, zb.y) : null;
  const jieGuo = {
    信息窗: (document.body.innerText || '').indexOf('补建建议点') >= 0 ? '已弹出' : '没看到',
    右侧高亮: document.querySelectorAll('.mq-item.shan').length,
    点击落点: yao ? yao.tagName + '.' + (yao.className || '') : '取不到'
  };
  if (!jieGuo.右侧高亮) {
    const d = document.querySelector('.map-inner');
    const k = d ? Object.keys(d).find(x => x.indexOf('__reactFiber$') === 0) : null;
    let f = k ? d[k] : null;
    let fn = null;
    let rep = null;
    while (f) {
      const p = f.memoizedProps || {};
      if (!fn && typeof p.onBuJianDianJi === 'function') fn = p.onBuJianDianJi;
      if (!rep && p.report && p.center) rep = p.report;
      f = f.return;
    }
    if (!fn) jieGuo.直调 = '没取到 onBuJianDianJi';
    else if (!rep) jieGuo.直调 = '没取到 report';
    else {
      fn(rep.mangquList[0]);
      await deng(500);
      jieGuo.直调后_右侧高亮 = document.querySelectorAll('.mq-item.shan').length;
      jieGuo.直调后_滚动目标 = document.querySelector('[data-mq="' + rep.mangquList[0].id + '"]') ? '有' : '无';
    }
  }
  return JSON.stringify(jieGuo);
})()`;

// 点盲区清单的整条框（正文区，避开右上角按钮），看地图有没有飞过去
const FEI_BUJIAN = `(async () => {
  const deng = t => new Promise(j => setTimeout(j, t));
  const kuang = document.querySelector('.mq-item');
  if (!kuang) return JSON.stringify({ cuo: '右侧还没有盲区条目（本轮报告可能没有盲区）' });
  // 面板收起来时条目量不到位置，先展开
  const youPan = document.querySelector('.right-panel');
  if (youPan && youPan.classList.contains('hidden')) {
    const kaiAn = [...document.querySelectorAll('.tog-btn')].find(
      b => (b.title || '').indexOf('显示右侧报告') === 0
    );
    if (kaiAn) kaiAn.click();
    await deng(900);
  }
  const d = document.querySelector('.map-inner');
  const k = Object.keys(d).find(x => x.indexOf('__reactFiber$') === 0);
  let f = d[k];
  let map = null;
  let rep = null;
  while (f) {
    const p = f.memoizedProps || {};
    if (!rep && p.report && p.center) rep = p.report;
    let s = f.memoizedState;
    while (s && !map) {
      const v = s.memoizedState;
      if (v && v.current && v.current.map && typeof v.current.map.getZoom === 'function') map = v.current.map;
      s = s.next;
    }
    f = f.return;
  }
  if (!map) return JSON.stringify({ cuo: '没拿到地图实例' });
  const he = c => (c ? c.lng.toFixed(5) + ',' + c.lat.toFixed(5) : '取不到');
  const c0 = map.getCenter();
  const z0 = map.getZoom();
  const mb = ((rep && rep.mangquList) || []).find(m => m.buJianDian) || {};
  // 临时追踪 setCenter 的调用方：看看到底是谁在点击之后又把中心搬回体检中心
  const PT = window.BMapGL && window.BMapGL.Map && window.BMapGL.Map.prototype;
  if (PT && !PT.__zhui) {
    const yuan = PT.setCenter;
    PT.setCenter = function (...can) {
      try {
        const d0 = can[0] || {};
        (window.__scLog = window.__scLog || []).push({
          t: Math.round(performance.now()),
          v: d0.lng != null ? d0.lng.toFixed(5) + ',' + d0.lat.toFixed(5) : String(d0),
          lai: (new Error().stack || '')
            .split('\\n')
            .slice(2, 4)
            .map(s => s.trim().replace(/https?:\\/\\/localhost:5173\\/src\\//, '').slice(0, 60))
            .join(' <- ')
        });
      } catch (e) {}
      return yuan.apply(this, can);
    };
    PT.__zhui = 1;
  }
  window.__scLog = [];
  kuang.scrollIntoView({ block: 'center' });
  await deng(350);
  // 取框内正文区一点（靠左下，避开右上角的「标记」按钮）——模拟用户直接点框
  const r0 = kuang.getBoundingClientRect();
  const dianX = Math.round(r0.left + Math.min(60, r0.width / 3));
  const dianY = Math.round(r0.top + r0.height * 0.72);
  const an = document.elementFromPoint(dianX, dianY) || kuang;
  window.__dianFang = an.tagName + '.' + (an.className || '');
  an.click(); // 点在正文上，靠冒泡到整条 .mq-item，正是用户点框的行为
  await deng(120);
  const cA = map.getCenter();
  await deng(400);
  const cB = map.getCenter();
  await deng(600);
  const cC = map.getCenter();
  // 飞过去之后，图钉是不是正落在屏幕中心（最直接的「跳转到加号那里」判据）——
  // 必须在下面手动 setCenter 之前测，否则中心已经被搬走了
  let zuiJin = null;
  try {
    const lie = map.getOverlays ? map.getOverlays() : [];
    const zx = d.clientWidth / 2;
    const zy = d.clientHeight / 2;
    for (const o of lie) {
      const t = o.getTitle && o.getTitle();
      if (!t || t.indexOf('补建点') !== 0) continue;
      const px = map.pointToPixel(o.getPosition());
      const ju = Math.round(Math.hypot(px.x - zx, px.y - zy));
      if (!zuiJin || ju < zuiJin.距屏幕中心像素) zuiJin = { 图钉: t, 距屏幕中心像素: ju };
    }
  } catch (e) {}
  // 手动设一次中心，验证 setCenter 本身灵不灵（用 +0.006/+0.004 的粗略偏移，只为看动不动）
  let shouDong = '没试';
  if (mb.buJianDian) {
    map.setCenter(new window.BMapGL.Point(mb.buJianDian.lng + 0.006, mb.buJianDian.lat + 0.004));
    await deng(300);
    shouDong = he(map.getCenter());
  }
  return JSON.stringify(
    {
      点击的条目: (kuang.innerText || '').replace(/\\s+/g, ' ').slice(0, 40),
      点击落在: window.__dianFang || '',
      误触发的标记: document.querySelectorAll('.mq-item.on').length,
      离中心最近的图钉: zuiJin || '没取到',
      点击前中心: he(c0),
      '点击后 120ms': he(cA),
      '点击后 520ms': he(cB),
      '点击后 1.1s': he(cC),
      层级: Math.round(z0 * 100) / 100 + ' → ' + Math.round(map.getZoom() * 100) / 100,
      目标_应用内坐标: mb.buJianDian ? mb.buJianDian.lng.toFixed(5) + ',' + mb.buJianDian.lat.toFixed(5) : '(没取到)',
      手动setCenter后: shouDong,
      setCenter调用: (window.__scLog || []).slice(0, 8),
      备注: '地图中心是 BD-09，比应用内的 WGS-84 大约偏 0.006,0.004 度'
    },
    null,
    1
  );
})()`;

// 诊断结论卡的「生成方式设置」：点齿轮看浮层、点本地规则、看标签与偏好是否落盘
const CHA_ZHEN_DUAN = `(async () => {
  const deng = t => new Promise(j => setTimeout(j, t));
  // 报告面板收起时先展开，否则里面的元素量不到
  const youPan = document.querySelector('.right-panel');
  if (youPan && youPan.classList.contains('hidden')) {
    const kaiAn = [...document.querySelectorAll('.tog-btn')].find(
      b => (b.title || '').indexOf('显示右侧报告') === 0
    );
    if (kaiAn) kaiAn.click();
    await deng(900);
  }
  const ka = document.querySelector('.ai-card');
  if (!ka) return JSON.stringify({ cuo: '报告面板里还没有诊断卡（体检没跑完？）' });
  ka.scrollIntoView({ block: 'center' });
  await deng(400);
  const jg = { 初始标签: (ka.querySelector('.ai-biao') || {}).innerText || '(无)' };
  jg.标签title = (ka.querySelector('.ai-biao') || {}).title || '(无)';
  jg.卡片上的失败原因 = ((ka.querySelector('.ai-cuo-tip') || {}).innerText || '(无)').slice(0, 120);
  try {
    const p = JSON.parse(localStorage.getItem('sq_admin_conf') || '{}');
    const a = p.ai || {};
    jg.本地配置 = { 地址: a.apiDiZhi || '', 本地密钥: a.miYao || '(空)', 模型: a.moXing || '' };
  } catch {
    jg.本地配置 = '(取不到)';
  }
  const chi = ka.querySelector('.ai-she-an');
  if (!chi) return JSON.stringify({ ...jg, cuo: '没找到设置齿轮' });
  chi.click();
  await deng(400);
  const she = ka.querySelector('.ai-she');
  jg.浮层出现 = !!she;
  if (she) {
    const xuan = [...she.querySelectorAll('.ai-she-xuan')];
    jg.两个选项 = xuan.map(
      b => (b.innerText || '').replace(/\\s+/g, ' ').slice(0, 34) + (b.disabled ? '［禁用］' : '')
    );
    if (xuan[1]) {
      xuan[1].click(); // 选「本地规则引擎」
      await deng(1800);
      jg.点本地后标签 = (ka.querySelector('.ai-biao') || {}).innerText || '(无)';
      jg.本地偏好已存 = localStorage.getItem('sq_zhenduan_she');
      jg.正文开头 = ((ka.querySelector('.ai-wen') || {}).innerText || '').slice(0, 36);
    }
  }
  return JSON.stringify(jg, null, 1);
})()`;

// 往浏览器里塞一份「本机旧配置」（含旧密钥），用来验证它不会把服务端那份配置顶掉
const JIU_PEI_ZHI = `(() => {
  const KEY = 'sq_admin_conf';
  let p = {};
  try {
    p = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch (e) {}
  p.ai = {
    qiYong: true,
    apiDiZhi: 'https://ben-di-jiu.invalid/v1',
    moXing: 'jiu-mo-xing',
    miYao: 'sk-ben-di-jiu-mi-yao',
    aiKu: []
  };
  localStorage.setItem(KEY, JSON.stringify(p));
  localStorage.removeItem('sq_zhenduan_she');
  return '已写入本机旧配置（地址 ben-di-jiu.invalid、旧密钥 sk-ben-di-jiu-mi-yao）';
})()`;

// 给管理员 AI 配置塞一份「假接口」，用来验证「大模型」选项与失败回退这条路（真密钥不落测试脚本）
const JIA_AI = `(() => {
  const KEY = 'sq_admin_conf';
  let p = {};
  try {
    p = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch (e) {}
  p.ai = {
    qiYong: true,
    apiDiZhi: 'https://example.invalid/v1',
    moXing: 'test-model',
    miYao: 'sk-test-jia',
    aiKu: []
  };
  localStorage.setItem(KEY, JSON.stringify(p));
  localStorage.removeItem('sq_zhenduan_she'); // 顺带清掉用户偏好，回到「跟随管理员配置」
  return '已写入假 AI 配置（example.invalid，必定失败，用于验证回退）';
})()`;

// 走一遍「点设施 → 进导航 → 退出导航」，看等时圈热力图与设施点在退出后是否原样恢复
const WANG_FAN = `(async () => {
  const deng = t => new Promise(j => setTimeout(j, t));
  const d = document.querySelector('.map-inner');
  if (!d) return '没有地图容器';
  const k = Object.keys(d).find(x => x.indexOf('__reactFiber$') === 0);
  let f = d[k];
  let map = null;
  let rep = null;
  let fn = null;
  while (f) {
    const p = f.memoizedProps || {};
    if (!rep && p.report && p.center) rep = p.report;
    if (!fn && typeof p.onPoiDianJi === 'function') fn = p.onPoiDianJi;
    const B0 = window.BMapGL;
    let s = f.memoizedState;
    while (s && !map && B0) {
      const v = s.memoizedState;
      if (v && v.current && v.current.map && typeof v.current.map.getZoom === 'function') map = v.current.map;
      s = s.next;
    }
    f = f.return;
  }
  if (!map || !fn || !rep) return '缺东西：map=' + !!map + ' fn=' + !!fn + ' report=' + !!rep;
  const B = window.BMapGL;
  const ji = () => {
    let duo = 0;
    let dian = 0;
    for (const o of map.getOverlays()) {
      if (B.Polygon && o instanceof B.Polygon) duo++;
      else if (B.Marker && o instanceof B.Marker) dian++;
    }
    return '多边形 ' + duo + ' / 标记 ' + dian;
  };
  const jg = [];
  jg.push('初始：' + ji());
  const fen = (rep.poiSet && rep.poiSet.fenleiSet) || {};
  const lei = Object.keys(fen).find(x => (fen[x] || []).length);
  if (!lei) return '本轮报告没有设施点，无法测';
  fn(fen[lei][0]);
  await deng(4500);
  jg.push('点设施后：' + ji());
  const ka = document.querySelector('.jiaoTong-ka');
  if (ka) {
    ka.click();
    await deng(2200);
  }
  jg.push('进导航后：' + ji() + ' / 全屏导航=' + !!document.querySelector('.daoHang-quanPing'));
  const tui = document.querySelector('.daoPing-tui');
  if (tui) {
    tui.click();
    await deng(2600);
  }
  jg.push('退出导航后：' + ji() + ' / 全屏导航=' + !!document.querySelector('.daoHang-quanPing'));
  return jg.join('\\n');
})()`;

// 查等时圈（热力图）：报告里到底有几层、地图上到底画了几个多边形
const CHA_ISO = `(() => {
  const d = document.querySelector('.map-inner');
  if (!d) return JSON.stringify({ cuo: '没有地图容器' });
  const k = Object.keys(d).find(x => x.indexOf('__reactFiber$') === 0);
  let f = d[k];
  let map = null;
  let rep = null;
  while (f) {
    const p = f.memoizedProps || {};
    if (!rep && p.report && p.center) rep = p.report;
    let s = f.memoizedState;
    while (s && !map) {
      const v = s.memoizedState;
      if (v && v.current && v.current.map && typeof v.current.map.getZoom === 'function') map = v.current.map;
      s = s.next;
    }
    f = f.return;
  }
  let tuCeng = '未拿到地图实例';
  if (map && map.getOverlays) {
    const B = window.BMapGL;
    const lie = map.getOverlays();
    let duo = 0;
    let xian = 0;
    let yuan = 0;
    let dian = 0;
    let qiTa = 0;
    for (const o of lie) {
      // 用 instanceof 判类：GL 内部的 constructor.name 在打包/压缩后并不可靠
      if (B.Polygon && o instanceof B.Polygon) duo++;
      else if (B.Circle && o instanceof B.Circle) yuan++;
      else if (B.Polyline && o instanceof B.Polyline) xian++;
      else if (B.Marker && o instanceof B.Marker) dian++;
      else qiTa++;
    }
    tuCeng = { 多边形: duo, 折线: xian, 圆: yuan, 标记: dian, 其他: qiTa, 总数: lie.length };
  }
  const ceng = (rep && rep.dengShiQuan && rep.dengShiQuan.ceng) || [];
  const sy = rep && rep.dengShiQuan && rep.dengShiQuan.shuiYu;
  return JSON.stringify(
    {
      报告里的等时圈层: ceng.length ? ceng.map(c => c.miao + '分/' + (c.polygon || []).length + '环') : '(空)',
      水域避让: sy
        ? '启用=' + sy.qiYong + ' 水面块数=' + sy.geShu + ' 被掩掉的格=' + sy.yanMaGe
        : '(旧报告，无该字段)',
      水域相关告警: ((rep && rep.warnings) || []).filter(w => /水域|水面/.test(w)),
      地图覆盖物: tuCeng,
      是否在导航: !!document.querySelector('.daoHang-quanPing'),
      顶部提示条: (document.querySelector('.buxing-tip') || {}).innerText || '(无)'
    },
    null,
    1
  );
})()`;

// 切到 OSM 数据源（不耗百度配额）并点「开始体检」，用来端到端验证水域掩膜
const QI_TIJIAN = `(() => {
  const sel = [...document.querySelectorAll('select')].find(s =>
    [...s.options].some(o => o.value === 'osm')
  );
  if (sel) {
    sel.value = 'osm';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const an = document.querySelector('.run-btn');
  if (!an) return '没找到「开始体检」按钮';
  if (an.disabled) return '体检按钮当前不可点（可能正在体检）';
  an.click();
  return (sel ? '已切到 OSM 数据源，' : '未找到数据源下拉（按当前数据源跑），') + '并点了「开始体检」';
})()`;

// 点设施（走 MapCanvas 的 onPoiDianJi，与手点地图设施图标同一条路），看「路线方案」窗口有没有弹出来
const DIAN_SHE_SHI = `(async () => {
  const deng = t => new Promise(j => setTimeout(j, t));
  const d = document.querySelector('.map-inner');
  if (!d) return JSON.stringify({ cuo: '没有地图容器' });
  const k = Object.keys(d).find(x => x.indexOf('__reactFiber$') === 0);
  let f = d[k];
  let rep = null;
  let fn = null;
  while (f) {
    const p = f.memoizedProps || {};
    if (!rep && p.report && p.center) rep = p.report;
    if (!fn && typeof p.onPoiDianJi === 'function') fn = p.onPoiDianJi;
    f = f.return;
  }
  if (!fn) return JSON.stringify({ cuo: '没拿到 onPoiDianJi' });
  if (!rep) return JSON.stringify({ cuo: '页面还没有体检报告（等体检跑完再试）' });
  const fen = (rep.poiSet && rep.poiSet.fenleiSet) || {};
  const lei = Object.keys(fen).find(x => (fen[x] || []).length);
  if (!lei) return JSON.stringify({ cuo: '本轮报告没有设施点' });
  const dian = fen[lei][0];
  const qian = document.querySelectorAll('.jiaoTong-chuang').length;
  fn(dian);
  await deng(4500);
  const chuang = document.querySelector('.jiaoTong-chuang');
  // 再往前一步：点弹窗里的路线卡，看能不能真的进导航（这才是用户要的「开始导航」）
  let jinRu = '弹窗没出来，没试';
  let kaWen = '';
  if (chuang) {
    const ka = chuang.querySelector('.jiaoTong-ka');
    if (ka) {
      kaWen = (ka.innerText || '').replace(/\\s+/g, ' ').slice(0, 40);
      ka.click();
      await deng(1500);
      jinRu = document.querySelector('.daoHang-quanPing') ? '已进入全屏导航' : '点了卡但没进导航';
    } else {
      jinRu = '路线卡还没出来（规划中）';
    }
  }
  return JSON.stringify(
    {
      点到的设施: (dian.name || '(无名)') + ' · ' + lei,
      点击前弹窗: qian,
      点击后弹窗: chuang ? '已弹出' : '没弹',
      弹窗标题: chuang ? (chuang.querySelector('.panel-title') || {}).innerText : '',
      路线卡: kaWen || '(无)',
      点路线卡后: jinRu,
      顶部提示条: (document.querySelector('.buxing-tip') || {}).innerText || '(无)'
    },
    null,
    1
  );
})()`;

// 在页面地图中心临时插一枚「新版自标图钉」，用来确认这枚 SVG 在百度 GL 里画得出来
const CHA_TUDING = `(async () => {
  const deng = t => new Promise(j => setTimeout(j, t));
  const d = document.querySelector('.map-inner');
  if (!d) return '没有地图容器';
  const k = Object.keys(d).find(x => x.indexOf('__reactFiber$') === 0);
  let f = d[k];
  let map = null;
  let onPick = null;
  while (f) {
    const p = f.memoizedProps || {};
    if (!onPick && typeof p.onPick === 'function') onPick = p.onPick;
    let s = f.memoizedState;
    while (s && !map) {
      const v = s.memoizedState;
      if (v && v.current && v.current.map && typeof v.current.map.getZoom === 'function') map = v.current.map;
      s = s.next;
    }
    f = f.return;
  }
  if (!map) return '没拿到地图实例';
  // 库里那几条自标标记在桂林一带，而本机默认定位在长沙——先把中心挪过去，
  // 共享标记按「附近 2 公里」过滤，不挪过去地图上根本不会有自标钉
  if (onPick) {
    onPick({ lng: 109.99707, lat: 25.0017546 });
    await deng(3500);
  }
  // 数一数真实数据画出来的自标图钉（标题以「自标盲区」开头），别拿测试钉糊弄
  let ziBiao = 0;
  for (const o of map.getOverlays()) {
    const t = o.getTitle && o.getTitle();
    if (t && t.indexOf('自标盲区') === 0) ziBiao++;
  }
  const qingDan = document.querySelectorAll('.zi-biao-biao').length;
  return '地图上自标钉 ' + ziBiao + ' 枚 / 右侧「自标」条目 ' + qingDan + ' 个（下面再截一张图看模样）';
})()`;

// 逐项实验：每一步都做同样的“视图微扰”（panBy 让 GL 需要新瓦片），再看瓦片请求数涨不涨
const SHI_YAN = `(async () => {
  const ji = () => performance.getEntriesByType('resource').filter(r => /qt=vtile/i.test(r.name)).length;
  const deng = t => new Promise(j => setTimeout(j, t));
  window.__ditu = (${ZHAO_SHI_LI}) || window.__ditu;
  const m = window.__ditu;
  if (!m) return '未找到地图实例（fiber 里没有 map ref）';
  const bu = async (biao, fn) => {
    const a = ji();
    let cuo = '';
    try { fn(); } catch (e) { cuo = ' [抛错 ' + e.message + ']'; }
    try { m.panBy(700, 0); await deng(200); m.panBy(-700, 0); } catch (e) { cuo += ' [平移失败]'; }
    await deng(4500);
    return biao + cuo + ' 瓦片 ' + a + ' → ' + ji();
  };
  const jg = [];
  jg.push('现状: 瓦片 ' + ji() + ' / 层级 ' + m.getZoom() + ' / 中心 ' + JSON.stringify(m.getCenter()));
  jg.push(await bu('对照(只平移)', () => {}));
  jg.push(await bu('A setMapStyleV2({styleJson:[]})', () => m.setMapStyleV2({ styleJson: [] })));
  jg.push(await bu('B 隐藏标签样式', () => m.setMapStyleV2({ styleJson: [{ featureType: 'poilabel', elementType: 'all', stylers: { visibility: 'off' } }] })));
  jg.push(await bu('C hide 后 show 街道层', () => {
    if (m.hideVectorStreetLayer) m.hideVectorStreetLayer();
    if (m.showVectorStreetLayer) m.showVectorStreetLayer();
  }));
  jg.push(await bu('D setDisplayOptions({street:true})', () => m.setDisplayOptions({ street: true })));
  jg.push(await bu('E setMapType(普通地图)', () => m.setMapType(window.BMAP_NORMAL_MAP || window.BMapGL.BMAP_NORMAL_MAP)));
  jg.push(await bu('F 缩放 +1', () => m.setZoom(m.getZoom() + 1)));
  jg.push('最终: 瓦片 ' + ji() + ' / 层级 ' + m.getZoom() + ' / 中心 ' + JSON.stringify(m.getCenter()));
  return jg.join('\\n');
})()`;

const zhu = async () => {
  const { ws, ye } = await lianJie();
  console.log('页面: ' + ye.url);
  let id = 0;
  let waPianQingQiu = 0;
  let waPianChengGong = 0;
  const qing = new Map();
  const shiBai = [];

  ws.onmessage = async shi => {
    const x = JSON.parse(shi.data);
    // 控制台错误 / 未捕获异常：底图渲染循环被异常打断时，只有这里能看到真正原因
    if (x.method === 'Runtime.exceptionThrown') {
      const d = x.params.exceptionDetails;
      const miao = (d.exception && d.exception.description) || d.text || '';
      console.log('!! 异常: ' + String(miao).slice(0, 200).replace(/\n/g, ' | '));
      console.log('   位置: ' + (d.url || '(无)') + ':' + d.lineNumber + ' 堆栈 ' + (d.stackTrace ? d.stackTrace.callFrames.length : 0) + ' 帧');
      if (d.stackTrace)
        (d.stackTrace.callFrames || []).slice(0, 3).forEach(f =>
          console.log('     ' + (f.functionName || '(匿名)') + ' @ ' + String(f.url).split('/').pop() + ':' + f.lineNumber)
        );
    }
    if (x.method === 'Runtime.consoleAPICalled' && /error|warning/.test(x.params.type)) {
      const w = (x.params.args || []).map(a => a.value || a.description || a.type).join(' ');
      if (w) console.log('   控制台 ' + x.params.type + ': ' + String(w).slice(0, 220));
    }
    if (x.method === 'Network.requestWillBeSent') {
      const u = x.params.request.url;
      if (/qt=vtile/i.test(u)) {
        waPianQingQiu++;
        qing.set(x.params.requestId, u);
      }
    }
    if (x.method === 'Network.responseReceived') {
      const u = qing.get(x.params.requestId);
      if (u) {
        waPianChengGong++;
        if (waPianChengGong <= 2)
          console.log('  瓦片 ' + x.params.response.status + ' ' + u.replace(/^https?:\/\//, '').slice(0, 80));
        qing.delete(x.params.requestId);
      }
    }
    if (x.method === 'Network.loadingFailed') {
      const u = qing.get(x.params.requestId);
      if (u) {
        shiBai.push(x.params.errorText + ' ' + u.replace(/^https?:\/\//, '').slice(0, 80));
        qing.delete(x.params.requestId);
      }
    }
    if (x.id === 818 && x.result && x.result.result) {
      console.log(x.result.result.value);
      process.exit(0);
    }
    if (x.id === 824) {
      const sb = x.result && x.result.data;
      if (sb) {
        const lu = require('path').join(require('os').tmpdir(), 'quan_jietu.png');
        require('fs').writeFileSync(lu, Buffer.from(sb, 'base64'));
        console.log('已保存截图: ' + lu);
      } else {
        console.log('截图返回空');
      }
      process.exit(0);
    }
    if (x.id === 822 && x.result && x.result.result) {
      console.log(x.result.result.value);
      process.exit(0);
    }
    if (x.id === 820 && x.result && x.result.result) {
      console.log(x.result.result.value);
      process.exit(0);
    }
    if (x.id === 819 && x.result && x.result.result) {
      console.log(x.result.result.value);
      process.exit(0);
    }
    if (x.id === 814 && x.result && x.result.result) {
      console.log(x.result.result.value);
      process.exit(0);
    }
    if (x.id === 813 && x.result && x.result.result) {
      console.log(x.result.result.value);
      process.exit(0);
    }
    if (x.id === 812 && x.result && x.result.result) {
      console.log(x.result.result.value);
      process.exit(0);
    }
    if (x.id === 815 && x.result && x.result.result) {
      console.log('注入: ' + x.result.result.value);
      ws.send(
        JSON.stringify({
          id: 816,
          method: 'Emulation.setDeviceMetricsOverride',
          params: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }
        })
      );
      setTimeout(() => {
        ws.send(
          JSON.stringify({
            id: 817,
            method: 'Page.captureScreenshot',
            params: { format: 'png', fromSurface: true }
          })
        );
      }, 900);
    }
    if (x.id === 817) {
      const sb = x.result && x.result.data;
      if (sb) {
        const lu = require('path').join(require('os').tmpdir(), 'ding_xin.png');
        require('fs').writeFileSync(lu, Buffer.from(sb, 'base64'));
        console.log('已保存截图: ' + lu);
      } else {
        console.log('截图返回空（headless 合成限制）');
      }
      process.exit(0);
    }
    if (x.id === 811 && x.result && x.result.result) {
      console.log(x.result.result.value);
      process.exit(0);
    }
    if (x.id === 810 && x.result && x.result.result) {
      const zhi = x.result.result.value;
      console.log(zhi);
      let d = {};
      try {
        d = JSON.parse(zhi);
      } catch (e) {
        /* 解析失败按未命中处理 */
      }
      if (!d.命中) {
        process.exit(0);
      }
      const can = { x: d.视口X, y: d.视口Y, button: 'left', clickCount: 1 };
      const pai = tai => ({ id: ++id, method: 'Input.dispatchMouseEvent', params: tai });
      ws.send(JSON.stringify(pai({ type: 'mouseMoved', ...can })));
      ws.send(JSON.stringify(pai({ type: 'mousePressed', ...can })));
      ws.send(JSON.stringify(pai({ type: 'mouseReleased', ...can })));
      setTimeout(() => {
        ws.send(
          JSON.stringify({
            id: 830,
            method: 'Runtime.evaluate',
            params: { expression: CHA_DIAN_JI, returnByValue: true, awaitPromise: true }
          })
        );
      }, 1200);
    }
    if (x.id === 830 && x.result && x.result.result) {
      console.log('点击后：' + x.result.result.value);
      process.exit(0);
    }
    if (x.id === 800 && x.result && x.result.result) {
      const r = x.result.result;
      if (r.subtype === 'error' || (r.description && !r.value)) console.log('表达式异常: ' + r.description);
      else console.log(r.value);
      console.log('网络口径：瓦片请求 ' + waPianQingQiu + ' 次 / 有响应 ' + waPianChengGong + ' 次');
      if (shiBai.length) console.log('瓦片失败:\n  ' + shiBai.slice(0, 5).join('\n  '));
      process.exit(0);
    }
  };

  ws.send(JSON.stringify({ id: ++id, method: 'Network.enable', params: {} }));
  ws.send(JSON.stringify({ id: ++id, method: 'Runtime.enable', params: {} }));

  if (MO === 'reload') {
    ws.send(JSON.stringify({ id: ++id, method: 'Page.enable', params: {} }));
    console.log('重载页面…');
    ws.send(JSON.stringify({ id: ++id, method: 'Page.reload', params: {} }));
    await new Promise(jie => setTimeout(jie, 25000));
  } else {
    await new Promise(jie => setTimeout(jie, 200));
  }

  if (MO === 'dian') {
    ws.send(
      JSON.stringify({
        id: 810,
        method: 'Runtime.evaluate',
        params: { expression: ZHAO_BUJIAN, returnByValue: true, awaitPromise: true }
      })
    );
    return;
  }

  if (MO === 'zhenduan') {
    ws.send(
      JSON.stringify({
        id: 818,
        method: 'Runtime.evaluate',
        params: { expression: CHA_ZHEN_DUAN, returnByValue: true, awaitPromise: true }
      })
    );
    return;
  }

  if (MO === 'jieTu') {
    ws.send(JSON.stringify({ id: ++id, method: 'Page.enable', params: {} }));
    // 先把左右浮层面板收起来，地图才看得全
    ws.send(
      JSON.stringify({
        id: 825,
        method: 'Runtime.evaluate',
        params: {
          expression:
            "[...document.querySelectorAll('.tog-btn')].forEach(b => { if ((b.title||'').indexOf('隐藏') === 0) b.click(); }); '已收起面板'",
          returnByValue: true
        }
      })
    );
    ws.send(
      JSON.stringify({
        id: 823,
        method: 'Emulation.setDeviceMetricsOverride',
        params: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }
      })
    );
    setTimeout(() => {
      ws.send(
        JSON.stringify({
          id: 824,
          method: 'Page.captureScreenshot',
          params: { format: 'png', fromSurface: true }
        })
      );
    }, 1400);
    return;
  }

  if (MO === 'tijian') {
    ws.send(
      JSON.stringify({
        id: 822,
        method: 'Runtime.evaluate',
        params: { expression: QI_TIJIAN, returnByValue: true }
      })
    );
    return;
  }

  if (MO === 'jiupeizhi') {
    ws.send(
      JSON.stringify({
        id: 820,
        method: 'Runtime.evaluate',
        params: { expression: JIU_PEI_ZHI, returnByValue: true }
      })
    );
    return;
  }

  if (MO === 'jiaai') {
    ws.send(
      JSON.stringify({
        id: 819,
        method: 'Runtime.evaluate',
        params: { expression: JIA_AI, returnByValue: true }
      })
    );
    return;
  }

  if (MO === 'wangfan') {
    ws.send(
      JSON.stringify({
        id: 814,
        method: 'Runtime.evaluate',
        params: { expression: WANG_FAN, returnByValue: true, awaitPromise: true }
      })
    );
    return;
  }

  if (MO === 'iso') {
    ws.send(
      JSON.stringify({
        id: 813,
        method: 'Runtime.evaluate',
        params: { expression: CHA_ISO, returnByValue: true }
      })
    );
    return;
  }

  if (MO === 'sheshi') {
    ws.send(
      JSON.stringify({
        id: 812,
        method: 'Runtime.evaluate',
        params: { expression: DIAN_SHE_SHI, returnByValue: true, awaitPromise: true }
      })
    );
    return;
  }

  if (MO === 'tuding') {
    ws.send(JSON.stringify({ id: ++id, method: 'Page.enable', params: {} }));
    ws.send(
      JSON.stringify({
        id: 815,
        method: 'Runtime.evaluate',
        params: { expression: CHA_TUDING, returnByValue: true, awaitPromise: true }
      })
    );
    return;
  }

  if (MO === 'fei') {
    ws.send(
      JSON.stringify({
        id: 811,
        method: 'Runtime.evaluate',
        params: { expression: FEI_BUJIAN, returnByValue: true, awaitPromise: true }
      })
    );
    return;
  }

  ws.send(
    JSON.stringify({
      id: 800,
      method: 'Runtime.evaluate',
      params: {
        expression: MO === 'shiyan' ? SHI_YAN : TAN_ZHEN,
        returnByValue: true,
        awaitPromise: MO === 'shiyan'
      }
    })
  );
};

zhu().catch(e => {
  console.error('失败: ' + e.message);
  process.exit(1);
});
