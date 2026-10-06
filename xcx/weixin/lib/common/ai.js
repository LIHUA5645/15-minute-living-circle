// 【自动生成】由 scripts/tongbu-xcx.mjs 从真源同步而来，请改真源后重跑同步
// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// AI 诊断：调自有服务端 /airelay（服务端代持大模型密钥，端上零密钥）。
// 提示词与 Web 端 src/core/zhenduan.js 保持一致的口吻与结构，只是把要点摘要换成小程序侧的紧凑版本。
// 小程序不支持流式响应，这里一次性拿完整文本。
import { plat } from './plat.js';
import { fuWu } from './peizhi.js';
import { FENLEI_MING } from '../core/types.js';

// 报告 → 大模型要点摘要（只给结论所需的关键数字，别把原始数据整包丢过去）
export function yaoDian(report) {
  const pf = (report && report.fenleiPingfen) || [];
  const pai = pf.slice().sort((a, b) => Number(b.score) - Number(a.score));
  const you = pai[0] || null;
  const duan = pai.slice(-2).reverse();
  const ming = f => FENLEI_MING[f] || f;
  return {
    综合得分: report ? report.total : 0,
    等级: report ? report.dengji : '',
    维度得分: pf.map(f => ({ 维度: ming(f.fenlei), 得分: f.score, 圈内设施数: f.shuliang })),
    优势维度: you ? `${ming(you.fenlei)}（${you.score} 分）` : '',
    短板维度: duan.map(d => `${ming(d.fenlei)}（${d.score} 分）`).join('、'),
    盲区: ((report && report.mangquList) || []).slice(0, 5).map(m => ({
      id: m.id,
      等级: m.level === 'red' ? '重度' : '轻度',
      缺口: (m.quekou || []).join('/'),
      建议补建坐标: m.buJianDian ? `${m.buJianDian.lng.toFixed(5)},${m.buJianDian.lat.toFixed(5)}` : '',
      预估覆盖人口: m.yujiFugaiRenkou || ''
    })),
    告警: ((report && report.warnings) || []).slice(0, 3)
  };
}

export async function aiZhenDuan(report) {
  const y = yaoDian(report);
  const tiShi = [
    '以下是某社区「15 分钟生活圈」体检结果（JSON）：',
    JSON.stringify(y),
    '请以社区规划专家口吻写一段 250 字以内的中文诊断，结构：①总评一句话；②优势维度；③短板维度；④盲区与影响人口；⑤补建建议与预期改善。不要罗列原始数据，直接给结论与建议。'
  ].join('\n');

  const r = await plat.request({
    url: fuWu('/airelay'),
    method: 'POST',
    timeout: 90000,
    data: {
      // url / 密钥都由服务端按管理员配置补上（这里只给对话内容与采样参数）
      tou: {},
      body: {
        temperature: 0.6,
        messages: [
          { role: 'system', content: '你是资深的社区规划专家，擅长把数据转译为给街道办与居民看的诊断结论。' },
          { role: 'user', content: tiShi }
        ]
      }
    }
  });
  let j = r.data;
  if (typeof j === 'string') {
    try {
      j = JSON.parse(j);
    } catch {
      throw new Error('AI 返回非 JSON：' + String(j).slice(0, 60));
    }
  }
  if (j && j.ok === false) throw new Error(j.xinxi || 'AI 中转失败');
  const c = j && j.choices && j.choices[0];
  const wen = (c && c.message && c.message.content) || (c && c.text) || (j && (j.output_text || j.content)) || '';
  if (!wen) throw new Error('AI 没有返回内容：' + JSON.stringify(j).slice(0, 120));
  return String(wen).trim();
}
