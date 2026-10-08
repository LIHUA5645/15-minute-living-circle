// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
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

  /* 地图上下文（与 plat.wxLei.js 同语义） */
  diTuBen(id) {
    try {
      return yao('createMapContext')(id);
    } catch {
      return null;
    }
  },

  /* 持续定位（与 plat.wxLei.js 同语义）：支付宝的 onLocationChange 形状基本一致，失败静默交由调用方提示 */
  dingWeiChiXu(huiCha) {
    const hui = r => huiCha({ latitude: r.latitude, longitude: r.longitude });
    return yao('startLocationUpdate')({
      success: () => yao('onLocationChange')(hui),
      fail: e => huiCha(null, new Error((e && e.errorMessage) || (e && e.errMsg) || '持续定位启动失败（需定位权限）'))
    });
  },
  dingWeiTing() {
    try {
      yao('offLocationChange')();
      yao('stopLocationUpdate')({});
    } catch {
      /* 忽略 */
    }
  },

  /* 用户文件持久化（panCun / panDu / panShan）：与 plat.wxLei.js 同一套语义 ——
     「清除缓存」清 storage 不清 USER_DATA_PATH 用户文件，历史记录用它扛住清缓存。
     支付宝的 FileSystemManager 同步 API 形状与微信一致，失败一律静默 */
  panLu(du) {
    return `${(quanJu.env && quanJu.env.USER_DATA_PATH) || ''}/sq_${du}.json`;
  },
  panCun(du, shu) {
    try {
      yao('getFileSystemManager')().writeFileSync(this.panLu(du), JSON.stringify(shu), 'utf8');
      return true;
    } catch {
      return false;
    }
  },
  panDu(du) {
    try {
      const wen = yao('getFileSystemManager')().readFileSync(this.panLu(du), 'utf8');
      return JSON.parse(wen);
    } catch {
      return null;
    }
  },
  panShan(du) {
    try {
      yao('getFileSystemManager')().unlinkSync(this.panLu(du));
    } catch {
      /* 文件本来就不存在也算删成 */
    }
  },

  navigateTo(url) {
    return huiBao(yao('navigateTo'), { url }).catch(() => null);
  },
  redirectTo(url) {
    return huiBao(yao('redirectTo'), { url }).catch(() => null);
  },
  navigateBack() {
    return huiBao(yao('navigateBack'), { delta: 1 }).catch(() => null);
  },
  // tabBar 页只能 switchTab
  switchTab(url) {
    return huiBao(yao('switchTab'), { url }).catch(() => null);
  },

  // ── 语音输入 ──

  // 支付宝的录音 API 与微信差异较大（my.startRecord / my.getRecorderManager 支持度不一），
  // 这里如实拒绝并给一句人话，不做半吊子实现
  luYinKai() {
    return Promise.reject(new Error('当前平台暂不支持语音输入，可改用键盘输入'));
  },
  luYinTing() {
    return Promise.resolve('');
  },
  duBase64(lu) {
    return new Promise((jie, ju) => {
      try {
        const v = yao('getFileSystemManager')().readFileSync(lu, 'base64');
        jie(String(v || ''));
      } catch (e) {
        ju(new Error('读取录音失败：' + ((e && e.errorMessage) || (e && e.message) || '')));
      }
    });
  },

  // ── 附件（图片 / 文件）──

  // 底部动作表：my 的参数名是 items、回调给 index（与 wx 的 itemList / tapIndex 不同）
  actionSheet(items) {
    return huiBao(yao('showActionSheet'), { items })
      .then(r => Number(r.index))
      .catch(() => -1);
  },

  // 选图片：相机 + 相册（支付宝返回的是本地路径数组，没有大小信息）
  xuanTu({ shu = 1 } = {}) {
    return huiBao(yao('chooseImage'), { count: shu, sourceType: ['camera', 'album'] }).then(r =>
      (r.apFilePaths || r.tempFilePaths || []).map(lu => ({ lu, daXiao: 0 }))
    );
  },

  // 选文件：靠 my.chooseFile；缺失时给一句人话，不静默失败
  xuanWenJian({ shu = 1 } = {}) {
    if (typeof quanJu.chooseFile !== 'function')
      return Promise.reject(new Error('当前平台暂不支持选择文件，可改用图片或把内容粘贴到输入框'));
    return huiBao(yao('chooseFile'), { count: shu, type: 'file' }).then(r =>
      (r.tempFiles || []).map(f => ({ lu: f.path || f.filePath, ming: f.name || '文件', daXiao: f.size || 0 }))
    );
  },

  // 读文本文件正文：docx / pdf 是二进制，端上读出来是乱码，只对文本类调用
  duWenBen(lu, zuiDa = 3000) {
    return new Promise((jie, ju) => {
      try {
        yao('getFileSystemManager')().readFile({
          filePath: lu,
          encoding: 'utf-8',
          success: r => jie(String((r && r.data) || '').slice(0, zuiDa)),
          fail: e => ju(new Error((e && e.errorMessage) || '读取文件失败'))
        });
      } catch (e) {
        ju(e);
      }
    });
  },

  // 临时文件存到本地，换回持久路径（历史里的图片才不会变空白）
  baoFile(lu) {
    return new Promise(jie => {
      try {
        yao('getFileSystemManager')().saveFile({
          tempFilePath: lu,
          success: r => jie((r && r.savedFilePath) || lu),
          fail: () => jie(lu)
        });
      } catch {
        jie(lu);
      }
    });
  },

  // 页面 canvas 上下文（画等时圈矢量示意图用）
  canvas(id, ben) {
    try {
      return quanJu.createCanvasContext(id, ben);
    } catch {
      return null;
    }
  }
};
