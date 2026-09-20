// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// base 设为相对路径，便于 Electron 直接加载 dist/index.html 与静态部署
export default defineConfig(({ mode }) => {
  // 读取 .env 全量变量（含不带 VITE_ 前缀的服务端 AK），AK 只在 dev 服务端注入，不进前端产物
  const env = loadEnv(mode, process.cwd(), '');
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
