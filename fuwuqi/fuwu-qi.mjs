// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 独立服务端（三端小程序 + 静态部署的统一出口）。
// 启动：node fuwuqi/fuwu-qi.mjs        （等价于 npm run fuwu）
// 端口：FUWU_PORT 环境变量，缺省 8787
//
// 为什么需要它：小程序只能连「已在后台配好白名单的 HTTPS 域名」，不可能像浏览器那样用相对路径 /bmapapi；
// 而 Web 端那三个中间件原本只挂在 Vite 开发服务器上（vite.config.js），生产构建（dist/）里是没有的。
// 本文件把同一批能力（含水域接口）挂到一个独立进程上，一端配一个域名即可覆盖三端 + 静态页面。
//
// 挂载点（与 vite.config.js 行为一致，实现同源在 fuwuqi/zhongJian.mjs）：
//   /api      用户注册登录、管理员、共享盲区标记、体检配置（MySQL）
//   /bmapapi  百度 Web 服务代理：服务端代持 AK + 多 AK 配额轮换
//   /airelay  AI 接口中转：服务端代持密钥，前端/小程序全程不接触密钥
//   /shuiyu   水域数据：预置样例 → 本地缓存 → Overpass 多节点
//   /zhoubian 周边地名：本地缓存 → Overpass 多节点（「定位周边推荐」用）
//   /jianKang 健康检查（部署探活用）
//   /*        若存在 dist/ 则一并托管（Web 端与小程序同机部署时省一个静态服务器）
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chuangJianYongHuFuWu } from './yonghu-fuwu.mjs';
import { chuangJianYuYin } from './yuyin.mjs';
import {
  chuangJianBmapDaiLi,
  chuangJianAiZhongJi,
  chuangJianShuiYuZhongJian,
  chuangJianZhouBianZhongJian
} from './zhongJian.mjs';

const GEN = resolve(fileURLToPath(new URL('..', import.meta.url)));

