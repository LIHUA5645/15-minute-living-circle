// 抖音端启动：恢复本地状态（与微信端同形，去掉云开发）
import { huiFu } from './lib/common/zhuangTai.js';

App({
  onLaunch() {
    try {
      huiFu();
    } catch (e) {
      console.warn('状态恢复失败：', e && e.message);
    }
  }
});
