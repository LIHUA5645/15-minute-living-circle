// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 限流 / 并发 / 缓存 / 降级 调度器

// 令牌桶：控制 QPS
class LingPaiTong {
  constructor(qps = 4, tuFa = 8) {
    this.qps = qps;
    this.tuFa = tuFa;
    this.lingPai = tuFa;
    this.last = Date.now();
  }
  async huoQu() {
    const now = Date.now();
    const dt = (now - this.last) / 1000;
    this.lingPai = Math.min(this.tuFa, this.lingPai + dt * this.qps);
    this.last = now;
    if (this.lingPai >= 1) {
      this.lingPai -= 1;
      return;
    }
    const wait = (1 - this.lingPai) / this.qps;
    await new Promise(r => setTimeout(r, wait * 1000));
    return this.huoQu();
  }
}

// 并发池：限制同时进行的请求数
class BingFaChi {
  constructor(bingFa = 6) {
    this.bingFa = bingFa;
    this.running = 0;
    this.queue = [];
  }
  async run(task) {
    if (this.running >= this.bingFa) {
      await new Promise(r => this.queue.push(r));
    }
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      if (this.queue.length) this.queue.shift()();
    }
  }
}

// 可插拔缓存（Web 用 localStorage，Node/Electron 用内存或磁盘）
class HuanCun {
  constructor(store = null, ttl = 7 * 24 * 3600 * 1000) {
    this.store = store; // 实现 get(key)/set(key,val) 的对象，缺省用内存 Map
    this.memory = new Map();
    this.ttl = ttl;
  }
  _s() {
    if (this.store) return this.store;
    return {
      get: k => (this.memory.has(k) ? this.memory.get(k) : null),
      set: (k, v) => this.memory.set(k, v)
    };
  }
  get(key) {
    const s = this._s(key);
    const raw = s.get(key);
    if (!raw) return null;
    try {
      const o = JSON.parse(raw);
      if (Date.now() - o.t > this.ttl) return null;
      return o.v;
    } catch {
      return null;
    }
  }
  set(key, val) {
    const s = this._s(key);
    s.set(key, JSON.stringify({ t: Date.now(), v: val }));
  }
}

// 退避重试包装：指数退避，最多 maxCi 次；仍失败抛出
async function tuiBiChongShi(fn, maxCi = 3, jiChi = 200) {
  let lastErr;
  for (let i = 0; i < maxCi; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, jiChi * 2 ** i));
    }
  }
  throw lastErr;
}

// 降级：用欧氏距离 × 绕路系数估算步行时间（秒）
function ouJiGuJI(origin, dest, raoLu = 1.35) {
  const dist = haversineLite(origin, dest);
  const v = 80; // 米/分钟
  return { durationSec: ((dist * raoLu) / v) * 60, distanceM: dist * raoLu, polyline: null };
}

function haversineLite(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export { LingPaiTong, BingFaChi, HuanCun, tuiBiChongShi, ouJiGuJI };
