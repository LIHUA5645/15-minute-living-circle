// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 存储层：给引擎的 HuanCun 当 store 用（它只要求 get(key)->字符串 / set(key, 字符串)）。
// 小程序存储有三个坑：① 单键 1MB、整包 10MB；② 满了会直接抛错；③ 没有遍历能力（各端 API 不同）。
// 这里用「一个索引键记全部缓存键」的办法自管容量，满了就按最旧优先清掉一半——宁可丢缓存也不能抛错打断体检。
import { plat } from './plat.js';

export function chuangJianCunChu({
  qian = 'sq_hc_',
  zuiDuoTiao = 600,
  danTiaoShangXian = 200000 // 单条 20 万字符（约 200KB）以上不缓存
} = {}) {
  const SUO = qian + '__suoyin';

  function duSuo() {
    const v = plat.getStorage(SUO);
    return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [];
  }

  function xieSuo(suo) {
    plat.setStorage(SUO, suo);
  }

  // 清掉最旧的 n 条（索引是按写入顺序 push 的，数组头部最旧）
  function qingLi(n) {
    const suo = duSuo();
    if (!suo.length) return;
    const qu = suo.splice(0, Math.max(1, Math.min(n, suo.length)));
    qu.forEach(k => plat.removeStorage(k));
    xieSuo(suo);
  }

  return {
    get(k) {
      try {
        const v = plat.getStorage(qian + k);
        return typeof v === 'string' && v ? v : null;
      } catch {
        return null;
      }
    },
    set(k, v) {
      const zh = typeof v === 'string' ? v : String(v);
      if (!zh || zh.length > danTiaoShangXian) return;
      const key = qian + k;
      let cheng = plat.setStorage(key, zh);
      if (!cheng) {
        // 写失败通常就是配额满了：清掉一半再试一次，仍失败就放弃这条缓存
        qingLi(Math.ceil(duSuo().length / 2) || 50);
        cheng = plat.setStorage(key, zh);
        if (!cheng) return;
      }
      const suo = duSuo();
      if (!suo.includes(key)) {
        suo.push(key);
        if (suo.length > zuiDuoTiao) {
          const duo = suo.length - zuiDuoTiao;
          suo.splice(0, duo).forEach(x => plat.removeStorage(x));
        }
        xieSuo(suo);
      }
    },
    qingKong() {
      duSuo().forEach(k => plat.removeStorage(k));
      xieSuo([]);
    },
    tiaoShu() {
      return duSuo().length;
    }
  };
}
