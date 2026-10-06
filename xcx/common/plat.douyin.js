/* global tt */
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 抖音小程序平台实现：tt.* 与 wx.* 同形，共用 plat.wxLei.js
import { chuangJianWxLei } from './plat.wxLei.js';

const quanJu = typeof tt !== 'undefined' ? tt : {};

export const douyin = chuangJianWxLei(quanJu, '抖音');
