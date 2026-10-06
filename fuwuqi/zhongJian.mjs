// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 服务端中间件工厂（Web 开发期与小程序/生产共用同一份实现）：
//   ① chuangJianBmapDaiLi —— /bmapapi：转发百度 Web 服务 API，服务端注入 AK 并做多 AK 轮换
//   ② chuangJianAiZhongJi —— /airelay：AI 接口中转，服务端代持密钥（解决 CORS 与密钥下发问题）
//   ③ chuangJianShuiYuZhongJian —— /shuiyu：水域数据（预置文件 → 本地缓存 → Overpass）
// 挂载方：vite.config.js（Web 开发期）+ fuwuqi/fuwu-qi.mjs（三端小程序与生产）。
// 两处共用本模块，避免「改了一处、另一处行为悄悄不一致」。
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// 接口地址规整：有人填完整 Chat Completions URL，有人只填到 /v1，也有把 /responses 端点填进来的
export function baiJieKou(u0) {
  const u = String(u0 || '')
    .trim()
    .replace(/\/+$/, '');
  if (/\/responses\/chat\/completions$/i.test(u))
    return u.replace(/\/responses\/chat\/completions$/i, '/chat/completions');
  if (/\/chat\/completions$/i.test(u)) return u;
  if (/\/responses$/i.test(u)) return u.replace(/\/responses$/i, '/chat/completions');
  if (/\/completions$/i.test(u)) return u.replace(/\/completions$/i, '/chat/completions');
  if (/\/v\d+$/i.test(u)) return u + '/chat/completions';
  return u + '/chat/completions';
}

