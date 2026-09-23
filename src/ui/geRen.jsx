// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，22
// 个人主页弹窗：账号信息卡 / 体检档案统计 / 等级分布 / 最近记录（可在地图回看）/ 修改密码 / 档案导出与清理。
// 体检档案存于本机浏览器（sq_reports），按登录账号归属过滤展示。
import React, { useState } from 'react';
import { loadReports, shanChuWoDeBaoGao } from './peiZhi.js';
import { yongHuGaiMiMa } from '../core/yonghu.js';

const DENG_JI = ['A', 'B', 'C', 'D'];

export function GeRen({ open, onClose, yongHu, onTuiChu, onHuiKan }) {
  // Hooks 必须在条件返回之前统一声明（Rules of Hooks）
  const [gaiMiMaKai, setGaiMiMaKai] = useState(false);
  const [jiuMiMa, setJiuMiMa] = useState('');
  const [xinMiMa, setXinMiMa] = useState('');
  const [xinMiMa2, setXinMiMa2] = useState('');
  const [gaiCuo, setGaiCuo] = useState('');
  const [gaiMang, setGaiMang] = useState(false);
  const [, gengXin] = useState(0); // 删除记录后手动触发重渲染（记录数量从 localStorage 读）

  if (!open || !yongHu) return null;
  const zhangHao = yongHu.zhangHao || '';
  // 只统计归属当前账号的记录；旧版本存档无账号字段，不纳入统计
  const woDe = loadReports().filter(r => r.zhangHao && r.zhangHao === zhangHao);
  const zuiXin = woDe[0];
  // 等级分布：A/B/C/D 各档次数
  const fenBu = DENG_JI.map(d => ({ d, shu: woDe.filter(r => r.dengji === d).length }));
  const zuiGaoFen = woDe.reduce((m, r) => Math.max(m, r.total || 0), 0);
  const pingJun = woDe.length
    ? Math.round(woDe.reduce((s, r) => s + (r.total || 0), 0) / woDe.length)
    : null;

  // 导出我的体检档案为 JSON 文件
  function daoChu() {
    const neirong = JSON.stringify(
      { zhangHao, daoChuShiJian: new Date().toISOString(), jiLu: woDe },
      null,
      2
    );
    const qiu = new Blob([neirong], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(qiu);
    a.download = `体检档案_${zhangHao}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function qingKong() {
    if (!woDe.length) return;
    if (!confirm(`确定清空 ${zhangHao} 的 ${woDe.length} 条体检记录？此操作不可恢复。`)) return;
    shanChuWoDeBaoGao(zhangHao);
    gengXin(n => n + 1);
  }

  async function tiJiaoGaiMiMa() {
    if (gaiMang) return;
    setGaiCuo('');
    if (xinMiMa !== xinMiMa2) {
      setGaiCuo('两次输入的新密码不一致');
      return;
    }
    if (xinMiMa === jiuMiMa) {
      setGaiCuo('新密码不能与原密码相同');
      return;
    }
    setGaiMang(true);
    try {
      const j = await yongHuGaiMiMa(zhangHao, jiuMiMa, xinMiMa);
      if (j.ok) {
        alert('密码修改成功，下次登录请使用新密码');
        setGaiMiMaKai(false);
        setJiuMiMa('');
        setXinMiMa('');
        setXinMiMa2('');
      } else {
        setGaiCuo(j.xinxi + (j.leiJi ? `（已累计 ${j.leiJi} 次）` : ''));
      }
    } catch {
      setGaiCuo('服务暂时不可用，请稍后重试');
    } finally {
      setGaiMang(false);
    }
  }

  return (
    <div className="admin-mask" onClick={onClose}>
      <div className="admin-panel" style={{ width: 480 }} onClick={e => e.stopPropagation()}>
        <div className="admin-head">
          <div className="panel-title">个人主页</div>
          <button className="a-btn a-btn-ghost a-btn-sm" onClick={onTuiChu} title="退出当前账号">
            退出登录
          </button>
          <button className="a-btn a-btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="admin-body">
          <div className="gr-ka">
            <span className="gr-touXiang">{(zhangHao || '?').slice(0, 1).toUpperCase()}</span>
            <div className="gr-xin">
              <b>{zhangHao}</b>
              <span>
                {yongHu.role === 'admin' ? '管理员' : '注册用户'}
                {yongHu.zhuCeShiJian
                  ? ` · 注册于 ${new Date(yongHu.zhuCeShiJian).toLocaleDateString()}`
                  : ''}
              </span>
            </div>
            <span className="gr-huiYuan">已登录</span>
          </div>

          <div className="gr-tongJi">
            <div className="gr-xiang">
              <b>{woDe.length}</b>
              <span>累计体检</span>
            </div>
            <div className="gr-xiang">
              <b>{zuiGaoFen || '—'}</b>
              <span>历史最高分</span>
            </div>
            <div className="gr-xiang">
              <b>{pingJun ?? '—'}</b>
              <span>平均得分</span>
            </div>
            <div className="gr-xiang">
              <b>{zuiXin ? zuiXin.mang : '—'}</b>
              <span>最近盲区</span>
            </div>
          </div>

          {woDe.length > 0 && (
            <div className="gr-fenBu">
              {fenBu.map(({ d, shu }) => (
                <div key={d} className="gr-fenBu-xiang">
                  <span className={`dengji ${d}`}>{d}</span>
                  <i>
                    <u
                      style={{
                        width: `${woDe.length ? Math.round((shu / woDe.length) * 100) : 0}%`
                      }}
                    />
                  </i>
                  <em>{shu} 次</em>
                </div>
              ))}
            </div>
          )}

          <div className="a-field">
            <div className="sec-title">
              最近体检记录
              {woDe.length > 0 && <span className="sec-tag">点「回看」在地图上打开该社区</span>}
            </div>
            <div className="a-history" style={{ maxHeight: 190 }}>
              {woDe.length === 0 && (
                <div className="empty-tip">
                  还没有体检记录。选好社区中心点后点「开始体检」，完成后自动归档到这里。
                </div>
              )}
              {woDe.slice(0, 8).map((r, i) => (
                <div className="a-record gr-jiLu" key={i}>
                  <span>
                    {new Date(r.t).toLocaleString()} · 等级 <b>{r.dengji}</b> · 得分 {r.total} ·
                    盲区 {r.mang}
                  </span>
                  {r.zhongXin && (
                    <button
                      className="a-btn a-btn-ghost a-btn-sm"
                      onClick={() => onHuiKan && onHuiKan(r)}
                      title="把地图中心移动到该社区"
                    >
                      回看
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {gaiMiMaKai ? (
            <div className="gr-gaiMiMa">
              <div className="sec-title">修改密码</div>
              <input
                className="a-input"
                type="password"
                placeholder="原密码"
                value={jiuMiMa}
                onChange={e => setJiuMiMa(e.target.value)}
              />
              <input
                className="a-input"
                type="password"
                placeholder="新密码（6 位以上）"
                value={xinMiMa}
                onChange={e => setXinMiMa(e.target.value)}
              />
              <input
                className="a-input"
                type="password"
                placeholder="确认新密码"
                value={xinMiMa2}
                onChange={e => setXinMiMa2(e.target.value)}
              />
              {gaiCuo && <div className="a-tip a-tip-err">{gaiCuo}</div>}
              <div className="a-row">
                <button className="a-btn a-btn-primary" onClick={tiJiaoGaiMiMa} disabled={gaiMang}>
                  {gaiMang ? '提交中…' : '确认修改'}
                </button>
                <button
                  className="a-btn a-btn-ghost"
                  onClick={() => {
                    setGaiMiMaKai(false);
                    setGaiCuo('');
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div className="a-row">
              <button className="a-btn a-btn-ghost" onClick={() => setGaiMiMaKai(true)}>
                修改密码
              </button>
              <button className="a-btn a-btn-ghost" onClick={daoChu} disabled={!woDe.length}>
                导出档案
              </button>
              <button
                className="a-btn a-btn-ghost a-btn-weiXian"
                onClick={qingKong}
                disabled={!woDe.length}
              >
                清空记录
              </button>
            </div>
          )}

          <div className="a-tip">
            体检档案保存在本机浏览器中，换设备或换浏览器不会同步；密码经服务端加密存储，修改需验证原密码。
          </div>
        </div>
      </div>
    </div>
  );
}
