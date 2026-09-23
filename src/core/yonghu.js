// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，22
// 用户与管理员鉴权前端客户端：注册/登录走后端 /api 接口（MySQL 存储 + 服务端 scrypt 哈希 + 真实 IP 限流）。
// 限流规则在后端执行：错 3 次锁 10 分钟、5 次锁 20 分钟、12 小时内累计 12 次封 12 小时（封顶）。
// 会话保存在 sessionStorage（关页即失效）。

const SESSION_KEY = 'sq_session_user';
const ADMIN_TOKEN_KEY = 'sq_admin_token';
// 管理员令牌存 localStorage（跨标签页共享，控制台可独立开新页）；用户会话仍在 sessionStorage（关页即失效）。
// 令牌有效期由服务端控制（2 小时），本地只作缓存，不引入额外安全风险。

async function tiJiao(lu, body, token) {
  const r = await fetch('/api' + lu, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    body: JSON.stringify(body || {})
  });
  if (r.status === 401) return { ok: false, xinxi: '请先以管理员身份登录' };
  return r.json();
}

// —— 用户注册 ——
export function zhuCe(zhangHao, miMa) {
  return tiJiao('/zhuCe', { zhangHao, miMa });
}

// —— 用户登录（锁定/失败计数由服务端返回） ——
export async function dengLuYongHu(zhangHao, miMa) {
  const j = await tiJiao('/dengLu', { zhangHao, miMa });
  if (j.ok) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(j.yongHu));
    return { ok: true, yongHu: j.yongHu };
  }
  return {
    ok: false,
    xinxi: j.xinxi,
    suoDing: j.suoDing,
    shengYuMiao: j.shengYuMiao,
    leiJi: j.leiJi
  };
}

export function dangQianYongHu() {
  try {
    const v = sessionStorage.getItem(SESSION_KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

export function yongHuTuiChu() {
  sessionStorage.removeItem(SESSION_KEY);
}

// —— 用户自助修改密码（个人主页内，需验证原密码） ——
export function yongHuGaiMiMa(zhangHao, jiuMiMa, xinMiMa) {
  return tiJiao('/yonghu/gaiMiMa', { zhangHao, jiuMiMa, xinMiMa });
}

// —— 管理员（独立令牌体系，与用户隔离） ——
export function guanLiYuanLingPai() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}
function cunLingPai(t) {
  localStorage.setItem(ADMIN_TOKEN_KEY, t);
}

export async function dengLuGuanLiYuan(zhangHao, miMa) {
  const j = await tiJiao('/guanliyuan/dengLu', { zhangHao, miMa });
  if (j.ok) cunLingPai(j.token);
  return j;
}

export function yongHuLieBiao() {
  return fetch('/api/guanliyuan/yongHuLieBiao', {
    headers: { Authorization: 'Bearer ' + guanLiYuanLingPai() }
  }).then(r => r.json());
}

export function shanChuYongHu(id) {
  return tiJiao('/guanliyuan/shanChu', { id }, guanLiYuanLingPai());
}

export function zhongZhiMiMa(id) {
  return tiJiao('/guanliyuan/zhongZhiMiMa', { id }, guanLiYuanLingPai());
}

export function guanLiYuanGaiMiMa(miMa) {
  return tiJiao('/guanliyuan/gaiMiMa', { miMa }, guanLiYuanLingPai());
}
