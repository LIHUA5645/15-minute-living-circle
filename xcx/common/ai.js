// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，10，06
// AI 能力（与网页端同源，提示词逐字一致）：
//   ① 诊断叙述：大模型路 + 本地规则路（无 AI 配置或调用失败自动回退）—— src/core/zhenduan.js
//   ② 在线问答：体检上下文注入 + 「【导航】地名」约定 —— src/core/aiLiaoTian.js
//   ③ 智能选点导航：从本轮真实设施里选一个并给理由，本地规则兜底 —— src/core/aiDaohang.js
// 与网页端的差别只有传输层：fetch → plat.request（小程序端不受 CORS 限制，所以两条路都保留，
// 「直连服务商」在小程序里比浏览器更可能成功）。
import { plat } from './plat.js';
import { fuWu, duFuWuDiZhi, tanCeFuWu } from './peizhi.js';
import { liangDianJuLi } from '../core/geo/jichu.js';
import { aiPeiHaoLe, fuWuDaiFa, MOREN_PEI_ZHI } from '../core/types.js';

const BU_SU = 80; // 米/分钟（把直线距离折算成步行分钟）

/* ───────────── AI 配置与用户偏好 ───────────── */

let huanCunPeiZhi = null;
let zuiHouCuo = ''; // 最近一次读配置失败的原因（''=没失败）：用来把「读不到」和「管理员没配」分开说

// 从服务端读管理员配置（与网页端 laPeiZhiFuWu 等价：服务端会把密钥抹成 miYaoYiCun 标记）
export async function duAiPeiZhi(qiangZhi) {
  if (huanCunPeiZhi && !qiangZhi) return huanCunPeiZhi;
  const jiu = duFuWuDiZhi();
  const jie = await duYiCi();
  if (jie) return (huanCunPeiZhi = jie);
  // 读不到 → 自动探一遍候选地址（服务端可能刚起来，或地址变了：开发者工具 ↔ 真机、
  // 手机热点换网段等）。探到别的可用地址就再读一次，用户只管起服务端，不用手改地址
  const xin = await tanCeFuWu([jiu]);
  if (xin) {
    const jie2 = await duYiCi();
    if (jie2) return (huanCunPeiZhi = jie2);
  }
  // 仍读不到就回默认值（按「未接入大模型」处理，走本地规则），但**绝不写进缓存**：
  // 老写法把默认值也缓存下来，一次网络抖动就会让整个会话都判成「管理员没配」，
  // 而且已打开的页面不会重新读——表现就是「表头写着已接入大模型、回复却说没配置」的自相矛盾。
  // 不缓存，下一次调用就会自动重试
  return MOREN_PEI_ZHI.ai;
}

// 读一次服务端配置：拿到返回 ai 段；拿不到返回 null 并记下原因（供提示文案用）
async function duYiCi() {
  try {
    const r = await plat.request({ url: fuWu('/api/peiZhi/du'), method: 'GET', timeout: 15000 });
    const j = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
    const ai = (j && j.ok !== false && j.peiZhi && j.peiZhi.ai) || null;
    if (ai) {
      zuiHouCuo = '';
      return ai;
    }
    jiCuo('服务端返回的配置里没有 AI 段（/api/peiZhi/du 拿到的是空配置）');
  } catch (e) {
    jiCuo((e && e.message) || '网络请求失败');
  }
  return null;
}

function jiCuo(wen) {
  zuiHouCuo = `${wen}（服务端地址 ${duFuWuDiZhi()}）`;
}

// 最近一次读配置失败的原因；'' = 读到了（或还没读过）
export function aiPeiZhiCuo() {
  return zuiHouCuo;
}

// 生成方式偏好：'' 跟随管理员配置 / 'ai' 强行走大模型 / 'bendi' 强行走本地规则
// （对应网页端 localStorage 的 sq_zhenduan_she）
const SHE_KEY = 'sq_zhenduan_she';

export function duShengChengFangShi() {
  const v = plat.getStorage(SHE_KEY);
  return v === 'ai' || v === 'bendi' ? v : '';
}

export function cunShengChengFangShi(v) {
  plat.setStorage(SHE_KEY, v === 'ai' || v === 'bendi' ? v : '');
}

