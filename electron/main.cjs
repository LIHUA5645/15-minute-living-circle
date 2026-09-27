// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// Electron 主进程：窗口 + 服务端 API 代理（批量距离矩阵）+ 磁盘缓存 + 离线样例
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
// 读取项目根 .env（与 vite 同源配置）：Electron 主进程没有 vite 的 loadEnv，
// 服务端 AK（BAIDU_SERVER_AK）靠这里注入——没有它，IPC 数据检索/算路全部空手而归。
// 行内 # 注释一并剥掉；已在系统环境里显式设置的变量不覆盖
try {
  const envWen = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envWen)) {
    fs.readFileSync(envWen, 'utf-8').split(/\r?\n/).forEach(xing => {
      const jing = xing.indexOf('#');
      const tou = (jing >= 0 ? xing.slice(0, jing) : xing).trim();
      const m = tou.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
    });
  }
} catch (e) {
  console.error('.env 读取失败（服务端 AK 将不可用）', e);
}
// 注意：本项目 "type": "module"，src 下的 .js 都是 ESM，Electron 31 内置 Node 20
// 不支持 require(ESM)（会抛 ERR_REQUIRE_ESM 白屏报错），这里改用动态 import() 延迟加载。
// provider 在 whenReady 后才有值；IPC 句柄都是惰性调用，注册顺序不受影响。
let provider = null;

// 磁盘缓存（落 userData，重复体检秒开、降配额）
const cacheFile = path.join(app.getPath('userData'), 'cache.json');
let cacheMap = {};
try {
  cacheMap = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
} catch {
  cacheMap = {};
}
let dirty = false;
let writeTimer = null;
function flushCache() {
  if (!dirty) return;
  dirty = false;
  fs.writeFile(cacheFile, JSON.stringify(cacheMap), (err) => {
    if (err) console.error('缓存写入失败', err);
  });
}
function cacheSet(k, v) {
  cacheMap[k] = { t: Date.now(), v };
  dirty = true;
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(flushCache, 500); // 500ms 内合并多次写入
}
function cacheGet(k) {
  const o = cacheMap[k];
  if (!o) return null;
  if (Date.now() - o.t > 7 * 864e5) return null;
  return o.v;
}
// 应用退出前强制落盘
app.on('before-quit', flushCache);
const store = { get: cacheGet, set: cacheSet };

const serverAk = process.env.BAIDU_SERVER_AK || '';

