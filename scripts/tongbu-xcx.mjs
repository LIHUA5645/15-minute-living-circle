// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 小程序端同步脚本：一处真源 → 三端工程
//   ① src/core（纯算法子集）→ xcx/core（源码树暂存，供编辑器解析）与 xcx/<端>/lib/core
//   ② xcx/common（平台层 + 适配器 + 页面逻辑）→ xcx/<端>/lib/common
//   ③ 微信视图（xcx/miniprogram/**）→ 支付宝 .axml/.acss、抖音 .ttml/.ttss（指令与事件名机械转换）
//
// 注意：app.js / app.json 不做转换——微信端有云开发初始化、支付宝端标题键名不同，
// 这三份应用壳各端手写（分别在 xcx/miniprogram、xcx/zhifubao、xcx/douyin 下）。
//
// 用法：
//   node scripts/tongbu-xcx.mjs            同步（覆盖各端 lib 与生成视图）
//   node scripts/tongbu-xcx.mjs --jiancha  只检查是否与真源一致（CI/提交前用，不一致就非零退出）
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GEN = resolve(fileURLToPath(new URL('..', import.meta.url)));
const JIAN_CHA = process.argv.includes('--jiancha');

// 引擎里这些模块直接依赖浏览器（fetch/sessionStorage/window），小程序端不用也不该带：
// 账号、AI 诊断、服务地址改由 xcx/common 下的模块承担（走 plat + 自有服务端）
const PAI_CHU = ['yonghu.js', 'fuwuDiZhi.js', 'zhenduan.js', 'aiLiaoTian.js', 'aiDaohang.js'];

// 二进制资源后缀：共享层里的图片只按字节复制到各端 images/（见 tongBuTuPian），
// 绝不能被 tongBuMu 当文本复制——那样 PNG 会被解坏，且体积翻倍占主包额度
const BU_BIN = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.ttf', '.woff', '.woff2'];

// 三端：微信端是「视图真源」（miniprogram 目录由用户工程指定为 miniprogramRoot），另两端视图由它生成
const DUAN = [
  { jian: 'weixin', ke: 'miniprogram', shiTu: 'wxml', yangShi: 'wxss', shengCheng: false },
  { jian: 'zhifubao', ke: 'zhifubao', shiTu: 'axml', yangShi: 'acss', shengCheng: true },
  { jian: 'douyin', ke: 'douyin', shiTu: 'ttml', yangShi: 'ttss', shengCheng: true }
];

const WEI_XIN_MU = join(GEN, 'xcx', 'miniprogram');
const bian = [];
let xieShu = 0;

const touMing = lu => (/\.(js|mjs)$/.test(lu) ? '// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步\n' : '');

// 内容一致就不动：既少写盘，也让 --jiancha 有据可依
function xie(lu, neiRong) {
  const jiu = existsSync(lu) ? readFileSync(lu, 'utf-8') : null;
  if (jiu === neiRong) return;
  bian.push(relative(GEN, lu));
  if (JIAN_CHA) return;
  mkdirSync(dirname(lu), { recursive: true });
  writeFileSync(lu, neiRong);
  xieShu++;
}

// 递归同步目录：跳过 PAI_CHU，给 .js 加「自动生成」头
function tongBuMu(cong, dao) {
  mkdirSync(dao, { recursive: true });
  for (const ming of readdirSync(cong)) {
    const yuan = join(cong, ming);
    const mu = join(dao, ming);
    if (statSync(yuan).isDirectory()) {
      tongBuMu(yuan, mu);
      continue;
    }
    if (PAI_CHU.includes(ming)) continue;
    // 图片等二进制不能走文本复制（会被 UTF-8 解码写坏，体积还会翻倍）：
    // 它们由 tongBuTuPian 按字节复制到各端工程根的 images/，视图里也用 /images/xxx.png 引用
    const hou = ming.slice(ming.lastIndexOf('.')).toLowerCase();
    if (BU_BIN.includes(hou)) continue;
    xie(mu, touMing(ming) + readFileSync(yuan, 'utf-8'));
  }
}

// 微信视图 → 支付宝 / 抖音视图：只做「指令前缀 + 事件名」这类机械转换
function zhuanShiTu(wxml, duan) {
  if (duan === 'douyin') return wxml.replace(/\bwx:/g, 'tt:');
  if (duan === 'zhifubao') {
    return wxml
      .replace(/\bwx:/g, 'a:')
      .replace(/\bbindtap\b/g, 'onTap')
      .replace(/\bcatchtap\b/g, 'catchTap')
      .replace(/\bbindinput\b/g, 'onInput')
      .replace(/\bbindmarkertap\b/g, 'onMarkerTap')
      .replace(/\bbindregionchange\b/g, 'onRegionChange')
      .replace(/\bbindcallouttap\b/g, 'onCalloutTap');
  }
  return wxml;
}

// 页面配置：支付宝的标题键叫 defaultTitle
function zhuanPeiZhi(jsonWen, duan) {
  if (duan !== 'zhifubao') return jsonWen;
  const j = JSON.parse(jsonWen);
  return JSON.stringify({ defaultTitle: j.navigationBarTitleText || '15 分钟生活圈体检' }, null, 2) + '\n';
}

