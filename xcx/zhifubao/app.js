// 支付宝端启动：恢复本地状态（本端不依赖云开发，逻辑比微信端更薄）
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
