// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { chuangJianYongHuFuWu } from './fuwuqi/yonghu-fuwu.mjs';

// base 设为相对路径，便于 Electron 直接加载 dist/index.html 与静态部署
export default defineConfig(({ mode }) => {
  // 读取 .env 全量变量（含不带 VITE_ 前缀的服务端 AK 与数据库口令），密钥只在服务端注入，不进前端产物
  const env = loadEnv(mode, process.cwd(), '');
  const yongHuFuWu = chuangJianYongHuFuWu({
    host: env.DB_HOST || '127.0.0.1',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASS || '',
  });
  return {
    base: './',
    plugins: [
      react(),
      // /bmapapi 中间件：转发百度 Web 服务 API 并在服务端注入服务端 AK
      {
        name: 'baidu-web-api-proxy',
        configureServer(server) {
          server.middlewares.use('/bmapapi', (req, res, next) => {
            const ak = env.BAIDU_SERVER_AK || '';
            const u = new URL(req.url, 'http://localhost');
            if (ak) u.searchParams.set('ak', ak);
            req.url = `${u.pathname}?${u.searchParams.toString()}`;
            next();
          });
        },
      },
      // /api 用户鉴权与管理接口（MySQL）：注册/登录/管理员用户管理
      {
        name: 'yonghu-api',
        configureServer(server) {
          yongHuFuWu.chuShiHua().catch((e) => console.error('[yonghu-api] MySQL 初始化失败：', e.message));
          server.middlewares.use('/api', (req, res) => yongHuFuWu.chuLi(req, res));
        },
      },
      // /airelay AI 接口中转：解决浏览器直连大模型 API 的 CORS 限制
      // 请求体 {url, tou, body} 均由前端传入（接口地址/密钥由管理员在面板配置）
      {
        name: 'ai-relay',
        configureServer(server) {
          server.middlewares.use('/airelay', (req, res) => {
            let s = '';
            req.on('data', (c) => (s += c));
            req.on('end', async () => {
              try {
                const { url, tou, body, fangFa } = JSON.parse(s || '{}');
                if (!/^https:\/\//.test(String(url || ''))) throw new Error('仅支持 HTTPS 接口地址');
                // fangFa 缺省为 POST（对话补全）；GET 用于拉取 /models 模型列表
                const shiGET = fangFa === 'GET';
                const r = await fetch(url, {
                  method: shiGET ? 'GET' : 'POST',
                  headers: { 'Content-Type': 'application/json', ...(tou || {}) },
                  ...(shiGET ? {} : { body: JSON.stringify(body || {}) }),
                });
                const txt = await r.text();
                res.statusCode = r.status;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(txt);
              } catch (e) {
                res.statusCode = 502;
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.end(JSON.stringify({ ok: false, xinxi: 'AI 中转失败：' + e.message }));
              }
            });
          });
        },
      },
    ],
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/bmapapi': {
          target: 'https://api.map.baidu.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/bmapapi/, ''),
        },
      },
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 1500,
    },
    resolve: {
      alias: { '@': resolve(__dirname, 'src') },
    },
    // Electron 主进程不进构建
    optimizeDeps: { exclude: ['electron'] },
  };
});
