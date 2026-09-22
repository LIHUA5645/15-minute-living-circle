// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 多源 POI 检索编排 + 清洗（归一/去重/过滤/可信度/分维归档）
import { liangDianJuLi, chuangJianWangGe } from '../geo/jichu.js';
import { FENLEI_GUANJIANCI, BIAOZHUN } from '../types.js';

const HEIMINGDAN = ['公司', '仓库', '批发', '养殖', '工地', '废弃', '工厂', '物流园'];

// 名称编辑距离（Levenshtein）
function bianJiJuLi(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
  return dp[m][n];
}

function piPeiFenlei(name, waiJia) {
  for (const f of Object.keys(FENLEI_GUANJIANCI)) {
    for (const kw of FENLEI_GUANJIANCI[f]) {
      if (name.includes(kw)) return f;
    }
  }
  // 自定义维度关键词（管理员配置）：内置类优先，同名自定义词其次
  for (const f of Object.keys(waiJia || {})) {
    for (const kw of waiJia[f]) {
      if (kw && name.includes(kw)) return f;
    }
  }
  return null;
}

// 可信度打分
function keXinDu(poi) {
  let s = 0;
  const fenlei = piPeiFenlei(poi.name);
  if (poi.name && fenlei) s += 0.4;
  if (poi.type) s += 0.3;
  if (poi.lng && poi.lat) s += 0.2;
  if (poi.address) s += 0.1;
  return Math.max(0, Math.min(1, s));
}

// 清洗主流程：去重 + 过滤 + 可信度 + 分维（waiJia：自定义维度关键词表 {f: [词]}）
export function qingXi(rawList, zhongXin, waiJia) {
  const list = rawList
    .filter((p) => p && p.lng && p.lat && p.lng !== 0 && p.lat !== 0)
    .map((p) => ({ ...p, _clng: zhongXin.lng, _clat: zhongXin.lat }));
  // 第一遍：过滤 + 分类 + 可信度
  const guoLv = [];
  for (const p of list) {
    if (HEIMINGDAN.some((w) => (p.name || '').includes(w))) continue;
    const fenlei = piPeiFenlei(p.name || '', waiJia);
    if (!fenlei) continue;
    guoLv.push({ ...p, fenlei, zixin: keXinDu(p) });
  }
  // 第二遍：基于栅格索引去重，避免 O(n²)
  const out = [];
  const wangGe = chuangJianWangGe([], 200);
  const suoYouDian = [];
  for (const p of guoLv) {
    const houXuan = wangGe.zaiBanJingNei(p, 200).map((it) => suoYouDian[it.i]);
    let dup = false;
    for (const q of houXuan) {
      if (q.fenlei !== p.fenlei) continue;
      const d = liangDianJuLi(p, q);
      if (q.uid && p.uid && q.uid === p.uid) {
        dup = true;
        break;
      }
      if (bianJiJuLi(q.name || '', p.name || '') <= 2 && d < 50) {
        dup = true;
        break;
      }
      if (q.brand && p.brand && q.brand === p.brand && d < 200) {
        dup = true;
        break;
      }
    }
    if (dup) continue;
    out.push(p);
    suoYouDian.push(p);
    // 索引随数据增长重建，POI 数量通常 <500，重建成本可忽略
    Object.assign(wangGe, chuangJianWangGe(suoYouDian, 200));
  }
  // 分维归档（含自定义维度）
  const fenleiSet = {};
  for (const f of Object.keys(FENLEI_GUANJIANCI)) fenleiSet[f] = [];
  for (const f of Object.keys(waiJia || {})) fenleiSet[f] = fenleiSet[f] || [];
  for (const p of out) (fenleiSet[p.fenlei] || (fenleiSet[p.fenlei] = [])).push(p);
  return { suoyou: out, fenleiSet, cunYi: out.filter((p) => p.zixin < 0.45) };
}

