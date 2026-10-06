/* global my */
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 支付宝小程序平台实现。my.* 与 wx.* 的差异集中在三处：
//   ① 请求头字段叫 headers（不是 header），响应状态码在 status（不是 statusCode）
//   ② 存储接口是「对象入参+出参」：my.setStorageSync({key, data}) / my.getStorageSync({key}) → {data}
//   ③ 提示类接口参数名不同：showToast(content/type)、confirm(title/content)
// 另外定位（my.getLocation）返回的坐标系随平台设置而定，工程里默认按 GCJ-02 处理，
// 「我的」页提供一处原始坐标对照显示，真机核对一次即可放心。

function huiBao(fn, can) {
  return new Promise((jie, ju) => {
    fn({ ...can, success: jie, fail: ju });
  });
}

const quanJu = typeof my !== 'undefined' ? my : {};

function yao(lu) {
  const f = quanJu && quanJu[lu];
  if (typeof f !== 'function') throw new Error(`支付宝端缺少 API：${lu}`);
  return f;
}

export const zhifubao = {
  mingCheng: '支付宝', // 平台中文名（提示文案用）；平台标识符见 plat.pingTai

  request({ url, method = 'GET', data, header, timeout }) {
    return new Promise((jie, ju) => {
      yao('request')({
        url,
        method,
        data,
        timeout: timeout || 20000,
        dataType: 'json',
        headers: { 'content-type': 'application/json', ...(header || {}) },
        success: r => jie({ statusCode: r.status || r.statusCode, data: r.data, header: r.headers }),
        fail: e => ju(new Error(`网络请求失败（${(e && e.errorMessage) || ''}）：${url}`))
      });
    });
  },

  getStorage(k) {
    try {
      const r = yao('getStorageSync')({ key: k });
      const v = r && typeof r === 'object' && 'data' in r ? r.data : r;
      return v === '' || v === undefined || v === null ? null : v;
    } catch {
      return null;
    }
  },
  setStorage(k, v) {
    try {
      yao('setStorageSync')({ key: k, data: v });
      return true;
    } catch {
      return false;
    }
  },
  removeStorage(k) {
    try {
      yao('removeStorageSync')({ key: k });
    } catch {
      /* 忽略 */
    }
  },

  // type: 1 —— 支付宝文档中该取值返回高德（GCJ-02）经纬度；如有偏差在「我的」页对照后调整
  getLocation() {
    return huiBao(yao('getLocation'), { type: 1 }).then(r => ({
      lng: Number(r.longitude),
      lat: Number(r.latitude)
    }));
  },

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
      longitude: lng,
      latitude: lat,
      name: name || '',
      address: address || ''
    }).catch(() => null);
  },

  toast({ title, icon = 'none', duration = 2000 }) {
    try {
      yao('showToast')({ content: String(title || ''), type: icon === 'success' ? 'success' : 'none', duration });
    } catch {
      /* 忽略 */
    }
  },
  loading(title = '处理中') {
    try {
      yao('showLoading')({ content: title });
    } catch {
      /* 忽略 */
    }
  },
  hideLoading() {
    try {
      yao('hideLoading')();
    } catch {
      /* 忽略 */
    }
  },
  modal({ title = '提示', content = '', showCancel = true, confirmText = '确定', cancelText = '取消' }) {
    if (!showCancel)
      return huiBao(yao('alert'), { title, content, buttonText: confirmText })
        .then(() => true)
        .catch(() => false);
    return huiBao(yao('confirm'), { title, content, confirmButtonText: confirmText, cancelButtonText: cancelText })
      .then(r => !!r.confirm)
      .catch(() => false);
  },
  setTitle(t) {
    try {
      yao('setNavigationBar')({ title: String(t || '') });
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