// 接口地址规整：与网页端完全一致（有人填完整 URL，有人只填到 /v1，火山方舟的 /responses 要纠正）
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

/* ───────────── 统一请求：找模型要一段文本 ───────────── */

// 两条路：① 自有服务端 /airelay（服务端代持密钥、可回退 curl）② 直连服务商（本地填了密钥时）
async function yaoYiDuan(url, ti, ai, ming, cuoLieBiao) {
  const tou = ai.miYao && !fuWuDaiFa(ai) ? { Authorization: 'Bearer ' + ai.miYao } : {};
  const r = await plat.request({ url, method: 'POST', data: ti, header: tou, timeout: 90000 });
  let j = r.data;
  if (typeof j === 'string') {
    try {
      j = JSON.parse(j);
    } catch {
      cuoLieBiao.push(`${ming}：接口返回了网页而非 JSON（HTTP ${r.statusCode}）`);
      return null;
    }
  }
  if (r.statusCode < 200 || r.statusCode >= 300) {
    const shang =
      (j && j.error && (j.error.message || j.error.code)) ||
      (j && j.xinxi) ||
      (j && j.message) ||
      `HTTP ${r.statusCode}`;
    cuoLieBiao.push(`${ming}：服务商返回错误：${shang}`);
    // 密钥/模型/余额类错误换路也没用
    if ([401, 402, 404].includes(r.statusCode)) return undefined;
    return null;
  }
  const c = j && j.choices && j.choices[0] && j.choices[0].message;
  const wen = (c && c.content) || (j && j.content && j.content[0] && j.content[0].text) || '';
  if (!wen) {
    cuoLieBiao.push(`${ming}：模型没有返回内容`);
    return null;
  }
  return String(wen).trim();
}

// 依次尝试候选通道；返回 null 表示都失败（原因在 cuoLieBiao 里）
async function wenMoXing(ai, moXingTi) {
  const changShi = [
    {
      ming: '服务端中转',
      url: fuWu('/airelay'),
      ti: {
        url: duiHuaJieKouZhi(ai.apiDiZhi),
        // 只有「本地填了密钥、且服务端还没存过」才自己带，服务端存过就让它代发
        ...(ai.miYao && !fuWuDaiFa(ai) ? { tou: { Authorization: 'Bearer ' + ai.miYao } } : {}),
        body: moXingTi
      }
    }
  ];
  // 小程序端直连不受 CORS 限制，本地有密钥就再留一条直连兜底
  if (ai.miYao && !fuWuDaiFa(ai)) changShi.push({ ming: '直连服务商', url: duiHuaJieKouZhi(ai.apiDiZhi), ti: moXingTi });

  const cuoLieBiao = [];
  for (const lu of changShi) {
    try {
      const hui = await yaoYiDuan(lu.url, lu.ti, ai, lu.ming, cuoLieBiao);
      if (hui === undefined) break; // 硬错误（401/402/404）换路无意义
      if (hui) return { hui, cuoLieBiao };
    } catch (e) {
      cuoLieBiao.push(`${lu.ming}：${(e && e.message) || '网络请求失败'}`);
    }
  }
  return { hui: '', cuoLieBiao };
}

/* ───────────── ① 诊断叙述（双路） ───────────── */

// 提取报告要点（两条路共用，与网页端同结构）
export function yaoDian(report) {
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

// 本地规则版诊断（文案与网页端一字不差，零配置零网络）
export function benDiZhenDuan(report) {
  const y = yaoDian(report);
  const paiXu = [...y.weiDu].sort((a, b) => b.fen - a.fen);
  const you = paiXu[0];
  const duan = paiXu.slice(-2).reverse();
  const miaoshu = fen => (fen >= 85 ? '充裕' : fen >= 70 ? '基本满足' : fen >= 55 ? '偏紧' : '明显不足');
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
    duan.length ? `短板集中在${duan.map(d => `${d.ming}（${d.fen} 分，${duanMiao(d.fen)}）`).join('与')}。` : '',
    mangJu,
    buJian ? `补建建议：${buJian}。` : '',
    '以上结论基于真实路网步行可达性计算，可在管理员面板调整阈值后重新体检复核。'
  ]
    .filter(Boolean)
    .join('');
}