function shengChengShiTu(duan) {
  const daoMu = join(GEN, 'xcx', duan.ke);
  const zou = ziMu => {
    const cong = join(WEI_XIN_MU, ziMu);
    if (!existsSync(cong)) return;
    for (const ming of readdirSync(cong)) {
      const yuan = join(cong, ming);
      if (statSync(yuan).isDirectory()) {
        zou(join(ziMu, ming));
        continue;
      }
      const hou = ming.slice(ming.lastIndexOf('.'));
      if (hou === '.wxml')
        xie(join(daoMu, ziMu, ming.replace(/\.wxml$/, '.' + duan.shiTu)), zhuanShiTu(readFileSync(yuan, 'utf-8'), duan.jian));
      else if (hou === '.wxss')
        xie(join(daoMu, ziMu, ming.replace(/\.wxss$/, '.' + duan.yangShi)), readFileSync(yuan, 'utf-8'));
      else if (hou === '.json') xie(join(daoMu, ziMu, ming), zhuanPeiZhi(readFileSync(yuan, 'utf-8'), duan.jian));
      else if (hou === '.js') xie(join(daoMu, ziMu, ming), touMing(ming) + readFileSync(yuan, 'utf-8'));
    }
  };
  // 只同步本项目的页面目录：miniprogram/pages 下还有 quickstart 示例页，
  // 那是微信端专有的演示，没必要搬到另外两端
  for (const ye of ['ditu', 'tijian', 'baogao', 'wo', 'denglu', 'ai']) zou(join('pages', ye));
  // 全局样式：微信端 app.wxss 是多端共用的样式真源（app.js / app.json 不生成，各端手写）
  const yangShi = join(WEI_XIN_MU, 'app.wxss');
  if (existsSync(yangShi)) xie(join(daoMu, 'app.' + duan.yangShi), readFileSync(yangShi, 'utf-8'));
}

// 图片等二进制资源：必须按字节复制（走文本写入会把 PNG 写坏）
function tongBuTuPian(cong, dao) {
  if (!existsSync(cong)) return;
  mkdirSync(dao, { recursive: true });
  for (const ming of readdirSync(cong)) {
    const yuan = join(cong, ming);
    const mu = join(dao, ming);
    if (statSync(yuan).isDirectory()) {
      tongBuTuPian(yuan, mu);
      continue;
    }
    const xin = readFileSync(yuan);
    const jiu = existsSync(mu) ? readFileSync(mu) : null;
    if (jiu && Buffer.compare(jiu, xin) === 0) continue;
    bian.push(relative(GEN, mu));
    if (JIAN_CHA) continue;
    copyFileSync(yuan, mu);
    xieShu++;
  }
}

/* ── 主流程 ── */
const heXin = join(GEN, 'src', 'core');
const gongXiang = join(GEN, 'xcx', 'common');

// ① 源码树暂存：让 xcx/common 里 `../core/xxx.js` 这类引用在编辑器里也能解析
tongBuMu(heXin, join(GEN, 'xcx', 'core'));

// ② 各端 lib（引擎 + 共享层）。只覆盖写入、不删目录：真源里删掉的文件需要手动清一下
//（好处是脚本永远不会误删小程序工程里的东西，代价极小）
for (const duan of DUAN) {
  const lib = join(GEN, 'xcx', duan.ke, 'lib');
  tongBuMu(heXin, join(lib, 'core'));
  tongBuMu(gongXiang, join(lib, 'common'));
  // 共享图片资源（如登录页 logo）→ 各端工程根的 images/，视图里用绝对路径 /images/xxx.png 引用
  tongBuTuPian(join(gongXiang, 'images'), join(GEN, 'xcx', duan.ke, 'images'));
}

// ③ 支付宝 / 抖音视图与全局样式
for (const duan of DUAN) if (duan.shengCheng) shengChengShiTu(duan);

// ④ 安全检查：生成的 lib/core 里不该出现对「已排除模块」的引用
const wenTi = [];
(function sao(lu) {
  if (!existsSync(lu)) return;
  if (statSync(lu).isDirectory()) {
    for (const m of readdirSync(lu)) sao(join(lu, m));
    return;
  }
  if (!/\.js$/.test(lu)) return;
  const wen = readFileSync(lu, 'utf-8');
  for (const m of PAI_CHU) {
    if (new RegExp(`from '[^']*${m.replace('.js', '')}\\.js'`).test(wen)) wenTi.push(relative(GEN, lu) + ' → 引用了 ' + m);
  }
})(join(WEI_XIN_MU, 'lib', 'core'));

console.log(
  JIAN_CHA
    ? bian.length
      ? '不同步：' + bian.length + ' 个文件与真源不一致\n  ' + bian.slice(0, 20).join('\n  ')
      : '已同步：三端 lib 与生成视图都与真源一致'
    : `已同步：写入/更新 ${xieShu} 个文件（三端 lib + 生成视图与全局样式）`
);
if (wenTi.length) console.log('注意：生成代码里有对已排除模块的引用，需要人工确认：\n  ' + wenTi.join('\n  '));
if (JIAN_CHA && bian.length) process.exit(1);