// 检索并清洗：对所有关键词组检索后合并清洗
// opt.xianliu 走限流器（避免触碰百度「地点检索」并发/QPS 上限）
// opt.huanCun 命中缓存直接复用，同中心点重复体检不再重复消耗配额
// opt.jinDu(已完成, 总数) 逐条回报检索进度：单次地点检索实测要 2~3 秒，
//   原先是「分类串行 + 分类内关键词串行」，30 多个关键词排队两三分钟且进度一直停在 0%，
//   看起来就像体检点不动。现在统一展开成任务并发提交给限流器，由限流器控制实际速率。
export async function souSuoBingQingXi(provider, zhongXin, banJingMi = 1500, opt = {}) {
  const { xianliu, huanCun, jinDu } = opt;
  const pao = (fn) => (xianliu ? xianliu.run(fn) : fn());
  const huanCunKey = (f) => `poi:${f}:${zhongXin.lng.toFixed(4)},${zhongXin.lat.toFixed(4)}:${banJingMi}`;
  const paoRenWu = (fn) =>
    pao(fn)
      .then((lie) => ({ lie: lie || [] }))
      .catch((e) => ({ lie: [], shiBai: true, yin: (e && e.message) || '' }));

  const tong = [];
  const renWu = [];
  let wanCheng = 0;
  let zongShu = 0;
  let shiBaiShu = 0;
  const shiBaiCi = [];
  let shiBaiYin = ''; // 首次失败原因（如「baidu:302 天配额超限」），用于整体失败时给出可读提示

  // 自定义维度（管理员配置）：与内置六类同一套检索/缓存/清洗流程
  const waiJia = {};
  for (const z of (opt.peiZhi && opt.peiZhi.ziDing) || []) {
    if (!z.f || !z.guanJianCi) continue;
    waiJia[z.f] = z.guanJianCi.split(/[，,、\s]+/).filter(Boolean);
  }

  for (const f of [...Object.keys(FENLEI_GUANJIANCI), ...Object.keys(waiJia)]) {
    const ku = { f, list: [] };
    tong.push(ku);
    const huan = huanCun ? huanCun.get(huanCunKey(f)) : null;
    if (huan) {
      ku.list = huan; // 命中缓存，不占进度也不消耗配额
      continue;
    }
    const kws = FENLEI_GUANJIANCI[f] || [];
    // 百度适配器一次只能一个关键词 → 每个关键词一个任务；能批量检索的适配器仍按分类整体提交
    const yiCiYiGe = !!provider.danGuanJianCi;
    const zuLie = yiCiYiGe ? kws.map((kw) => [kw]) : [kws];
    for (const zu of zuLie) {
      zongShu++;
      renWu.push(
        paoRenWu(() => provider.searchPoi(zhongXin, zu, banJingMi)).then((r) => {
          if (r.shiBai) {
            shiBaiShu++;
            shiBaiCi.push(zu.join('/'));
            if (!shiBaiYin && r.yin) shiBaiYin = r.yin;
          } else {
            for (const p of r.lie) ku.list.push(p);
          }
          wanCheng++;
          if (jinDu) jinDu(wanCheng, zongShu);
        })
      );
    }
  }

  await Promise.all(renWu);
  for (const ku of tong) {
    if (!ku.list.length) continue;
    if (huanCun) huanCun.set(huanCunKey(ku.f), ku.list);
  }

  const all = [];
  for (const ku of tong) {
    for (const p of ku.list) all.push({ ...p, brand: p.brand || guessBrand(p.name) });
  }
  const jieGuo = qingXi(all, zhongXin, waiJia);
  jieGuo.shiBaiShu = shiBaiShu; // 交给上层汇总成体检告警，避免关键词失败被悄悄吞掉
  jieGuo.shiBaiCi = shiBaiCi;
  // 全军覆没（典型原因是地点检索天配额超限 / AK 被禁用）时直接报错：
  // 拿一份空 POI 去评分只会得出一个 0 分的假报告，比报错更误导人
  if (zongShu > 0 && shiBaiShu === zongShu) {
    throw new Error(`POI 检索全部失败：${shiBaiYin || '数据源不可用'}`);
  }
  return jieGuo;
}

// 简单品牌识别（取前 4 字作为品牌指纹）
function guessBrand(name = '') {
  return name.slice(0, 4);
}

export { BIAOZHUN, piPeiFenlei };
