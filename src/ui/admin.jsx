// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，22
// 管理员控制台（专业后台布局）：左侧导航栏 + 顶栏 + 内容卡片
// 分区：用户管理 / 体检配置 / 盲区阈值 / AI 设置 / 账号安全 / 历史报告
// 登录鉴权（后端 MySQL 校验 + 真实 IP 限流）；隐藏入口：连点左上角 logo 三次，或 URL 带 #guanliyuan
import React, { useState } from 'react';
import { FENLEI_MING, MOREN_PEI_ZHI } from '../core/types.js';
import { savePeiZhi, loadReports } from './peiZhi.js';
import {
  dengLuGuanLiYuan,
  yongHuLieBiao,
  shanChuYongHu,
  zhongZhiMiMa,
  guanLiYuanGaiMiMa,
} from '../core/yonghu.js';

const FENLEI = Object.keys(FENLEI_MING);

// 导航分区：图标 + 名称 + 描述（描述显示在顶栏副标题里）
const YE_QIAN = [
  {
    id: 'yonghu',
    ming: '用户管理',
    miao: '查看注册用户、重置密码与删除账号',
    tu: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: 'peizhi',
    ming: '体检配置',
    miao: '目标步行时长与六类设施基准数、权重',
    tu: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
      </svg>
    ),
  },
  {
    id: 'mangqu',
    ming: '盲区阈值',
    miao: '菜市场 / 药店 / 小学的最大允许步行时长',
    tu: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  {
    id: 'ai',
    ming: 'AI 设置',
    miao: '接入大模型服务，自动生成 AI 诊断叙述',
    tu: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" /><line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
      </svg>
    ),
  },
  {
    id: 'anquan',
    ming: '账号安全',
    miao: '修改管理员密码、查看登录保护策略',
    tu: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    id: 'jilu',
    ming: '历史报告',
    miao: '历次体检的归档记录与得分等级',
    tu: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
];

// 极简行内图标：刷新 / 返回 / 拉取
const TuShuaXin = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);
const TuFanHui = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
  </svg>
);
const TuXiaZai = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

// 档案圆点配色：按序轮换，一眼区分不同服务商
const AI_DANG_SE = ['#2f86f7', '#7c5cf0', '#12b886', '#f59f00', '#e8590c'];

// 由接口地址推导模型列表地址：
// .../v1/chat/completions → .../v1/models；.../v1（基础地址）→ .../v1/models；其余取末段前拼 /models
function tuiDaoMoXingDiZhi(apiDiZhi) {
  const u = String(apiDiZhi || '').trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(u)) return u.replace(/\/chat\/completions$/i, '/models');
  if (/\/models$/i.test(u)) return u;
  if (/\/v\d+$/i.test(u)) return u + '/models';
  const i = u.lastIndexOf('/');
  return i > 0 ? u.slice(0, i) + '/models' : u + '/models';
}

