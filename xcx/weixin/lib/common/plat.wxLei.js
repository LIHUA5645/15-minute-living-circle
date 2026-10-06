// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 「wx 类」平台实现：微信小程序（wx）与抖音小程序（tt）的 API 形状基本一致，共用这一份；
// 支付宝（my）签名差异较大，另见 plat.zhifubao.js。
// 取全局对象用函数包一层，避免模块加载期就引用未定义变量（三端工程会同时被工具扫描）。

function huiBao(fn, can) {
  return new Promise((jie, ju) => {
    fn({ ...can, success: jie, fail: ju });
  });
}

export function chuangJianWxLei(quanJu, ming) {
  function yao(lu) {
    const f = quanJu && quanJu[lu];
    if (typeof f !== 'function') throw new Error(`${ming}端缺少 API：${lu}`);
    return f;
  }

  return {
    mingCheng: ming, // 平台中文名（提示文案用）；平台标识符见 plat.pingTai

    // 统一返回 { statusCode, data }：小程序自带 JSON 解析，非 JSON 响应会以字符串返回
    request({ url, method = 'GET', data, header, timeout }) {
      return new Promise((jie, ju) => {
        yao('request')({
          url,
          method,
          data,
          timeout: timeout || 20000,
          dataType: 'json',
          header: { 'content-type': 'application/json', ...(header || {}) },
          success: r => jie({ statusCode: r.statusCode, data: r.data, header: r.header }),
          fail: e => ju(new Error(`网络请求失败（${(e && e.errMsg) || ''}）：${url}`))
        });
      });
    },

    getStorage: k => {
      try {
        const v = quanJu.getStorageSync(k);
        return v === '' || v === undefined ? null : v;
      } catch {
        return null;
      }
    },
    setStorage: (k, v) => {
      try {
        quanJu.setStorageSync(k, v);
        return true;
      } catch {
        return false; // 配额满等情况：上层当作「没缓存」继续跑，不打断体检
      }
    },
    removeStorage: k => {
      try {
        quanJu.removeStorageSync(k);
      } catch {
        /* 忽略 */
      }
    },

    // 定位：统一要 GCJ-02（腾讯/高德底图坐标），引擎侧再转 WGS-84
    getLocation() {
      return huiBao(yao('getLocation'), { type: 'gcj02' }).then(r => ({
        lng: Number(r.longitude),
        lat: Number(r.latitude)
      }));
    },

    // 地图上选点（带地名）
    chooseLocation() {
      return huiBao(yao('chooseLocation'), {}).then(r => ({
        lng: Number(r.longitude),
        lat: Number(r.latitude),
        name: r.name || '',
        address: r.address || ''
      }));
    },

    openLocation({ lng, lat, name, address }) {
      return huiBao(yao('openLocation'), {
        latitude: lat,
        longitude: lng,
        name: name || '',
        address: address || '',
        scale: 16
      }).catch(() => null);
    },

    toast({ title, icon = 'none', duration = 2000 }) {
      try {
        quanJu.showToast({ title: String(title || ''), icon, duration });
      } catch {
        /* 忽略 */
      }
    },
    loading(title = '处理中') {
      try {
        quanJu.showLoading({ title, mask: true });
      } catch {
        /* 忽略 */
      }
    },
    hideLoading() {
      try {
        quanJu.hideLoading();
      } catch {
        /* 忽略 */
      }
    },
    modal({ title = '提示', content = '', showCancel = true, confirmText = '确定', cancelText = '取消' }) {
      return huiBao(yao('showModal'), { title, content, showCancel, confirmText, cancelText })
        .then(r => !!r.confirm)
        .catch(() => false);
    },
    setTitle(t) {
      try {
        quanJu.setNavigationBarTitle({ title: String(t || '') });
      } catch {
        /* 忽略 */
      }
    },
    getSystemInfo() {
      return huiBao(yao('getSystemInfo'), {}).catch(() => ({}));
    },

    navigateTo(url) {
      return huiBao(yao('navigateTo'), { url }).catch(() => null);
    },
    redirectTo(url) {
      return huiBao(yao('redirectTo'), { url }).catch(() => null);
    },
    navigateBack() {
      return huiBao(yao('navigateBack'), { delta: 1 }).catch(() => null);
    }
  };
}
