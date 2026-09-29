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
