// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，22
// AI 在线问答：用户与管理员配置的大模型自由聊天，自动附带本轮体检摘要作为上下文，
// 模型能结合当前社区体检结果回答「看病方便吗」「盲区是什么意思」等问题。
// 经 /airelay 中转调用（与 AI 诊断 / AI 导航同路），密钥不落库。
import { duiHuaJieKouZhi } from './zhenduan.js';
import { liangDianJuLi } from './geo/jichu.js';
import { fuWuUrl } from './fuwuDiZhi.js';

// 主入口：lishi 历史对话（[{role:'user'|'ai', wen}]）；wen 本条提问；report 本轮体检报告；
// ai 管理员 AI 配置；zhongXin 用户当前地图中心 {lng, lat, ming}（可选，用于位置感知）
export async function aiLiaoTian(lishi, wen, report, ai, zhongXin) {
  // 先区分「没配置」和「配置了但没开启用开关」，给用户可执行的提示
  if (!(ai && ai.apiDiZhi && ai.miYao)) {
    return {
      ok: false,
      xinxi:
        '管理员尚未配置大模型的接口地址与密钥，请在管理员控制台「AI 设置」里填写并点「保存配置」。'
    };
  }
  if (!ai.qiYong) {
    return {
      ok: false,
      xinxi:
        '大模型已配置，但「启用」开关还没打开——请到管理员控制台「AI 设置」，把「AI 诊断服务」右上角的开关切到「已启用」，再点「保存配置」。'
    };
  }
  if (!ai.moXing) {
    return {
      ok: false,
      xinxi:
        '还没填写模型名称——请在管理员控制台「AI 设置」里点「自动获取」选择模型，或手填模型 ID 后保存。'
    };
  }

  // 体检摘要塞进系统提示，让模型「看得见」本轮结果；
  // 同时注入用户当前地图中心——若报告中心与当前中心相距超过 500m，明确告知模型「报告已过期」，
  // 避免用户重新定位后 AI 还拿着旧位置的坐标说事
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

  // 设施清单（名称去重，最多 40 个）注入提示——让大模型自己语义判断用户想去哪、能否匹配到设施
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

  const xiaoXi = [
    {
      role: 'system',
      content:
        '你是「15 分钟生活圈智能体检助手」的在线问答助手，用简体中文简洁、口语化地回答，' +
        '话题围绕社区生活圈、设施配套、体检报告解读。回答控制在 200 字以内。当前上下文：' +
        zhaiYao +
        (sheShiMiao ? ' ' + sheShiMiao : '') +
        ' —— 你需要自己语义判断用户这句话是想导航去某地，还是在提问：' +
        '①若用户想导航/前往某个地方（例如「我想去广西博物馆」「带我去最近的医院」「导航到人民公园」「送我去超市」），' +
        '无论目的地是否在设施清单里，都只回复一行：【导航】目的地名称（剥掉客套词后的可检索地名，如「【导航】广西博物馆」），不要输出任何其他文字；' +
        '②其余情况正常回答（此时绝不要出现【导航】字样）。语义判断由你完成，不要拘泥于具体关键词。'
    },
    // 只带最近 8 条，防上下文超长
    ...lishi.slice(-8).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.wen
    })),
    { role: 'user', content: wen }
  ];

  // 双路尝试：①服务端 /airelay 中转（防 CORS）→ ②浏览器直连（过 Cloudflare 等防火墙的真实 TLS 指纹）。
  // 哪条路先拿到合法回答就走哪条；都失败时把两条路的错误拼在一起供排查。
  const moXingTi = { model: ai.moXing, temperature: 0.5, messages: xiaoXi };
  const changShi = [
    {
      ming: '服务端中转',
      url: fuWuUrl('/airelay'),
      ti: {
        url: duiHuaJieKouZhi(ai.apiDiZhi),
        tou: { Authorization: 'Bearer ' + ai.miYao },
        body: moXingTi
      }
    },
    {
      ming: '浏览器直连',
      url: duiHuaJieKouZhi(ai.apiDiZhi),
      ti: moXingTi
    }
  ];
  const cuoLieBiao = [];
  for (const lu of changShi) {
    try {
      const r = await fetch(lu.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ai.miYao },
        body: JSON.stringify(lu.ti)
      });
      const yuan = await r.text();
      let j = null;
      try {
        j = JSON.parse(yuan);
      } catch {
        // 返回网页：多半是 Cloudflare 拦截页，换下一条路试
        cuoLieBiao.push(`${lu.ming}：接口返回了网页而非 JSON（HTTP ${r.status}）`);
        continue;
      }
      if (!r.ok) {
        const fuWuShangCuo =
          (j && j.error && (j.error.message || j.error.code)) ||
          j.xinxi ||
          j.message ||
          `HTTP ${r.status}`;
        cuoLieBiao.push(`${lu.ming}：服务商返回错误：${fuWuShangCuo}`);
        // 密钥/模型/余额类错误换路径也没用，直接停下报错
        if ([401, 402, 404].includes(r.status)) break;
        continue;
      }
      const hui =
        (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      if (!hui) {
        cuoLieBiao.push(`${lu.ming}：模型没有返回内容`);
        continue;
      }
      return { ok: true, hui: hui.trim() };
    } catch (e) {
      // 浏览器直连被 CORS 拦时这里会收到 Failed to fetch
      cuoLieBiao.push(`${lu.ming}：${(e && e.message) || '网络请求失败'}`);
    }
  }
  return {
    ok: false,
    xinxi:
      '调用大模型失败，两条路都试过了：' +
      cuoLieBiao.join('；') +
      '。若两条路都是 403 / 返回网页 / Failed to fetch，说明该服务商开启了 Cloudflare 防护且不允许跨域直连，建议更换服务商接口地址。'
  };
}