// 大模型版诊断
async function yuanChengZhenDuan(report, ai) {
  const y = yaoDian(report);
  const tiShi = [
    '以下是某社区「15 分钟生活圈」体检结果（JSON）：',
    JSON.stringify(y),
    '请以社区规划专家口吻写一段 250 字以内的中文诊断，结构：①总评一句话；②优势维度；③短板维度；④盲区与影响人口；⑤补建建议与预期改善。不要罗列原始数据，直接给结论与建议。'
  ].join('\n');
  const { hui, cuoLieBiao } = await wenMoXing(ai, {
    model: ai.moXing,
    temperature: 0.6,
    messages: [
      { role: 'system', content: '你是资深的社区规划专家，擅长把数据转译为给街道办与居民看的诊断结论。' },
      { role: 'user', content: tiShi }
    ]
  });
  if (!hui) throw new Error(cuoLieBiao.join('；') || '接口未返回文本');
  return hui;
}

/**
 * 生成诊断（与网页端 shengChengZhenDuan 行为一致）
 * @param {object} report 体检报告
 * @param {object} tiJianPeiZhi 管理员配置（含 ai 段）
 * @param {''|'ai'|'bendi'} sheZhi 用户在“生成方式”里的选择
 * @returns {{wen:string, laiYuan:'ai'|'bendi', jiangJi?:boolean, cuoYin?:string}}
 */
export async function shengChengZhenDuan(report, tiJianPeiZhi, sheZhi) {
  const ai = tiJianPeiZhi && tiJianPeiZhi.ai;
  const aiKeYong = aiPeiHaoLe(ai);
  const zouAi = sheZhi === 'ai' ? true : sheZhi === 'bendi' ? false : !!(ai && ai.qiYong);
  if (zouAi && aiKeYong) {
    try {
      return { wen: await yuanChengZhenDuan(report, ai), laiYuan: 'ai' };
    } catch (e) {
      // 把失败原因带回去：界面上要如实说明「为什么没用大模型」
      return {
        wen: benDiZhenDuan(report),
        laiYuan: 'bendi',
        jiangJi: true,
        cuoYin: (e && e.message) || '调用失败'
      };
    }
  }
  return { wen: benDiZhenDuan(report), laiYuan: 'bendi' };
}

/* ───────────── ② 在线问答（AI 回复） ───────────── */

/**
 * AI 用不了的原因说明（''=可用）。页面与问答共用同一套话术，
 * 把三种情形分开：读不到服务器配置 / 管理员没配 / 配了但开关没开或没填模型——
 * 三者对用户的下一步动作完全不同（查服务端 / 去管理员面板配 / 去管理员面板开开关），
 * 早期一律说成「管理员没配」，服务端没起时用户会白跑一趟管理员面板
 */
export function aiBuKeYongShuoMing(ai) {
  if (!aiPeiHaoLe(ai)) {
    if (zuiHouCuo)
      return (
        '读不到服务器上的 AI 配置：' +
        zuiHouCuo +
        '。请确认服务端已启动、地址能从当前设备访问（手机预览还要换成 HTTPS 域名并在小程序后台加白名单），然后重试；也能在「我的」页改服务端地址。'
      );
    return '管理员尚未配置大模型的接口地址与密钥，请在管理员控制台「AI 设置」里填写并点「保存配置」。';
  }
  if (!ai.qiYong)
    return '大模型已配置，但「启用」开关还没打开——请到管理员控制台「AI 设置」，把「AI 诊断服务」右上角的开关切到「已启用」，再点「保存配置」。';
  if (!ai.moXing)
    return '还没填写模型名称——请在管理员控制台「AI 设置」里点「自动获取」选择模型，或手填模型 ID 后保存。';
  return '';
}

/**
 * 在线问答：lishi 历史（[{role:'user'|'ai', wen}]）；wen 本次提问；report 本轮报告；
 * ai 管理员 AI 配置；zhongXin 当前中心 {lng,lat,ming}
 * @returns {{ok:true, hui:string} | {ok:false, xinxi:string}}
 */
