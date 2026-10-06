// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 预下载真实路网数据（OpenStreetMap / Overpass）到本地静态文件，供前端离线加载
// 用法：node scripts/xiazai-luwang.mjs --lng 112.9388 --lat 28.2281 --r 1500 [--name 砂子塘] [--jinShuiyu 1]
// 输出：public/osm/osm_<经度>_<纬度>.json 与（加 --jinShuiyu 1 时）shuiyu_<经度>_<纬度>.json
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { huoShuiYu } from '../src/adapters/shuiyu.js';

const FUWUQI = [
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// 与前端适配器保持一致的分组策略，避免单次查询过大被网关超时
const LUWANG_FEN_ZU = [
  { re: 'residential|service|unclassified|road', k: 1 },
  { re: 'tertiary|tertiary_link|secondary|secondary_link|primary|primary_link', k: 1 },
  { re: 'footway|path|pedestrian|steps|corridor|cycleway|living_street|track', k: 0.8 },
];

function canShu() {
  const a = process.argv.slice(2);
  const m = {};
  for (let i = 0; i < a.length; i += 2) m[a[i].replace(/^--/, '')] = a[i + 1];
  return {
    lng: parseFloat(m.lng || '112.9388'),
    lat: parseFloat(m.lat || '28.2281'),
    r: parseInt(m.r || '1500', 10),
    name: m.name || '',
    jinShuiyu: m.jinShuiyu === '1', // 只下水域（等时圈水面避让用），跳过路网与 POI
  };
}

async function chaXun(ql, ciShu = 5) {
  let lastErr = null;
  for (let i = 0; i < ciShu; i++) {
    for (const host of FUWUQI) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 90000);
        const r = await fetch(`${host}?data=${encodeURIComponent(ql)}`, {
          signal: ctl.signal,
          headers: { 'User-Agent': 'life-circle/1.0 (osm prefetch)', Accept: 'application/json' },
        });
        clearTimeout(timer);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (j && Array.isArray(j.elements)) {
          console.log(`  查询成功：${host} 元素 ${j.elements.length} 条`);
          return j.elements;
        }
        throw new Error('返回格式异常');
      } catch (e) {
        lastErr = e;
        console.log(`  失败 ${host}：${e.message}`);
      }
    }
    const wait = 4000 * (i + 1);
    console.log(`  第 ${i + 1} 轮全部失败，等待 ${wait / 1000}s 后重试…`);
    await new Promise((res) => setTimeout(res, wait));
  }
  throw lastErr || new Error('Overpass 全部节点不可用');
}

const { lng, lat, r, name, jinShuiyu } = canShu();
console.log(`下载真实路网：中心 (${lng}, ${lat})，半径 ${r} 米${name ? '，' + name : ''}`);

const muLu = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'osm');
if (!existsSync(muLu)) mkdirSync(muLu, { recursive: true });

if (!jinShuiyu) {
  console.log('[1/3] 道路网络（分 3 组请求）…');
  let luWang = [];
  for (const z of LUWANG_FEN_ZU) {
    const R = Math.round(r * z.k);
    luWang = luWang.concat(
      await chaXun(`[out:json][timeout:90];way["highway"~"^(${z.re})$"](around:${R},${lat},${lng});out geom;`)
    );
  }

  console.log('[2/3] 民生设施 POI…');
  const poi1 = await chaXun(
    `[out:json][timeout:90];node["amenity"~"^(hospital|clinic|doctors|pharmacy|school|kindergarten|marketplace|bus_station|parking|nursing_home|retirement_home|library|arts_centre|theatre|museum|social_facility)$"](around:${r},${lat},${lng});out center;`
  );
  const poi2 = await chaXun(
    `[out:json][timeout:90];(
node["healthcare"="pharmacy"](around:${r},${lat},${lng});
node["shop"~"^(supermarket|greengrocer|convenience|mall|general)$"](around:${r},${lat},${lng});
node["highway"="bus_stop"](around:${r},${lat},${lng});
node["railway"~"^(station|subway_entrance)$"](around:${r},${lat},${lng});
node["leisure"~"^(park|garden|fitness_centre|sports_centre|pitch|playground)$"](around:${r},${lat},${lng});
node["place"="square"](around:${r},${lat},${lng});
);out center;`
  );

  const shuChu = {
    banBen: 1,
    laiYuan: 'OpenStreetMap (ODbL)',
    xiaZaiShiJian: new Date().toISOString(),
    zhongXin: { lng, lat },
    banJingMi: r,
    mingCheng: name,
    luWang,
    poi: [...poi1, ...poi2],
  };

  const wenJian = resolve(muLu, `osm_${lng.toFixed(3)}_${lat.toFixed(3)}.json`);
  writeFileSync(wenJian, JSON.stringify(shuChu), 'utf-8');
  console.log(`完成：${wenJian}`);
  console.log(
    `道路元素 ${luWang.length} 条，POI ${shuChu.poi.length} 条，文件 ${(JSON.stringify(shuChu).length / 1024).toFixed(0)} KB`
  );
}

// [3/3] 水域（江河湖泊）：等时圈「水面避让」用。解析逻辑直接复用前端的适配器，
// 免得两边写两份还不一致（这里的 fetch 是相对路径，适配器内部会跳过本地预置那一步）
console.log(jinShuiyu ? '[1/1] 水域…' : '[3/3] 水域…');
// 脚本里给足重试时间（前端跑体检时只等 20 秒，超了就按「本轮不避让」走）
const shuiYu = await huoShuiYu({ lng, lat }, undefined, 120000);
if (shuiYu.cuo || !shuiYu.geShu) {
  console.log('  未取到水域数据（Overpass 限流或该区域无水面），本次不写出文件');
} else {
  // 文件名按 0.01 度网格取整（约 1.1 公里一格），与前端本地预置的查法保持一致
  const wenJian = resolve(muLu, `shuiyu_${lng.toFixed(2)}_${lat.toFixed(2)}.json`);
  writeFileSync(
    wenJian,
    JSON.stringify({
      laiYuan: 'OpenStreetMap (ODbL)',
      xiaZaiShiJian: new Date().toISOString(),
      zhongXin: { lng, lat },
      duoBianXing: shuiYu.duoBianXing,
    }),
    'utf-8'
  );
  console.log(`完成：${wenJian}`);
  console.log(`水域多边形 ${shuiYu.geShu} 处，文件 ${(JSON.stringify(shuiYu).length / 1024).toFixed(0)} KB`);
}
