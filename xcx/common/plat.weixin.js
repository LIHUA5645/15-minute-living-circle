/* global wx */
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// 微信小程序平台实现：与抖音同形，共用 plat.wxLei.js
import { chuangJianWxLei } from './plat.wxLei.js';

const quanJu = typeof wx !== 'undefined' ? wx : {};

export const weixin = chuangJianWxLei(quanJu, '微信');