export async function aiLiaoTian(lishi, wen, report, ai, zhongXin) {
  // 「AI 为什么用不了」只有这一处判据（页面也调它），避免同类提示出现两种说法
  const buKe = aiBuKeYongShuoMing(ai);
  if (buKe) return { ok: false, xinxi: buKe };

  // 体检摘要塞进系统提示；报告中心与当前中心相距超过 500 米就明确告知「报告已过期」
  const baoZuo = report && report.zhongXin;
  const baoMiao =
    report &&
    `本轮体检结果：综合得分 ${report.total} 分（${report.dengji} 级），体检中心坐标 ${Number(baoZuo && baoZuo.lng).toFixed(4)},${Number(baoZuo && baoZuo.lat).toFixed(4)}，服务盲区 ${report.mangquList ? report.mangquList.length : 0} 个。`;
  let zhaiYao;
  if (report && zhongXin && baoZuo && Number.isFinite(baoZuo.lng)) {
    const ju = liangDianJuLi(zhongXin, baoZuo);
    if (ju > 500) {
      zhaiYao =
        baoMiao +
        ` 注意：该报告是旧位置的数据；用户当前地图中心在「${zhongXin.ming || '新位置'}」（坐标 ${zhongXin.lng.toFixed(4)},${zhongXin.lat.toFixed(4)}），距报告位置约 ${Math.round(ju)} 米。回答请以用户当前所在位置为准，并提醒旧报告已过期、建议重新体检。`;
    } else {
      zhaiYao = baoMiao + ' 用户当前就在该体检中心附近。';
    }
  } else if (report) {
    zhaiYao = baoMiao;
  } else if (zhongXin) {
    zhaiYao = `用户尚未完成体检。当前地图中心在「${zhongXin.ming || '未命名位置'}」（坐标 ${zhongXin.lng.toFixed(4)},${zhongXin.lat.toFixed(4)}）。`;
  } else {
    zhaiYao = '用户尚未完成体检。';
  }

  // 设施清单（去重，最多 40 个）
  let sheShiMiao = '';
  if (report && report.poiSet && report.poiSet.fenleiSet) {
    const ming = [];
    Object.values(report.poiSet.fenleiSet).forEach(lie =>
      (lie || []).forEach(p => {
        if (p && p.name && !ming.includes(p.name) && ming.length < 40) ming.push(p.name);
      })
    );
    if (ming.length) sheShiMiao = `本轮体检检索到的设施（部分清单）：${ming.join('、')}。`;
  }

  // 设施明细：每类数量 + 最近 2 个的直线距离与估算步行时间
  let mingXiMiao = '';
  if (report && report.poiSet && report.poiSet.fenleiSet && baoZuo && Number.isFinite(baoZuo.lng)) {
    const LEI_MING = { yiliao: '医疗', jiaoyu: '教育', gouwu: '购物', yanglao: '养老', jiaotong: '交通', xiuxian: '休闲' };
    const hang = [];
    Object.entries(report.poiSet.fenleiSet).forEach(([lei, lie]) => {
      const youXiao = (lie || []).filter(p => p && p.name && Number.isFinite(p.lng) && Number.isFinite(p.lat));
      if (!youXiao.length) {
        hang.push(`${LEI_MING[lei] || lei} 0 个`);
        return;
      }
      const jin = youXiao
        .map(p => ({ ming: p.name, ju: liangDianJuLi(baoZuo, p) }))
        .sort((a, b) => a.ju - b.ju)
        .slice(0, 2)
        .map(j => `${j.ming}（直线约 ${Math.round(j.ju)} 米，步行约 ${Math.max(1, Math.round(j.ju / BU_SU))} 分钟）`)
        .join('、');
      hang.push(`${LEI_MING[lei] || lei} ${youXiao.length} 个，最近：${jin}`);
    });
    if (hang.length) mingXiMiao = ` 设施明细（直线距离，步行按 80 米/分钟估算）：${hang.join('；')}。`;
  }

  const xiaoXi = [
    {
      role: 'system',
      content:
        '你是「15 分钟生活圈智能体检助手」的在线问答助手，用简体中文简洁、口语化地回答，' +
        '话题围绕社区生活圈、设施配套、体检报告解读。回答控制在 200 字以内。当前上下文：' +
        zhaiYao +
        (sheShiMiao ? ' ' + sheShiMiao : '') +
        mingXiMiao +
        ' —— 你需要自己语义判断用户这句话是想导航去某地，还是在提问：' +
        '①若用户想导航/前往某个地方（例如「我想去广西博物馆」「带我去最近的医院」「导航到人民公园」「送我去超市」），' +
        '无论目的地是否在设施清单里，都只回复一行：【导航】目的地名称（剥掉客套词后的可检索地名，如「【导航】广西博物馆」），不要输出任何其他文字；' +
        '②其余情况正常回答（此时绝不要出现【导航】字样）。' +
        '重要：你本身就是地图体检工具，回答「看病/买菜/上学方便吗」这类问题时，必须直接依据上面注入的设施明细下结论' +
        '（例如「步行 15 分钟内有 2 个医疗点（最近的 XX 约 X 分钟），看病算方便」），' +
        '严禁回复「打开手机地图搜一搜」「用高德/百度地图查一下」这类让用户自己去别的地图验证的话；' +
        '若某类设施数量为 0 或明细缺失，就如实说体检范围内没检索到该类设施，并建议重新体检或换个位置。' +
        '与本工具后台有关的问题（AI 接口地址/密钥/模型名、管理员控制台、服务器是否启动、部署运维等）不要展开，' +
        '只回一句「这属于后台配置，请让管理员看「AI 设置」，或查项目文档」，并把话题拉回社区生活圈体检；' +
        '不要编造本工具的设置步骤。' +
        '语义判断由你完成，不要拘泥于具体关键词。'
    },
    // 只带最近 8 条，防上下文超长。
    // 注意：role='cuo' 是「程序给的提示」（读不到配置、没检索到设施等），不是模型说过的话——
    // 早期把这类也当 assistant 喂回去，模型会照着学舌，张口就是「请到管理员控制台填接口地址和密钥」，
    // 看着像 AI 答非所问。程序提示一律不进上下文
    ...(lishi || [])
      .filter(m => m.role === 'user' || m.role === 'ai')
      .slice(-8)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.wen })),
    { role: 'user', content: wen }
  ];

  const { hui, cuoLieBiao } = await wenMoXing(ai, { model: ai.moXing, temperature: 0.5, messages: xiaoXi });
  if (hui) return { ok: true, hui };
  return {
    ok: false,
    xinxi:
      '调用大模型失败，两条路都试过了：' +
      cuoLieBiao.join('；') +
      '。若都提示返回网页或请求被拒，说明该服务商不放行小程序域名，建议更换服务商接口地址。'
  };
}

