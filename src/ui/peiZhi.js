// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，18
// 浏览器端管理员配置读写（localStorage 持久化 + 服务端 MySQL 同步）
// 本地那份负责「离线也能用、改完即时生效」，服务端那份负责「换浏览器 / 换机器也读得到同一份」
import { MOREN_PEI_ZHI } from '../core/types.js';
import { peiZhiDu, peiZhiCun } from '../core/yonghu.js';

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

// 从服务端拉管理员配置：本地那份先兜底（服务没起 / 静态部署也能用），服务端有就覆盖过来——
// 这样换浏览器、换机器打开，管理员配好的评分维度与 AI 接口跟着来，不再是白纸一张。
// 注意密钥服务端不下发（只回 miYaoYiCun 标记），本地原来存的那把继续留着，仅作本机调试用
export async function laPeiZhiFuWu() {
  try {
    const j = await peiZhiDu();
    if (!j || !j.ok || !j.peiZhi) return null;
    const ben = loadPeiZhi();
    const benAi = ben.ai || {};
    const fuAi = j.peiZhi.ai || {};
    const he = {
      ...ben,
      ...j.peiZhi,
      // 服务端那份为准，但本机残留的密钥**不清掉**：万一服务端配置被删了 / 还没同步上来，
      // 本机这把还能顶上；到底由谁带密钥发请求，交给 fuWuDaiFa 判断（服务端有就服务端发）
      ai: { ...benAi, ...fuAi, miYao: benAi.miYao || '' }
    };
    localStorage.setItem(KEY, JSON.stringify(he));
    return he;
  } catch {
    return null;
  }
}

// 保存配置：先落地本地（离线可用、改完即时生效），再推服务端。
// 服务端没保存成功要把原因回给界面，免得管理员以为已经同步到别的浏览器了
export async function savePeiZhiFuWu(p) {
  savePeiZhi(p);
  try {
    const j = await peiZhiCun(p);
    if (j && j.ok) return { ok: true, fuWu: true };
    return { ok: true, fuWu: false, xinxi: (j && j.xinxi) || '服务端未保存' };
  } catch (e) {
    return { ok: true, fuWu: false, xinxi: (e && e.message) || '服务端未连接' };
  }
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
