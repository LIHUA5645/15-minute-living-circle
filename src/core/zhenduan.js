// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，22
// AI 诊断叙述生成（双路）：
//   1) 大模型路：管理员在面板配置接口地址/模型/密钥（OpenAI Chat Completions 兼容格式），
//      经服务端 /airelay 中转调用（解决 CORS，密钥由请求携带不落后端日志）
//   2) 本地规则路：无 AI 配置或调用失败时自动回退，基于评分与盲区数据模板生成，演示零风险
import { fuWuUrl } from './fuwuDiZhi.js';

const V = 80; // 米/分钟（用于把秒换算成分钟描述）

// 接口地址规整：兼容「完整 Chat Completions URL」与「.../v1 基础地址」等填法；
// 火山方舟的 /responses（Responses 端点）不兼容 Chat Completions 请求体，自动纠正为 /chat/completions
export function duiHuaJieKouZhi(apiDiZhi) {
  const u = String(apiDiZhi || '')
    .trim()
    .replace(/\/+$/, '');
  if (/\/responses\/chat\/completions$/i.test(u))
    return u.replace(/\/responses\/chat\/completions$/i, '/chat/completions');
  if (/\/chat\/completions$/i.test(u)) return u;
  if (/\/responses$/i.test(u)) return u.replace(/\/responses$/i, '/chat/completions');
  if (/\/completions$/i.test(u)) return u.replace(/\/completions$/i, '/chat/completions');
  if (/\/v\d+$/i.test(u)) return u + '/chat/completions';
  return u + '/chat/completions';
}

// 提取报告要点（两条路共用）
function yaoDian(report) {
  const fps = report.fenleiPingfen || [];
  const mq = report.mangquList || [];
  const renKou = mq.reduce((s, m) => s + (m.yujiFugaiRenkou || 0), 0);
  return {
    zongFen: report.total,
    dengJi: report.dengji,
    weiDu: fps.map(x => ({ ming: x.ming || x.fenlei, fen: x.score, shu: x.shuliang })),
    mangQu: mq.map(m => ({
      id: m.id,
      ji: m.level === 'red' ? '重度' : '轻度',
      quekou: (m.quekou || []).join('、'),
      mianJiWan: Math.round((m.areaM2 || 0) / 10000),
      renKou: m.yujiFugaiRenkou || 0,
      buJian: m.buJianDian ? `${m.buJianDian.lng.toFixed(5)},${m.buJianDian.lat.toFixed(5)}` : ''
    })),
    renKou
  };
}

// —— 本地规则版诊断 ——
export function benDiZhenDuan(report) {
  const y = yaoDian(report);
  const paiXu = [...y.weiDu].sort((a, b) => b.fen - a.fen);
  const you = paiXu[0];
  const duan = paiXu.slice(-2).reverse();
  const miaoshu = fen =>
    fen >= 85 ? '充裕' : fen >= 70 ? '基本满足' : fen >= 55 ? '偏紧' : '明显不足';
  const duanMiao = fen => (fen >= 70 ? '基本满足' : fen >= 55 ? '偏紧' : '明显不足');
  const mangJu = y.mangQu.length
    ? `识别出 ${y.mangQu.length} 个服务盲区（${y.mangQu.filter(m => m.ji === '重度').length} 个重度），影响约 ${y.renKou} 名居民，缺口集中在${[...new Set(y.mangQu.flatMap(m => (m.quekou || '').split('、')))].join('、')}。`
    : '未识别明显服务盲区，设施覆盖均衡。';
  const buJian = y.mangQu
    .filter(m => m.buJian)
    .slice(0, 3)
    .map(m => `盲区${m.id}建议在 (${m.buJian}) 补建${m.quekou}，覆盖约 ${m.renKou} 人`)
    .join('；');
  return [
    `综合得分 ${y.zongFen} 分（${y.dengJi} 级），该社区 15 分钟生活圈服务水平${y.zongFen >= 70 ? '总体达标' : '存在明显短板'}。`,
    `${you ? `优势维度为${you.ming}（${you.fen} 分，圈内 ${you.shu} 处设施，供给${miaoshu(you.fen)}）` : ''}`,
    duan.length
      ? `短板集中在${duan.map(d => `${d.ming}（${d.fen} 分，${duanMiao(d.fen)}）`).join('与')}。`
      : '',
    mangJu,
    buJian ? `补建建议：${buJian}。` : '',
    '以上结论基于真实路网步行可达性计算，可在管理员面板调整阈值后重新体检复核。'
  ]
    .filter(Boolean)
    .join('');
}

// —— 大模型版诊断 ——
async function yuanChengZhenDuan(report, ai) {
  const y = yaoDian(report);
  const tiShi = [
    `以下是某社区「15 分钟生活圈」体检结果（JSON）：`,
    JSON.stringify(y),
    `请以社区规划专家口吻写一段 250 字以内的中文诊断，结构：①总评一句话；②优势维度；③短板维度；④盲区与影响人口；⑤补建建议与预期改善。不要罗列原始数据，直接给结论与建议。`
  ].join('\n');
  const r = await fetch(fuWuUrl('/airelay'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: duiHuaJieKouZhi(ai.apiDiZhi),
      tou: { Authorization: 'Bearer ' + ai.miYao },
      body: {
        model: ai.moXing,
        temperature: 0.6,
        messages: [
          {
            role: 'system',
            content: '你是资深的社区规划专家，擅长把数据转译为给街道办与居民看的诊断结论。'
          },
          { role: 'user', content: tiShi }
        ]
      }
    })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.xinxi || `接口返回 ${r.status}`);
  const wen = j.choices?.[0]?.message?.content || j.content?.[0]?.text || '';
  if (!wen) throw new Error('接口未返回文本');
  return wen.trim();
}

// —— 主入口：优先 AI，失败回退本地 ——
export async function shengChengZhenDuan(report, peiZhi) {
  const ai = peiZhi && peiZhi.ai;
  if (ai && ai.qiYong && ai.apiDiZhi && ai.miYao) {
    try {
      return { wen: await yuanChengZhenDuan(report, ai), laiYuan: 'ai' };
    } catch {
      return { wen: benDiZhenDuan(report), laiYuan: 'bendi', jiangJi: true };
    }
  }
  return { wen: benDiZhenDuan(report), laiYuan: 'bendi' };
}
