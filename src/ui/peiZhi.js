// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 浏览器端管理员配置读写（localStorage 持久化，跨刷新保留）
import { MOREN_PEI_ZHI } from '../core/types.js';

const KEY = 'sq_admin_conf';
const RKEY = 'sq_reports';

export function loadPeiZhi() {
  try {
    const s = localStorage.getItem(KEY);
    let p = s ? { ...MOREN_PEI_ZHI, ...JSON.parse(s) } : { ...MOREN_PEI_ZHI };
    // 一次性迁移：老版本填了地址与密钥但启用开关默认关闭的存量配置，自动视为已启用；
    // 迁移后管理员手动关闭的开关不受影响（迁移标记落地后不再改写）
    if (!localStorage.getItem('sq_ai_qiyong_migrated')) {
      if (p.ai && p.ai.apiDiZhi && p.ai.miYao && !p.ai.qiYong) {
        p = { ...p, ai: { ...p.ai, qiYong: true } };
        localStorage.setItem(KEY, JSON.stringify(p));
      }
      localStorage.setItem('sq_ai_qiyong_migrated', '1');
    }
    return p;
  } catch {
    /* 忽略 */
  }
  return { ...MOREN_PEI_ZHI };
}

export function savePeiZhi(p) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

// 报告存档（个人主页与管理员均可查看）；zhangHao 记录归属账号，供个人主页按账号过滤
export function saveReport(rep, zhangHao) {
  try {
    const list = JSON.parse(localStorage.getItem(RKEY) || '[]');
    list.unshift({
      t: Date.now(),
      zhangHao: zhangHao || '',
      zhongXin: rep.zhongXin,
      total: rep.total,
      dengji: rep.dengji,
      mang: rep.mangquList.length
    });
    localStorage.setItem(RKEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* 忽略 */
  }
}

export function loadReports() {
  try {
    return JSON.parse(localStorage.getItem(RKEY) || '[]');
  } catch {
    return [];
  }
}

// 清空指定账号的体检记录（个人主页「清空我的记录」），返回删除条数
export function shanChuWoDeBaoGao(zhangHao) {
  try {
    const list = JSON.parse(localStorage.getItem(RKEY) || '[]');
    const sheng = list.filter(r => r.zhangHao !== zhangHao);
    localStorage.setItem(RKEY, JSON.stringify(sheng));
    return list.length - sheng.length;
  } catch {
    return 0;
  }
}
