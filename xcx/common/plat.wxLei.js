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

// 允许在「从聊天选文件」里挑的扩展名（平台只收扩展名、不带点）。
// 覆盖办公文档 + 纯文本 + 表格 + 数据文件，够 AI 问答用
export const WEN_JIAN_KUO = [
  'doc',
  'docx',
  'pdf',
  'txt',
  'md',
  'csv',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'json',
  'log'
];

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

    /* 地图上下文（站内导航用） */
    diTuBen(id) {
      try {
        return yao('createMapContext')(id);
      } catch {
        return null;
      }
    },

    /* 持续定位（真实导航的定位源）：startLocationUpdate + onLocationChange。
       需要用户授权 scope.userLocation；授权失败/不支持时 huiCha 抛错由调用方提示。
       坐标与 getLocation 一致（GCJ-02），直接进地图组件 */
    dingWeiChiXu(huiCha) {
      const hui = r => huiCha({ latitude: r.latitude, longitude: r.longitude });
      return yao('startLocationUpdate')({
        success: () => yao('onLocationChange')(hui),
        fail: e => huiCha(null, new Error((e && e.errMsg) || '持续定位启动失败（需定位权限）'))
      });
    },
    dingWeiTing() {
      try {
        yao('offLocationChange')();
        yao('stopLocationUpdate')({}); // 回调缺省也成立：关掉就好
      } catch {
        /* 没开过就无所谓关 */
      }
    },

    /* ── 用户文件持久化（panCun / panDu / panShan）──
       「清除缓存」清的是 storage 与缓存文件，USER_DATA_PATH 下的用户文件不受影响
       （真机「删除小程序」才会清）。历史记录这类要扛住清缓存的数据：storage 快照 + 用户文件兜底，
       读的时候 storage 空了就从文件回填。同步 API 足够（历史最多几十 KB），失败一律静默 ——
       持久层坏了不能拖垮主流程 */
    panLu(du) {
      // env.USER_DATA_PATH 三端都有；拿不到就让 writeFileSync 自己抛错走静默分支
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
    // tabBar 页只能用 switchTab 打开（navigateTo / redirectTo 会被平台直接拒绝）
    switchTab(url) {
      return huiBao(yao('switchTab'), { url }).catch(() => null);
    },

    // ── 语音输入（录音 → 服务端识别成文字）──

    // 开始录音：PCM / 16kHz / 单声道，与服务端（百度短语音识别）的入参严格对齐；
    // 录音权限由平台自动弹窗，拒绝会走 onError
    luYinKai() {
      return new Promise((jie, ju) => {
        try {
          const m = quanJu.getRecorderManager();
          m.onError(e => ju(new Error((e && e.errMsg) || '录音失败（可能没给麦克风权限）')));
          m.start({ duration: 30000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, format: 'pcm' });
          setTimeout(() => jie(true), 120);
        } catch (e) {
          ju(new Error('当前平台不支持录音：' + ((e && e.message) || '')));
        }
      });
    },

    // 结束录音：返回临时音频路径（'' 表示没录到）。
    // 3 秒超时兜底：start 后极短时间内 stop，个别平台 onStop 不回调，不能让 Promise 永远挂着
    luYinTing() {
      return new Promise(jie => {
        let hui = false;
        const shou = v => {
          if (hui) return;
          hui = true;
          jie(v);
        };
        try {
          const m = quanJu.getRecorderManager();
          m.onStop(r => shou((r && r.tempFilePath) || ''));
          m.stop();
          setTimeout(() => shou(''), 3000);
        } catch {
          shou('');
        }
      });
    },

    // 读文件为 base64（音频体积不大，base64 走 request 最省事，见服务端 yuyin.mjs 的注释）
    duBase64(lu) {
      return new Promise((jie, ju) => {
        try {
          const v = yao('getFileSystemManager')().readFileSync(lu, 'base64');
          jie(String(v || ''));
        } catch (e) {
          ju(new Error('读取录音失败：' + ((e && e.errMsg) || (e && e.message) || '')));
        }
      });
    },

    // ── 附件（图片 / 文件）──

    // 底部动作表：返回点中的序号，没选（取消/不支持）返回 -1
    actionSheet(itemList) {
      return huiBao(yao('showActionSheet'), { itemList, itemColor: '#101828' })
        .then(r => Number(r.tapIndex))
        .catch(() => -1);
    },

    // 选图片：相机 + 相册（取压缩图，避免原图几 MB 拖垮上传与存储）
    xuanTu({ shu = 1 } = {}) {
      return huiBao(yao('chooseMedia'), {
        count: shu,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed']
      }).then(r => (r.tempFiles || []).map(f => ({ lu: f.tempFilePath, daXiao: f.size || 0 })));
    },

    // 选文件：小程序只能从「聊天记录」里挑（平台限制，没法直接翻手机文件系统）
    xuanWenJian({ shu = 1 } = {}) {
      // 抖音暂无此 API：给一句人话，而不是「缺少 API：chooseMessageFile」
      if (typeof quanJu.chooseMessageFile !== 'function')
        return Promise.reject(new Error('当前平台暂不支持选择文件，可改用图片或把内容粘贴到输入框'));
      return huiBao(yao('chooseMessageFile'), {
        count: shu,
        type: 'file',
        extension: WEN_JIAN_KUO
      }).then(r => (r.tempFiles || []).map(f => ({ lu: f.path, ming: f.name || '文件', daXiao: f.size || 0 })));
    },

    // 读文本文件正文：docx / pdf 这类是二进制，端上读出来是乱码，只对文本类调用
    duWenBen(lu, zuiDa = 3000) {
      return new Promise((jie, ju) => {
        try {
          yao('getFileSystemManager')().readFile({
            filePath: lu,
            encoding: 'utf-8',
            success: r => jie(String((r && r.data) || '').slice(0, zuiDa)),
            fail: e => ju(new Error((e && e.errMsg) || '读取文件失败'))
          });
        } catch (e) {
          ju(e);
        }
      });
    },

    // 临时文件存到小程序本地，换回持久路径：否则历史记录里的图片过几天就变空白
    baoFile(lu) {
      return new Promise(jie => {
        try {
          yao('getFileSystemManager')().saveFile({
            tempFilePath: lu,
            success: r => jie((r && r.savedFilePath) || lu),
            fail: () => jie(lu) // 存不上就用临时路径，至少本次会话能看
          });
        } catch {
          jie(lu);
        }
      });
    },

    // 页面 canvas 上下文（画等时圈矢量示意图用；微信/抖音同名，返回旧版上下文即可满足需求）
    canvas(id, ben) {
      try {
        return quanJu.createCanvasContext(id, ben);
      } catch {
        return null;
      }
    }
  };
}
