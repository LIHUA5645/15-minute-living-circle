// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 小程序启动入口：恢复本地状态（中心点 / 体检参数 / 登录用户 / 上次结论摘要）
import { huiFu } from './lib/common/zhuangTai.js';

App({
  onLaunch() {
    try {
      huiFu();
    } catch (e) {
      // 存储异常不该拦住启动
      console.warn('状态恢复失败：', e && e.message);
    }
  },
  onShow() {},
  onError(e) {
    console.error('小程序运行错误：', e);
  }
});