// .env 极简解析：本工程不引 dotenv，且 .env 是「一行一个 KEY=VALUE」的朴素格式
function duEnv() {
  const p = join(GEN, '.env');
  const out = {};
  if (!existsSync(p)) return out;
  for (const hang of readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const s = hang.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    out[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return { ...out, ...process.env };
}

const env = duEnv();
const PORT = Number(env.FUWU_PORT || 8787);
const distMuLu = join(GEN, 'dist');

// 用户/配置服务（MySQL）。数据库连不上不阻塞启动：其它端点照常可用，/api 会如实报错
const yongHuFuWu = chuangJianYongHuFuWu({
  host: env.DB_HOST || '127.0.0.1',
  port: Number(env.DB_PORT || 3306),
  user: env.DB_USER || 'root',
  password: env.DB_PASS || ''
});

// 语音识别中转（密钥仍由服务端代持；未配置时接口如实报「没配」，不影响其它功能）
const yuYin = chuangJianYuYin({ ak: env.BAIDU_YUYIN_AK, sk: env.BAIDU_YUYIN_SK });

const bmapDaiLi = chuangJianBmapDaiLi({
  akLie: [env.BAIDU_SERVER_AK, env.BAIDU_SERVER_AK2].filter(Boolean)
});

const aiZhongJi = chuangJianAiZhongJi({ quAiPeiZhi: () => yongHuFuWu.quAiPeiZhi() });

// 水域：预置样例文件在 public/osm（随仓库分发），联网结果缓存在 fuwuqi/shuju
const shuiYuZhongJian = chuangJianShuiYuZhongJian({
  yuZhiMuLu: join(GEN, 'public', 'osm'),
  huanCunMuLu: join(GEN, 'fuwuqi', 'shuju'),
  // 懒加载：水域模块会连带 import Overpass 查询器，只有真要用时才载入，启动更干净
  huoShuiYu: async (zx, banJingMi) => {
    const { huoShuiYu } = await import('../src/adapters/shuiyu.js');
    return huoShuiYu(zx, banJingMi);
  }
});

// 周边地点：只落盘缓存（没有预置样例——地名随位置而变，预置意义不大），
// 结果同样存 fuwuqi/shuju，键前缀 zhoubian_ 与水域的 shuiyu_ 区分开
const zhouBianZhongJian = chuangJianZhouBianZhongJian({
  huanCunMuLu: join(GEN, 'fuwuqi', 'shuju'),
  // 懒加载同上：只有真点开「切换」面板要推荐时才载入 Overpass 查询器
  huoZhouBian: async (zx, banJingMi) => {
    const { huoZhouBian } = await import('../src/adapters/zhoubian.js');
    return huoZhouBian(zx, banJingMi);
  }
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

// 静态托管：只在 dist/ 存在时启用（生产用 nginx 时可以把这段删掉）
function jingTai(req, res) {
  const u = new URL(req.url, 'http://localhost');
  const lu = decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname);
  const p = normalize(join(distMuLu, lu));
  if (!p.startsWith(distMuLu)) {
    res.statusCode = 403;
    return res.end('forbidden');
  }
  if (existsSync(p) && statSync(p).isFile()) {
    res.setHeader('Content-Type', MIME[extname(p).toLowerCase()] || 'application/octet-stream');
    return res.end(readFileSync(p));
  }
  // 单页应用回退
  const shou = join(distMuLu, 'index.html');
  if (existsSync(shou)) {
    res.setHeader('Content-Type', MIME['.html']);
    return res.end(readFileSync(shou));
  }
  res.statusCode = 404;
  return res.end('not found');
}

// 本机内网 IPv4（真机预览时小程序得用这些地址，127.0.0.1 指的是手机自己）
function lanDiZhi() {
  const lie = [];
  for (const [jieKou, list] of Object.entries(networkInterfaces())) {
    for (const a of list || []) {
      if (a && a.family === 'IPv4' && !a.internal) lie.push({ jieKou, diZhi: a.address });
    }
  }
  return lie;
}

const fu = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const lu = u.pathname;
  // 挂载点前缀剥掉再交给各中间件：与 Vite（connect）的 use('/x', handler) 行为保持一致
  const bo = qian => {
    req.url = req.url.slice(qian.length) || '/';
  };
  try {
    if (lu === '/jianKang' || lu === '/health') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      // 顺带把「本机内网地址候选」报给客户端：开发者工具用 127.0.0.1 就能通，
      // 真机预览必须换成电脑内网 IP 或 HTTPS 域名——有了这份候选，小程序端就能自动切换/提示
      return res.end(
        JSON.stringify({
          ok: true,
          fuWu: 'shenghuoquan-tijian',
          shiJian: new Date().toISOString(),
          duanKou: PORT,
          lan: lanDiZhi().map(x => `http://${x.diZhi}:${PORT}`)
        })
      );
    }
    // 语音识别必须排在 /api 之前：/api 前缀会被「用户与配置」服务整段吃掉
    if (lu === '/api/yuyin' || lu.startsWith('/api/yuyin/')) {
      return yuYin(req, res);
    }
    if (lu === '/api' || lu.startsWith('/api/')) {
      bo('/api');
      return yongHuFuWu.chuLi(req, res);
    }
    if (lu === '/bmapapi' || lu.startsWith('/bmapapi/')) {
      bo('/bmapapi');
      return bmapDaiLi(req, res);
    }
    if (lu === '/airelay' || lu.startsWith('/airelay/')) {
      bo('/airelay');
      return aiZhongJi(req, res);
    }
    if (lu === '/shuiyu' || lu.startsWith('/shuiyu/')) {
      bo('/shuiyu');
      return shuiYuZhongJian(req, res);
    }
    if (lu === '/zhoubian' || lu.startsWith('/zhoubian/')) {
      bo('/zhoubian');
      return zhouBianZhongJian(req, res);
    }
    if (existsSync(distMuLu)) return jingTai(req, res);
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, xinxi: '接口不存在：' + lu }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok: false, xinxi: '服务异常：' + e.message }));
  }
});

fu.listen(PORT, '0.0.0.0', async () => {
  const akGe = [env.BAIDU_SERVER_AK, env.BAIDU_SERVER_AK2].filter(Boolean).length;
  console.log(`服务端已启动：http://127.0.0.1:${PORT}`);
  console.log(`  百度服务端 AK：${akGe ? akGe + ' 把（含轮换）' : '未配置（/bmapapi 会返回 status -1）'}`);
  console.log(`  静态产物 dist/：${existsSync(distMuLu) ? '已托管' : '未构建（仅提供接口）'}`);
  const lan = lanDiZhi();
  console.log(
    lan.length
      ? `  开发者工具填 http://127.0.0.1:${PORT}；真机预览要填内网地址：${lan.map(x => `http://${x.diZhi}:${PORT}`).join(' 或 ')}`
      : `  小程序端请把 peizhi.js 里的 fuWuDiZhi 指向本机内网 IP 或 HTTPS 穿透域名`
  );
  console.log(
    '  接口：/api 用户与配置 ｜ /bmapapi 百度 Web 服务 ｜ /airelay AI 中转 ｜ /shuiyu 水域数据 ｜ /zhoubian 周边地名 ｜ /jianKang 健康检查'
  );
  try {
    await yongHuFuWu.chuShiHua();
    console.log('  MySQL 已就绪（shenghuoquan 库）');
  } catch (e) {
    console.log('  MySQL 未就绪（/api 会如实报错，其余接口不受影响）：' + e.message);
  }
});
