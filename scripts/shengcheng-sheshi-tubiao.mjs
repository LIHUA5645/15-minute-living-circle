// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，08
// 生成地图设施图标（六类各一张 PNG）。图标**直接取 Web 端用的同一批 lucide 语义图标**
//   （Cross 十字 / GraduationCap 学士帽 / ShoppingCart 购物车 / Armchair 扶手椅 / Bus 公交车 / Trees 树林，
//    见 src/ui/MapCanvas.jsx 的 TU_BIAO），拼装方式也照抄网页端的 tuZhuanSvg + sheShiBiaoJi
//   （类别色圆底 + 白描边 + 居中的白色图标）—— 两端图标因此完全一致，不是"各画一套"。
//
// 为什么要多这一步"渲染"：小程序 <map> 的 marker 图标只认图片路径（官方文档：项目目录 / 网络 / 代码包路径），
// 不认 data URI / base64 / SVG；而网页端是百度地图，可以把内联 SVG 转 data URI 直接塞给 B.Icon。
// 所以这里把同一份 SVG 写成 HTML，用本机 Edge / Chrome 的无头模式截成 80×80 透明 PNG，输出到 xcx/common/images/。
//
// 用法：node scripts/shengcheng-sheshi-tubiao.mjs
//   之后跑 node scripts/tongbu-xcx.mjs 分发到三端 images/（视图与标记里统一写 /images/sheshi-<类别>.png）
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Armchair, Bike, Bus, Car, Cross, Footprints, GraduationCap, ShoppingCart, Trees } from 'lucide';

const GEN = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHU_CHU = join(GEN, 'xcx', 'common', 'images');
const LIN_SHI = join(GEN, 'scripts', '.sheshi-tubiao-linshi');

const BIAN = 80; // 画布边长（像素）：标记里按 20px 显示，等于 4 倍图，三倍屏也清晰
const YUAN_R = BIAN * 0.45; // 圆底半径（36）：留出白描边的位置
const YUAN_CU = BIAN * 0.08; // 圆底白描边（6.4）
const TU_BIAN = BIAN * 0.55; // lucide 图标边长（44）：约占圆底直径 61%，与网页端 11/18 的比例一致
// 图例版（去圆底）的画布：与徽章里的图标同尺寸（44），这样图例与地图上的图标观感一致
const TU_XIAN = 44;

// 六类：类别色 + 图标（与网页端 TU_BIAO 一一对应），颜色取自网页端 COLOR / 小程序端 FENLEI_SE
const LEI = [
  { k: 'yiliao', se: '#ff6b6b', tu: Cross, ming: '医疗' },
  { k: 'jiaoyu', se: '#ffd166', tu: GraduationCap, ming: '教育' },
  { k: 'gouwu', se: '#3ddc97', tu: ShoppingCart, ming: '购物' },
  { k: 'yanglao', se: '#b18cff', tu: Armchair, ming: '养老' },
  { k: 'jiaotong', se: '#2f9bff', tu: Bus, ming: '交通' },
  { k: 'xiuxian', se: '#e64980', tu: Trees, ming: '休闲' }
];

// 属性名转 kebab-case（stroke-width、stroke-linecap …），与网页端同名函数一致
function kebab(s) {
  return s.replace(/([A-Z])/g, '-$1').toLowerCase();
}

// 与网页端 src/ui/MapCanvas.jsx 的 tuZhuanSvg 同一套拼法：
// lucide 导出的是 [[标签, 属性], ...] 节点数据，不是组件，所以要自己拼成 SVG 字符串
function tuZhuanSvg(Tu, se, bian, cu) {
  const nei = Tu.map(
    ([tag, attrs]) =>
      `<${tag} ${Object.entries(attrs || {})
        .map(([k, v]) => `${kebab(k)}='${v}'`)
        .join(' ')}/>`
  ).join('');
  return `<svg xmlns='http://www.w3.org/2000/svg' width='${bian}' height='${bian}' viewBox='0 0 24 24' fill='none' stroke='${se}' stroke-width='${cu}' stroke-linecap='round' stroke-linejoin='round'>${nei}</svg>`;
}

// 徽章：与网页端 sheShiBiaoJi 同构（类别色圆底 + 白描边 + 居中的白色 lucide 图标）
function biaoJi(se, tu) {
  const ju = (BIAN - TU_BIAN) / 2;
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${BIAN}' height='${BIAN}'>` +
    `<circle cx='${BIAN / 2}' cy='${BIAN / 2}' r='${YUAN_R}' fill='${se}' stroke='#ffffff' stroke-width='${YUAN_CU}'/>` +
    `<g transform='translate(${ju},${ju})'>${tuZhuanSvg(tu, '#ffffff', TU_BIAN, 2.6)}</g>` +
    `</svg>`
  );
}

