// 自定义 tabBar（微信端）：用 app.wxss 的 .ic-* CSS 图标自绘底部栏。
// 用它的原因只有一个——原生 tabBar 的图标只认图片文件，而项目图标规则明确「不引图片资源」。
// 选中态由各 tab 页在 onShow 里回报（getTabBar().setData({xuanZhong})），没法在这里自己判断。
Component({
  options: { addGlobalClass: true }, // 让 app.wxss 里的 .ic-* 图标样式作用到组件内部

  data: {
    xuanZhong: 0,
    lie: [
      { ming: '地图', url: '/pages/ditu/ditu', ic: 'ic-tu' },
      { ming: '生活圈', url: '/pages/baogao/baogao', ic: 'ic-huan' },
      { ming: '助手', url: '/pages/ai/ai', ic: 'ic-qipao' },
      { ming: '我的', url: '/pages/wo/wo', ic: 'ic-ren' }
    ]
  },

  methods: {
    dian(e) {
      const i = Number(e.currentTarget.dataset.i) || 0;
      const ye = this.data.lie[i];
      if (!ye || i === this.data.xuanZhong) return;
      wx.switchTab({ url: ye.url });
      this.setData({ xuanZhong: i });
    }
  }
});