// —— 百度 AK Referer 白名单注入 ——
// 百度「浏览器端」AK 按 Referer 白名单校验：开发态 localhost:5173 在白名单内，
// 而 Electron 生产态用 file:// 加载页面，请求带不出合法 Referer，
// 百度 JSAPI 会弹原生错误框「APP Referer校验失败」。
// 这里在主进程统一给百度系域名的请求注入白名单 Referer，桌面端即可正常过校验。
const baiDuXi = /(^|\.)(baidu\.com|bdstatic\.com|bcebos\.com)$/;
function zhuRuReferer() {
  try {
    const { session } = require('electron');
    session.defaultSession.webRequest.onBeforeSendHeaders((xiang, hui) => {
      const tou = xiang.requestHeaders;
      try {
        const zhu = new URL(xiang.url).hostname;
        if (baiDuXi.test(zhu)) tou.Referer = 'http://localhost:5173/';
      } catch {
        /* 非法 URL 原样放行 */
      }
      hui({ requestHeaders: tou });
    });
  } catch (e) {
    console.error('Referer 注入失败', e);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    // 窗口图标：标题栏与任务栏统一用项目根的 logo1.png（默认 Electron 图标太出戏）
    icon: path.join(__dirname, '..', 'logo1.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // 开发模式加载 Vite，生产加载构建产物
  const dev = process.env.ELECTRON_DEV === '1';
  if (dev) win.loadURL('http://localhost:5173');
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  // 渲染进程 window.open 弹出的子窗口（如「跳转百度地图导航」）：
  // 主进程接管创建并统一带 logo1.png 图标——不走这段时新窗口用默认 Electron 图标，
  // 标题栏左上角很出戏。菜单栏一并隐藏（File/Edit/View 对纯展示外页没有用处）
  win.webContents.setWindowOpenHandler(({ url }) => {
    const zi = new BrowserWindow({
      width: 1200,
      height: 860,
      icon: path.join(__dirname, '..', 'logo1.png'),
      autoHideMenuBar: true,
    });
    zi.loadURL(url);
    return { action: 'deny' }; // 阻止 Electron 默认创建（默认窗口没有我们的图标）
  });
}

// IPC 桥：渲染进程通过 window.api.* 调用主进程代理（AK 不进前端产物）
ipcMain.handle('walkingRoute', async (_e, o, d) => provider.walkingRoute(o, d));
ipcMain.handle('routeMatrix', async (_e, o, d) => provider.routeMatrix(o, d));
ipcMain.handle('searchPoi', async (_e, c, k, r) => provider.searchPoi(c, k, r));
ipcMain.handle('reverseGeocode', async (_e, p) => provider.reverseGeocode(p));
// IP 定位兜底：桌面无 GPS、浏览器定位被拒时，用百度 IP 定位拿城市/区县级位置。
// coor=bd09ll 让返回点直接是 BD-09 经纬度，渲染层再转内部 WGS-84
ipcMain.handle('ipDingWei', async () => {
  try {
    const ak = process.env.BAIDU_SERVER_AK || '';
    if (!ak) return { ok: false, reason: '未配置服务端 AK' };
    const r = await fetch(
      `https://api.map.baidu.com/location/ip?ak=${ak}&coor=bd09ll&output=json`
    );
    const j = await r.json();
    if (j && j.status === 0 && j.content && j.content.point) {
      const dz = j.content.address || {};
      return {
        ok: true,
        lng: j.content.point.x,
        lat: j.content.point.y,
        address: dz.city || dz.district || ''
      };
    }
    return { ok: false, reason: (j && j.message) || 'IP 定位无结果' };
  } catch (e) {
    return { ok: false, reason: String((e && e.message) || e) };
  }
});

// —— 内嵌用户/管理员鉴权服务 ——
// 桌面端用 file:// 加载页面，没有 vite dev 中间件承接 /api，渲染层的登录 /
// 管理员控制台 / 盲区标记会全部「服务暂时不可用」。这里把 fuwuqi/yonghu-fuwu.mjs
// 直接挂进主进程的本地 HTTP 服务（仅监听 127.0.0.1，不对外网暴露），
// 渲染层在桌面端把 /api 指到 http://127.0.0.1:37777（见 src/core/fuwuDiZhi.js）。
// MySQL 连接参数复用 .env 的 DB_*；库表结构 / 限流规则 / 种子管理员与服务端完全一致。
const YONGHU_DUANKOU = 37777;
async function qiDongYongHuFuWu() {
  try {
    const { chuangJianYongHuFuWu } = await import('../fuwuqi/yonghu-fuwu.mjs');
    const http = require('http');
    const fuwu = chuangJianYongHuFuWu({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || ''
    });
    // 初始化失败（MySQL 没开）不拦启动：服务照常监听，请求时会以 500 报出具体原因
    fuwu.chuShiHua().catch(e => console.error('[yonghu-fuwu] MySQL 初始化失败：', e.message));
    require('http')
      .createServer((req, res) => {
        // 前端统一走 /api 前缀，fuwu 服务内的路由不带前缀，剥掉再交给处理器
        req.url = String(req.url || '/').replace(/^\/api/, '');
        fuwu.chuLi(req, res);
      })
      .listen(YONGHU_DUANKOU, '127.0.0.1')
      .on('listening', () =>
        console.log('[yonghu-fuwu] 桌面端本地服务已启动：http://127.0.0.1:' + YONGHU_DUANKOU)
      )
      .on('error', e =>
        // 端口被占（应用多开）：另一个实例已经在服务，直接复用即可
        console.error('[yonghu-fuwu] 本地端口启动失败（多开时可忽略）：', e.message)
      );
  } catch (e) {
    console.error('[yonghu-fuwu] 服务加载失败：', e.message);
  }
}

app.whenReady().then(async () => {
  // 动态 import 加载 ESM 适配器（主进程是 CJS，只能这样引 src 下的模块）
  const { chuangJianBmapServer } = await import('../src/adapters/bmapServer.js');
  // 多 AK 轮换：主 AK 当日配额超限（baidu:302「天配额超限」）或被禁用（4/5）时，
  // 自动换下一把重试；全部用尽才把最后的错误抛回渲染层（与 vite 中间件的多 AK 架构对齐）。
  // 此前只挂主 AK，配额一满桌面端路线/检索/体检就全挂（表现为「没有当前方案」）
  const AK_LIE = [process.env.BAIDU_SERVER_AK, process.env.BAIDU_SERVER_AK2]
    .filter(Boolean)
    .map(ak => chuangJianBmapServer({ ak, referer: 'http://localhost' }));
  let AK_Xu = 0;
  const daiHuan = mingZ => async (...can) => {
    let zuiHou = null;
    for (let t = 0; t < AK_LIE.length; t++) {
      const x = (AK_Xu + t) % AK_LIE.length;
      try {
        const r = await AK_LIE[x][mingZ](...can);
        AK_Xu = x; // 记住当前可用的 AK，后续请求优先用它
        return r;
      } catch (e) {
        zuiHou = e;
        const xinXi = String((e && e.message) || e);
        // 只有配额/账号级错误才轮换；参数、网络类错误直接抛
        if (!/baidu:(30[12]|4|5)|配额|AK/i.test(xinXi)) throw e;
      }
    }
    throw zuiHou;
  };
  provider = {
    walkingRoute: daiHuan('walkingRoute'),
    routeMatrix: daiHuan('routeMatrix'),
    searchPoi: daiHuan('searchPoi'),
    reverseGeocode: daiHuan('reverseGeocode')
  };
  // 必须在窗口加载前注册，否则 JSAPI 首个请求已带着空 Referer 出站
  zhuRuReferer();
  qiDongYongHuFuWu();
  createWindow();
});
app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit());
