// 版权声明：肖沐樑  QQ：3387432690
// 完成时间：2026，09，22
// 用户登录/注册弹窗：校验由后端 /api 完成（MySQL 存储 + scrypt 哈希 + 真实 IP 限流）。
// 登录失败限流规则（服务端执行）：错 3 次锁 10 分钟、5 次锁 20 分钟、12 小时内累计 12 次封 12 小时
import React, { useState } from 'react';
import { zhuCe, dengLuYongHu } from '../core/yonghu.js';

export function DengLu({ open, onClose, onDengLu }) {
  const [ye, setYe] = useState('denglu'); // denglu | zhuce
  const [zhangHao, setZhangHao] = useState('');
  const [miMa, setMiMa] = useState('');
  const [miMa2, setMiMa2] = useState('');
  const [cuo, setCuo] = useState('');
  const [mang, setMang] = useState(false);

  if (!open) return null;

  async function tiJiao() {
    if (mang) return;
    setCuo('');
    if (ye === 'zhuce' && miMa !== miMa2) {
      setCuo('两次输入的密码不一致');
      return;
    }
    setMang(true);
    try {
      if (ye === 'zhuce') {
        const zc = await zhuCe(zhangHao, miMa);
        if (!zc.ok) {
          setCuo(zc.xinxi);
          return;
        }
        const dl = await dengLuYongHu(zhangHao, miMa);
        if (dl.ok) {
          onDengLu(dl.yongHu);
          onClose();
        } else {
          setCuo(dl.xinxi);
        }
      } else {
        const dl = await dengLuYongHu(zhangHao, miMa);
        if (dl.ok) {
          onDengLu(dl.yongHu);
          onClose();
        } else {
          setCuo(
            dl.suoDing
              ? `密码错误已累计 ${dl.leiJi} 次，锁定 ${dl.shengYuMiao} 秒`
              : `${dl.xinxi}${dl.leiJi ? `（已累计错误 ${dl.leiJi} 次，错 3 次锁 10 分钟、5 次锁 20 分钟）` : ''}`
          );
        }
      }
    } catch {
      setCuo('服务暂时不可用，请稍后重试');
    } finally {
      setMang(false);
    }
  }

  return (
    <div className="admin-mask" onClick={onClose}>
      <div className="admin-panel" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="admin-head">
          <div className="panel-title">{ye === 'denglu' ? '用户登录' : '用户注册'}</div>
          <button className="a-btn a-btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="admin-body">
          <div className="a-row">
            <button
              className={`a-btn ${ye === 'denglu' ? 'a-btn-primary' : 'a-btn-ghost'}`}
              onClick={() => {
                setYe('denglu');
                setCuo('');
              }}
            >
              登录
            </button>
            <button
              className={`a-btn ${ye === 'zhuce' ? 'a-btn-primary' : 'a-btn-ghost'}`}
              onClick={() => {
                setYe('zhuce');
                setCuo('');
              }}
            >
              注册
            </button>
          </div>

          <input
            className="a-input"
            placeholder="账号（3 位以上）"
            value={zhangHao}
            onChange={e => setZhangHao(e.target.value)}
          />
          <input
            className="a-input"
            type="password"
            placeholder="密码（6 位以上）"
            value={miMa}
            onChange={e => setMiMa(e.target.value)}
          />
          {ye === 'zhuce' && (
            <input
              className="a-input"
              type="password"
              placeholder="确认密码"
              value={miMa2}
              onChange={e => setMiMa2(e.target.value)}
            />
          )}
          {cuo && <div className="a-tip a-tip-err">{cuo}</div>}
          <div className="a-tip">
            密码经服务端加密存储，明文不落盘。管理员后台为独立入口，与用户账号互不相通。
          </div>
          <button className="a-btn a-btn-primary" onClick={tiJiao} disabled={mang}>
            {mang ? '处理中…' : ye === 'denglu' ? '登录' : '注册并登录'}
          </button>
        </div>
      </div>
    </div>
  );
}