// 跨域头：静态部署的页面（GitHub Pages / 小程序开发者工具）直连本机服务时需要
function kuaYu(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

function yuJianKuaYu(req, res) {
  kuaYu(res);
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function xieJson(res, status, wenBen) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(wenBen);
}

// 读请求体（POST 用；带 1MB 上限，别让畸形请求把内存吃光）
function duTi(req, shangXian = 1024 * 1024) {
  return new Promise((jie, ju) => {
    let s = '';
    req.on('data', c => {
      s += c;
      if (s.length > shangXian) ju(new Error('请求体过大'));
    });
    req.on('end', () => jie(s));
    req.on('error', ju);
  });
}

/* ───────────────────────── ① /bmapapi ───────────────────────── */

export function chuangJianBmapDaiLi({ akLie = [] } = {}) {
  const youXiao = (akLie || []).filter(Boolean);
  return async function bmapDaiLi(req, res) {
    if (yuJianKuaYu(req, res)) return;
    const u = new URL(req.url, 'http://localhost');
    let zuiHou = youXiao.length ? '无请求' : '未配置服务端 AK';
    let zuiHouWen = '';
    for (const ak of youXiao) {
      u.searchParams.set('ak', ak);
      const muBiao = `https://api.map.baidu.com${u.pathname}?${u.searchParams}`;
      try {
        const r = await fetch(muBiao, { headers: { Accept: 'application/json' } });
        const txt = await r.text();
        let j = null;
        try {
          j = JSON.parse(txt);
        } catch {
          /* 非 JSON（异常页）也当作失败换下一把 */
        }
        if (j && j.status === 0) return xieJson(res, 200, txt);
        // 这把 AK 不可用（配额超限 302 / 服务未开通 240 / 其他）→ 记下原因，换下一把
        zuiHou = (j && j.message) || `HTTP ${r.status}`;
        zuiHouWen = txt;
      } catch (e) {
        zuiHou = (e && e.message) || '网络异常';
        zuiHouWen = JSON.stringify({ status: -1, message: zuiHou });
      }
    }
    // 所有 AK 都失败：把最后一把的原始错误透传（前端按 status!==0 自行降级并展示原因）
    xieJson(res, 200, zuiHouWen || JSON.stringify({ status: -1, message: '百度服务不可用：' + zuiHou }));
  };
}

/* ───────────────────────── ② /airelay ───────────────────────── */

export function chuangJianAiZhongJi({ quAiPeiZhi } = {}) {
  // 三级回退出站请求：Node fetch → Windows 自带 curl.exe（Schannel TLS 指纹，可过部分 Cloudflare 规则）
  async function curlQingQiu(url, tou, body, fangFa) {
    const canshu = [
      '-sS',
      '--max-time',
      '90',
      '--compressed',
      '-X',
      fangFa === 'GET' ? 'GET' : 'POST',
      '-H',
      'Content-Type: application/json',
      '-H',
      'Accept: application/json',
      '-H',
      'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    ];
    for (const [k, v] of Object.entries(tou || {})) canshu.push('-H', `${k}: ${v}`);
    if (fangFa !== 'GET') canshu.push('--data', JSON.stringify(body || {}));
    canshu.push(url);
    const { stdout } = await execFileAsync('curl', canshu, {
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
      timeout: 95000
    });
    return stdout;
  }

  return async function aiZhongJi(req, res) {
    if (yuJianKuaYu(req, res)) return;
    try {
      const s = await duTi(req, 8 * 1024 * 1024);
      let { url, tou, body, fangFa } = JSON.parse(s || '{}');
      // 服务端代持密钥：请求没自带 Authorization 时，拿数据库里管理员保存的那份配置补上。
      // 这样任何端（哪怕没登录、没配过接口）都能用大模型，而密钥全程不出服务端
      if (!tou || !(tou.Authorization || tou.authorization)) {
        const ai = (await quAiPeiZhi?.()) || {};
        if (!ai.apiDiZhi || !ai.miYao) {
          // 报清楚缺哪一项，别只说「还没保存」——管理员才知道该去补哪一格
          const que = !ai.apiDiZhi ? '接口地址' : 'API 密钥';
          throw new Error(
            `服务器上还没有可用的 AI 配置（缺 ${que}）：请打开管理员面板 → AI 设置，把「接口地址 + API 密钥 + 模型名称」填好并点「保存配置」`
          );
        }
        url = baiJieKou(ai.apiDiZhi);
        tou = { Authorization: 'Bearer ' + ai.miYao };
        body = { ...(body || {}), model: ai.moXing || (body && body.model) || '' };
      }
      if (!/^https:\/\//.test(String(url || ''))) throw new Error('仅支持 HTTPS 接口地址');
      // fangFa 缺省为 POST（对话补全）；GET 用于拉取 /models 模型列表
      const shiGET = fangFa === 'GET';
      const wangYe = t => String(t || '').trimStart().startsWith('<');
      let txt = '';
      let status = 0;
      // 第一级：Node fetch（补浏览器 UA）
      try {
        const r = await fetch(url, {
          method: shiGET ? 'GET' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            Accept: 'application/json',
            ...(tou || {})
          },
          ...(shiGET ? {} : { body: JSON.stringify(body || {}) })
        });
        txt = await r.text();
        status = r.status;
      } catch (e) {
        txt = JSON.stringify({ ok: false, xinxi: '出站请求失败：' + e.message });
        status = 502;
      }
      // 第二级：返回的是网页（Cloudflare 拦截页等）→ 换 curl.exe 的 Schannel TLS 指纹再试
      if (wangYe(txt)) {
        try {
          const txt2 = await curlQingQiu(url, tou, body, fangFa);
          if (!wangYe(txt2)) {
            txt = txt2;
            status = 200;
          }
        } catch {
          /* curl 也失败：保留第一级结果 */
        }
      }
      xieJson(res, status, txt);
    } catch (e) {
      xieJson(res, 502, JSON.stringify({ ok: false, xinxi: 'AI 中转失败：' + e.message }));
    }
  };
}

/* ───────────────────────── ③ /shuiyu ───────────────────────── */

// 取整到 0.01 度网格的键（约 1.1 公里一格，与预置文件命名一致）
function wangGe(lng, lat) {
  return [Number(lng).toFixed(2), Number(lat).toFixed(2)];
}

// 3×3 邻格查找：取整可能正好差一格（砂子塘中心 112.9388 取两位是 112.94，预置文件却是 112.95），
// 查询半径 2.6 公里足够覆盖跨一格的中心点，所以按「先本格、再正四方、最后对角」的顺序兜一圈
function linJinJian(qian, lng, lat) {
  const [a, b] = wangGe(lng, lat);
  const jia = [
    [0, 0],
    [0.01, 0],
    [-0.01, 0],
    [0, 0.01],
    [0, -0.01],
    [0.01, 0.01],
    [-0.01, 0.01],
    [0.01, -0.01],
    [-0.01, -0.01]
  ];
  return jia.map(([x, y]) => `${qian}${(Number(a) + x).toFixed(2)}_${(Number(b) + y).toFixed(2)}.json`);
}

/**
 * 水域数据接口：GET /shuiyu?lng=&lat=[&banJingMi=2600][&qiangZhi=1]
 * 返回 { duoBianXing: [[{lng,lat}...]], geShu, laiYuan: 'yuzhi'|'huancun'|'overpass', cuo? }
 * 为什么要放服务端：① 小程序只连一个域名，Overpass 不必进白名单；② 查询结果按网格落盘，
 * 同一片区域第二次体检直接读文件；③ 预置样例文件（public/osm/shuiyu_*.json）优先命中，演示不怕断网
 */
export function chuangJianShuiYuZhongJian({ yuZhiMuLu, huanCunMuLu, huoShuiYu, youXiaoQiMs = 30 * 24 * 3600 * 1000 } = {}) {
  return async function shuiYu(req, res) {
    if (yuJianKuaYu(req, res)) return;
    try {
      const u = new URL(req.url, 'http://localhost');
      const lng = Number(u.searchParams.get('lng'));
      const lat = Number(u.searchParams.get('lat'));
      const banJingMi = Number(u.searchParams.get('banJingMi')) || 2600;
      const qiangZhi = u.searchParams.get('qiangZhi') === '1';
      if (!Number.isFinite(lng) || !Number.isFinite(lat))
        return xieJson(res, 400, JSON.stringify({ cuo: true, xinxi: '缺少 lng / lat' }));

      // ① 预置样例：public/osm/shuiyu_<lng>_<lat>.json（演示现场零网络依赖）
      for (const ming of linJinJian('shuiyu_', lng, lat)) {
        const p = join(yuZhiMuLu, ming);
        if (!existsSync(p)) continue;
        const j = JSON.parse(readFileSync(p, 'utf-8'));
        if (Array.isArray(j.duoBianXing) && j.duoBianXing.length) {
          return xieJson(
            res,
            200,
            JSON.stringify({ duoBianXing: j.duoBianXing, geShu: j.duoBianXing.length, laiYuan: 'yuzhi' })
          );
        }
      }

      // ② 本地缓存（按网格键落盘，30 天有效）
      const [a, b] = wangGe(lng, lat);
      const cun = join(huanCunMuLu, `shuiyu_${a}_${b}.json`);
      if (!qiangZhi && existsSync(cun)) {
        try {
          if (Date.now() - statSync(cun).mtimeMs < youXiaoQiMs) {
            const j = JSON.parse(readFileSync(cun, 'utf-8'));
            return xieJson(
              res,
              200,
              JSON.stringify({ duoBianXing: j.duoBianXing || [], geShu: (j.duoBianXing || []).length, laiYuan: 'huancun' })
            );
          }
        } catch {
          /* 缓存文件坏了就当没有，走联网重取 */
        }
      }

      // ③ 联网取（Overpass 多节点容灾；失败不报错，让这一轮体检「不做水面避让」照常完成）
      if (typeof huoShuiYu !== 'function')
        return xieJson(res, 200, JSON.stringify({ duoBianXing: [], geShu: 0, laiYuan: 'kong', cuo: true }));
      const r = await huoShuiYu({ lng, lat }, banJingMi);
      if (r && r.cuo) return xieJson(res, 200, JSON.stringify({ duoBianXing: [], geShu: 0, laiYuan: 'kong', cuo: true }));
      const duoBianXing = (r && r.duoBianXing) || [];
      try {
        mkdirSync(huanCunMuLu, { recursive: true });
        writeFileSync(cun, JSON.stringify({ lng, lat, banJingMi, duoBianXing }));
      } catch {
        /* 落盘失败不影响本次返回 */
      }
      xieJson(res, 200, JSON.stringify({ duoBianXing, geShu: duoBianXing.length, laiYuan: 'overpass' }));
    } catch (e) {
      xieJson(res, 200, JSON.stringify({ duoBianXing: [], geShu: 0, laiYuan: 'kong', cuo: true, xinxi: e.message }));
    }
  };
}