export function GuanLiYuan({ open, onClose, peiZhi, onChange }) {
  const [user, setUser] = useState('');
  const [pwd, setPwd] = useState('');
  const [err, setErr] = useState('');
  const [auth, setAuth] = useState(() => localStorage.getItem('sq_admin_session') === '1');
  const [draft, setDraft] = useState(() => ({
    ...MOREN_PEI_ZHI,
    ...peiZhi,
    // 嵌套字段单独合并，兼容旧存档缺字段的情况
    mangqu: { ...MOREN_PEI_ZHI.mangqu, ...(peiZhi.mangqu || {}) },
    ai: (() => {
      const a = { ...MOREN_PEI_ZHI.ai, ...(peiZhi.ai || {}) };
      // 不做默认预填：从未启用（无密钥）且仍是旧版出厂示例值时展示为空，避免误导「已配置」
      if (!a.miYao) {
        if (!a.apiDiZhi || /api\.openai\.com/i.test(a.apiDiZhi)) a.apiDiZhi = '';
        if (a.moXing === 'gpt-4o-mini') a.moXing = '';
      }
      return a;
    })(),
    mingGai: { ...(peiZhi.mingGai || {}) },
  }));
  const [reports, setReports] = useState([]);
  const [newPwd, setNewPwd] = useState('');
  const [yongHuList, setYongHuList] = useState([]);
  const [yongHuCuo, setYongHuCuo] = useState('');
  const [mang, setMang] = useState(false);
  const [ye, setYe] = useState('yonghu');
  const [moXingList, setMoXingList] = useState([]);
  const [moXingZhong, setMoXingZhong] = useState(false);
  const [moXingCuo, setMoXingCuo] = useState('');
  const [dangBeiZhu, setDangBeiZhu] = useState('');
  const [bianJiIdx, setBianJiIdx] = useState(-1);
  const [bianJiZhi, setBianJiZhi] = useState(null);

  if (!open) return null;

  const dangQianYe = YE_QIAN.find((y) => y.id === ye) || YE_QIAN[0];

  async function doLogin() {
    setErr('');
    setMang(true);
    try {
      const j = await dengLuGuanLiYuan(user || 'admin', pwd);
      if (j.ok) {
        localStorage.setItem('sq_admin_session', '1');
        setAuth(true);
        setErr('');
        setReports(loadReports());
        zaiRuYongHu();
      } else {
        setErr(
          j.suoDing
            ? `密码错误已累计 ${j.leiJi} 次，锁定 ${j.shengYuMiao} 秒`
            : `${j.xinxi}${j.leiJi ? `（已累计 ${j.leiJi} 次，错 3 次锁 10 分钟、5 次锁 20 分钟）` : ''}`
        );
      }
    } catch {
      setErr('服务暂时不可用，请稍后重试');
    } finally {
      setMang(false);
    }
  }

  async function zaiRuYongHu() {
    setYongHuCuo('');
    try {
      const j = await yongHuLieBiao();
      if (j.ok) setYongHuList(j.list || []);
      else setYongHuCuo(j.xinxi || '加载失败');
    } catch {
      setYongHuCuo('服务暂时不可用，请稍后重试');
    }
  }

  function logout() {
    localStorage.removeItem('sq_admin_session');
    localStorage.removeItem('sq_admin_token');
    setAuth(false);
  }

  function save() {
    savePeiZhi(draft);
    onChange(draft);
    alert('配置已保存并立即生效');
  }

  function reset() {
    const d = { ...MOREN_PEI_ZHI, mingGai: {} };
    setDraft(d);
    savePeiZhi(d);
    onChange(d);
  }

  // 清空本地路网缓存（OSM 适配器缓存），不动配置 / 报告 / 登录态
  function qingChuHuanCun() {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('osmcache_'));
    keys.forEach((k) => localStorage.removeItem(k));
    alert(`已清空 ${keys.length} 条本地路网缓存，下次体检将重新拉取路网数据。`);
  }

  // 把当前 AI 配置（地址/密钥/模型整组）存入常用配置档案，多服务商免来回手抄
  function cunDangQianAi() {
    if (!draft.ai.apiDiZhi) return;
    let zhuJi = '';
    try {
      zhuJi = new URL(draft.ai.apiDiZhi).host;
    } catch {
      zhuJi = String(draft.ai.apiDiZhi).replace(/^https?:\/\//, '').split('/')[0];
    }
    const ku = (draft.ai.aiKu || []).filter(
      (k) => !(k.apiDiZhi === draft.ai.apiDiZhi && k.moXing === draft.ai.moXing)
    );
    ku.push({
      ming: (dangBeiZhu || '').trim() || `${zhuJi} · ${draft.ai.moXing || '未选模型'}`,
      apiDiZhi: draft.ai.apiDiZhi,
      miYao: draft.ai.miYao,
      moXing: draft.ai.moXing,
    });
    const next = { ...draft, ai: { ...draft.ai, aiKu: ku } };
    setDraft(next);
    setDangBeiZhu('');
    // 档案即时落盘：入档立刻写存储并通知主界面，不用再点一次「保存配置」也不会丢
    savePeiZhi(next);
    onChange(next);
    alert(`已存入常用配置档案（现有 ${ku.length} 份），点档案行即可整组切回`);
  }

  // 新增一条 AI 配置：清空表单准备录入新服务商，已存档案不受影响
  function xinZengAiPeiZhi() {
    setDraft({ ...draft, ai: { ...draft.ai, apiDiZhi: '', miYao: '', moXing: '' } });
    setMoXingList([]);
    setMoXingCuo('');
  }

  // 点常用配置档案 → 整组填入表单
  function yongAiDang(k) {
    setDraft({ ...draft, ai: { ...draft.ai, apiDiZhi: k.apiDiZhi, miYao: k.miYao, moXing: k.moXing } });
  }

  // 点 ✎ → 该档案行进入行内整组编辑（备注/地址/密钥/模型都可改，不用浏览器弹窗）
  function bianJiAiDang(i) {
    const k = draft.ai.aiKu[i];
    setBianJiIdx(i);
    setBianJiZhi({ ming: k.ming, apiDiZhi: k.apiDiZhi, miYao: k.miYao, moXing: k.moXing });
  }

  // 确认编辑：备注留空恢复自动命名，整组即时落盘
  function queRenBianJi(i) {
    const yuan = draft.ai.aiKu[i];
    let zhuJi = '';
    try {
      zhuJi = new URL(bianJiZhi.apiDiZhi || yuan.apiDiZhi).host;
    } catch {
      zhuJi = String(bianJiZhi.apiDiZhi || yuan.apiDiZhi).replace(/^https?:\/\//, '').split('/')[0];
    }
    const ku = [...draft.ai.aiKu];
    ku[i] = {
      ...yuan,
      ming: (bianJiZhi.ming || '').trim() || `${zhuJi} · ${bianJiZhi.moXing || '未选模型'}`,
      apiDiZhi: bianJiZhi.apiDiZhi,
      miYao: bianJiZhi.miYao,
      moXing: bianJiZhi.moXing,
    };
    const next = { ...draft, ai: { ...draft.ai, aiKu: ku } };
    setDraft(next);
    savePeiZhi(next);
    onChange(next);
    setBianJiIdx(-1);
  }

  // 取消编辑
  function quXiaoBianJi() {
    setBianJiIdx(-1);
  }

  // 删除档案（即时落盘）
  function shanChuAiDang(i) {
    const ku = draft.ai.aiKu.filter((_, x) => x !== i);
    const next = { ...draft, ai: { ...draft.ai, aiKu: ku } };
    setDraft(next);
    savePeiZhi(next);
    onChange(next);
  }

  async function changePwd() {
    if (!newPwd) return;
    const j = await guanLiYuanGaiMiMa(newPwd);
    alert(j.ok ? '管理员密码已修改' : j.xinxi || '修改失败');
    if (j.ok) setNewPwd('');
  }

  async function shanChu(id) {
    if (!confirm('确定删除该用户？')) return;
    const j = await shanChuYongHu(id);
    if (j.ok) zaiRuYongHu();
    else setYongHuCuo(j.xinxi || '删除失败');
  }

  async function zhongZhi(id) {
    if (!confirm('重置为随机 8 位临时密码？')) return;
    const j = await zhongZhiMiMa(id);
    if (j.ok) {
      alert(`已重置，临时密码：${j.xinMiMa}（请告知用户尽快修改）`);
      zaiRuYongHu();
    } else {
      setYongHuCuo(j.xinxi || '重置失败');
    }
  }

  // 自动获取模型列表：由接口地址推导 /models 端点，经服务端 /airelay 中转（解决 CORS）
  async function huoQuMoXing() {
    setMoXingCuo('');
    if (!draft.ai.apiDiZhi || !draft.ai.miYao) {
      setMoXingCuo('请先填写接口地址与 API 密钥，再获取模型列表');
      return;
    }
    setMoXingZhong(true);
    try {
      const r = await fetch('/airelay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: tuiDaoMoXingDiZhi(draft.ai.apiDiZhi),
          tou: { Authorization: 'Bearer ' + draft.ai.miYao },
          fangFa: 'GET',
        }),
      });
      const yuan = await r.text();
      let j = null;
      try {
        j = JSON.parse(yuan);
      } catch {
        // 服务商返回了网页（404 页面等）而非 JSON，多半是地址拼错
        throw new Error(`接口返回了网页而非 JSON（HTTP ${r.status}），请检查接口地址是否正确`);
      }
      const list = (j.data || j.models || [])
        .map((m) => m.id || m.name || '')
        .filter(Boolean)
        .sort();
      if (!list.length) throw new Error(j.xinxi || `接口未返回模型列表（HTTP ${r.status}）`);
      setMoXingList(list);
    } catch (e) {
      setMoXingCuo('获取失败：' + (e.message || '请检查接口地址与密钥'));
    } finally {
      setMoXingZhong(false);
    }
  }

  /* ===== 登录页：左右分栏，左侧品牌区 + 右侧表单 ===== */
  if (!auth) {
    return (
      <div className="admin-ye admin-ye-deng">
        <div className="admin-deng-ka">
          <div className="admin-deng-pai">
            <div className="admin-deng-logo">
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="admin-deng-ming">社区体检助手</div>
            <div className="admin-deng-fu">管理员控制台 · Admin Console</div>
            <ul className="admin-deng-lieBiao">
              <li>用户与账号安全管理</li>
              <li>体检评分模型在线调参</li>
              <li>设施盲区阈值动态配置</li>
              <li>AI 诊断服务一键接入</li>
            </ul>
          </div>
          <div className="admin-deng-biao">
            <div className="admin-deng-biaoT">登录控制台</div>
            <div className="admin-deng-biaoFu">请输入管理员账号与密码继续</div>
            <label className="a-label">账号</label>
            <input
              className="a-input"
              placeholder="admin"
              value={user}
              onChange={(e) => setUser(e.target.value)}
            />
            <label className="a-label">密码</label>
            <input
              className="a-input"
              type="password"
              placeholder="••••••••"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doLogin(); }}
            />
            {err && <div className="a-tip a-tip-err">{err}</div>}
            <button className="a-btn a-btn-primary admin-deng-btn" onClick={doLogin} disabled={mang}>
              {mang ? '正在校验…' : '登 录'}
            </button>
            <div className="a-tip">初始账号 admin / admin，首次登录后请立即在「账号安全」中修改密码。</div>
            <button className="link-btn admin-deng-fan" onClick={onClose}>返回体检助手</button>
          </div>
        </div>
      </div>
    );
  }

  /* ===== 控制台主界面：左侧导航 + 右侧内容 ===== */
  return (
    <div className="admin-ye admin-ye-tai">
      <aside className="admin-ce">
        <div className="admin-ce-brand">
          <span className="admin-ce-logo">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </span>
          <div>
            <div className="admin-ce-ming">社区体检助手</div>
            <div className="admin-ce-fu">管理员控制台</div>
          </div>
        </div>

        <div className="admin-ce-fenGe">功能导航</div>
        <nav className="admin-ce-nav">
          {YE_QIAN.map((y) => (
            <button
              key={y.id}
              className={`admin-ce-xiang ${ye === y.id ? 'on' : ''}`}
              onClick={() => setYe(y.id)}
            >
              <span className="admin-ce-tu">{y.tu}</span>
              <span className="admin-ce-wen">{y.ming}</span>
            </button>
          ))}
        </nav>

        <div className="admin-ce-di">
          <div className="admin-ce-yongHu">
            <span className="admin-ce-touXiang">A</span>
            <div>
              <div className="admin-ce-yongHuMing">admin</div>
              <div className="admin-ce-yongHuFu">超级管理员</div>
            </div>
          </div>
          <button className="admin-ce-tuiChu" onClick={logout}>退出登录</button>
        </div>
      </aside>

      <main className="admin-zhu">
        <header className="admin-ding">
          <div className="admin-ding-zuo">
            <div className="admin-ding-biao">{dangQianYe.ming}</div>
            <div className="admin-ding-miao">{dangQianYe.miao}</div>
          </div>
          <div className="admin-ding-you">
            {(ye === 'peizhi' || ye === 'mangqu' || ye === 'ai') && (
              <>
                <button className="a-btn a-btn-ghost" onClick={reset}>恢复默认</button>
                <button className="a-btn a-btn-primary" onClick={save}>保存配置</button>
              </>
            )}
            <button className="a-btn a-btn-ghost" onClick={onClose}>{TuFanHui} 返回体检助手</button>
          </div>
        </header>

        <div className="admin-nei">
          {ye === 'yonghu' && (
            <div className="a-card">
              <div className="a-card-tou">
                <div className="a-card-ming">注册用户</div>
                <div className="a-row">
                  <span className="a-shuPian">共 {yongHuList.length} 个用户</span>
                  <button className="a-btn a-btn-ghost a-btn-sm" onClick={zaiRuYongHu}>{TuShuaXin} 刷新列表</button>
                </div>
              </div>
              {yongHuCuo && <div className="a-tip a-tip-err">{yongHuCuo}</div>}
              <div className="a-history" style={{ maxHeight: 420 }}>
                {yongHuList.length === 0 && (
                  <div className="empty-tip">暂无注册用户，用户在首页「登录 / 注册」处注册后自动入库。</div>
                )}
                {yongHuList.map((y) => (
                  <div className="a-yongHuHang" key={y.id}>
                    <span className="a-yongHuTou">{(y.zhang_hao || '?').slice(0, 1).toUpperCase()}</span>
                    <div className="a-yongHuXin">
                      <b>{y.zhang_hao}</b>
                      <span>注册于 {new Date(y.created_at).toLocaleString()}</span>
                    </div>
                    <div className="a-yongHu-Cao">
                      <button className="a-btn a-btn-ghost a-btn-sm" onClick={() => zhongZhi(y.id)}>重置密码</button>
                      <button className="a-btn a-btn-ghost a-btn-sm a-btn-weiXian" onClick={() => shanChu(y.id)}>删除</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ye === 'peizhi' && (
            <>
              <div className="a-card">
                <div className="a-card-tou">
                  <div className="a-card-ming">基础参数</div>
                </div>
                <div className="a-field" style={{ maxWidth: 320 }}>
                  <label className="a-label">目标步行时长（秒，默认 900 = 15 分钟）</label>
                  <input
                    className="a-input"
                    type="number"
                    value={draft.mubiaoMiao}
                    onChange={(e) => setDraft({ ...draft, mubiaoMiao: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="a-card">
                <div className="a-card-tou">
                  <div className="a-card-ming">评分维度</div>
                  <button
                    className="a-btn a-btn-ghost a-btn-sm"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        ziDing: [
                          ...(draft.ziDing || []),
                          {
                            f: 'zd' + Date.now().toString(36),
                            ming: '新维度',
                            guanJianCi: '',
                            biaoZhun: 1,
                            quanZhong: 0.05,
                          },
                        ],
                      })
                    }
                  >
                    ＋ 新增维度
                  </button>
                </div>
                <table className="a-table">
                  <thead>
                    <tr>
                      <th style={{ width: '46%' }}>维度</th>
                      <th>圈内基准数</th>
                      <th>权重</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FENLEI.map((f) => (
                      <tr key={f}>
                        <td>
                          <div className="a-nei-hang">
                            <input
                              className="a-input a-mingShu"
                              value={draft.mingGai[f] ?? FENLEI_MING[f]}
                              title="内置维度可改名，保存后评分与报告同步更新"
                              onChange={(e) =>
                                setDraft({ ...draft, mingGai: { ...draft.mingGai, [f]: e.target.value } })
                              }
                            />
                            <span className="a-neiZhiBiao">内置</span>
                          </div>
                        </td>
                        <td>
                          <input
                            className="a-input a-input-sm"
                            type="number"
                            value={draft.biaozhun[f]}
                            onChange={(e) =>
                              setDraft({ ...draft, biaozhun: { ...draft.biaozhun, [f]: Number(e.target.value) } })
                            }
                          />
                        </td>
                        <td>
                          <input
                            className="a-input a-input-sm"
                            type="number"
                            step="0.05"
                            value={draft.quanzhong[f]}
                            onChange={(e) =>
                              setDraft({ ...draft, quanzhong: { ...draft.quanzhong, [f]: Number(e.target.value) } })
                            }
                          />
                        </td>
                        <td className="a-label">—</td>
                      </tr>
                    ))}
                    {(draft.ziDing || []).map((z, i) => (
                      <tr key={z.f}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <input
                              className="a-input"
                              value={z.ming}
                              placeholder="维度名称"
                              onChange={(e) => {
                                const next = [...draft.ziDing];
                                next[i] = { ...z, ming: e.target.value };
                                setDraft({ ...draft, ziDing: next });
                              }}
                            />
                            <input
                              className="a-input"
                              value={z.guanJianCi}
                              placeholder="检索关键词（逗号分隔）"
                              onChange={(e) => {
                                const next = [...draft.ziDing];
                                next[i] = { ...z, guanJianCi: e.target.value };
                                setDraft({ ...draft, ziDing: next });
                              }}
                            />
                          </div>
                        </td>
                        <td>
                          <input
                            className="a-input a-input-sm"
                            type="number"
                            value={z.biaoZhun}
                            onChange={(e) => {
                              const next = [...draft.ziDing];
                              next[i] = { ...z, biaoZhun: Number(e.target.value) };
                              setDraft({ ...draft, ziDing: next });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            className="a-input a-input-sm"
                            type="number"
                            step="0.05"
                            value={z.quanZhong}
                            onChange={(e) => {
                              const next = [...draft.ziDing];
                              next[i] = { ...z, quanZhong: Number(e.target.value) };
                              setDraft({ ...draft, ziDing: next });
                            }}
                          />
                        </td>
                        <td>
                          <button
                            className="a-btn a-btn-ghost a-btn-sm a-btn-weiXian"
                            onClick={() => setDraft({ ...draft, ziDing: draft.ziDing.filter((_, k) => k !== i) })}
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="a-tip">
                  表内直接编辑：内置六类可改名称 / 基准数 / 权重（改名后评分与报告同步更新）；自定义维度可改名称与检索关键词（逗号分隔），保存后即参与检索、评分与地图图层。
                </div>
              </div>
            </>
          )}

          {ye === 'mangqu' && (
            <div className="a-card">
              <div className="a-card-tou">
                <div className="a-card-ming">盲区判定阈值</div>
              </div>
              <div className="a-mang-geWang">
                <div className="a-field">
                  <label className="a-label">菜市场（秒）</label>
                  <input
                    className="a-input"
                    type="number"
                    value={draft.mangqu.caiShiChangMiao}
                    onChange={(e) =>
                      setDraft({ ...draft, mangqu: { ...draft.mangqu, caiShiChangMiao: Number(e.target.value) } })
                    }
                  />
                </div>
                <div className="a-field">
                  <label className="a-label">药店（秒）</label>
                  <input
                    className="a-input"
                    type="number"
                    value={draft.mangqu.yaoDianMiao}
                    onChange={(e) =>
                      setDraft({ ...draft, mangqu: { ...draft.mangqu, yaoDianMiao: Number(e.target.value) } })
                    }
                  />
                </div>
                <div className="a-field">
                  <label className="a-label">小学（秒）</label>
                  <input
                    className="a-input"
                    type="number"
                    value={draft.mangqu.xiaoXueMiao}
                    onChange={(e) =>
                      setDraft({ ...draft, mangqu: { ...draft.mangqu, xiaoXueMiao: Number(e.target.value) } })
                    }
                  />
                </div>
                <div className="a-field">
                  <label className="a-label">粗筛直线距离（米）</label>
                  <input
                    className="a-input"
                    type="number"
                    value={draft.mangqu.cuShaiMi}
                    onChange={(e) =>
                      setDraft({ ...draft, mangqu: { ...draft.mangqu, cuShaiMi: Number(e.target.value) } })
                    }
                  />
                </div>
              </div>
              <div className="a-tip">
                以上为三类设施的最大允许步行时长与粗筛直线距离。改完点右上角「保存配置」生效。
              </div>
            </div>
          )}

          {ye === 'ai' && (
            <>
            <div className="a-card">
              <div className="a-card-tou">
                <div className="a-card-ming">AI 诊断服务</div>
                <button
                  className={`a-kaiGuan ${draft.ai.qiYong ? 'on' : ''}`}
                  onClick={() => setDraft({ ...draft, ai: { ...draft.ai, qiYong: !draft.ai.qiYong } })}
                  title={draft.ai.qiYong ? '点击关闭' : '点击启用'}
                >
                  <i />
                  {draft.ai.qiYong ? '已启用' : '已关闭'}
                </button>
              </div>
              <div className="a-tip">
                配置兼容 OpenAI Chat Completions 格式的任意大模型服务商（OpenAI / DeepSeek / 通义千问 / 智谱等）。
                启用后体检报告自动生成 AI 诊断叙述；未启用或调用失败时自动回退本地规则引擎，不影响体检流程。
              </div>
              <div className="a-field">
                <label className="a-label">接口地址（Chat Completions 完整 URL）</label>
                <input
                  className="a-input"
                  value={draft.ai.apiDiZhi}
                  placeholder="https://api.openai.com/v1/chat/completions"
                  onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, apiDiZhi: e.target.value } })}
                />
              </div>
              <div className="a-field">
                <label className="a-label">API 密钥（仅保存在本机浏览器配置中）</label>
                <input
                  className="a-input"
                  type="password"
                  value={draft.ai.miYao}
                  placeholder="sk-…"
                  onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, miYao: e.target.value } })}
                />
              </div>
              <div className="a-field">
                <label className="a-label">模型名称（可手填，或填好地址与密钥后自动获取）</label>
                <div className="a-row">
                  <input
                    className="a-input"
                    value={draft.ai.moXing}
                    placeholder="gpt-4o-mini / deepseek-chat / qwen-plus …"
                    onChange={(e) => setDraft({ ...draft, ai: { ...draft.ai, moXing: e.target.value } })}
                  />
                  <button
                    className="a-btn a-btn-ghost"
                    onClick={huoQuMoXing}
                    disabled={moXingZhong}
                    title="自动获取模型列表"
                  >
                    {TuXiaZai} {moXingZhong ? '获取中…' : '自动获取'}
                  </button>
                </div>
                {moXingCuo && <div className="a-tip a-tip-err">{moXingCuo}</div>}
                {moXingList.length > 0 && (
                  <div className="a-moXing-he">
                    <div className="a-moXing-tou">
                      <span>获取到 {moXingList.length} 个模型，点击选用</span>
                      <button className="link-btn" onClick={() => setMoXingList([])}>收起</button>
                    </div>
                    <div className="a-moXing-lie">
                      {moXingList.map((m) => (
                        <button
                          key={m}
                          className={`a-moXing-xiang ${draft.ai.moXing === m ? 'on' : ''}`}
                          onClick={() => setDraft({ ...draft, ai: { ...draft.ai, moXing: m } })}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="a-field">
                <label className="a-label">存为档案（可加备注方便辨认，如「DeepSeek 主力」「备用通道」）</label>
                <div className="a-row a-huanHang">
                  <input
                    className="a-input a-beiZhu"
                    placeholder="档案备注（可选，留空自动命名为「服务商 · 模型」）"
                    value={dangBeiZhu}
                    onChange={(e) => setDangBeiZhu(e.target.value)}
                  />
                  <button className="a-btn a-btn-ghost a-btn-sm" onClick={xinZengAiPeiZhi}>
                    ＋ 新增配置
                  </button>
                  <button className="a-btn a-btn-primary a-btn-sm" onClick={cunDangQianAi} disabled={!draft.ai.apiDiZhi}>
                    ＋ 保存当前为常用配置
                  </button>
                </div>
                <div className="a-tip">
                  换 AI 的流程：点「新增配置」清空表单 → 填新服务商的地址 / 密钥 / 模型 → 点「保存当前为常用配置」入档 →
                  点右上角「保存配置」启用；旧 AI 已在档案里，随时点档案行整组切回，互不覆盖。档案的保存 / 改名 / 删除即时生效。
                </div>
              </div>

              <div className="a-field">
                <label className="a-label">已存档案（点击行整组切换，✎ 编辑，× 删除）</label>
                {(draft.ai.aiKu || []).length === 0 && (
                  <div className="a-aiKu-kong">
                    还没有档案。填好上方配置后点「保存当前为常用配置」，即可在多个 AI 服务商之间随时切换。
                  </div>
                )}
                <div className="a-aiKu-lie">
                  {(draft.ai.aiKu || []).map((k, i) => {
                    const zaiYong = draft.ai.apiDiZhi === k.apiDiZhi && draft.ai.moXing === k.moXing;
                    return (
                      <div key={i} className={`a-aiKu-xiang ${zaiYong ? 'on' : ''}`}>
                        <span
                          className="a-aiKu-dian"
                          style={{ background: AI_DANG_SE[i % AI_DANG_SE.length] }}
                        />
                        <button className="a-aiKu-zhu" onClick={() => yongAiDang(k)} title="点击整组填入表单">
                          <b>{k.ming}</b>
                          <span>{k.apiDiZhi}{k.moXing ? ` · ${k.moXing}` : ''}</span>
                        </button>
                        {zaiYong && <span className="a-aiKu-biao">使用中</span>}
                        <button className="a-aiKu-cao" onClick={() => bianJiAiDang(i)} title="编辑该档案（备注 / 地址 / 密钥 / 模型）">✎</button>
                        <button className="a-aiKu-cao a-aiKu-cao-shan" onClick={() => shanChuAiDang(i)} title="删除该档案">×</button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="a-row">
                <button className="a-btn a-btn-primary" onClick={save}>保存配置</button>
                <span className="a-label">保存后当前表单里的配置立即生效；档案的增删改备注已即时保存</span>
              </div>
            </div>

            {/* 编辑档案弹窗：应用内居中卡片，点遮罩或关闭按钮退出 */}
            {bianJiIdx >= 0 && bianJiZhi && (
              <div className="admin-mask" onClick={quXiaoBianJi}>
                <div className="admin-panel" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
                  <div className="admin-head">
                    <div className="panel-title">编辑档案</div>
                    <button className="a-btn a-btn-ghost a-btn-sm" onClick={quXiaoBianJi}>关闭</button>
                  </div>
                  <div className="admin-body">
                    <div className="a-field">
                      <label className="a-label">备注名称（留空恢复自动命名「服务商 · 模型」）</label>
                      <input
                        className="a-input"
                        value={bianJiZhi.ming}
                        placeholder="如：DeepSeek 主力 / 备用通道"
                        onChange={(e) => setBianJiZhi({ ...bianJiZhi, ming: e.target.value })}
                      />
                    </div>
                    <div className="a-field">
                      <label className="a-label">接口地址（Chat Completions 完整 URL）</label>
                      <input
                        className="a-input"
                        value={bianJiZhi.apiDiZhi}
                        placeholder="https://…/v1/chat/completions"
                        onChange={(e) => setBianJiZhi({ ...bianJiZhi, apiDiZhi: e.target.value })}
                      />
                    </div>
                    <div className="a-field">
                      <label className="a-label">API 密钥</label>
                      <input
                        className="a-input"
                        type="password"
                        value={bianJiZhi.miYao}
                        placeholder="sk-…"
                        onChange={(e) => setBianJiZhi({ ...bianJiZhi, miYao: e.target.value })}
                      />
                    </div>
                    <div className="a-field">
                      <label className="a-label">模型名称</label>
                      <input
                        className="a-input"
                        value={bianJiZhi.moXing}
                        placeholder="模型 ID"
                        onChange={(e) => setBianJiZhi({ ...bianJiZhi, moXing: e.target.value })}
                      />
                    </div>
                    <div className="a-row" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
                      <button className="a-btn a-btn-ghost" onClick={quXiaoBianJi}>取消</button>
                      <button className="a-btn a-btn-primary" onClick={() => queRenBianJi(bianJiIdx)}>确定</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </>
          )}

          {ye === 'anquan' && (
            <div className="a-card">
              <div className="a-card-tou">
                <div className="a-card-ming">修改管理员密码</div>
              </div>
              <div className="a-field" style={{ maxWidth: 420 }}>
                <label className="a-label">新密码（6 位以上）</label>
                <div className="a-row">
                  <input
                    className="a-input"
                    type="password"
                    placeholder="••••••••"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                  />
                  <button className="a-btn a-btn-primary" onClick={changePwd}>修改</button>
                </div>
              </div>
              <div className="a-tip">
                登录保护：密码连续错 3 次锁定 10 分钟，错 5 次锁定 20 分钟，12 小时内累计错 12 次封禁 12 小时（按来源 IP 计数，登录成功自动清零）。
              </div>
              <div className="a-field">
                <label className="a-label">本地存储维护</label>
                <div className="a-row">
                  <button className="a-btn a-btn-ghost" onClick={qingChuHuanCun}>
                    {TuShuaXin} 清空本地路网缓存
                  </button>
                  <span className="a-label">路网缓存异常增大时会挤占地图服务存储空间，一键清空即可恢复。</span>
                </div>
              </div>
            </div>
          )}

          {ye === 'jilu' && (
            <div className="a-card">
              <div className="a-card-tou">
                <div className="a-card-ming">体检归档记录</div>
                <div className="a-row">
                  <span className="a-shuPian">共 {reports.length} 条</span>
                  <button className="a-btn a-btn-ghost a-btn-sm" onClick={() => setReports(loadReports())}>
                    {TuShuaXin} 刷新
                  </button>
                </div>
              </div>
              <div className="a-history" style={{ maxHeight: 420 }}>
                {reports.length === 0 && <div className="empty-tip">暂无记录，运行体检后自动归档。</div>}
                {reports.map((r, i) => (
                  <div className="a-record" key={i}>
                    {new Date(r.t).toLocaleString()} · 等级 <b>{r.dengji}</b> · 得分 {r.total} · 盲区 {r.mang}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