/* ───────────── ③ 智能选点导航 ───────────── */

// 意图关键词 → 评分维度（本地规则用）
const YI_TU = [
  { f: 'gouwu', ci: ['购物', '买菜', '超市', '商场', '菜场', '市场', '买东西'] },
  { f: 'yiliao', ci: ['看病', '买药', '医疗', '医院', '药店', '诊所', '拿药'] },
  { f: 'jiaoyu', ci: ['上学', '教育', '学校', '幼儿园', '接孩子'] },
  { f: 'yanglao', ci: ['养老', '老人', '照料', '敬老'] },
  { f: 'jiaotong', ci: ['坐车', '乘车', '地铁', '公交', '停车', '通勤'] },
  { f: 'xiuxian', ci: ['休闲', '锻炼', '健身', '公园', '散步', '玩', '遛弯'] }
];

// 导航意图判定（与网页端同规则）
export function shiDaoHangYiTu(wen) {
  const s = String(wen || '').trim();
  if (!s) return false;
  if (/[吗呢？?]\s*$/.test(s) && !/怎么去|怎么走|在哪|路线/.test(s)) return false;
  const leiCi = YI_TU.flatMap(y => y.ci);
  const youDongZuo = /去|找|导航|带我去|送我去|最近的?|哪家|哪个|推荐/;
  if (leiCi.some(c => s.includes(c)) && youDongZuo.test(s)) return true;
  return /导航|我想去|我想要去|我要去|我想到|带我|送我去|开车去|骑车去|坐车去|想去/.test(s);
}

