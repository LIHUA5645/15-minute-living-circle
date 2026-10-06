// 小程序启动：① 恢复本项目状态（中心点/参数/登录用户/上次结论摘要）② 保留 quickstart 的云开发初始化
import { huiFu } from './lib/common/zhuangTai.js';

App({
  globalData: {
    // 云开发环境 ID：本项目的体检 / 报告 / 地图都不依赖云开发，留空即可；
    // 若要用云函数或云存储，在右上角「云开发」里取环境 ID 填进来
    env: ''
  },

  onLaunch() {
    // ① 本项目状态恢复（存储异常不该拦住启动）
    try {
      huiFu();
    } catch (e) {
      console.warn('状态恢复失败：', e && e.message);
    }
    // ② 云开发初始化（保持 quickstart 原样：基础库不足或未填 env 时只告警、不报错）
    if (!wx.cloud) {
      console.warn('当前基础库不支持云能力（需 2.2.3+）；本项目不依赖云开发，可忽略');
      return;
    }
    try {
      wx.cloud.init({ env: this.globalData.env, traceUser: true });
    } catch (e) {
      console.warn('云开发初始化失败（本项目不依赖云开发，可忽略）：', e && e.message);
    }
  }
});
