// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，22
// AI 在线问答：用户与管理员配置的大模型自由聊天，自动附带本轮体检摘要作为上下文，
// 模型能结合当前社区体检结果回答「看病方便吗」「盲区是什么意思」等问题。
// 经 /airelay 中转调用（与 AI 诊断 / AI 导航同路），密钥不落库。
import { duiHuaJieKouZhi } from './zhenduan.js';

// 主入口：lishi 历史对话（[{role:'user'|'ai', wen}]）；wen 本条提问；report 本轮体检报告；ai 管理员 AI 配置
export async function aiLiaoTian(lishi, wen, report, ai) {
  if (!(ai && ai.qiYong && ai.apiDiZhi && ai.miYao)) {
    return { ok: false, xinxi: '管理员尚未启用大模型，请先在管理员控制台「AI 设置」里配置接口地址与密钥。' };
  }

  // 体检摘要塞进系统提示，让模型「看得见」本轮结果
  const zhaiYao = report
    ? `本轮体检结果：综合得分 ${report.total} 分（${report.dengji} 级），体检中心坐标 ${Number(report.zhongXin && report.zhongXin.lng).toFixed(4)},${Number(report.zhongXin && report.zhongXin.lat).toFixed(4)}，服务盲区 ${report.mangquList ? report.mangquList.length : 0} 个。`
    : '用户尚未完成体检。';

  const xiaoXi = [
    {
      role: 'system',
      content:
        '你是「15 分钟生活圈智能体检助手」的在线问答助手，用简体中文简洁、口语化地回答，' +
        '话题围绕社区生活圈、设施配套、体检报告解读。回答控制在 200 字以内。当前上下文：' +
        zhaiYao,
    },
    // 只带最近 8 条，防上下文超长
    ...lishi.slice(-8).map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.wen,
    })),
    { role: 'user', content: wen },
  ];

  try {
    const r = await fetch('/airelay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: duiHuaJieKouZhi(ai.apiDiZhi),
        tou: { Authorization: 'Bearer ' + ai.miYao },
        body: {
          model: ai.moXing,
          temperature: 0.5,
          messages: xiaoXi,
        },
      }),
    });
    const j = await r.json();
    const hui = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    if (!hui) return { ok: false, xinxi: '模型没有返回内容，请稍后再试。' };
    return { ok: true, hui: hui.trim() };
  } catch {
    return { ok: false, xinxi: '调用大模型失败，请检查网络与管理员 AI 配置。' };
  }
}