// 抽取目的地名称
export function tiQuMuDiDi(wen) {
  let s = String(wen || '').trim();
  s = s.replace(/[。！!？?，,～~\s]+$/, '');
  s = s.replace(/(帮我|麻烦|请你|我想|我要|我打算|我准备|我想着|打算|准备)/g, '');
  s = s.replace(
    /(导航到|导航去|导航|带我去|带我去到|带|送我去|送我去到|送|开车去|骑车去|坐公交去|坐地铁去|坐车去|打车去|步行去|去到|去|到|找|搜|搜索|查)/g,
    ''
  );
  return s.trim();
}

// 本地规则选点：意图定类别 → 距离与可信度加权排序
function benDiXuanDian(wen, houXuan, zhongXin) {
  const yi = YI_TU.find(y => y.ci.some(c => wen.includes(c)));
  let chi = yi ? houXuan.filter(p => p.fenlei === yi.f) : [];
  let tiShi = '';
  if (!chi.length) {
    const ci = String(wen).split(/[，,、。！!？?\s]+/).filter(w => w.length >= 2);
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
  return { poi: pai[0], liYou: yi ? `${yi.f}类设施中直线距离最近且可信度较高者` : tiShi || '距离最近者' };
}

/** 从本轮体检的真实设施里选一个目的地；返回 {ok:true, poi, liYou, laiYuan} 或 {ok:false, xinxi} */
export async function aiXuanDian(wen, report, zhongXin, ai) {
  const houXuan = [];
  for (const [f, list] of Object.entries((report && report.poiSet && report.poiSet.fenleiSet) || {})) {
    for (const p of list || []) houXuan.push({ ...p, fenlei: f });
  }
  if (!houXuan.length)
    return {
      ok: false,
      // 「没跑过体检」和「跑了但没检索到设施」是两回事：前者让用户白白以为是配额问题，
      // 所以没有报告时直接告诉他先去跑一轮（与网页端 src/core/aiDaohang.js 同一套话术）
      xinxi: report
        ? '本轮体检没有检索到任何设施（多为百度接口配额超限或数据源异常，也可能是这个位置附近确实没有），暂时无法规划导航。等配额恢复后重新体检后再试。'
        : '还没有可用的体检结果，暂时无法规划导航：请先回地图页跑一轮体检，再来问我「带我去最近的医院」这类问题。'
    };

  // ① 大模型路：候选清单（限 120 条）+ 用户需求 → 只输出 JSON
  if (ai && ai.qiYong && aiPeiHaoLe(ai)) {
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
      const { hui } = await wenMoXing(ai, {
        model: ai.moXing,
        temperature: 0.2,
        messages: [
          { role: 'system', content: '你是社区生活圈导航助手，只输出 JSON，不输出多余文字。' },
          { role: 'user', content: tiShi }
        ]
      });
      const m = hui && hui.match(/\{[\s\S]*\}/);
      const x = m && JSON.parse(m[0]);
      const poi = houXuan[Number(x && x.i)];
      if (poi) return { ok: true, poi, liYou: (x && x.liYou) || '大模型推荐', laiYuan: 'ai' };
    } catch {
      /* 大模型失败 → 静默回退本地规则 */
    }
  }

  // ② 本地规则路
  const ben = benDiXuanDian(wen, houXuan, zhongXin);
  if (!ben)
    return {
      ok: false,
      xinxi:
        '没听懂要去哪，或该目的地不在本轮体检的设施里（导航只能去体检检索到的真实设施，比如家、公司这类私人地点去不了）。试试「去最近的医院」「去超市」「带我去药店」。'
    };
  return {
    ok: true,
    poi: ben.poi,
    liYou: ben.liYou + (ai && ai.qiYong ? '（大模型不可用，本地规则兜底）' : '（本地规则）'),
    laiYuan: 'bendi'
  };
}

/* ───────────── 聊天记录（按账号本地留存） ───────────── */

const LT_KEY = 'sq_lt_lishi_';

export function duLiaoTianJiLu(zhangHao) {
  const v = plat.getStorage(LT_KEY + (zhangHao || 'youke'));
  return Array.isArray(v) ? v : [];
}

export function cunLiaoTianJiLu(zhangHao, lieBiao) {
  plat.setStorage(LT_KEY + (zhangHao || 'youke'), (lieBiao || []).slice(-100)); // 最多留 100 条
}
