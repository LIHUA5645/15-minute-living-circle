// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，22
// 用户鉴权后端服务（Vite dev 中间件，部署期由 nginx + 等效后端承接）：
//   - MySQL 存储：shenghuoquan.users / admins
//   - 密码 scrypt 加盐哈希（node:crypto），明文不落盘、不出后端
//   - 登录失败限流（真实 IP）：错 3 次锁 10 分钟、5 次锁 20 分钟、12 小时窗口内累计 12 次封 12 小时
//   - 管理员接口需登录令牌（Bearer），管理用户：列表 / 删除 / 重置密码
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';

const GUIZE = {
  suo1Ci: 3, suo1: 10 * 60 * 1000,
  suo2Ci: 5, suo2: 20 * 60 * 1000,
  fengCi: 12, feng: 12 * 60 * 60 * 1000,
};
const LING_PAI_YOU_XIAO = 2 * 60 * 60 * 1000; // 管理员令牌 2 小时

const xianZhi = new Map(); // ip -> {fails, shouCi, suoZhi}
const lingPai = new Map(); // token -> daoQi
let chi = null; // 连接池

function haXi(miMa, yan) {
  return crypto.scryptSync(String(miMa), String(yan), 64).toString('hex');
}
function suiJiYan() {
  return crypto.randomBytes(16).toString('hex');
}

// —— 限流（真实 IP） ——
function xianZhiJianCha(ip) {
  const ji = xianZhi.get(ip);
  if (!ji || !ji.suoZhi) return { yunXu: true };
  const sheng = ji.suoZhi - Date.now();
  if (sheng > 0) return { yunXu: false, shengYuMiao: Math.ceil(sheng / 1000), leiJi: ji.fails };
  return { yunXu: true };
}
function xianZhiJiLu(ip) {
  const now = Date.now();
  let ji = xianZhi.get(ip) || { fails: 0, shouCi: now };
  if (now - ji.shouCi > GUIZE.feng) ji = { fails: 0, shouCi: now };
  ji.fails += 1;
  let suo = 0;
  if (ji.fails >= GUIZE.fengCi) suo = GUIZE.feng;
  else if (ji.fails >= GUIZE.suo2Ci) suo = GUIZE.suo2;
  else if (ji.fails >= GUIZE.suo1Ci) suo = GUIZE.suo1;
  if (suo > 0) ji.suoZhi = now + suo;
  xianZhi.set(ip, ji);
  return { suoDing: suo > 0, shengYuMiao: Math.ceil(suo / 1000), leiJi: ji.fails };
}
function xianZhiQingChu(ip) {
  xianZhi.delete(ip);
}