// 本机浏览器（Edge 优先，其次 Chrome）：用无头模式把 SVG 截成 PNG
function zhaoLiuLanQi() {
  const hou = [
    process.env.CHROME_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ].filter(Boolean);
  const you = hou.find(p => existsSync(p));
  if (!you)
    throw new Error('找不到 Edge / Chrome：把 SVG 渲染成 PNG 要靠它（可用 CHROME_PATH 环境变量指定路径）');
  return you;
}

// 清理临时目录：个别环境（比如 IDE 的 safe-delete 钩子）删目录会抛错，这里吞掉 ——
// 临时文件留在 scripts/.sheshi-tubiao-linshi 里也不影响生成的图片
function qingLinShi() {
  try {
    rmSync(LIN_SHI, { recursive: true, force: true });
  } catch {
    /* 忽略：清不掉就留着 */
  }
}

const liuLanQi = zhaoLiuLanQi();
mkdirSync(SHU_CHU, { recursive: true });
qingLinShi();
mkdirSync(LIN_SHI, { recursive: true });

// 独立的 user-data-dir：不借用你正在用的浏览器配置，免得"浏览器已运行"导致截图失败
const YONG_HU = join(LIN_SHI, 'profile');

// 无头浏览器截图：把 SVG 包成透明底的 HTML，截成边长 bian 的 PNG
function jieTu(svg, png, bian) {
  const html = join(LIN_SHI, basename(png).replace(/\.png$/, '.html'));
  writeFileSync(
    html,
    `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:transparent}</style>${svg}`
  );
  execFileSync(
    liuLanQi,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--default-background-color=00000000',
      `--user-data-dir=${YONG_HU}`,
      `--window-size=${bian},${bian}`,
      `--screenshot=${png}`,
      'file:///' + html.replace(/\\/g, '/')
    ],
    { stdio: 'pipe' }
  );
}

// 出行方式（与网页端 App.jsx 的 CHU_XING 同一批 lucide：Footprints/Bike/Car/Bus）。
// 小程序胶囊里用：CSS 复刻不出 lucide 的曲线（脚印/车身弧线），图标形状要与网页端完全一致
// 就走同一套「SVG → 无头浏览器截图」管线；颜色固定为胶囊默认字色 #475467
const LU_MO = [
  { mo: 'walking', tu: Footprints, ming: '步行' },
  { mo: 'riding', tu: Bike, ming: '骑行' },
  { mo: 'driving', tu: Car, ming: '驾车' },
  { mo: 'transit', tu: Bus, ming: '公交' }
];
const LU_BIAN = 48; // 胶囊里按 28rpx（≈14px 逻辑）显示，48px 即 3 倍图

for (const x of LU_MO) {
  const png = join(SHU_CHU, 'luxing-' + x.mo + '.png');
  jieTu(tuZhuanSvg(x.tu, '#475467', LU_BIAN, 2), png, LU_BIAN);
  console.log('已生成 ' + png + '（' + x.ming + '，' + LU_BIAN + ' x ' + LU_BIAN + ' 透明 PNG · 出行方式胶囊用）');
}

for (const x of LEI) {
  // ① 地图标记：类别色圆底 + 白色图标（与网页端 sheShiBiaoJi 同构）。
  //    地图上的点只有十几像素，必须有圆底才认得出来
  const pngBiao = join(SHU_CHU, 'sheshi-' + x.k + '.png');
  jieTu(biaoJi(x.se, x.tu), pngBiao, BIAN);
  console.log('已生成 ' + pngBiao + '（' + x.ming + '，' + BIAN + ' x ' + BIAN + ' 透明 PNG · 地图标记用，带圆底徽章）');

  // ② 图例：同样的 lucide 图标，但**去掉圆底**、改成类别色线条、透明背景 ——
  //    「设施」面板是白底，图标直接成为清晰的一笔，不再被一圈圆底包着显糊。
  //    画布与徽章里的图标同尺寸（44），图例与地图上的图标观感一致
  const pngXian = join(SHU_CHU, 'sheshi-xian-' + x.k + '.png');
  jieTu(tuZhuanSvg(x.tu, x.se, TU_XIAN, 2.6), pngXian, TU_XIAN);
  console.log('已生成 ' + pngXian + '（' + x.ming + '，' + TU_XIAN + ' x ' + TU_XIAN + ' 透明 PNG · 面板图例用，去圆底线条）');
}

qingLinShi();
console.log('接着跑：node scripts/tongbu-xcx.mjs   # 分发到三端 images/');
