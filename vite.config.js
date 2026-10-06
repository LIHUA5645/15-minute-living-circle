// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { chuangJianYongHuFuWu } from './fuwuqi/yonghu-fuwu.mjs';
// 三个中间件的实现放在 fuwuqi/zhongJian.mjs：Vite 开发服务器（本文件）与独立服务端
// fuwuqi/fuwu-qi.mjs 共用同一份，避免「Web 改了、小程序端那套没跟上」的漂移
import { chuangJianBmapDaiLi, chuangJianAiZhongJi } from './fuwuqi/zhongJian.mjs';

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
      // /bmapapi 中间件：转发百度 Web 服务 API 并在服务端注入服务端 AK。
      // 多 AK 轮换：某把 AK 当日配额超限（百度 status 302「天配额超限」）时自动换下一把重试，
      // 全部用尽才把原因透传给前端；BAIDU_SERVER_AK2 留空则退化为单 AK
      {
        name: 'baidu-web-api-proxy',
        configureServer(server) {
          const daiLi = chuangJianBmapDaiLi({
            akLie: [env.BAIDU_SERVER_AK, env.BAIDU_SERVER_AK2].filter(Boolean)
          });
          server.middlewares.use('/bmapapi', (req, res) => daiLi(req, res));
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
      // 请求体 {url, tou, body} 均由前端传入（接口地址/密钥由管理员在面板配置，服务端代持）
      {
        name: 'ai-relay',
        configureServer(server) {
          const zhongJi = chuangJianAiZhongJi({ quAiPeiZhi: () => yongHuFuWu.quAiPeiZhi() });
          server.middlewares.use('/airelay', (req, res) => zhongJi(req, res));
        },
      },
    ],
    server: {
      host: true,
      port: 5173,
      // 允许内网穿透域名访问本机 dev 服务（cloudflared / ngrok / cpolar 等），
      // 否则 Vite 的主机白名单校验会对非 localhost 的 Host 返回 403
      allowedHosts: true,
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
