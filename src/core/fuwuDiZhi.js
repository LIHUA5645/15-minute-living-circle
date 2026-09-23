// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，23
// 服务端地址解析：默认同域（本地 vite dev / 静态部署走相对路径）；
// 管理员可指定外部 Node 服务地址（如把本机服务经内网穿透暴露成 https 域名），
// 使静态部署的页面也能调用本机后端（登录 / 管理员 / AI 中转）。
// 地址来源优先级：URL 参数 ?fuwu=https://xxx → localStorage（管理员设置）。

const KEY = 'sq_fuwu_dizhi';

// 把 URL 参数里的服务端地址落地保存（一次性），之后都从本地存储读
function xiRu() {
  try {
    const u = new URL(window.location.href);
    const q = u.searchParams.get('fuwu');
    if (q) {
      const z = String(q).trim().replace(/\/+$/, '');
      localStorage.setItem(KEY, z);
      return z;
    }
  } catch {
    /* 忽略 */
  }
  try {
    return String(localStorage.getItem(KEY) || '').replace(/\/+$/, '');
  } catch {
    return '';
  }
}

// 拼出完整请求地址：未配置外部服务时原样返回相对路径（同域）
export function fuWuUrl(lu) {
  const base = xiRu();
  return base ? base + lu : lu;
}

// 当前服务端地址（空串表示同域）
export function fuWuDiZhi() {
  return xiRu();
}

// 管理员设置：留空表示恢复同域
export function sheZhiFuWuDiZhi(d) {
  try {
    localStorage.setItem(
      KEY,
      String(d || '')
        .trim()
        .replace(/\/+$/, '')
    );
  } catch {
    /* 忽略 */
  }
}
