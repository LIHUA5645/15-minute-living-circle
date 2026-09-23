// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，22
// AI 智能选点导航：用户说「去购物」「去看病」，从本轮体检检索到的真实设施里选最佳一个并给出理由。
// 双路：①管理员已配置大模型 → 经 /airelay 中转让模型从候选清单里选（结构化 JSON 输出）；
//      ②未配置 / 调用失败 → 本地规则兜底：意图关键词定类别，直线距离最近且可信度较高者优先。
import { liangDianJuLi } from './geo/jichu.js';
import { duiHuaJieKouZhi } from './zhenduan.js';
import { fuWuUrl } from './fuwuDiZhi.js';

// 意图关键词 → 评分维度（本地规则用）
const YI_TU = [
  { f: 'gouwu', ci: ['购物', '买菜', '超市', '商场', '菜场', '市场', '买东西'] },
  { f: 'yiliao', ci: ['看病', '买药', '医疗', '医院', '药店', '诊所', '拿药'] },
  { f: 'jiaoyu', ci: ['上学', '教育', '学校', '幼儿园', '接孩子'] },
  { f: 'yanglao', ci: ['养老', '老人', '照料', '敬老'] },
  { f: 'jiaotong', ci: ['坐车', '乘车', '地铁', '公交', '停车', '通勤'] },
  { f: 'xiuxian', ci: ['休闲', '锻炼', '健身', '公园', '散步', '玩', '遛弯'] }
];

// 导航意图判定：聊天输入里出现「类别词 + 选点动作」才算导航（如「帮我找最近的医院」「去购物」），
// 纯疑问句（看病方便吗？散步适合吗？）不算，仍走在线问答
export function shiDaoHangYiTu(wen) {
  const s = String(wen || '').trim();
  if (!s) return false;
  // 句尾是疑问语气的不导航（但「最近的医院在哪 / 怎么去」这类路线问句仍算）
  if (/[吗呢吧？?]\s*$/.test(s) && !/怎么去|怎么走|在哪|路线/.test(s)) return false;
  const leiCi = YI_TU.flatMap(y => y.ci);
  const youDongZuo = /去|找|导航|带我去|送我去|最近的?|哪家|哪个|推荐/;
  return leiCi.some(c => s.includes(c)) && youDongZuo.test(s);
}

// 本地规则选点：意图定类别 → 距离与可信度加权排序
function benDiXuanDian(wen, houXuan, zhongXin) {
  const yi = YI_TU.find(y => y.ci.some(c => wen.includes(c)));
  let chi = yi ? houXuan.filter(p => p.fenlei === yi.f) : [];
  let tiShi = '';
  if (!chi.length) {
    // 没命中意图词：尝试按名称包含用户输入的词匹配
    const ci = wen.split(/[，,、。！？\s]+/).filter(w => w.length >= 2);
    chi = houXuan.filter(p => ci.some(w => (p.name || '').includes(w)));
    tiShi = '按名称匹配选择';
  }
  if (!chi.length) return null;
  const pai = [...chi].sort(
    (a, b) =>
      liangDianJuLi(zhongXin, a) +
      (1 - (a.zixin || 0.5)) * 400 -
      (liangDianJuLi(zhongXin, b) + (1 - (b.zixin || 0.5)) * 400)
  );
  return {
    poi: pai[0],
    liYou: yi ? `${yi.f}类设施中直线距离最近且可信度较高者` : tiShi || '距离最近者'
  };
}

// 主入口：wen 用户需求语句；report 本轮体检报告；zhongXin 当前中心点；ai 管理员 AI 配置
export async function aiXuanDian(wen, report, zhongXin, ai) {
  const houXuan = [];
  for (const [f, list] of Object.entries(report?.poiSet?.fenleiSet || {})) {
    for (const p of list) houXuan.push({ ...p, fenlei: f });
  }
  if (!houXuan.length) return { ok: false, xinxi: '没有可选设施，请先完成一轮体检' };

  // ① 大模型路：候选清单（限 120 条防超长）+ 用户需求 → 结构化 JSON 选择
  if (ai && ai.qiYong && ai.apiDiZhi && ai.miYao) {
    try {
      const mingDan = houXuan.slice(0, 120).map((p, i) => ({
        i,
        ming: p.name,
        lei: p.fenlei,
        mi: Math.round(liangDianJuLi(zhongXin, p))
      }));
      const tiShi = [
        '候选设施列表(JSON)：',
        JSON.stringify(mingDan),
        `用户需求：「${wen}」。请从候选中选出最符合需求的 1 个设施（序号 i）。`,
        '只输出 JSON，格式：{"i": 序号, "liYou": "20字以内选择理由"}，不要输出其他内容。'
      ].join('\n');
      const r = await fetch(fuWuUrl('/airelay'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: duiHuaJieKouZhi(ai.apiDiZhi),
          tou: { Authorization: 'Bearer ' + ai.miYao },
          body: {
            model: ai.moXing,
            temperature: 0.2,
            messages: [
              { role: 'system', content: '你是社区生活圈导航助手，只输出 JSON，不输出多余文字。' },
              { role: 'user', content: tiShi }
            ]
          }
        })
      });
      const j = await r.json();
      const hui = j.choices?.[0]?.message?.content || '';
      const m = hui.match(/\{[\s\S]*\}/);
      const x = m && JSON.parse(m[0]);
      const poi = houXuan[Number(x && x.i)];
      if (poi) return { ok: true, poi, liYou: (x && x.liYou) || '大模型推荐', laiYuan: 'ai' };
    } catch {
      /* 大模型失败 → 静默回退本地规则 */
    }
  }

  // ② 本地规则路
  const ben = benDiXuanDian(wen, houXuan, zhongXin);
  if (!ben) return { ok: false, xinxi: '没听懂要去哪，试试「去购物」「去看病」「去锻炼」' };
  return {
    ok: true,
    poi: ben.poi,
    liYou: ben.liYou + (ai && ai.qiYong ? '（大模型不可用，本地规则兜底）' : '（本地规则）'),
    laiYuan: 'bendi'
  };
}