// 跨域响应头：静态部署页面直连本机服务时用（管理员可在前端设置服务端地址）
function kaiKuaYu(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function hui(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}
function duBody(req) {
  return new Promise((jie) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => {
      try {
        jie(JSON.parse(s || '{}'));
      } catch {
        jie({});
      }
    });
  });
}
function ipOf(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

export function chuangJianYongHuFuWu(cfg) {
  async function chuShiHua() {
    const lian = await mysql.createConnection({ ...cfg, multipleStatements: true });
    await lian.query('CREATE DATABASE IF NOT EXISTS shenghuoquan DEFAULT CHARSET utf8mb4');
    await lian.query('USE shenghuoquan');
    await lian.query(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      zhang_hao VARCHAR(50) NOT NULL UNIQUE,
      mi_ma_hash VARCHAR(200) NOT NULL,
      yan VARCHAR(64) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await lian.query(`CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      zhang_hao VARCHAR(50) NOT NULL UNIQUE,
      mi_ma_hash VARCHAR(200) NOT NULL,
      yan VARCHAR(64) NOT NULL
    )`);
    // 种子管理员 admin/admin（scrypt 哈希），首次初始化时写入
    const [rows] = await lian.query('SELECT id FROM admins LIMIT 1');
    if (!rows.length) {
      const yan = suiJiYan();
      await lian.query('INSERT INTO admins (zhang_hao, mi_ma_hash, yan) VALUES (?, ?, ?)', [
        'admin',
        haXi('admin', yan),
        yan,
      ]);
    }
    await lian.end();
    chi = mysql.createPool({ ...cfg, database: 'shenghuoquan', connectionLimit: 8 });
  }

  // 管理员令牌校验
  function lingPaiYouXiao(req) {
    const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!t) return false;
    const daoQi = lingPai.get(t);
    if (!daoQi || daoQi < Date.now()) {
      lingPai.delete(t);
      return false;
    }
    return true;
  }

  async function chuLi(req, res) {
    const lu = req.url.split('?')[0];
    const ip = ipOf(req);
    // 跨域支持：允许静态部署的页面（GitHub Pages / Gitee Pages）调用本机服务
    kaiKuaYu(res);
    if (req.method === 'OPTIONS') return hui(res, 204, {});
    try {
      // —— 用户注册 ——
      if (lu === '/zhuCe' && req.method === 'POST') {
        const { zhangHao, miMa } = await duBody(req);
        const hao = String(zhangHao || '').trim();
        if (hao.length < 3) return hui(res, 200, { ok: false, xinxi: '账号至少 3 个字符' });
        if (!/^[A-Za-z0-9_\u4e00-\u9fa5]+$/.test(hao)) return hui(res, 200, { ok: false, xinxi: '账号只能含中英文、数字、下划线' });
        if (String(miMa || '').length < 6) return hui(res, 200, { ok: false, xinxi: '密码至少 6 位' });
        const yan = suiJiYan();
        try {
          await chi.query('INSERT INTO users (zhang_hao, mi_ma_hash, yan, role) VALUES (?, ?, ?, ?)', [
            hao,
            haXi(miMa, yan),
            yan,
            'user',
          ]);
          return hui(res, 200, { ok: true });
        } catch (e) {
          if (String(e.message).includes('UNIQUE')) return hui(res, 200, { ok: false, xinxi: '该账号已被注册' });
          throw e;
        }
      }

      // —— 用户登录 ——
      if (lu === '/dengLu' && req.method === 'POST') {
        const suo = xianZhiJianCha(ip);
        if (!suo.yunXu) return hui(res, 200, { ok: false, suoDing: true, shengYuMiao: suo.shengYuMiao, leiJi: suo.leiJi, xinxi: `失败次数过多已锁定，请 ${suo.shengYuMiao} 秒后再试` });
        const { zhangHao, miMa } = await duBody(req);
        const [rows] = await chi.query('SELECT * FROM users WHERE zhang_hao = ? LIMIT 1', [String(zhangHao || '').trim()]);
        const yh = rows[0];
        if (!yh || haXi(miMa, yh.yan) !== yh.mi_ma_hash) {
          const ji = xianZhiJiLu(ip);
          return hui(res, 200, {
            ok: false,
            xinxi: '账号不存在或密码错误',
            suoDing: ji.suoDing,
            shengYuMiao: ji.shengYuMiao,
            leiJi: ji.leiJi,
          });
        }
        xianZhiQingChu(ip);
        return hui(res, 200, { ok: true, yongHu: { zhangHao: yh.zhang_hao, role: yh.role, zhuCeShiJian: yh.created_at, t: Date.now() } });
      }

      // —— 用户自助修改密码（验旧密码 + 独立限流） ——
      if (lu === '/yonghu/gaiMiMa' && req.method === 'POST') {
        const suo = xianZhiJianCha(ip + '|gm');
        if (!suo.yunXu) return hui(res, 200, { ok: false, xinxi: `操作过于频繁已锁定，请 ${suo.shengYuMiao} 秒后再试` });
        const { zhangHao, jiuMiMa, xinMiMa } = await duBody(req);
        if (String(xinMiMa || '').length < 6) return hui(res, 200, { ok: false, xinxi: '新密码至少 6 位' });
        const [rows] = await chi.query('SELECT * FROM users WHERE zhang_hao = ? LIMIT 1', [String(zhangHao || '').trim()]);
        const yh = rows[0];
        if (!yh || haXi(jiuMiMa, yh.yan) !== yh.mi_ma_hash) {
          const ji = xianZhiJiLu(ip + '|gm');
          return hui(res, 200, { ok: false, xinxi: '原密码错误', suoDing: ji.suoDing, shengYuMiao: ji.shengYuMiao, leiJi: ji.leiJi });
        }
        const yan = suiJiYan();
        await chi.query('UPDATE users SET mi_ma_hash = ?, yan = ? WHERE id = ?', [haXi(xinMiMa, yan), yan, yh.id]);
        xianZhiQingChu(ip + '|gm');
        return hui(res, 200, { ok: true });
      }

      // —— 管理员登录 ——
      if (lu === '/guanliyuan/dengLu' && req.method === 'POST') {
        const suo = xianZhiJianCha(ip + '|admin');
        if (!suo.yunXu) return hui(res, 200, { ok: false, suoDing: true, shengYuMiao: suo.shengYuMiao, leiJi: suo.leiJi, xinxi: `失败次数过多已锁定，请 ${suo.shengYuMiao} 秒后再试` });
        const { zhangHao, miMa } = await duBody(req);
        const [rows] = await chi.query('SELECT * FROM admins WHERE zhang_hao = ? LIMIT 1', [String(zhangHao || 'admin').trim()]);
        const gl = rows[0];
        if (!gl || haXi(miMa, gl.yan) !== gl.mi_ma_hash) {
          const ji = xianZhiJiLu(ip + '|admin');
          return hui(res, 200, { ok: false, xinxi: '账号或密码错误', suoDing: ji.suoDing, shengYuMiao: ji.shengYuMiao, leiJi: ji.leiJi });
        }
        xianZhiQingChu(ip + '|admin');
        const token = crypto.randomBytes(24).toString('hex');
        lingPai.set(token, Date.now() + LING_PAI_YOU_XIAO);
        return hui(res, 200, { ok: true, token });
      }

      // —— 以下均为管理员接口：需要有效令牌 ——
      if (lu.startsWith('/guanliyuan/')) {
        if (!lingPaiYouXiao(req)) return hui(res, 401, { ok: false, xinxi: '请先以管理员身份登录' });

        if (lu === '/guanliyuan/yongHuLieBiao' && req.method === 'GET') {
          const [rows] = await chi.query('SELECT id, zhang_hao, role, created_at FROM users ORDER BY id DESC LIMIT 500');
          return hui(res, 200, { ok: true, list: rows });
        }

        if (lu === '/guanliyuan/shanChu' && req.method === 'POST') {
          const { id } = await duBody(req);
          await chi.query('DELETE FROM users WHERE id = ?', [Number(id) || 0]);
          return hui(res, 200, { ok: true });
        }

        if (lu === '/guanliyuan/zhongZhiMiMa' && req.method === 'POST') {
          const { id } = await duBody(req);
          const xinMiMa = 'sq' + Math.random().toString(36).slice(2, 8); // 随机 8 位临时密码
          const yan = suiJiYan();
          await chi.query('UPDATE users SET mi_ma_hash = ?, yan = ? WHERE id = ?', [haXi(xinMiMa, yan), yan, Number(id) || 0]);
          return hui(res, 200, { ok: true, xinMiMa });
        }

        if (lu === '/guanliyuan/gaiMiMa' && req.method === 'POST') {
          const { miMa } = await duBody(req);
          if (String(miMa || '').length < 6) return hui(res, 200, { ok: false, xinxi: '密码至少 6 位' });
          const yan = suiJiYan();
          await chi.query('UPDATE admins SET mi_ma_hash = ?, yan = ? WHERE zhang_hao = ?', [haXi(miMa, yan), yan, 'admin']);
          return hui(res, 200, { ok: true });
        }
      }

      return hui(res, 404, { ok: false, xinxi: '接口不存在' });
    } catch (e) {
      return hui(res, 500, { ok: false, xinxi: '服务异常：' + e.message });
    }
  }

  return { chuShiHua, chuLi };
}
